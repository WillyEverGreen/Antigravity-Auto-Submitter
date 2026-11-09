#!/usr/bin/env node
/**
 * Antigravity PowerTools — Smart Model Cost & Tier Router CLI
 * 
 * Usage:
 *   ag-router "Write commit message"
 *   ag-router "Refactor database architecture" --files 8
 *   ag-router --json "Fix login page bug"
 */

'use strict';

const { classifyTask } = require('../lib/cost-router');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Antigravity PowerTools — Smart Model Cost Router

Usage:
  ag-router "<prompt>" [options]

Options:
  --files <num>     Number of files touched
  --tokens <num>    Estimated token count
  --json            Output raw JSON
  -h, --help        Show this help message
`);
  process.exit(0);
}

const isJson = args.includes('--json');
const cleanArgs = args.filter(a => a !== '--json');

let fileCount = 0;
let tokenEstimate = null;
const promptWords = [];

for (let i = 0; i < cleanArgs.length; i++) {
  const arg = cleanArgs[i];
  if (arg === '--files' && cleanArgs[i + 1]) {
    fileCount = parseInt(cleanArgs[++i], 10) || 0;
  } else if (arg === '--tokens' && cleanArgs[i + 1]) {
    tokenEstimate = parseInt(cleanArgs[++i], 10) || null;
  } else {
    promptWords.push(arg);
  }
}

const prompt = promptWords.join(' ').trim();
if (!prompt) {
  console.error('Error: Please provide a prompt to classify.');
  process.exit(1);
}

const result = classifyTask(prompt, { fileCount, tokenEstimate });

if (isJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const tierColor = result.tier === 'flagship' ? '\x1b[35m' : result.tier === 'balanced' ? '\x1b[36m' : '\x1b[32m';
  console.log(`\n\x1b[1mTask Classification:\x1b[0m`);
  console.log(`  Tier:              ${tierColor}${result.tierName}\x1b[0m (${result.reason})`);
  console.log(`  Recommended Model: \x1b[1m${result.recommendedModel}\x1b[0m`);
  console.log(`  Available Models:  ${result.availableModels.join(', ')}`);
  console.log(`  Estimated Tokens:  ${result.estimatedTokens.toLocaleString()}`);
  console.log(`  Estimated Cost:    \x1b[32m$${result.estimatedCostUsd.toFixed(6)}\x1b[0m (vs $${result.flagshipBenchmarkUsd.toFixed(6)} flagship)`);
  console.log(`  Token Savings:     \x1b[1m\x1b[32m${result.savingsPercentage}%\x1b[0m ($${result.savingsUsd.toFixed(6)})\n`);
}
process.exit(0);

