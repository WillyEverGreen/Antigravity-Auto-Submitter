#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'scripts', 'antigravity_cleaner.py');
const args = ['--check', ...process.argv.slice(2)];

const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';
const proc = spawn(pythonCmd, [scriptPath, ...args], { stdio: 'inherit' });

proc.on('error', (err) => {
  if (err.code === 'ENOENT') {
    // Fallback to python if py/python3 is not directly mapped
    spawn('python', [scriptPath, ...args], { stdio: 'inherit' });
  } else {
    console.error('Failed to start antigravity-check:', err);
  }
});
