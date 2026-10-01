#!/usr/bin/env node
/**
 * Kiro Auto-Accept Installation Script
 * Handles global installation and setup
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const GLOBAL_DIR = path.join(os.homedir(), '.kiro-auto-accept');
const CONFIG_FILE = path.join(GLOBAL_DIR, 'config.json');
const STATS_FILE = path.join(GLOBAL_DIR, 'stats.json');

// Colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

console.log(`\n${C.bold}${C.brightCyan}⚡ Kiro Auto-Accept Installation${C.reset}\n`);

// Create global directory
if (!fs.existsSync(GLOBAL_DIR)) {
  try {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    console.log(`${C.green}✔ Created global directory: ${GLOBAL_DIR}${C.reset}`);
  } catch (e) {
    console.error(`${C.red}✗ Failed to create global directory: ${e.message}${C.reset}`);
    process.exit(1);
  }
}

// Create default config if not exists
if (!fs.existsSync(CONFIG_FILE)) {
  const defaultConfig = {
    enabled: true,
    mode: 'autonomous',
    cdpPort: 0,
    cdpPorts: [],
    safetyDelayMs: 200,
    pollIntervalMs: 250,
    autoSelectAlwaysAllow: false,
    askKeywords: [
      'git push',
      'git reset --hard',
      'rm -rf',
      'execute_pwsh'
    ],
    skipKeywords: [
      'drop table',
      'git push --force',
      'format c:',
      'del /f /s /q c:',
      'Remove-Item -Recurse -Force C:\\'
    ]
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log(`${C.green}✔ Created global config: ${CONFIG_FILE}${C.reset}`);
  } catch (e) {
    console.error(`${C.red}✗ Failed to create config: ${e.message}${C.reset}`);
  }
}

// Create stats file if not exists
if (!fs.existsSync(STATS_FILE)) {
  const defaultStats = {
    accepted: 0,
    skipped: 0,
    asked: 0,
    startTime: Date.now(),
    sessions: 0
  };

  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(defaultStats, null, 2), 'utf8');
    console.log(`${C.green}✔ Created stats file: ${STATS_FILE}${C.reset}`);
  } catch (e) {
    console.error(`${C.red}✗ Failed to create stats file: ${e.message}${C.reset}`);
  }
}

// Check Node.js version
const nodeVer = process.version;
const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
if (major < 18) {
  console.log(`\n${C.yellow}⚠️ Warning: Node.js ${nodeVer} detected. Requires >=18.0.0${C.reset}`);
  console.log(`${C.dim}Please upgrade Node.js for best compatibility.${C.reset}\n`);
} else {
  console.log(`${C.green}✔ Node.js ${nodeVer} (supported)${C.reset}`);
}

// Check for Kiro/VS Code installation
let ideFound = false;
if (process.platform === 'win32') {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Kiro', 'Kiro.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Kiro', 'Kiro.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Kiro', 'Kiro.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log(`${C.green}✔ Found IDE: ${c}${C.reset}`);
      ideFound = true;
      break;
    }
  }
}

console.log(`\n${C.bold}${C.brightGreen}✔ Installation Complete!${C.reset}\n`);

console.log(`${C.bold}${C.cyan}Next Steps:${C.reset}`);
console.log(`  1. Run: ${C.bold}kiro-auto-accept doctor${C.reset} (check system health)`);
console.log(`  2. Run: ${C.bold}kiro-auto-accept start${C.reset} (launch & start daemon)\n`);

console.log(`${C.bold}${C.cyan}Quick Reference:${C.reset}`);
console.log(`  ${C.dim}• Start daemon:        ${C.reset}${C.bold}kiro-auto-accept${C.reset}`);
console.log(`  ${C.dim}• Easy start:          ${C.reset}${C.bold}kiro-auto-accept start${C.reset}`);
console.log(`  ${C.dim}• System diagnostics:  ${C.reset}${C.bold}kiro-auto-accept doctor${C.reset}`);
console.log(`  ${C.dim}• Show rules:          ${C.reset}${C.bold}kiro-auto-accept list${C.reset}`);
console.log(`  ${C.dim}• Project config:      ${C.reset}${C.bold}kiro-auto-accept init${C.reset}`);
console.log(`  ${C.dim}• Help:                ${C.reset}${C.bold}kiro-auto-accept --help${C.reset}\n`);

console.log(`${C.dim}Global config: ${CONFIG_FILE}${C.reset}`);
console.log(`${C.dim}Documentation: See KIRO-README.md${C.reset}\n`);
