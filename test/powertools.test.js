/**
 * Automated test suite for Antigravity PowerTools Core Modules
 * Tests: Turbo Preset, Cleaner Bridge, Time-Travel Snapshots, Cost Router.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

console.log('🧪 Starting Antigravity PowerTools Core Test Suite...\n');

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

// ── 1. Turbo Preset Applicator ──
const { TURBO_PRESET, applyTurboPreset, auditTurboSettings, readSettings } = require('../lib/turbo-preset');

it('TURBO_PRESET contains expected low-latency performance keys', () => {
  assert(TURBO_PRESET['files.watcherExclude']);
  assert.strictEqual(TURBO_PRESET['editor.cursorBlinking'], 'blink');
  assert.strictEqual(TURBO_PRESET['editor.smoothScrolling'], false);
  assert.strictEqual(TURBO_PRESET['typescript.tsserver.maxTsServerMemory'], 1536);
  assert.strictEqual(TURBO_PRESET['telemetry.telemetryLevel'], 'off');
});

it('applyTurboPreset dryRun does not write to disk', () => {
  const tmpFile = path.join(os.tmpdir(), `test-settings-dry-${Date.now()}.json`);
  const res = applyTurboPreset({ dryRun: true, settingsPath: tmpFile });
  assert.strictEqual(res.dryRun, true);
  assert.strictEqual(fs.existsSync(tmpFile), false);
});

it('applyTurboPreset writes atomically and tolerates UTF-8 BOM', () => {
  const tmpFile = path.join(os.tmpdir(), `test-settings-${Date.now()}.json`);
  // Write BOM + valid JSON
  fs.writeFileSync(tmpFile, '\uFEFF{"custom.setting": true}\n', 'utf8');

  const res = applyTurboPreset({ dryRun: false, settingsPath: tmpFile });
  assert.strictEqual(fs.existsSync(tmpFile), true);
  const reloaded = readSettings(tmpFile);
  assert.strictEqual(reloaded['custom.setting'], true);
  assert.strictEqual(reloaded['editor.cursorBlinking'], 'blink');
  assert.strictEqual(reloaded['typescript.tsserver.maxTsServerMemory'], 1536);

  const audit = auditTurboSettings({ settingsPath: tmpFile });
  assert.strictEqual(audit.isCompliant, true);
  try { fs.unlinkSync(tmpFile); } catch (e) {}
});

// ── 2. Time-Travel Snapshots ──
const { isGitRepo, createCheckpoint, listCheckpoints, rollbackToCheckpoint } = require('../lib/time-travel');

it('time-travel detects git repository status cleanly', () => {
  const isRepo = isGitRepo(__dirname);
  assert.strictEqual(isRepo, true);
});

it('createCheckpoint and listCheckpoints capture tree snapshot', () => {
  const root = path.join(__dirname, '..');
  const ckpt = createCheckpoint('Test checkpoint for PowerTools', root);
  assert(ckpt.id.startsWith('ckpt_'));
  assert(ckpt.treeSha);
  assert(ckpt.timestamp);

  const all = listCheckpoints(root);
  assert(all.some(c => c.id === ckpt.id));

  const dryRollback = rollbackToCheckpoint(ckpt.id, root, { dryRun: true });
  assert.strictEqual(dryRollback.dryRun, true);
  assert.strictEqual(dryRollback.target.id, ckpt.id);
});

// ── 3. Smart Model Tier & Cost Router ──
const { classifyTask, calculateSavingsSummary, MODEL_TIERS } = require('../lib/cost-router');

it('classifyTask routes commit messages and linting to Economy tier', () => {
  const res1 = classifyTask('write a git commit message for this patch');
  assert.strictEqual(res1.tier, 'economy');
  assert(res1.savingsPercentage >= 90);

  const res2 = classifyTask('fix eslint warnings in auth.ts');
  assert.strictEqual(res2.tier, 'economy');
});

it('classifyTask routes architecture and spec tasks to Flagship tier', () => {
  const res = classifyTask('architect a distributed multi-agent payment system PRD');
  assert.strictEqual(res.tier, 'flagship');
  assert.strictEqual(res.savingsPercentage, 0);
});

it('classifyTask routes standard implementation to Balanced tier', () => {
  const res = classifyTask('implement user login controller and hash passwords');
  assert.strictEqual(res.tier, 'balanced');
  assert(res.savingsPercentage >= 90);
});

it('calculateSavingsSummary calculates aggregate token savings', () => {
  const summary = calculateSavingsSummary([
    { prompt: 'write git commit message', tokenEstimate: 500 },
    { prompt: 'implement login feature', tokenEstimate: 4000 },
    { prompt: 'fix typo', tokenEstimate: 200 }
  ]);
  assert(summary.savingsPercentage > 70);
  assert(summary.netSavingsUsd > 0);
});

console.log(`\nResults: ${passed}/${total} PowerTools core tests passed.`);
if (process.exitCode) process.exit(process.exitCode);

