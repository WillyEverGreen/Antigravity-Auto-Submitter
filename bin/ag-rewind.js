#!/usr/bin/env node
'use strict';
const { rollbackToCheckpoint, listCheckpoints } = require('../lib/time-travel');

const targetId = process.argv[2];
if (!targetId) {
  const list = listCheckpoints();
  console.log('Available Checkpoints:');
  if (list.length === 0) console.log('  (no checkpoints found)');
  for (const c of list) {
    console.log(`  - \x1b[36m${c.id}\x1b[0m [${c.timestamp}] ${c.description} (${c.fileCount} files)`);
  }
  console.log('\nUsage: ag-rewind <checkpoint_id>');
  process.exit(0);
}

try {
  const res = rollbackToCheckpoint(targetId);
  console.log(`\x1b[32m✓ Rewound to checkpoint ${res.checkpoint.id}:\x1b[0m ${res.checkpoint.description}`);
  process.exit(0);
} catch (e) {
  console.error(`\x1b[31m✗ Rewind failed:\x1b[0m ${e.message}`);
  process.exit(1);
}

