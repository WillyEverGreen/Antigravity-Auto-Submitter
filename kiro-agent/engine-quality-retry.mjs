/**
 * Kiro Agent V2 - Adaptive Quality-Scored Retry Engine (engine-quality-retry.mjs)
 *
 * Replaces dumb "retry N times on error" with intelligent retry logic:
 *   1. After each attempt, score the output on 5 quality dimensions
 *   2. If score >= acceptThreshold => accept immediately
 *   3. If score < acceptThreshold => retry with a targeted correction prompt
 *   4. After maxAttempts, return the highest-scoring attempt
 *   5. Each retry escalates model tier (haiku → sonnet → deepseek) if needed
 *
 * Quality dimensions scored:
 *   - Completeness  : Does output address all parts of the task?
 *   - Concreteness  : Actual code/data vs vague prose?
 *   - Correctness   : Syntax/logic validity check
 *   - Length        : Not too short (incomplete) or too long (padding)
 *   - Structure     : Code blocks, sections, clear output
 *
 * Exports:
 *   scoreOutputQuality(output, taskPrompt) => { score, dimensions }
 *   executeWithQualityRetry({ prompt, executor, acceptThreshold, maxAttempts, ... })
 */

import { validateCodeSyntax, extractCodeBlocks } from './engine-verifier.mjs';

// ─── Quality scorer ───────────────────────────────────────────────────────────

/**
 * Score LLM output quality heuristically without another LLM call.
 * Returns a 0-100 composite score and per-dimension breakdown.
 *
 * @param {string} output
 * @param {string} taskPrompt
 * @returns {{ score: number, dimensions: object, issues: string[] }}
 */
export function scoreOutputQuality(output, taskPrompt = '') {
  if (!output || output.trim().length === 0) {
    return { score: 0, dimensions: {}, issues: ['Empty output'] };
  }

  const issues = [];
  const dimensions = {};

  // 1. Completeness — keyword overlap between task and output
  const taskWords = new Set(
    taskPrompt.toLowerCase().match(/\b\w{4,}\b/g) || []
  );
  const outWords = new Set(
    output.toLowerCase().match(/\b\w{4,}\b/g) || []
  );
  const overlap = [...taskWords].filter(w => outWords.has(w)).length;
  const completeness = taskWords.size > 0
    ? Math.min(100, Math.round((overlap / taskWords.size) * 120))
    : 70;
  dimensions.completeness = completeness;
  if (completeness < 40) issues.push('Low task coverage — may be incomplete');

  // 2. Concreteness — code blocks present?
  const codeBlocks = extractCodeBlocks(output);
  const hasCode = codeBlocks.length > 0 && codeBlocks[0].trim().length > 30;
  const taskNeedsCode = /\b(implement|create|build|generate|write|code|function|class|api|script)\b/i.test(taskPrompt);
  let concreteness = 70;
  if (taskNeedsCode) {
    concreteness = hasCode ? 90 : 20;
    if (!hasCode) issues.push('Task requires code but no code block found');
  } else {
    concreteness = output.length > 100 ? 80 : 50;
  }
  dimensions.concreteness = concreteness;

  // 3. Correctness — syntax validity of code blocks
  let correctness = 85; // assume OK if no code
  if (hasCode) {
    const check = validateCodeSyntax(codeBlocks[0]);
    correctness = check.valid ? 95 : 30;
    if (!check.valid) issues.push(`Syntax error: ${check.error}`);
  }
  dimensions.correctness = correctness;

  // 4. Length — penalise too-short or too-long outputs
  const len = output.trim().length;
  let length = 80;
  if (len < 50)   { length = 10; issues.push('Output suspiciously short'); }
  else if (len < 200)  { length = 50; }
  else if (len > 30000) { length = 60; issues.push('Output very large — possible padding'); }
  else if (len > 12000) { length = 75; }
  dimensions.length = length;

  // 5. Structure — headers, bullets, or code formatting present
  const hasStructure = /#{1,3}\s|\*\*|```|^\s*[-*]\s/m.test(output);
  const structure = hasStructure ? 85 : 65;
  dimensions.structure = structure;

  // Composite weighted score
  const score = Math.round(
    completeness * 0.30 +
    concreteness  * 0.25 +
    correctness   * 0.25 +
    length        * 0.10 +
    structure     * 0.10
  );

  return { score, dimensions, issues };
}

// ─── Model escalation ladder ──────────────────────────────────────────────────

const ESCALATION_LADDER = [
  'claude-haiku-4.5',
  'claude-sonnet-4.5',
  'deepseek-3.2',
];

function escalateModel(currentModel, attempt) {
  const currentIdx = ESCALATION_LADDER.indexOf(currentModel);
  const nextIdx = Math.min(currentIdx + attempt, ESCALATION_LADDER.length - 1);
  return ESCALATION_LADDER[Math.max(0, nextIdx)];
}

// ─── Correction prompt builder ────────────────────────────────────────────────

export function buildCorrectionPrompt(originalPrompt, previousOutput, issues, attempt) {
  return `Your previous response had quality issues (attempt ${attempt}):

${issues.map(i => `- ${i}`).join('\n')}

### Original Task:
${originalPrompt}

### Previous Response (DEFECTIVE):
${previousOutput.slice(0, 3000)}${previousOutput.length > 3000 ? '\n[... truncated ...]' : ''}

Fix ALL listed issues in your new response. Be complete, concrete, and correct.
Output ONLY the corrected response.`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Execute a task with adaptive quality-scored retry.
 *
 * @param {object} opts
 * @param {string}   opts.prompt           - Task prompt
 * @param {Function} opts.executor         - async (prompt, model) => { success, content, ... }
 * @param {string}   [opts.model]          - Starting model
 * @param {number}   [opts.acceptThreshold=82]  - Min quality score to accept (0-100)
 * @param {number}   [opts.maxAttempts=3]  - Max total attempts
 * @param {boolean}  [opts.escalate=true]  - Escalate model tier on retry
 * @returns {Promise<{ content: string, score: number, attempts: number, model: string, allAttempts: object[] }>}
 */
export async function executeWithQualityRetry({
  prompt,
  executor,
  model = 'claude-haiku-4.5',
  acceptThreshold = 82,
  maxAttempts = 3,
  escalate = true,
}) {
  const allAttempts = [];
  let bestAttempt = null;
  let currentPrompt = prompt;
  let currentModel = model;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await executor(currentPrompt, currentModel);

    if (!res.success) {
      allAttempts.push({ attempt, success: false, score: 0, error: res.error, model: currentModel });
      // On failure, escalate model immediately
      if (escalate && attempt < maxAttempts) {
        currentModel = escalateModel(currentModel, attempt);
        currentPrompt = prompt; // retry original
      }
      continue;
    }

    const { score, dimensions, issues } = scoreOutputQuality(res.content, prompt);
    const attemptRecord = { attempt, success: true, score, dimensions, issues, model: currentModel, content: res.content };
    allAttempts.push(attemptRecord);

    // Track best so far
    if (!bestAttempt || score > bestAttempt.score) {
      bestAttempt = attemptRecord;
    }

    // Accept if quality threshold met
    if (score >= acceptThreshold) {
      return {
        content: res.content,
        score,
        attempts: attempt,
        model: currentModel,
        accepted: true,
        dimensions,
        allAttempts,
      };
    }

    // Not accepted — prepare targeted retry
    if (attempt < maxAttempts) {
      currentPrompt = buildCorrectionPrompt(prompt, res.content, issues, attempt);
      if (escalate) {
        currentModel = escalateModel(currentModel, attempt);
      }
    }
  }

  // Return best attempt after exhausting retries
  const best = bestAttempt || allAttempts[allAttempts.length - 1];
  return {
    content: best?.content || '',
    score: best?.score || 0,
    attempts: maxAttempts,
    model: best?.model || currentModel,
    accepted: false,
    dimensions: best?.dimensions || {},
    allAttempts,
  };
}

export default { scoreOutputQuality, executeWithQualityRetry };
