/**
 * Kiro Agent V2 - Critic / Peer-Review Loop (engine-critic.mjs)
 *
 * Runs a structured 2-turn critic loop after code generation:
 *   Turn 1 (Critic)  - Blind peer-review on a separate model; scores 0-100
 *                      on Correctness, Edge Cases, Security, and Clarity.
 *   Turn 2 (Editor)  - If score < threshold, patches the code guided by
 *                      the critic''s findings.
 *
 * Only fires when the initial verifier passes syntax (no point critiquing
 * broken code — the self-heal loop handles that first).
 *
 * Exports:
 *   runCriticLoop({ code, taskPrompt, threshold?, criticModel?, editorModel? })
 *     => { improved, score, critique, finalCode }
 */

import { executeRaw } from './kiro-core.mjs';

// ─── Critique parser ──────────────────────────────────────────────────────────

/**
 * Extract a numeric score (0-100) from critic output.
 * Looks for patterns like: "Score: 72", "SCORE: 72/100", "72 / 100", etc.
 */
function extractScore(text) {
  const patterns = [
    /score[:\s]+(\d{1,3})\s*\/?\s*100/i,
    /(\d{1,3})\s*\/\s*100/,
    /overall[:\s]+(\d{1,3})/i,
    /rating[:\s]+(\d{1,3})/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n <= 100) return n;
    }
  }
  // Fallback: count positive / negative keywords
  const positives = (text.match(/\b(correct|good|solid|clean|safe|efficient|elegant)\b/gi) || []).length;
  const negatives = (text.match(/\b(bug|error|missing|unsafe|incorrect|broken|incomplete|issue|risk)\b/gi) || []).length;
  const ratio = positives / Math.max(1, positives + negatives);
  return Math.round(50 + ratio * 50 - negatives * 3);
}

// ─── Critic prompt builder ────────────────────────────────────────────────────

function buildCriticPrompt(code, taskPrompt) {
  return `You are a Blind Peer Reviewer — you have NOT seen how this code was generated.

### Original Task:
${taskPrompt}

### Code Under Review:
\`\`\`
${code}
\`\`\`

Perform a rigorous peer review. Evaluate on these 4 dimensions (each 0–25 pts):
1. **Correctness** — Does it fully and correctly implement the task? Subtle logic errors?
2. **Edge Cases** — Are boundaries, nulls, empty inputs, and error paths handled?
3. **Security** — Any injection, SSRF, prototype pollution, or unsafe patterns?
4. **Clarity** — Is the code readable, well-structured, and maintainable?

Output format (MUST follow exactly):
Score: <total 0–100>
---
**Issues Found:**
- <issue 1>
- <issue 2>
...
**What is Good:**
- <strength 1>
...
**Recommended Fixes:**
- <fix 1>
...`;
}

// ─── Patch prompt builder ─────────────────────────────────────────────────────

function buildPatchPrompt(code, critique, taskPrompt) {
  return `You are a Surgical Code Editor. A peer reviewer has identified issues in this code.

### Original Task:
${taskPrompt}

### Peer Review Findings:
${critique}

### Current Code:
\`\`\`
${code}
\`\`\`

Apply ONLY the specific fixes recommended by the reviewer. Do NOT refactor unnecessarily.
Output ONLY the corrected, complete code inside a single code block. No explanation.`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Run a structured critic loop on generated code.
 *
 * @param {object} opts
 * @param {string} opts.code          - Generated code to review
 * @param {string} opts.taskPrompt    - Original task description
 * @param {number} [opts.threshold=78] - Min score to skip patching (0-100)
 * @param {string} [opts.criticModel]  - Model used for critique
 * @param {string} [opts.editorModel]  - Model used for patching
 * @returns {Promise<{ improved: boolean, score: number, critique: string, finalCode: string }>}
 */
export async function runCriticLoop({
  code,
  taskPrompt,
  threshold = 78,
  criticModel = 'deepseek-3.2',
  editorModel = 'claude-haiku-4.5',
}) {
  const tStart = Date.now();

  // Turn 1: Critique
  const criticRes = await executeRaw({
    prompt: buildCriticPrompt(code, taskPrompt),
    model: criticModel,
    role: 'critic',
    maxTokens: 1200,
    temperature: 0.15,
  });

  if (!criticRes.success) {
    return {
      improved: false,
      score: 100, // assume passing if critic fails — don't block
      critique: `Critic unavailable: ${criticRes.error}`,
      finalCode: code,
      durationMs: Date.now() - tStart,
    };
  }

  const score = extractScore(criticRes.content);

  // If score is above threshold, no patching needed
  if (score >= threshold) {
    return {
      improved: false,
      score,
      critique: criticRes.content,
      finalCode: code,
      durationMs: Date.now() - tStart,
    };
  }

  // Turn 2: Patch guided by critique
  const patchRes = await executeRaw({
    prompt: buildPatchPrompt(code, criticRes.content, taskPrompt),
    model: editorModel,
    role: 'editor',
    maxTokens: 4096,
    temperature: 0.1,
  });

  if (!patchRes.success) {
    return {
      improved: false,
      score,
      critique: criticRes.content,
      finalCode: code,
      durationMs: Date.now() - tStart,
    };
  }

  return {
    improved: true,
    score,
    critique: criticRes.content,
    finalCode: patchRes.content,
    durationMs: Date.now() - tStart,
  };
}

export default { runCriticLoop };
