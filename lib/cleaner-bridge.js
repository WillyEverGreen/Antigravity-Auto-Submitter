/**
 * Antigravity PowerTools — Storage & Memory Cleaner Bridge
 * 
 * Safely bridges VS Code extension and CLI commands to the battle-tested
 * Python cleaner (`scripts/antigravity_cleaner.py`) and brain pruner.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'antigravity_cleaner.py');

function findPython(customPath) {
  if (customPath) {
    if (typeof customPath !== 'string' || !customPath.trim()) {
      throw new TypeError('pythonPath must be a non-empty string');
    }
    const probe = spawnSync(customPath, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (!probe.error && probe.status === 0) {
      return customPath;
    }
    throw new Error(`Custom Python executable at "${customPath}" failed execution check.`);
  }

  const commands = process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'];

  for (const cmd of commands) {
    const probe = spawnSync(cmd, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (!probe.error && probe.status === 0) {
      return cmd;
    }
  }
  return null;
}

function validateOlderThan(olderThan) {
  if (olderThan === undefined || olderThan === null) return null;
  const num = Number(olderThan);
  if (!Number.isFinite(num) || num <= 0) {
    throw new TypeError('olderThan must be a positive number of days');
  }
  return Math.round(num);
}

function auditDiskUsage(options = {}) {
  const py = findPython(options.pythonPath);
  if (!py) {
    throw new Error('Python 3 is required for cache auditing but was not found in PATH.');
  }
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`Cleaner script not found at ${SCRIPT_PATH}`);
  }

  const args = [SCRIPT_PATH, '--check', '--json'];
  const days = validateOlderThan(options.olderThan);
  if (days) {
    args.push('--older-than', String(days));
  }

  const res = spawnSync(py, args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Audit process exited with code ${res.status}: ${res.stderr || res.stdout}`);
  }

  try {
    return JSON.parse(res.stdout);
  } catch (err) {
    throw new Error(`Invalid JSON output from cleaner audit: ${res.stdout}`);
  }
}

function cleanSafeCaches(options = {}) {
  const py = findPython(options.pythonPath);
  if (!py) {
    throw new Error('Python 3 is required for cache cleaning but was not found in PATH.');
  }

  const args = [SCRIPT_PATH];
  if (options.dryRun) {
    args.push('--check', '--json');
  } else {
    args.push('--clean', '--tier', '1', '--force-clean', '--json');
  }

  const days = validateOlderThan(options.olderThan);
  if (days) {
    args.push('--older-than', String(days));
  }

  const res = spawnSync(py, args, { encoding: 'utf8', windowsHide: true, timeout: 45000 });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Cleaner exited with code ${res.status}: ${res.stderr || res.stdout}`);
  }

  try {
    return JSON.parse(res.stdout);
  } catch (err) {
    return { rawOutput: res.stdout, success: true };
  }
}

module.exports = {
  findPython,
  validateOlderThan,
  auditDiskUsage,
  cleanSafeCaches
};
