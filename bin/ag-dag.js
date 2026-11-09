#!/usr/bin/env node
/**
 * Antigravity PowerTools — Directed Acyclic Graph (DAG) Task Compiler CLI
 * 
 * Usage:
 *   ag-dag tasks.json
 *   ag-dag tasks.json --waves
 *   ag-dag tasks.json --hazards
 *   ag-dag tasks.json --json
 */

'use strict';

const path = require('node:path');
const {
  readJsonFile,
  compileExecutionWaves,
  analyzeGraphHazards,
  topologicalSort
} = require('../lib/dag-compiler');

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
Antigravity PowerTools — DAG Task Compiler

Usage:
  ag-dag <task-file.json> [options]

Options:
  --waves           Display parallel execution waves (default)
  --hazards         Analyze file conflict hazards and concurrency potential
  --sort            Show flat topological execution order
  --json            Output raw JSON
  -h, --help        Show this help message
`);
  process.exit(0);
}

const isJson = args.includes('--json');
const isHazards = args.includes('--hazards');
const isSort = args.includes('--sort');
const cleanArgs = args.filter(a => !a.startsWith('--'));

const targetFile = cleanArgs[0];
if (!targetFile) {
  console.error('Error: Please provide a valid JSON task file path.');
  process.exit(1);
}

try {
  const tasks = readJsonFile(targetFile);

  if (isHazards) {
    const hazards = analyzeGraphHazards(tasks);
    if (isJson) {
      console.log(JSON.stringify(hazards, null, 2));
    } else {
      console.log(`\n\x1b[1mDAG Concurrency & Hazard Analysis:\x1b[0m`);
      console.log(`  Total Tasks:           ${hazards.totalTasks}`);
      console.log(`  Execution Waves:       ${hazards.waveCount}`);
      console.log(`  Max Concurrency:       \x1b[32m${hazards.concurrencyPotential} concurrent tracks\x1b[0m`);
      if (hazards.fileConflicts.length > 0) {
        console.log(`\n  \x1b[33mShared File Conflicts (${hazards.fileConflicts.length}):\x1b[0m`);
        for (const c of hazards.fileConflicts) {
          console.log(`    - \x1b[36m${c.file}\x1b[0m touched by [${c.tasks.join(', ')}]`);
        }
      } else {
        console.log(`  File Overlap Hazards:  \x1b[32mNone (0 conflicts)\x1b[0m`);
      }
      console.log('');
    }
    process.exit(0);
  }

  if (isSort) {
    const sorted = topologicalSort(tasks);
    if (isJson) {
      console.log(JSON.stringify(sorted, null, 2));
    } else {
      console.log(`\n\x1b[1mTopological Execution Order (${sorted.length} tasks):\x1b[0m`);
      sorted.forEach((t, i) => {
        const deps = t.dependencies.length > 0 ? ` (deps: ${t.dependencies.join(', ')})` : '';
        console.log(`  ${i + 1}. \x1b[32m${t.id}\x1b[0m: ${t.title}${deps}`);
      });
      console.log('');
    }
    process.exit(0);
  }

  // Default: Waves
  const waves = compileExecutionWaves(tasks);
  if (isJson) {
    console.log(JSON.stringify(waves, null, 2));
  } else {
    console.log(`\n\x1b[1mParallel Swarm Execution Waves (${waves.length} waves):\x1b[0m`);
    waves.forEach((wave, idx) => {
      console.log(`\n  \x1b[35m[Wave ${idx + 1}]\x1b[0m — ${wave.length} concurrent worktree track(s):`);
      wave.forEach(t => {
        const files = t.files.length > 0 ? ` [${t.files.join(', ')}]` : '';
        console.log(`    • \x1b[1m${t.id}\x1b[0m — ${t.title}${files}`);
      });
    });
    console.log('');
  }
  process.exit(0);
} catch (err) {
  console.error(`\x1b[31mDAG Compiler Error:\x1b[0m ${err.message}`);
  process.exit(1);
}

