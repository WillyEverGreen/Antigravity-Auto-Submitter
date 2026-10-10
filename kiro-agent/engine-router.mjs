/**
 * Kiro Agent V2 - Swarm Capability Router (engine-router.mjs)
 * 
 * Analyzes task intent and routes to the optimal execution strategy:
 * - Architect-Editor: Complex code generation & multi-file features (~13-18s).
 * - LLM Council: High-stakes algorithms, critical security, multi-model consensus.
 * - Deep Logic: Specialized reasoning via DeepSeek 3.2.
 * - Fast Tier: Low-latency tasks via Claude Haiku 4.5.
 * - Parallel Batching: High-throughput concurrent worker pool across 20 accounts.
 */

import { executeRaw } from './kiro-core.mjs';
import { executeArchitectEditor } from './engine-architect-editor.mjs';
import { executeCouncil } from './engine-council.mjs';
import { verifyAndSelfHeal } from './engine-verifier.mjs';

/**
 * Route task based on intent or explicit mode
 */
export async function routeTask({
  prompt,
  mode = 'auto',
  model = null,
  context = '',
  autoVerify = true
}) {
  let selectedMode = mode;

  if (selectedMode === 'auto') {
    const lower = prompt.toLowerCase();
    if (lower.includes('council') || lower.includes('consensus') || lower.includes('swarm') || lower.includes('compare all models')) {
      selectedMode = 'council';
    } else if (lower.includes('math') || lower.includes('algorithm') || lower.includes('invariant') || lower.includes('proof')) {
      selectedMode = 'logic';
    } else if (lower.includes('quick') || lower.includes('simple') || lower.includes('short') || lower.length < 80) {
      selectedMode = 'fast';
    } else {
      selectedMode = 'architect-editor';
    }
  }

  let result;
  switch (selectedMode) {
    case 'architect-editor':
    case 'arch': {
      result = await executeArchitectEditor({
        prompt,
        architectModel: model || 'claude-sonnet-4.5',
        editorModel: 'claude-haiku-4.5',
        context
      });
      break;
    }

    case 'council':
    case 'swarm': {
      result = await executeCouncil({
        prompt,
        chairmanModel: model || 'claude-sonnet-4.5',
        context
      });
      break;
    }

    case 'logic': {
      const res = await executeRaw({
        prompt,
        model: model || 'deepseek-3.2',
        role: 'coder',
        maxTokens: 4096
      });
      result = {
        success: res.success,
        pattern: 'Deep Logic (DeepSeek 3.2)',
        totalDurationMs: res.durationMs,
        finalCode: res.content,
        error: res.error
      };
      break;
    }

    case 'fast': {
      const res = await executeRaw({
        prompt,
        model: model || 'claude-haiku-4.5',
        role: 'coder',
        maxTokens: 2048
      });
      result = {
        success: res.success,
        pattern: 'Fast Tier (Haiku 4.5)',
        totalDurationMs: res.durationMs,
        finalCode: res.content,
        error: res.error
      };
      break;
    }

    case 'direct':
    default: {
      const res = await executeRaw({
        prompt,
        model: model || 'claude-sonnet-4.5',
        role: 'coder',
        maxTokens: 4096
      });
      result = {
        success: res.success,
        pattern: 'Direct Single Model',
        totalDurationMs: res.durationMs,
        finalCode: res.content,
        error: res.error
      };
      break;
    }
  }

  // Self-Healing Verification Gate
  if (autoVerify && result.success && (result.finalCode || result.finalSolution)) {
    const rawCode = result.finalCode || result.finalSolution;
    const verified = await verifyAndSelfHeal({
      code: rawCode,
      taskPrompt: prompt
    });
    result.verified = verified.valid;
    result.healed = verified.healed;
    if (verified.healed) {
      if (result.finalCode) result.finalCode = verified.code;
      if (result.finalSolution) result.finalSolution = verified.code;
    }
  }

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
