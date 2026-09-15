#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'scripts', 'antigravity_brain.py');
const args = process.argv.slice(2);

const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
const proc = spawn(pythonCmd, [scriptPath, ...args], { stdio: 'inherit' });

proc.on('error', (err) => {
  if (err.code === 'ENOENT') {
    spawn('python', [scriptPath, ...args], { stdio: 'inherit' });
  } else {
    console.error('Failed to start antigravity-brain:', err);
  }
});
