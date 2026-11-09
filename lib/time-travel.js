/**
 * Antigravity PowerTools — Time-Travel Snapshots (Instant State Rollback)
 * 
 * Takes silent git micro-checkpoints before and after agent modifications.
 * Enables 1-click conflict-free tree rollbacks to rescue projects from rogue edits.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CHECKPOINT_FILE = '.ag-checkpoints.json';

function validateCwd(cwd) {
  const resolved = path.resolve(cwd || process.cwd());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Invalid working directory: ${cwd}`);
  }
  return resolved;
}

function getStorePath(cwd) {
  const validCwd = validateCwd(cwd);
  const resolved = path.resolve(validCwd, CHECKPOINT_FILE);
  if (!resolved.startsWith(validCwd + path.sep) && resolved !== path.join(validCwd, CHECKPOINT_FILE)) {
    throw new Error('Checkpoint file path escape detected');
  }
  return resolved;
}

function runGit(args, cwd = process.cwd()) {
  const validCwd = validateCwd(cwd);
  const res = spawnSync('git', args, { cwd: validCwd, encoding: 'utf8', windowsHide: true });
  if (res.error) throw res.error;
  return res;
}

function isGitRepo(cwd = process.cwd()) {
  try {
    const res = runGit(['rev-parse', '--is-inside-work-tree'], cwd);
    return res.status === 0 && res.stdout.trim() === 'true';
  } catch (e) {
    return false;
  }
}

function loadCheckpointStore(cwd = process.cwd()) {
  const storePath = getStorePath(cwd);
  if (!fs.existsSync(storePath)) return { checkpoints: [] };
  try {
    let raw = fs.readFileSync(storePath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const parsed = JSON.parse(raw);
    return {
      checkpoints: Array.isArray(parsed?.checkpoints) ? parsed.checkpoints : []
    };
  } catch (e) {
    return { checkpoints: [] };
  }
}

function saveCheckpointStore(data, cwd = process.cwd()) {
  const storePath = getStorePath(cwd);
  const rand = crypto.randomBytes(6).toString('hex');
  let tmpPath = `${storePath}.tmp.${process.pid}.${rand}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, storePath);
    tmpPath = null;
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch (e) {}
    }
  }
}

function createCheckpoint(description = 'Autonomous checkpoint', cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    throw new Error('Time-Travel Snapshots require an active git repository.');
  }

  // 1. Stage changes safely or write index tree
  runGit(['add', '-A'], cwd);
  const treeRes = runGit(['write-tree'], cwd);
  if (treeRes.status !== 0) {
    throw new Error(`Failed to create git tree snapshot: ${treeRes.stderr}`);
  }
  const treeSha = treeRes.stdout.trim();

  // 2. Get current HEAD and branch
  const headRes = runGit(['rev-parse', 'HEAD'], cwd);
  const headSha = headRes.status === 0 ? headRes.stdout.trim() : 'EMPTY';
  const branchRes = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const branch = branchRes.status === 0 ? branchRes.stdout.trim() : 'HEAD';

  // 3. Count modified files
  const statusRes = runGit(['status', '--porcelain'], cwd);
  const modifiedFiles = statusRes.stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const id = `ckpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const checkpoint = {
    id,
    treeSha,
    headSha,
    branch,
    timestamp: new Date().toISOString(),
    description,
    fileCount: modifiedFiles.length,
    files: modifiedFiles.slice(0, 50)
  };

  // 4. Create git ref
  runGit(['update-ref', `refs/ag-checkpoints/${id}`, treeSha], cwd);

  // 5. Append to store
  const store = loadCheckpointStore(cwd);
  store.checkpoints.unshift(checkpoint);
  if (store.checkpoints.length > 50) {
    const pruned = store.checkpoints.slice(50);
    store.checkpoints = store.checkpoints.slice(0, 50);
    for (const p of pruned) {
      try { runGit(['update-ref', '-d', `refs/ag-checkpoints/${p.id}`], cwd); } catch (_) {}
    }
  }
  saveCheckpointStore(store, cwd);

  return checkpoint;
}

function listCheckpoints(cwd = process.cwd()) {
  const store = loadCheckpointStore(cwd);
  return store.checkpoints || [];
}

function rollbackToCheckpoint(checkpointId, cwd = process.cwd(), options = {}) {
  if (!isGitRepo(cwd)) {
    throw new Error('Time-Travel Snapshots require an active git repository.');
  }

  const store = loadCheckpointStore(cwd);
  const target = store.checkpoints.find(c => c.id === checkpointId || c.id.startsWith(checkpointId));
  if (!target) {
    throw new Error(`Checkpoint "${checkpointId}" not found in history.`);
  }

  if (options.dryRun) {
    return { dryRun: true, target, message: `Would restore tree ${target.treeSha} (${target.description})` };
  }

  // Restore index from snapshot tree
  const readRes = runGit(['read-tree', target.treeSha], cwd);
  if (readRes.status !== 0) {
    throw new Error(`Failed to read git tree ${target.treeSha}: ${readRes.stderr}`);
  }

  // Checkout files to working tree cleanly
  const checkoutRes = runGit(['checkout-index', '-a', '-f'], cwd);
  if (checkoutRes.status !== 0) {
    throw new Error(`Failed to checkout working files: ${checkoutRes.stderr}`);
  }

  return {
    success: true,
    checkpoint: target,
    restoredTree: target.treeSha,
    timestamp: target.timestamp
  };
}

module.exports = {
  isGitRepo,
  createCheckpoint,
  listCheckpoints,
  rollbackToCheckpoint
};

