#!/usr/bin/env node
'use strict';
const { applyTurboPreset, auditTurboSettings } = require('../lib/turbo-preset');

const args = process.argv.slice(2);
if (args.includes('--audit') || args.includes('--check')) {
  const audit = auditTurboSettings();
  console.log(`Settings file: ${audit.filePath}`);
  console.log(`Compliant with Turbo Preset: ${audit.isCompliant ? '\x1b[32mYES\x1b[0m' : '\x1b[33mNO\x1b[0m'}`);
  if (audit.diff.length > 0) {
    console.log(`\nPending optimizations (${audit.diff.length}):`);
    for (const d of audit.diff) {
      console.log(`  - \x1b[36m${d.key}\x1b[0m`);
    }
  }
} else {
  const res = applyTurboPreset({ dryRun: args.includes('--dry-run') });
  console.log(`\x1b[32m✓ Antigravity Turbo Preset applied to:\x1b[0m ${res.filePath}`);
  console.log(`  Optimized ${res.appliedKeys.length} settings for low-latency & high performance.`);
}
process.exit(0);

