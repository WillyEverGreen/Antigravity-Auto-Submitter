#!/usr/bin/env node
'use strict';
const { createCheckpoint } = require('../lib/time-travel');

const desc = process.argv.slice(2).join(' ') || 'Manual checkpoint';
try {
  const ckpt = createCheckpoint(desc);
  console.log(`\x1b[32m✓ Checkpoint created:\x1b[0m ${ckpt.id} (${ckpt.fileCount} files snapshot)`);
  process.exit(0);
} catch (e) {
  console.error(`\x1b[31m✗ Failed to create checkpoint:\x1b[0m ${e.message}`);
  process.exit(1);
}

