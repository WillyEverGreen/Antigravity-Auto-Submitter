/**
 * Kiro Agent V2 - Context Budget Manager (engine-context-budget.mjs)
 *
 * Prevents silent context-window degradation by:
 *   1. Estimating token consumption before dispatch
 *   2. Truncating / summarizing context when approaching model limits
 *   3. Splitting oversized prompts into chunked sub-tasks
 *   4. Tracking cumulative token spend per session
 *
 * Token estimation uses 3.8 chars-per-token heuristic (empirically close
 * enough for English + code; avoids expensive tiktoken dependency).
 *
 * Exports:
 *   estimateTokens(text)
 *   fitToContextBudget({ prompt, context, systemPrompt, maxModelTokens, reserveOutputTokens })
 *   chunkPrompt(prompt, chunkTokens)
 *   ContextBudgetTracker  (class)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

// Conservative model context limits (input + output combined)
export const MODEL_CONTEXT_LIMITS = {
  'claude-sonnet-4.5':  200000,
  'claude-haiku-4.5':   200000,
  'deepseek-3.2':        65536,
  'qwen3-coder-next':   131072,
  'minimax-m2.5':        65536,
  'default':            100000,
};

const CHARS_PER_TOKEN = 3.8;

// ─── Token estimation ─────────────────────────────────────────────────────────

/**
 * Fast token count estimate without a tokenizer library.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── Context fitting ──────────────────────────────────────────────────────────

/**
 * Trim a prompt + context block to fit within model context window,
 * reserving enough room for the expected output.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.context]
 * @param {string} [opts.systemPrompt]
 * @param {string} [opts.model]
 * @param {number} [opts.reserveOutputTokens=4096]
 * @returns {{ prompt: string, context: string, systemPrompt: string,
 *             estimatedInputTokens: number, budgetUsed: number, truncated: boolean }}
 */
export function fitToContextBudget({
  prompt,
  context = '',
  systemPrompt = '',
  model = 'default',
  reserveOutputTokens = 4096,
}) {
  const limit = MODEL_CONTEXT_LIMITS[model] ?? MODEL_CONTEXT_LIMITS.default;
  const inputBudget = limit - reserveOutputTokens;

  let sysTokens = estimateTokens(systemPrompt);
  let promptTokens = estimateTokens(prompt);
  let ctxTokens = estimateTokens(context);

  const totalTokens = sysTokens + promptTokens + ctxTokens;

  if (totalTokens <= inputBudget) {
    return { prompt, context, systemPrompt, estimatedInputTokens: totalTokens,
             budgetUsed: totalTokens / inputBudget, truncated: false };
  }

  // Strategy 1: trim context first (it''s usually the most expendable)
  let trimmedContext = context;
  const availableForCtx = inputBudget - sysTokens - promptTokens - 200; // safety margin
  if (availableForCtx > 0 && ctxTokens > availableForCtx) {
    const targetChars = Math.floor(availableForCtx * CHARS_PER_TOKEN);
    trimmedContext = context.slice(0, targetChars) + '\n\n[... context truncated to fit context window ...]';
    ctxTokens = estimateTokens(trimmedContext);
  }

  // Strategy 2: trim system prompt (keep last 200 tokens worth)
  let trimmedSys = systemPrompt;
  const availableForSys = inputBudget - promptTokens - ctxTokens - 100;
  if (availableForSys > 0 && sysTokens > availableForSys) {
    const targetChars = Math.floor(availableForSys * CHARS_PER_TOKEN);
    trimmedSys = systemPrompt.slice(0, targetChars);
    sysTokens = estimateTokens(trimmedSys);
  }

  // Strategy 3: last resort — trim prompt tail (preserve first 80%)
  let trimmedPrompt = prompt;
  const remaining = inputBudget - sysTokens - ctxTokens - 100;
  if (remaining > 0 && promptTokens > remaining) {
    const targetChars = Math.floor(remaining * CHARS_PER_TOKEN);
    const keepHead = Math.floor(targetChars * 0.8);
    const keepTail = targetChars - keepHead;
    trimmedPrompt = prompt.slice(0, keepHead) + '\n\n[... middle truncated ...]\n\n' + prompt.slice(-keepTail);
  }

  const finalTokens = estimateTokens(trimmedSys) + estimateTokens(trimmedPrompt) + estimateTokens(trimmedContext);
  return {
    prompt: trimmedPrompt,
    context: trimmedContext,
    systemPrompt: trimmedSys,
    estimatedInputTokens: finalTokens,
    budgetUsed: finalTokens / inputBudget,
    truncated: true,
  };
}

// ─── Prompt chunker ───────────────────────────────────────────────────────────

/**
 * Split a large prompt into overlapping chunks for sequential processing.
 * Used when the prompt itself is the bottleneck (e.g., large code reviews).
 *
 * @param {string} prompt
 * @param {number} [chunkTokens=3000]  - Target tokens per chunk
 * @param {number} [overlapTokens=200] - Overlap to preserve continuity
 * @returns {string[]}
 */
export function chunkPrompt(prompt, chunkTokens = 3000, overlapTokens = 200) {
  const chunkChars   = Math.max(1, Math.floor(chunkTokens * CHARS_PER_TOKEN));
  // Overlap must be strictly less than chunk size to guarantee forward progress
  const overlapChars = Math.min(Math.floor(overlapTokens * CHARS_PER_TOKEN), Math.floor(chunkChars * 0.5));

  if (prompt.length <= chunkChars) return [prompt];

  const chunks = [];
  let start = 0;
  while (start < prompt.length) {
    const end = Math.min(start + chunkChars, prompt.length);
    chunks.push(prompt.slice(start, end));
    // Always advance by at least 1 char to prevent infinite loop
    const nextStart = end - overlapChars;
    if (nextStart <= start) {
      start = start + Math.max(1, chunkChars - overlapChars);
    } else {
      start = nextStart;
    }
    if (start >= prompt.length) break;
  }
  return chunks;
}

// ─── Session tracker ──────────────────────────────────────────────────────────

/**
 * Track cumulative token usage across multiple calls in a session.
 * Useful for long-running parallel batches.
 */
export class ContextBudgetTracker {
  constructor() {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.callCount = 0;
    this.truncatedCount = 0;
    this.startedAt = Date.now();
  }

  record({ inputTokens = 0, outputTokens = 0, truncated = false }) {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.callCount++;
    if (truncated) this.truncatedCount++;
  }

  get totalTokens() {
    return this.totalInputTokens + this.totalOutputTokens;
  }

  summary() {
    const elapsedSec = (Date.now() - this.startedAt) / 1000;
    return {
      calls: this.callCount,
      truncated: this.truncatedCount,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalTokens: this.totalTokens,
      tokensPerSecond: Math.round(this.totalTokens / Math.max(1, elapsedSec)),
      elapsedSec: Math.round(elapsedSec),
    };
  }
}

export default { estimateTokens, fitToContextBudget, chunkPrompt, ContextBudgetTracker, MODEL_CONTEXT_LIMITS };
