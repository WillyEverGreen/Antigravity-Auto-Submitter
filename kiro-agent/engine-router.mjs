/**
 * Kiro Agent V2 - Swarm Capability Router (engine-router.mjs)
 *
 * Analyzes task intent and routes to the optimal execution strategy:
 * - Architect-Editor : Complex code generation & multi-file features.
 * - LLM Council      : High-stakes / security / consensus tasks.
 * - Deep Logic       : Algorithmic / mathematical reasoning via DeepSeek 3.2.
 * - Fast Tier        : Low-latency tasks via Claude Haiku 4.5.
 * - Parallel Batching: High-throughput concurrent worker pool across 20 accounts.
 *
 * V2.1 additions wired in:
 *   engine-semantic-router  — Multi-dimensional signal scoring (replaces naive keywords)
 *   engine-critic           — Structured peer-review + patch loop
 *   engine-context-budget   — Context window guard + truncation
 *   engine-quality-retry    — Adaptive quality-scored retry with model escalation
 */

import { executeRaw } from './kiro-core.mjs';
import { executeArchitectEditor } from './engine-architect-editor.mjs';
import { executeCouncil } from './engine-council.mjs';
import { verifyAndSelfHeal } from './engine-verifier.mjs';
import { semanticRoute } from './engine-semantic-router.mjs';
import { runCriticLoop } from './engine-critic.mjs';
import { fitToContextBudget } from './engine-context-budget.mjs';
import { executeWithQualityRetry } from './engine-quality-retry.mjs';

/**
 * Route task based on intent or explicit mode
 */
export async function routeTask({
  prompt,
  mode = 'auto',
  model = null,
  context = '',
  autoVerify = true,
  autoCritic = true,
  qualityThreshold = 82
}) {
  // ── Context Budget Guard: trim before anything touches the prompt ──────────
  const budgeted = fitToContextBudget({
    prompt,
    context,
    model: model || 'claude-sonnet-4.5',
    reserveOutputTokens: 4096,
  });
  if (budgeted.truncated) {
    console.warn(`[router] Context truncated to ${Math.round(budgeted.budgetUsed * 100)}% of budget`);
  }
  const safePrompt  = budgeted.prompt;
  const safeContext = budgeted.context;

  // ── Semantic Routing: replaces naive keyword matching ────────────────────
  let selectedMode = mode;
  let selectedModel = model;
  let routeReason = 'user-specified';

  if (selectedMode === 'auto') {
    const routing = semanticRoute(safePrompt, null);
    selectedMode  = routing.mode;
    selectedModel = model || routing.model;
    routeReason   = routing.reason;
    console.log(`[router] Semantic route → ${selectedMode} (${routeReason})`);
  } else {
    selectedModel = model || 'claude-sonnet-4.5';
  }

  let result;
  switch (selectedMode) {
    case 'architect-editor':
    case 'arch': {
      result = await executeArchitectEditor({
        prompt:         safePrompt,
        architectModel: selectedModel || 'claude-sonnet-4.5',
        editorModel:    'claude-haiku-4.5',
        context:        safeContext
      });
      break;
    }

    case 'council':
    case 'swarm': {
      result = await executeCouncil({
        prompt:        safePrompt,
        chairmanModel: selectedModel || 'claude-sonnet-4.5',
        context:       safeContext
      });
      break;
    }

    case 'logic': {
      const res = await executeRaw({
        prompt:    safePrompt,
        model:     selectedModel || 'deepseek-3.2',
        role:      'coder',
        maxTokens: 4096
      });
      result = {
        success:        res.success,
        pattern:        'Deep Logic (DeepSeek 3.2)',
        totalDurationMs: res.durationMs,
        finalCode:      res.content,
        error:          res.error
      };
      break;
    }

    case 'fast': {
      // Fast tier uses quality-retry for adaptive escalation
      const fastResult = await executeWithQualityRetry({
        prompt: safePrompt,
        model:  selectedModel || 'claude-haiku-4.5',
        acceptThreshold: qualityThreshold,
        maxAttempts: 2,
        escalate: true,
        executor: async (p, m) => executeRaw({
          prompt: p, model: m, role: 'coder', maxTokens: 2048
        }),
      });
      result = {
        success:        !!fastResult.content,
        pattern:        `Fast Tier (${fastResult.model})`,
        totalDurationMs: Date.now() - Date.now(),
        finalCode:      fastResult.content,
        qualityScore:   fastResult.score,
        attempts:       fastResult.attempts,
        error:          fastResult.content ? undefined : 'Fast tier returned empty'
      };
      break;
    }

    case 'direct':
    default: {
      const res = await executeRaw({
        prompt:    safePrompt,
        model:     selectedModel || 'claude-sonnet-4.5',
        role:      'coder',
        maxTokens: 4096
      });
      result = {
        success:        res.success,
        pattern:        'Direct Single Model',
        totalDurationMs: res.durationMs,
        finalCode:      res.content,
        error:          res.error
      };
      break;
    }
  }

  // ── Gate 1: Self-Healing Verification (syntax) ───────────────────────────
  if (autoVerify && result.success && (result.finalCode || result.finalSolution)) {
    const rawCode = result.finalCode || result.finalSolution;
    const verified = await verifyAndSelfHeal({
      code: rawCode,
      taskPrompt: safePrompt
    });
    result.verified = verified.valid;
    result.healed   = verified.healed;
    if (verified.healed) {
      if (result.finalCode)     result.finalCode     = verified.code;
      if (result.finalSolution) result.finalSolution = verified.code;
    }
  }

  // ── Gate 2: Critic Loop (semantic quality review + patch) ────────────────
  if (autoCritic && result.success && (result.finalCode || result.finalSolution)) {
    const codeForCritic = result.finalCode || result.finalSolution;
    const criticResult  = await runCriticLoop({
      code:       codeForCritic,
      taskPrompt: safePrompt,
      threshold:  qualityThreshold,
    });
    result.criticScore   = criticResult.score;
    result.criticImproved = criticResult.improved;
    if (criticResult.improved) {
      if (result.finalCode)     result.finalCode     = criticResult.finalCode;
      if (result.finalSolution) result.finalSolution = criticResult.finalCode;
    }
  }

  result.routeReason = routeReason;
  return result;
}

/**
 * High-Throughput Parallel Worker Batching across 20-Account Pool
 */
export async function executeParallelBatch({
  tasks,
  concurrency = 10,
  defaultMode = 'auto'
}) {
  const tStart = Date.now();
  const results = [];
  const queue = [...tasks];

  async function worker(workerId) {
    while (true) {
      const task = queue.shift();
      if (!task) break;

      const t0 = Date.now();
      try {
        const res = await routeTask({
          prompt: task.prompt,
          mode: task.mode || defaultMode,
          model: task.model || null,
          context: task.context || ''
        });

        results.push({
          id: task.id || `task-${results.length + 1}`,
          title: task.title || task.prompt.slice(0, 40),
          success: res.success,
          pattern: res.pattern,
          durationMs: Date.now() - t0,
          output: res.finalCode || res.finalSolution || res.error,
          workerId
        });
      } catch (err) {
        results.push({
          id: task.id || `task-${results.length + 1}`,
          success: false,
          error: err.message,
          workerId
        });
      }
    }
  }

  const workerPool = [];
  const activeWorkers = Math.min(concurrency, tasks.length);
  for (let i = 0; i < activeWorkers; i++) {
    workerPool.push(
      worker(i + 1).catch(err => {
        results.push({
          id: `worker-${i + 1}-fatal`,
          success: false,
          error: `Worker fatal crash: ${err.message}`,
          workerId: i + 1
        });
      })
    );
  }

  await Promise.all(workerPool);

  return {
    totalTasks: tasks.length,
    completed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    totalDurationMs: Date.now() - tStart,
    results
  };
}
