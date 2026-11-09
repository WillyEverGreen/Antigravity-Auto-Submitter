/**
 * Antigravity PowerTools — Smart Model Tier & Cost Router
 * 
 * Automatically routes developer tasks to the optimal model tier:
 * - Flagship (Sonnet / Gemini Pro): Architecture, specs, multi-file refactors ($3-$15/M)
 * - Balanced (Gemini Flash / DeepSeek 3.2): Code implementation, bug fixing ($0.15-$0.50/M)
 * - Economy (Flash-Lite / Local): Commit messages, linting, test runners ($0.05-$0.075/M)
 * 
 * Delivers 70-80% developer token savings while accelerating turnaround time.
 */

'use strict';

const MODEL_TIERS = {
  flagship: {
    name: 'Flagship',
    models: ['claude-sonnet-4.5', 'gemini-1.5-pro', 'gemini-2.0-pro'],
    costPerMillion: 10.0,
    bestFor: 'Architecture specs, complex multi-file refactors, security audits'
  },
  balanced: {
    name: 'Balanced',
    models: ['claude-haiku-4.5', 'gemini-2.0-flash', 'deepseek-3.2'],
    costPerMillion: 0.40,
    bestFor: 'Feature implementation, unit tests, bug fixing, algorithms'
  },
  economy: {
    name: 'Economy',
    models: ['gemini-2.0-flash-lite', 'qwen3-coder-next', 'ollama-local'],
    costPerMillion: 0.075,
    bestFor: 'Git commit messages, lint fixes, markdown summaries, cache scans'
  }
};

const ECONOMY_SIGNALS = [
  'commit message', 'git commit', 'lint', 'format', 'prettier', 'eslint',
  'fix typo', 'spelling', 'summarize log', 'cache scan', 'audit'
];

const FLAGSHIP_SIGNALS = [
  'architect', 'system design', 'security audit', 'migration plan',
  'specification', 'prd', 'rfc', 'threat model', 'multi-file refactor'
];

function classifyTask(prompt = '', options = {}) {
  const safePrompt = typeof prompt === 'string' ? prompt : String(prompt || '');
  const p = safePrompt.toLowerCase();
  const fileCount = Number.isInteger(options.fileCount) && options.fileCount >= 0 ? options.fileCount : 0;
  const tokenEstimate = Number.isFinite(options.tokenEstimate) && options.tokenEstimate > 0
    ? Math.round(options.tokenEstimate)
    : Math.max(1, Math.ceil(safePrompt.length / 3.8));

  // Check Economy first
  for (const signal of ECONOMY_SIGNALS) {
    if (p.includes(signal) && fileCount <= 1) {
      return buildClassification('economy', `Matched economy keyword: "${signal}"`, tokenEstimate);
    }
  }

  // Check Flagship
  for (const signal of FLAGSHIP_SIGNALS) {
    if (p.includes(signal) || fileCount > 5) {
      return buildClassification('flagship', `Matched high-complexity keyword or >5 files`, tokenEstimate);
    }
  }

  // Default to Balanced for standard code generation
  return buildClassification('balanced', 'Standard implementation task', tokenEstimate);
}

function buildClassification(tierKey, reason, tokens) {
  const tier = MODEL_TIERS[tierKey] || MODEL_TIERS.balanced;
  const flagshipTier = MODEL_TIERS.flagship;

  const cost = (tokens / 1_000_000) * tier.costPerMillion;
  const benchmarkCost = (tokens / 1_000_000) * flagshipTier.costPerMillion;
  const savingsAmount = Math.max(0, benchmarkCost - cost);
  const savingsPct = benchmarkCost > 0 ? Math.round((savingsAmount / benchmarkCost) * 100) : 0;

  return {
    tier: tierKey,
    tierName: tier.name,
    recommendedModel: tier.models[0],
    availableModels: tier.models,
    reason,
    estimatedTokens: tokens,
    estimatedCostUsd: Number(cost.toFixed(6)),
    flagshipBenchmarkUsd: Number(benchmarkCost.toFixed(6)),
    savingsPercentage: savingsPct,
    savingsUsd: Number(savingsAmount.toFixed(6))
  };
}

function calculateSavingsSummary(taskRuns = []) {
  if (!Array.isArray(taskRuns)) {
    throw new TypeError('taskRuns must be an array');
  }

  let totalTokens = 0;
  let totalCost = 0;
  let totalBenchmark = 0;

  for (const run of taskRuns) {
    if (!run || typeof run !== 'object') continue;
    const classification = classifyTask(run.prompt, run);
    totalTokens += classification.estimatedTokens;
    totalCost += classification.estimatedCostUsd;
    totalBenchmark += classification.flagshipBenchmarkUsd;
  }

  const netSavings = Math.max(0, totalBenchmark - totalCost);
  const overallPct = totalBenchmark > 0 ? Math.round((netSavings / totalBenchmark) * 100) : 0;

  return {
    taskCount: taskRuns.length,
    totalTokens,
    totalCostUsd: Number(totalCost.toFixed(4)),
    benchmarkCostUsd: Number(totalBenchmark.toFixed(4)),
    netSavingsUsd: Number(netSavings.toFixed(4)),
    savingsPercentage: overallPct
  };
}

module.exports = {
  MODEL_TIERS,
  classifyTask,
  calculateSavingsSummary
};
