#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'scripts', 'antigravity_brain.py');
const args = process.argv.slice(2);

const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
let res = spawnSync(pythonCmd, [scriptPath, ...args], { stdio: 'inherit' });

if (res.error && res.error.code === 'ENOENT') {
  res = spawnSync('python', [scriptPath, ...args], { stdio: 'inherit' });
}

if (res.error) {
  console.error('\n  \x1b[31m✗ Python 3 runtime is required for antigravity-brain.\x1b[0m');
  console.error('  \x1b[90mPlease install Python 3 from https://python.org or run:\x1b[0m');
  console.error('  \x1b[36mwinget install Python.Python.3\x1b[0m (Windows) or \x1b[36mbrew install python3\x1b[0m (macOS/Linux)\n');
  process.exit(1);
}

process.exit(res.status !== null ? res.status : 0);
