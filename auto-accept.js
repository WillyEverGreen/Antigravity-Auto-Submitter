#!/usr/bin/env node
/**
 * Antigravity Auto-Submit — Ultra-Modern Developer CLI
 * 
 * Inspired by Vite, Astro, and Gum:
 * - Instant single-key hotkeys (no Enter required)
 * - Rounded Unicode aesthetic styling & badges
 * - "auto-accept init" to drop project rules into any folder
 * - Zero external dependencies (pure native Node.js)
 * 
 * Author: WillyEverGreen / advdi
 * License: MIT
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawn, spawnSync, execSync } = require('child_process');

// ── Package Metadata ──
let PKG_VERSION = '1.8.1';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  if (pkg.version) PKG_VERSION = pkg.version;
} catch (e) {}

// ── Paths ──
const GLOBAL_DIR = path.join(os.homedir(), '.antigravity-auto-submit');
const STATS_FILE = path.join(GLOBAL_DIR, 'stats.json');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_DIR, 'config.json');
const LOCAL_CONFIG_FILES = ['.auto-accept.json', 'auto-accept.config.json'];

function getPidFilePath(portKey = 'auto') {
  const safeKey = String(portKey).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(GLOBAL_DIR, `daemon_${safeKey}.pid`);
}

function acquireDaemonLock(portKey = 'auto', force = false) {
  if (typeof portKey === 'boolean') {
    force = portKey;
    portKey = 'auto';
  }
  if (!fs.existsSync(GLOBAL_DIR)) {
    try { fs.mkdirSync(GLOBAL_DIR, { recursive: true }); } catch (e) {}
  }
  const pidFile = getPidFilePath(portKey);
  if (!force && fs.existsSync(pidFile)) {
    try {
      const existingPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (existingPid && existingPid !== process.pid) {
        try {
          process.kill(existingPid, 0);
          return existingPid;
        } catch (e) {
          // Process not active, stale lock
        }
      }
    } catch (e) {}
  }

  // Clean up legacy daemon.pid if present and stale
  try {
    const legacy = path.join(GLOBAL_DIR, 'daemon.pid');
    if (fs.existsSync(legacy)) {
      const legPid = parseInt(fs.readFileSync(legacy, 'utf8').trim(), 10);
      try { process.kill(legPid, 0); } catch (e) { fs.unlinkSync(legacy); }
    }
  } catch (e) {}

  try { fs.writeFileSync(pidFile, String(process.pid), 'utf8'); } catch (e) {}
  return null;
}

function releaseDaemonLock(portKey = 'auto') {
  if (typeof portKey !== 'string' && typeof portKey !== 'number') portKey = 'auto';
  try {
    const pidFile = getPidFilePath(portKey);
    if (fs.existsSync(pidFile)) {
      const existingPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (existingPid === process.pid) {
        fs.unlinkSync(pidFile);
      }
    }
  } catch (e) {}
}

// ── Default Safety Profile ──
const DEFAULTS = {
  enabled: true,
  mode: 'autonomous', // 'autonomous' | 'autopilot'
  cdpPort: 0,         // 0 = auto-detect 9333 / scan 9000-9400
  cdpPorts: [],       // explicit candidate ports e.g. [9333, 9334]
  safetyDelayMs: 200,
  pollIntervalMs: 250,
  autoSelectAlwaysAllow: false, // Default false: preserves per-command keyword gating
  daemon: false,
  quiet: false,
  askKeywords: [
    'git push',
    'git reset --hard'
  ],
  skipKeywords: [
    'rm -rf',
    'drop table',
    'git push --force',
    'format c:',
    'del /f /s /q c:'
  ]
};

// ── Colors & Badges ──
const isTty = process.stdout.isTTY && !process.env.NO_COLOR;
const C = {
  reset:     isTty ? '\x1b[0m' : '',
  bold:      isTty ? '\x1b[1m' : '',
  dim:       isTty ? '\x1b[2m' : '',
  underline: isTty ? '\x1b[4m' : '',
  
  // Foreground
  cyan:      isTty ? '\x1b[36m' : '',
  brightCyan:isTty ? '\x1b[96m' : '',
  green:     isTty ? '\x1b[32m' : '',
  brightGreen:isTty ? '\x1b[92m' : '',
  yellow:    isTty ? '\x1b[33m' : '',
  brightYellow:isTty ? '\x1b[93m' : '',
  red:       isTty ? '\x1b[31m' : '',
  magenta:   isTty ? '\x1b[35m' : '',
  brightMagenta:isTty ? '\x1b[95m' : '',
  white:     isTty ? '\x1b[37m' : '',
  gray:      isTty ? '\x1b[90m' : '',

  // Pills / Badges
  pillGreen:   isTty ? '\x1b[1m\x1b[42m\x1b[30m' : '',
  pillYellow:  isTty ? '\x1b[1m\x1b[43m\x1b[30m' : '',
  pillCyan:    isTty ? '\x1b[1m\x1b[46m\x1b[30m' : '',
  pillMagenta: isTty ? '\x1b[1m\x1b[45m\x1b[30m' : '',
  pillGray:    isTty ? '\x1b[1m\x1b[100m\x1b[37m' : '',
};

function cleanStr(s, maxLen = 70) {
  if (s == null) return '';
  try {
    const cleaned = String(s)
      .replace(/[\r\n\t\u21b5\u23ce\u21a9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.slice(0, maxLen) + '...';
  } catch (e) {
    return '';
  }
}

// ── Subcommand: init ──
function handleInit() {
  const target = path.join(process.cwd(), '.auto-accept.json');
  if (fs.existsSync(target)) {
    console.log(`\n${C.yellow}⚠️ .auto-accept.json already exists in:${C.reset} ${process.cwd()}\n`);
    process.exit(0);
  }

  const template = {
    mode: "autonomous",
    safetyDelayMs: 200,
    askKeywords: [
      "git push",
      "git reset --hard"
    ],
    skipKeywords: [
      "rm -rf",
      "drop table",
      "git push --force",
      "format c:",
      "del /f /s /q c:"
    ]
  };

  fs.writeFileSync(target, JSON.stringify(template, null, 2), 'utf8');
  console.log(`
${C.bold}${C.brightCyan}✔ Initialized Antigravity Auto-Submit config!${C.reset}
  Created: ${C.green}${target}${C.reset}

${C.dim}You can now customize Ask/Skip guardrails for this project.${C.reset}
${C.dim}Run ${C.reset}${C.bold}auto-accept${C.reset}${C.dim} in this directory anytime.${C.reset}
`);
  process.exit(0);
}

// ── Subcommand: list ──
function handleList(cfg, shouldExit = true) {
  console.log(`
${C.bold}${C.cyan}Antigravity Auto-Submit — Active Rules${C.reset}

  ${C.bold}Operating Mode:${C.reset} ${cfg.mode === 'autopilot' ? `${C.magenta}AUTOPILOT (100% Hands-Free)${C.reset}` : `${C.cyan}AUTONOMOUS (Reviews Plans)${C.reset}`}
  ${C.bold}Click Delay:${C.reset}    ${cfg.safetyDelayMs}ms

  ${C.yellow}✋ Ask Permission List (${cfg.askKeywords.length} rules):${C.reset}
${cfg.askKeywords.map(k => `    • "${k}"`).join('\n') || '    (none)'}

  ${C.magenta}⏩ Directly Skip List (${cfg.skipKeywords.length} rules):${C.reset}
${cfg.skipKeywords.map(k => `    • "${k}"`).join('\n') || '    (none)'}
`);
  if (shouldExit) process.exit(0);
}

// ── Subcommand: doctor (Connection & Setup Guide) ──
async function handleDoctor(cfg, shouldExit = true) {
  console.log(`\n${C.bold}${C.brightCyan}⚡ Antigravity Auto-Submitter — System Doctor${C.reset}\n`);

  // 1. Node.js check
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  const nodeOk = major >= 18;
  console.log(`  ${C.bold}Node.js Version:${C.reset}     ${nodeVer} ${nodeOk ? `${C.green}✔ (Supported: >=18.0.0)${C.reset}` : `${C.red}✗ (Requires Node.js 18+)${C.reset}`}`);
  console.log(`  ${C.bold}Operating System:${C.reset}   ${process.platform} (${os.type()} ${os.release()})`);

  // 2. Python Runtime check (for cleanup & audit suite)
  let pyVersion = null;
  const pyCmds = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const cmd of pyCmds) {
    try {
      const pyOut = execSync(`${cmd} --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (pyOut) {
        pyVersion = `${cmd} (${pyOut})`;
        break;
      }
    } catch (e) {}
  }
  console.log(`  ${C.bold}Python Runtime:${C.reset}     ${pyVersion ? `${pyVersion} ${C.green}✔${C.reset}` : `${C.yellow}Not found ⚠️ (Needed for audit & clean suite)${C.reset}`}`);

  // 3. Executables check (Both IDE & App)
  const exes = findAntigravityExecutables();
  console.log(`  ${C.bold}Antigravity IDE:${C.reset}    ${exes.ide ? `${C.cyan}${cleanStr(exes.ide, 60)}${C.reset} ${C.green}✔${C.reset}` : `${C.dim}Not detected in standard paths${C.reset}`}`);
  console.log(`  ${C.bold}Antigravity App:${C.reset}    ${exes.app ? `${C.cyan}${cleanStr(exes.app, 60)}${C.reset} ${C.green}✔${C.reset}` : `${C.dim}Not detected in standard paths${C.reset}`}`);

  // 4. Process Status check
  const running = getRunningAntigravity();
  const ideStateStr = running.ide ? `${C.green}RUNNING${C.reset}` : `${C.dim}CLOSED${C.reset}`;
  const appStateStr = running.app ? `${C.green}RUNNING${C.reset}` : `${C.dim}CLOSED${C.reset}`;
  console.log(`  ${C.bold}Running State:${C.reset}      IDE: ${ideStateStr}  |  App: ${appStateStr}`);

  // 5. CDP Port check
  process.stdout.write(`  ${C.bold}CDP Port Status:${C.reset}    Scanning active ports & windows...\r`);
  const endpoints = await findCdpEndpoints(cfg.cdpPort, cfg.cdpPorts);

  if (endpoints.length > 0) {
    const portsStr = endpoints.map(e => e.port).join(', ');
    console.log(`  ${C.bold}CDP Port Status:${C.reset}    ${C.green}Connected on port(s): ${portsStr} ✔${C.reset}                                 `);
    let winCount = 0;
    endpoints.forEach(ep => {
      const targets = selectAllWorkbenchTargets(ep.targets);
      targets.forEach(t => {
        winCount++;
        console.log(`  ${C.bold}Window [${winCount}]:${C.reset}         ${C.cyan}"${cleanStr(t.title || 'Antigravity', 60)}"${C.reset} (Port ${ep.port}) ✔`);
      });
    });
    console.log(`  ${C.bold}Confirmation Engine:${C.reset}${C.green} Ready for multi-window auto-approvals! (${winCount} window(s)) ✔${C.reset}\n`);

    const connectedPorts = endpoints.map(e => e.port);
    if (running.app && !connectedPorts.includes(9334)) {
      console.log(`  ${C.yellow}ℹ  Note: Antigravity App is running, but port 9334 is closed.${C.reset}`);
      console.log(`     ${C.dim}To enable auto-approvals in Antigravity App: close it and launch from its Desktop/Start Menu shortcut, or run 'auto-accept restart app'.${C.reset}\n`);
    }
    if (running.ide && !connectedPorts.includes(9333)) {
      console.log(`  ${C.yellow}ℹ  Note: Antigravity IDE is running, but port 9333 is closed.${C.reset}`);
      console.log(`     ${C.dim}To enable auto-approvals in Antigravity IDE: close it and launch from its Desktop/Start Menu shortcut, or run 'auto-accept restart ide'.${C.reset}\n`);
    }
    console.log(`  ${C.bold}${C.green}Status:${C.reset} All systems operational! Run ${C.bold}auto-accept${C.reset} to start the daemon.\n`);
  } else {
    console.log(`  ${C.bold}CDP Port Status:${C.reset}    ${C.yellow}No active port detected ⚠️${C.reset}                                     \n`);

    if (running.any) {
      console.log(`  ${C.bold}${C.red}✗ ROOT CAUSE IDENTIFIED:${C.reset}`);
      if (running.ide && running.app) {
        console.log(`  Both Antigravity IDE and Antigravity App are running, but their debugging ports are inactive.`);
        console.log(`  (Note: IDE requires port ${C.yellow}9333${C.reset} and App requires port ${C.yellow}9334${C.reset} to avoid port collisions).\n`);
      } else if (running.app) {
        console.log(`  Antigravity App is running, but was started without ${C.yellow}--remote-debugging-port=9334${C.reset}.`);
        console.log(`  Chromium cannot attach a debugging port to an already-running process.\n`);
      } else {
        console.log(`  Antigravity IDE is running, but was started without ${C.yellow}--remote-debugging-port=9333${C.reset}.`);
        console.log(`  Chromium cannot attach a debugging port to an already-running process.\n`);
      }
      console.log(`  ${C.bold}👉 QUICK FIX (Choose one):${C.reset}`);
      console.log(`     • Run: ${C.bold}${C.cyan}auto-accept setup${C.reset}   (automatically sets Port 9333 for IDE and Port 9334 for App shortcuts)`);
      console.log(`     • Run: ${C.bold}${C.cyan}auto-accept restart${C.reset} (restarts with debugging ports enabled)`);
      console.log(`     • OR reopen Antigravity from your shortcut configured with remote debugging flags.`);
      console.log(`     • Then run: ${C.bold}${C.green}auto-accept${C.reset}\n`);
    } else {
      printSetupInstructions();
    }
  }
  if (shouldExit) process.exit(0);
}

function getRunningAntigravity() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /NH 2>nul', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const ide = /antigravity ide\.exe/i.test(out);
      const lines = out.split(/[\r\n]+/);
      const app = lines.some(l => /^antigravity\.exe\b/i.test(l.trim()));
      return { ide, app, any: ide || app };
    } else if (process.platform === 'darwin') {
      const out = execSync('ps -A -o comm= 2>/dev/null', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const ide = /Antigravity IDE/i.test(out);
      const app = /(^|\n)[^\n]*Antigravity\.app\/Contents\/MacOS\/Antigravity(\n|$)/i.test(out);
      return { ide, app, any: ide || app };
    } else {
      const out = execSync('ps -A -o comm= 2>/dev/null', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const ide = /antigravity-ide/i.test(out);
      const app = /(^|\n)antigravity(\n|$)/i.test(out);
      return { ide, app, any: ide || app };
    }
  } catch (e) {
    return { ide: false, app: false, any: false };
  }
}

function isAntigravityRunning(target = 'any') {
  const r = getRunningAntigravity();
  if (target === 'ide') return r.ide;
  if (target === 'app') return r.app;
  return r.any;
}

function killAntigravity(target = 'all') {
  try {
    if (process.platform === 'win32') {
      if (target === 'all' || target === 'ide') {
        try { execSync('taskkill /F /IM "Antigravity IDE.exe" /T 2>nul', { stdio: 'ignore' }); } catch (e) {}
      }
      if (target === 'all' || target === 'app') {
        try { execSync('taskkill /F /IM "Antigravity.exe" /T 2>nul', { stdio: 'ignore' }); } catch (e) {}
      }
      try {
        const psKillChrome = 'Get-CimInstance Win32_Process -Filter "name = \'chrome.exe\'" | Where-Object { $_.CommandLine -like "*antigravity-browser-profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }';
        execSync(`powershell -NoProfile -NonInteractive -Command "${psKillChrome}" 2>nul`, { stdio: 'ignore', timeout: 3000 });
      } catch (e) {}
    } else if (process.platform === 'darwin') {
      if (target === 'all' || target === 'ide') {
        try { execSync('pkill -9 -f "Antigravity IDE" 2>/dev/null', { stdio: 'ignore' }); } catch (e) {}
      }
      if (target === 'all' || target === 'app') {
        try { execSync('pkill -9 -f "Antigravity" 2>/dev/null', { stdio: 'ignore' }); } catch (e) {}
      }
    } else {
      if (target === 'all' || target === 'ide') {
        try { execSync('pkill -9 -f antigravity-ide 2>/dev/null', { stdio: 'ignore' }); } catch (e) {}
      }
      if (target === 'all' || target === 'app') {
        try { execSync('pkill -9 -f antigravity 2>/dev/null', { stdio: 'ignore' }); } catch (e) {}
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

function findAntigravityExecutables() {
  const result = { ide: null, app: null };

  if (process.platform === 'win32') {
    const ideCandidates = [
      process.env.ANTIGRAVITY_IDE_EXE,
      process.env.ANTIGRAVITY_IDE_PATH,
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Antigravity IDE', 'Antigravity IDE.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Antigravity IDE', 'Antigravity IDE.exe'),
      path.join(process.env.APPDATA || '', 'Local', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe')
    ].filter(Boolean);

    const appCandidates = [
      process.env.ANTIGRAVITY_APP_EXE,
      process.env.ANTIGRAVITY_APP_PATH,
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Antigravity', 'Antigravity.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Antigravity', 'Antigravity.exe'),
      path.join(process.env.APPDATA || '', 'Local', 'Programs', 'Antigravity', 'Antigravity.exe')
    ].filter(Boolean);

    result.ide = ideCandidates.find(c => fs.existsSync(c)) || null;
    result.app = appCandidates.find(c => fs.existsSync(c)) || null;

    if (!result.ide || !result.app) {
      try {
        const psFind = `
          $shell = New-Object -ComObject WScript.Shell
          $dirs = @(
            [Environment]::GetFolderPath('Desktop'),
            (Join-Path $env:USERPROFILE 'Desktop'),
            (Join-Path $env:USERPROFILE 'OneDrive\\Desktop'),
            [Environment]::GetFolderPath('Programs'),
            [Environment]::GetFolderPath('CommonPrograms')
          ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
          $foundIde = ''
          $foundApp = ''
          foreach ($d in $dirs) {
            Get-ChildItem -Path $d -Filter "*Antigravity*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
              try {
                $target = $shell.CreateShortcut($_.FullName).TargetPath
                if ($target -and (Test-Path $target)) {
                  if (!$foundIde -and ($target -like "*Antigravity IDE*.exe")) { $foundIde = $target }
                  elseif (!$foundApp -and ($target -like "*Antigravity*.exe") -and ($target -notlike "*Antigravity IDE*")) { $foundApp = $target }
                }
              } catch {}
            }
          }
          Write-Output "IDE:$foundIde"
          Write-Output "APP:$foundApp"
        `;
        const lines = execSync(`powershell -NoProfile -Command "${psFind.replace(/[\r\n]+/g, '; ')}"`, { encoding: 'utf8' }).trim().split(/[\r\n]+/);
        lines.forEach(l => {
          if (l.startsWith('IDE:') && !result.ide) { const p = l.slice(4).trim(); if (p && fs.existsSync(p)) result.ide = p; }
          if (l.startsWith('APP:') && !result.app) { const p = l.slice(4).trim(); if (p && fs.existsSync(p)) result.app = p; }
        });
      } catch (e) {}
    }
  } else if (process.platform === 'darwin') {
    const ideCandidates = [
      '/Applications/Antigravity IDE.app/Contents/MacOS/Antigravity IDE',
      path.join(os.homedir(), 'Applications', 'Antigravity IDE.app', 'Contents', 'MacOS', 'Antigravity IDE'),
      '/Applications/Antigravity IDE.app'
    ];
    const appCandidates = [
      '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
      path.join(os.homedir(), 'Applications', 'Antigravity.app', 'Contents', 'MacOS', 'Antigravity'),
      '/Applications/Antigravity.app'
    ];
    result.ide = ideCandidates.find(c => fs.existsSync(c)) || null;
    result.app = appCandidates.find(c => fs.existsSync(c)) || null;
  } else {
    // Linux
    const ideCandidates = [
      '/opt/Antigravity IDE/antigravity',
      path.join(os.homedir(), '.local', 'bin', 'antigravity-ide'),
      '/usr/bin/antigravity-ide'
    ];
    const appCandidates = [
      '/usr/bin/antigravity',
      '/usr/local/bin/antigravity',
      '/opt/Antigravity/antigravity',
      path.join(os.homedir(), '.local', 'bin', 'antigravity'),
      '/snap/bin/antigravity'
    ];
    result.ide = ideCandidates.find(c => fs.existsSync(c)) || null;
    result.app = appCandidates.find(c => fs.existsSync(c)) || null;
  }

  return result;
}

function findAntigravityExecutable(type = 'auto') {
  if (process.env.ANTIGRAVITY_PATH && fs.existsSync(process.env.ANTIGRAVITY_PATH)) {
    return process.env.ANTIGRAVITY_PATH;
  }
  if (process.env.ANTIGRAVITY_EXE && fs.existsSync(process.env.ANTIGRAVITY_EXE)) {
    return process.env.ANTIGRAVITY_EXE;
  }

  const { ide, app } = findAntigravityExecutables();
  if (type === 'app') return app || ide;
  if (type === 'ide') return ide || app;
  return ide || app;
}

function launchAntigravityProcess(port = 9333, target = 'auto') {
  const exe = findAntigravityExecutable(target);
  if (!exe) {
    console.error(`\n${C.red}✗ Could not automatically locate Antigravity (${target}) executable on this device.${C.reset}\n`);
    printSetupInstructions();
    return false;
  }

  const { spawn } = require('child_process');
  let child;
  if (process.platform === 'darwin' && exe.includes('.app')) {
    child = spawn('open', ['-a', exe, '--args', `--remote-debugging-port=${port}`], {
      detached: true,
      stdio: 'ignore'
    });
  } else {
    child = spawn(exe, [`--remote-debugging-port=${port}`], {
      detached: true,
      stdio: 'ignore'
    });
  }
  child.on('error', () => {});
  child.unref();
  return true;
}

async function handleRestart(cfg, shouldExit = true) {
  const args = process.argv.slice(2).map(a => a.toLowerCase());
  const isApp = args.includes('app') || args.includes('--app');
  const isIde = args.includes('ide') || args.includes('--ide');
  const target = isApp ? 'app' : (isIde ? 'ide' : 'auto');
  const defaultPort = target === 'app' ? 9334 : 9333;
  const port = (cfg && cfg.cdpPort > 0) ? cfg.cdpPort : defaultPort;
  const targetName = target === 'app' ? 'Antigravity App' : (target === 'ide' ? 'Antigravity IDE' : 'Antigravity');

  console.log(`\n${C.bold}${C.brightCyan}🔄 Restarting ${targetName} with remote debugging enabled on Port ${port}...${C.reset}`);

  if (isAntigravityRunning(target)) {
    console.log(`  ${C.yellow}Closing existing ${targetName} process...${C.reset}`);
    killAntigravity(target);
    await new Promise(r => setTimeout(r, 1500));
  } else {
    console.log(`  ${C.dim}No existing ${targetName} process running.${C.reset}`);
  }

  return handleLaunch(cfg, true, shouldExit, target, port);
}

async function handleLaunch(cfg, forceRestart = false, shouldExit = true, explicitTarget = null, explicitPort = null) {
  const args = process.argv.slice(2).map(a => a.toLowerCase());
  const target = explicitTarget || (args.includes('app') || args.includes('--app') ? 'app' : (args.includes('ide') || args.includes('--ide') ? 'ide' : 'auto'));
  const defaultPort = target === 'app' ? 9334 : 9333;
  const port = explicitPort || ((cfg && cfg.cdpPort > 0) ? cfg.cdpPort : defaultPort);
  const targetName = target === 'app' ? 'Antigravity App' : (target === 'ide' ? 'Antigravity IDE' : 'Antigravity');

  const isForce = forceRestart || args.includes('--force') || args.includes('-f') || args.includes('--restart') || args.includes('restart');

  if (isForce && isAntigravityRunning(target)) {
    console.log(`  ${C.yellow}Closing existing ${targetName} processes (--force)...${C.reset}`);
    killAntigravity(target);
    await new Promise(r => setTimeout(r, 1200));
  }

  if (!isForce) {
    const endpoints = await findCdpEndpoints(port, []);
    if (endpoints.length > 0) {
      console.log(`\n  ${C.yellow}ℹ ${targetName} is already running and connected on port ${port}!${C.reset}`);
      console.log(`  ${C.dim}Run ${C.bold}auto-accept${C.reset}${C.dim} to start the confirmation daemon.${C.reset}`);
      console.log(`  ${C.dim}(To force restart anyway, run: ${C.bold}auto-accept restart ${target !== 'auto' ? target : ''}${C.reset}${C.dim})${C.reset}\n`);
      if (shouldExit) process.exit(0);
      return true;
    }

    if (isAntigravityRunning(target)) {
      console.log(`\n  ${C.bold}${C.yellow}⚠️ ${targetName} is already running WITHOUT remote debugging enabled!${C.reset}`);
      console.log(`  ${C.dim}Chromium cannot attach port ${port} to an already-running process.${C.reset}\n`);
      console.log(`  ${C.bold}👉 To fix this instantly:${C.reset}`);
      console.log(`     • Run: ${C.bold}${C.cyan}auto-accept restart ${target !== 'auto' ? target : ''}${C.reset}  (closes old process and starts fresh with port ${port})`);
      console.log(`     • OR close ${targetName} completely and run ${C.bold}${C.cyan}auto-accept launch ${target !== 'auto' ? target : ''}${C.reset}\n`);
      if (shouldExit) process.exit(1);
      return false;
    }
  }

  const exe = findAntigravityExecutable(target);
  if (!exe) {
    console.error(`\n${C.red}✗ Could not automatically locate ${targetName} executable on this machine.${C.reset}\n`);
    printSetupInstructions();
    if (shouldExit) process.exit(1);
    return false;
  }

  console.log(`\n${C.bold}${C.brightCyan}🚀 Auto-launching ${targetName} with remote debugging enabled on Port ${port}...${C.reset}`);
  console.log(`  Executable: ${C.green}${exe}${C.reset}`);

  const launched = launchAntigravityProcess(port, target);
  if (!launched) {
    if (shouldExit) process.exit(1);
    return false;
  }

  console.log(`\n${C.bold}${C.green}✔ ${targetName} process spawned successfully!${C.reset}`);
  console.log(`  ${C.dim}Run ${C.bold}auto-accept${C.reset}${C.dim} to begin auto-approvals.${C.reset}\n`);
  if (shouldExit) process.exit(0);
  return true;
}

// ── Subcommand: start (One-Command Easy Start for Any Device) ──
async function handleEasyStart(cfg, configSource) {
  const args = process.argv.slice(2).map(a => a.toLowerCase());
  const isApp = args.includes('app') || args.includes('--app');
  const isIde = args.includes('ide') || args.includes('--ide');
  const target = isApp ? 'app' : (isIde ? 'ide' : 'auto');
  const defaultPort = target === 'app' ? 9334 : 9333;
  const port = (cfg && cfg.cdpPort > 0) ? cfg.cdpPort : defaultPort;
  const targetName = target === 'app' ? 'Antigravity App' : (target === 'ide' ? 'Antigravity IDE' : 'Antigravity');

  console.log(`\n${C.bold}${C.brightCyan}⚡ Antigravity Auto-Submit — Easy Start (All-in-One)${C.reset}`);
  console.log(`  ${C.dim}Launching ${targetName} with remote debugging & connecting daemon...${C.reset}\n`);

  process.stdout.write(`  ${C.bold}CDP Status:${C.reset} Scanning for active instances...\r`);
  const endpoints = await findCdpEndpoints(port, cfg.cdpPorts || []);

  if (endpoints.length > 0) {
    const portsStr = endpoints.map(e => e.port).join(', ');
    console.log(`  ${C.bold}CDP Status:${C.reset} ${C.green}Connected on port ${portsStr} ✔${C.reset}                                 `);
    console.log(`  ${C.dim}${targetName} is already running with remote debugging enabled.${C.reset}\n`);
  } else if (isAntigravityRunning(target)) {
    console.log(`  ${C.bold}CDP Status:${C.reset} ${C.yellow}${targetName} running WITHOUT remote debugging port ⚠️${C.reset}   `);
    console.log(`  ${C.cyan}🔄 Restarting ${targetName} with remote debugging enabled on Port ${port}...${C.reset}`);
    killAntigravity(target);
    await new Promise(r => setTimeout(r, 1500));
    if (!launchAntigravityProcess(port, target)) {
      process.exit(1);
    }
    console.log(`  ${C.green}✔ Relaunched ${targetName} with Port ${port}.${C.reset}`);
    console.log(`  ${C.dim}Waiting for window to initialize...${C.reset}\n`);
    await new Promise(r => setTimeout(r, 2500));
  } else {
    console.log(`  ${C.bold}CDP Status:${C.reset} ${C.dim}${targetName} is not running.${C.reset}                               `);
    console.log(`  ${C.cyan}🚀 Auto-launching ${targetName} with remote debugging enabled on Port ${port}...${C.reset}`);
    if (!launchAntigravityProcess(port, target)) {
      process.exit(1);
    }
    console.log(`  ${C.green}✔ Spawned ${targetName} with Port ${port}.${C.reset}`);
    console.log(`  ${C.dim}Waiting for window to initialize...${C.reset}\n`);
    await new Promise(r => setTimeout(r, 2500));
  }

  const portKey = cfg.cdpPort > 0 ? String(cfg.cdpPort) : 'auto';
  const isForce = process.argv.includes('--force') || process.argv.includes('-f');
  const runningPid = acquireDaemonLock(portKey, isForce);
  if (runningPid) {
    console.log(`\n  ${C.yellow}⚠️ Another auto-accept daemon (PID ${runningPid}) is already running on ${portKey === 'auto' ? 'auto-detection' : 'CDP port ' + portKey}.${C.reset}`);
    console.log(`  ${C.dim}Only one daemon should manage approvals to prevent duplicate submissions.${C.reset}`);
    console.log(`  ${C.dim}To override or replace it, stop PID ${runningPid} or run with: ${C.bold}auto-accept start --force${C.reset}\n`);
    process.exit(0);
  }
  process.on('exit', () => releaseDaemonLock(portKey));
  process.on('SIGINT', () => { releaseDaemonLock(portKey); process.exit(0); });
  process.on('SIGTERM', () => { releaseDaemonLock(portKey); process.exit(0); });

  const daemon = new AutoSubmitDaemon(cfg, configSource);
  daemon.start().catch((err) => {
    releaseDaemonLock(portKey);
    console.error(`${C.red}Fatal daemon error:${C.reset}`, err);
    process.exit(1);
  });
}

function handleSetup(cfg) {
  const idePort = (cfg && cfg.cdpPort > 0) ? cfg.cdpPort : 9333;
  const appPort = 9334;
  console.log(`\n${C.bold}${C.brightCyan}⚡ Antigravity Auto-Submitter — Automatic Environment Setup${C.reset}\n`);

  if (process.platform === 'win32') {
    const exes = findAntigravityExecutables();
    if (!exes.ide && !exes.app) {
      console.log(`  ${C.yellow}⚠️ Neither Antigravity IDE nor Antigravity App executable found in standard paths.${C.reset}`);
      printSetupInstructions();
      process.exit(0);
    }

    const { execSync } = require('child_process');
    const idePathSafe = (exes.ide || '').replace(/\\/g, '\\\\');
    const appPathSafe = (exes.app || '').replace(/\\/g, '\\\\');

    const psScript = `
      $shell = New-Object -ComObject WScript.Shell
      $desktopDirs = @(
        [Environment]::GetFolderPath('Desktop'),
        (Join-Path $env:USERPROFILE 'Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\\Desktop'),
        [Environment]::GetFolderPath('CommonDesktopDirectory')
      ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

      $startDirs = @(
        [Environment]::GetFolderPath('Programs'),
        [Environment]::GetFolderPath('CommonPrograms')
      ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

      $taskbar = Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'
      $scanDirs = @($desktopDirs + $startDirs + @($taskbar)) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
      $ideCount = 0
      $appCount = 0

      foreach ($dir in $scanDirs) {
        Get-ChildItem -Path $dir -Filter "*Antigravity*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            $sc = $shell.CreateShortcut($_.FullName)
            $t = $sc.TargetPath
            if ($t -like "*Antigravity IDE*.exe" -or $_.Name -like "*Antigravity IDE*") {
              $sc.Arguments = '--remote-debugging-port=${idePort}'
              $sc.Save()
              $ideCount++
            } elseif ($t -like "*Antigravity*.exe" -or $_.Name -like "*Antigravity*") {
              $sc.Arguments = '--remote-debugging-port=${appPort}'
              $sc.Save()
              $appCount++
            }
          } catch {}
        }
      }

      $ideExe = '${idePathSafe}'
      $appExe = '${appPathSafe}'

      foreach ($d in $desktopDirs) {
        if ($ideExe -and (Test-Path $ideExe)) {
          $scIde = $shell.CreateShortcut((Join-Path $d 'Antigravity IDE.lnk'))
          $scIde.TargetPath = $ideExe
          $scIde.Arguments = '--remote-debugging-port=${idePort}'
          $scIde.IconLocation = "$ideExe,0"
          $scIde.Save()
        }
        if ($appExe -and (Test-Path $appExe)) {
          $scApp = $shell.CreateShortcut((Join-Path $d 'Antigravity.lnk'))
          $scApp.TargetPath = $appExe
          $scApp.Arguments = '--remote-debugging-port=${appPort}'
          $scApp.IconLocation = "$appExe,0"
          $scApp.Save()
        }
      }

      Write-Output "IDE:$ideCount"
      Write-Output "APP:$appCount"
    `;
    try {
      const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, { stdio: 'ignore' });
      console.log(`  ${C.bold}${C.green}✔ Successfully configured shortcuts for both Antigravity IDE & Antigravity App!${C.reset}`);
      if (exes.ide) {
        console.log(`    • ${C.cyan}Antigravity IDE:${C.reset} ${exes.ide} -> ${C.yellow}--remote-debugging-port=${idePort}${C.reset}`);
      }
      if (exes.app) {
        console.log(`    • ${C.cyan}Antigravity App:${C.reset} ${exes.app} -> ${C.yellow}--remote-debugging-port=${appPort}${C.reset}`);
      }
      console.log('');

      const running = getRunningAntigravity();
      if (running.any) {
        console.log(`  ${C.bold}${C.yellow}───────────────────────────────────────────────────────────────────────${C.reset}`);
        console.log(`  ${C.bold}${C.yellow}⚠️  CRITICAL NEXT STEP: ANTIGRAVITY INSTANCE IS CURRENTLY OPEN!${C.reset}`);
        console.log(`  ${C.bold}${C.yellow}───────────────────────────────────────────────────────────────────────${C.reset}`);
        console.log(`  Chromium cannot attach a debugging port to an already-running process.`);
        console.log(`  Close open Antigravity windows and relaunch from your updated shortcuts.\n`);
        console.log(`  ${C.bold}👉 To complete setup (choose one):${C.reset}`);
        console.log(`     ${C.bold}Option 1 (Auto):${C.reset}   Run: ${C.bold}${C.cyan}auto-accept restart${C.reset} (closes & restarts with debug ports)`);
        console.log(`     ${C.bold}Option 2 (Manual):${C.reset} Fully CLOSE Antigravity (IDE & App),`);
        console.log(`                         reopen from your Desktop or Taskbar shortcut,`);
        console.log(`                         then run: ${C.bold}${C.green}auto-accept${C.reset}\n`);
      } else {
        console.log(`  ${C.bold}${C.cyan}───────────────────────────────────────────────────────────────────────${C.reset}`);
        console.log(`  ${C.bold}${C.brightCyan}👉 NEXT STEP:${C.reset}`);
        console.log(`  ${C.bold}${C.cyan}───────────────────────────────────────────────────────────────────────${C.reset}`);
        console.log(`  1. Launch Antigravity IDE or Antigravity App from your Desktop shortcuts`);
        console.log(`  2. In your terminal, run: ${C.bold}${C.green}auto-accept${C.reset}\n`);
      }
    } catch (e) {
      console.log(`  ${C.yellow}⚠️ Shortcut auto-patch error: ${e.message}${C.reset}\n`);
      printSetupInstructions();
    }
  } else if (process.platform === 'linux') {
    const desktopDirs = [
      path.join(os.homedir(), '.local', 'share', 'applications'),
      path.join(os.homedir(), 'Desktop')
    ];
    let patched = false;
    for (const d of desktopDirs) {
      if (fs.existsSync(d)) {
        const files = fs.readdirSync(d);
        for (const file of files) {
          if (file.toLowerCase().includes('antigravity') && file.endsWith('.desktop')) {
            const fPath = path.join(d, file);
            try {
              let content = fs.readFileSync(fPath, 'utf8');
              const targetPort = file.toLowerCase().includes('ide') ? idePort : appPort;
              if (!content.includes('--remote-debugging-port')) {
                content = content.replace(/(Exec=[^\r\n]+)/, `$1 --remote-debugging-port=${targetPort}`);
                fs.writeFileSync(fPath, content, 'utf8');
                console.log(`  ${C.bold}${C.green}✔ Updated Linux desktop entry:${C.reset} ${fPath}`);
                patched = true;
              } else {
                console.log(`  ${C.bold}${C.green}✔ Linux desktop entry already configured:${C.reset} ${fPath}`);
                patched = true;
              }
            } catch (e) {}
          }
        }
      }
    }
    const localBin = path.join(os.homedir(), '.local', 'bin');
    try {
      if (!fs.existsSync(localBin)) fs.mkdirSync(localBin, { recursive: true });
      const realExeCandidates = ['/usr/bin/antigravity', '/usr/local/bin/antigravity', '/opt/Antigravity/antigravity', '/opt/Antigravity IDE/antigravity', '/snap/bin/antigravity'];
      const realExe = realExeCandidates.find(p => fs.existsSync(p)) || 'antigravity';
      const wrapperIde = path.join(localBin, 'antigravity-ide');
      fs.writeFileSync(wrapperIde, `#!/bin/sh\nexec antigravity-ide --remote-debugging-port=${idePort} "$@"\n`, { mode: 0o755 });
      const wrapperApp = path.join(localBin, 'antigravity');
      fs.writeFileSync(wrapperApp, `#!/bin/sh\nexec "${realExe}" --remote-debugging-port=${appPort} "$@"\n`, { mode: 0o755 });
      console.log(`  ${C.bold}${C.green}✔ Created Linux CLI launchers:${C.reset} ${wrapperIde} & ${wrapperApp}`);
      patched = true;
    } catch (e) {}

    console.log(`  ${C.bold}${C.green}✔ Linux configuration ready! Launch with: ${C.cyan}auto-accept start${C.reset}\n`);
  } else if (process.platform === 'darwin') {
    // 1. Create Desktop Launchers
    const desktopIde = path.join(os.homedir(), 'Desktop', 'Antigravity IDE (Debug).command');
    const desktopApp = path.join(os.homedir(), 'Desktop', 'Antigravity App (Debug).command');
    try {
      fs.writeFileSync(desktopIde, `#!/bin/bash\nopen -a "Antigravity IDE" --args --remote-debugging-port=${idePort}\n`, { mode: 0o755 });
      fs.writeFileSync(desktopApp, `#!/bin/bash\nopen -a "Antigravity" --args --remote-debugging-port=${appPort}\n`, { mode: 0o755 });
      console.log(`  ${C.bold}${C.green}✔ Created macOS Desktop Launchers for IDE & App${C.reset}`);
    } catch (e) {}

    // 2. Create ~/.local/bin wrappers
    const localBin = path.join(os.homedir(), '.local', 'bin');
    try {
      if (!fs.existsSync(localBin)) fs.mkdirSync(localBin, { recursive: true });
      fs.writeFileSync(path.join(localBin, 'antigravity-ide'), `#!/bin/sh\nexec open -a "Antigravity IDE" --args --remote-debugging-port=${idePort} "$@"\n`, { mode: 0o755 });
      fs.writeFileSync(path.join(localBin, 'antigravity'), `#!/bin/sh\nexec open -a "Antigravity" --args --remote-debugging-port=${appPort} "$@"\n`, { mode: 0o755 });
      console.log(`  ${C.bold}${C.green}✔ Created macOS CLI launchers in ~/.local/bin${C.reset}`);
    } catch (e) {}

    // 3. Configure ~/.zshrc shell aliases
    const zshrc = path.join(os.homedir(), '.zshrc');
    try {
      let zContent = fs.existsSync(zshrc) ? fs.readFileSync(zshrc, 'utf8') : '';
      let added = false;
      if (!zContent.includes('alias antigravity=')) {
        zContent += `\nalias antigravity='open -a "Antigravity" --args --remote-debugging-port=${appPort}'\n`;
        added = true;
      }
      if (!zContent.includes('alias antigravity-ide=')) {
        zContent += `alias antigravity-ide='open -a "Antigravity IDE" --args --remote-debugging-port=${idePort}'\n`;
        added = true;
      }
      if (added) {
        fs.writeFileSync(zshrc, zContent, 'utf8');
        console.log(`  ${C.bold}${C.green}✔ Configured ~/.zshrc shell aliases for Antigravity App & IDE${C.reset}`);
      }
    } catch (e) {}

    console.log(`\n  ${C.bold}${C.cyan}👉 macOS Setup Complete!${C.reset}\n`);
  }
  process.exit(0);
}

function handleUpdate() {
  console.log(`\n${C.bold}${C.brightCyan}🔄 Updating Antigravity Auto-Submitter to latest version from GitHub...${C.reset}\n`);
  const { execSync } = require('child_process');
  try {
    execSync('npm install -g WillyEverGreen/Antigravity-Auto-Submitter', { stdio: 'inherit' });
    console.log(`\n${C.bold}${C.green}✔ Successfully updated Antigravity Auto-Submitter to the latest version!${C.reset}\n`);
  } catch (e) {
    console.error(`\n${C.red}✗ Update failed: ${e.message}${C.reset}`);
    console.log(`\n  You can run manually:\n  ${C.cyan}npm install -g WillyEverGreen/Antigravity-Auto-Submitter${C.reset}\n`);
    process.exit(1);
  }
}

function handleUninstall() {
  console.log(`\n${C.bold}${C.yellow}🗑️  Uninstalling Antigravity Auto-Submitter & Cleaning System Shortcuts...${C.reset}\n`);
  const { execSync } = require('child_process');

  // 1. Remove local .auto-accept.json if present
  const localConfig = path.join(process.cwd(), '.auto-accept.json');
  if (fs.existsSync(localConfig)) {
    try {
      fs.unlinkSync(localConfig);
      console.log(`  ${C.green}✔ Removed local project config:${C.reset} ${localConfig}`);
    } catch (e) {}
  }

  // 2. Remove global config directory ~/.antigravity-auto-submit
  const globalDir = path.join(os.homedir(), '.antigravity-auto-submit');
  if (fs.existsSync(globalDir)) {
    try {
      fs.rmSync(globalDir, { recursive: true, force: true });
      console.log(`  ${C.green}✔ Removed global config directory:${C.reset} ${globalDir}`);
    } catch (e) {}
  }

  // 3. Revert shortcut debugging flags & remove launchers
  if (process.platform === 'win32') {
    const psRevert = `
      \$shell = New-Object -ComObject WScript.Shell
      \$desktopDirs = @(
        [Environment]::GetFolderPath('Desktop'),
        (Join-Path \$env:USERPROFILE 'Desktop'),
        (Join-Path \$env:USERPROFILE 'OneDrive\\Desktop'),
        [Environment]::GetFolderPath('CommonDesktopDirectory')
      ) | Where-Object { \$_ -and (Test-Path \$_) } | Select-Object -Unique
      \$startDirs = @(
        [Environment]::GetFolderPath('Programs'),
        [Environment]::GetFolderPath('CommonPrograms')
      ) | Where-Object { \$_ -and (Test-Path \$_) } | Select-Object -Unique
      \$taskbar = Join-Path \$env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'
      \$scanDirs = @(\$desktopDirs + \$startDirs + @(\$taskbar)) | Where-Object { \$_ -and (Test-Path \$_) } | Select-Object -Unique
      foreach (\$d in \$scanDirs) {
        Get-ChildItem -Path \$d -Filter "*Antigravity*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            \$sc = \$shell.CreateShortcut(\$_.FullName)
            if (\$sc.Arguments -like "*--remote-debugging-port*") {
              \$sc.Arguments = ''
              \$sc.Save()
            }
          } catch {}
        }
      }
    `;
    try {
      const b64 = Buffer.from(psRevert, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, { stdio: 'ignore' });
      console.log(`  ${C.green}✔ Reverted Antigravity shortcut arguments to default.${C.reset}`);
    } catch (e) {}
  } else if (process.platform === 'darwin') {
    const macDesktop = path.join(os.homedir(), 'Desktop', 'Antigravity IDE (Debug).command');
    if (fs.existsSync(macDesktop)) {
      try { fs.unlinkSync(macDesktop); console.log(`  ${C.green}✔ Removed macOS desktop launcher:${C.reset} ${macDesktop}`); } catch (e) {}
    }
    const macBin = path.join(os.homedir(), '.local', 'bin', 'antigravity');
    if (fs.existsSync(macBin)) {
      try { fs.unlinkSync(macBin); console.log(`  ${C.green}✔ Removed macOS CLI wrapper:${C.reset} ${macBin}`); } catch (e) {}
    }
    const zshrc = path.join(os.homedir(), '.zshrc');
    if (fs.existsSync(zshrc)) {
      try {
        let zContent = fs.readFileSync(zshrc, 'utf8');
        if (zContent.includes('alias antigravity=')) {
          zContent = zContent.replace(/\n?# Antigravity IDE with Remote Debugging[^\n]*\nalias antigravity=[^\n]*\n?/g, '\n');
          fs.writeFileSync(zshrc, zContent, 'utf8');
          console.log(`  ${C.green}✔ Removed ~/.zshrc alias.${C.reset}`);
        }
      } catch (e) {}
    }
  } else if (process.platform === 'linux') {
    const linuxBin = path.join(os.homedir(), '.local', 'bin', 'antigravity');
    if (fs.existsSync(linuxBin)) {
      try { fs.unlinkSync(linuxBin); console.log(`  ${C.green}✔ Removed Linux CLI launcher:${C.reset} ${linuxBin}`); } catch (e) {}
    }
    const desktopDirs = [
      path.join(os.homedir(), '.local', 'share', 'applications'),
      path.join(os.homedir(), 'Desktop')
    ];
    for (const d of desktopDirs) {
      if (fs.existsSync(d)) {
        try {
          const files = fs.readdirSync(d);
          for (const file of files) {
            if (file.toLowerCase().includes('antigravity') && file.endsWith('.desktop')) {
              const fPath = path.join(d, file);
              let content = fs.readFileSync(fPath, 'utf8');
              if (content.includes('--remote-debugging-port')) {
                content = content.replace(/\s*--remote-debugging-port=\d+/g, '');
                fs.writeFileSync(fPath, content, 'utf8');
                console.log(`  ${C.green}✔ Reverted Linux desktop entry:${C.reset} ${fPath}`);
              }
            }
          }
        } catch (e) {}
      }
    }
  }

  // 4. Uninstall global package
  console.log(`\n  ${C.cyan}Uninstalling global npm package...${C.reset}`);
  try {
    execSync('npm uninstall -g antigravity-auto-submit WillyEverGreen/Antigravity-Auto-Submitter', { stdio: 'inherit' });
    console.log(`\n${C.bold}${C.green}✔ Antigravity Auto-Submitter completely uninstalled!${C.reset}\n`);
  } catch (e) {
    console.log(`\n  ${C.dim}To remove npm package manually, run:${C.reset}`);
    console.log(`  ${C.cyan}npm uninstall -g antigravity-auto-submit${C.reset}\n`);
  }
}

function printSetupInstructions() {
  console.log(`  ${C.bold}${C.cyan}──────────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`  ${C.bold}${C.brightCyan}👉 BULLETPROOF 3-STEP SETUP (Antigravity IDE & Antigravity App):${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}──────────────────────────────────────────────────────────────────${C.reset}\n`);
  console.log(`  ${C.bold}1. Close Antigravity IDE and Antigravity App completely first.${C.reset}`);
  console.log(`     ${C.dim}(Chromium singleton cannot attach a debug port to an already-running process)${C.reset}\n`);

  if (process.platform === 'win32') {
    console.log(`  ${C.bold}2. Add debugging port to your Shortcut Targets (or run 'auto-accept setup'):${C.reset}`);
    console.log(`     • ${C.cyan}Antigravity IDE:${C.reset}  Append ${C.yellow}--remote-debugging-port=9333${C.reset} to Target`);
    console.log(`     • ${C.cyan}Antigravity App:${C.reset}  Append ${C.yellow}--remote-debugging-port=9334${C.reset} to Target\n`);
  } else if (process.platform === 'darwin') {
    console.log(`  ${C.bold}2. Launch Antigravity with debugging port (or add shell alias):${C.reset}`);
    console.log(`     • IDE: ${C.cyan}open -a "Antigravity IDE" --args --remote-debugging-port=9333${C.reset}`);
    console.log(`     • App: ${C.cyan}open -a "Antigravity" --args --remote-debugging-port=9334${C.reset}\n`);
  } else {
    console.log(`  ${C.bold}2. Launch Antigravity with debugging port (or update .desktop launcher):${C.reset}`);
    console.log(`     • IDE: ${C.cyan}antigravity-ide --remote-debugging-port=9333${C.reset}`);
    console.log(`     • App: ${C.cyan}antigravity --remote-debugging-port=9334${C.reset}\n`);
  }

  console.log(`  ${C.bold}3. Launch Antigravity from that shortcut, then run: ${C.green}auto-accept${C.reset}\n`);

  console.log(`  ${C.bold}${C.yellow}👻 Troubleshooting: Ghost Process / Port Inactive?${C.reset}`);
  console.log(`  If Antigravity appears closed but the port doesn't attach, a ghost background process`);
  console.log(`  may be holding the singleton lock. ${C.bold}DO NOT use blind taskkill${C.reset} (protect your browser tabs!):`);
  if (process.platform === 'win32') {
    console.log(`    1. Find lingering PID:   ${C.cyan}tasklist /FI "IMAGENAME eq Antigravity*.exe"${C.reset}`);
    console.log(`       Or check port holder: ${C.cyan}netstat -ano | findstr :9333${C.reset} or ${C.cyan}:9334${C.reset}`);
    console.log(`    2. Open Task Manager (${C.bold}Ctrl+Shift+Esc${C.reset}) -> ${C.bold}Details${C.reset} tab.`);
    console.log(`    3. End task on ONLY that specific Antigravity PID, then relaunch from your shortcut.\n`);
  } else {
    console.log(`    1. Find lingering PID:   ${C.cyan}pgrep -l Antigravity${C.reset} or ${C.cyan}lsof -i :9333${C.reset}`);
    console.log(`    2. Terminate ONLY that PID: ${C.cyan}kill <PID>${C.reset}, then relaunch.\n`);
  }

  console.log(`  ${C.dim}Convenience CLI Launchers (Optional):${C.reset}\n`);
  console.log(`    • ${C.cyan}auto-accept setup${C.reset}   (Auto-configures IDE port 9333 and App port 9334 shortcuts)`);
  console.log(`    • ${C.cyan}auto-accept start${C.reset}   (Auto-starts IDE + daemon in one step)`);
  console.log(`    • ${C.cyan}auto-accept restart${C.reset} (Closes and restarts IDE/App with debug ports)\n`);
}

// ── Help Screen ──
function printHelp() {
  console.log(`
${C.bold}${C.brightCyan}⚡ Antigravity Auto-Submitter CLI${C.reset} ${C.gray}v${PKG_VERSION}${C.reset}
Zero-interruption confirmation daemon for Google Antigravity IDE.

${C.bold}USAGE:${C.reset}
  ${C.cyan}auto-accept${C.reset} [command] [options]

${C.bold}COMMANDS:${C.reset}
  ${C.green}auto-accept${C.reset}               Start the auto-approval daemon (default)
  ${C.green}auto-accept start${C.reset}         Easy Start: launch/restart IDE with debug port & connect daemon (recommended)
  ${C.green}auto-accept launch${C.reset}        Auto-launch Antigravity IDE with remote debugging port
  ${C.green}auto-accept setup${C.reset}         Auto-patch Desktop & Taskbar shortcut with --remote-debugging-port=9333
  ${C.green}auto-accept restart${C.reset}       Restart Antigravity IDE with remote debugging port enabled
  ${C.green}auto-accept update${C.reset}        Update CLI globally to latest version from GitHub
  ${C.green}auto-accept uninstall${C.reset}     Uninstall CLI, restore shortcuts & remove configs
  ${C.green}auto-accept kill${C.reset}          Close all running Antigravity IDE processes
  ${C.green}auto-accept init${C.reset}          Generate .auto-accept.json in the current directory
  ${C.green}auto-accept status${C.reset}        Query live Antigravity IDE status as JSON
  ${C.green}auto-accept list${C.reset}          List active keywords and mode configuration
  ${C.green}auto-accept doctor${C.reset}        Diagnose Antigravity connection & print setup guide
  ${C.green}auto-accept add-ask <kw>${C.reset}    Add keyword to Ask list (manual permission)
  ${C.green}auto-accept add-skip <kw>${C.reset}   Add keyword to Skip list (direct skip)
  ${C.green}auto-accept check${C.reset}         Run 3-tier deletion audit scan (Safe / Review / Protected)
  ${C.green}auto-accept find-temp${C.reset}     Scan & preview candidate temporary files for cleanup
  ${C.green}auto-accept clean [flags]${C.reset} Purge safe temp files (--all, --stale, --deep, etc.)
  ${C.green}auto-accept brain [flags]${C.reset} Inspect session brain disk distribution & delete sessions
  ${C.green}auto-accept mode [mode]${C.reset}   Get or switch operating mode (autonomous | autopilot)
  ${C.green}auto-accept pause${C.reset}         Pause auto-approvals without stopping daemon
  ${C.green}auto-accept resume${C.reset}        Resume active auto-approvals
  ${C.green}auto-accept rm <kw>${C.reset}         Remove keyword from active rules
  ${C.green}auto-accept rm-ask <kw>${C.reset}     Remove keyword from Ask list
  ${C.green}auto-accept rm-skip <kw>${C.reset}    Remove keyword from Skip list

${C.bold}OPTIONS:${C.reset}
  ${C.cyan}-m, --mode <mode>${C.reset}        Operating mode: ${C.cyan}autonomous${C.reset} or ${C.magenta}autopilot${C.reset}
  ${C.cyan}-p, --port <port>${C.reset}        CDP port (default: auto-detect 9333 / 9000-9400)
  ${C.cyan}-d, --delay <ms>${C.reset}         Delay in ms before clicking dialogs (default: 200)
  ${C.cyan}--poll <ms>${C.reset}              DOM scanner polling interval (default: 250)
  ${C.cyan}--ask <patterns>${C.reset}         Comma-separated list of commands requiring permission
  ${C.cyan}--skip <patterns>${C.reset}        Comma-separated list of commands to directly skip
  ${C.cyan}--add-ask <pattern>${C.reset}      Append a keyword to the Ask list
  ${C.cyan}--add-skip <pattern>${C.reset}     Append a keyword to the Skip list
  ${C.cyan}--daemon${C.reset}                 Run non-interactively in background (no stdin TUI)
  ${C.cyan}--quiet${C.reset}                  Suppress standard approvals (errors only)
  ${C.cyan}-c, --config <file>${C.reset}      Explicit config file path
  ${C.cyan}--save${C.reset}                   Save CLI flags to current project config
  ${C.cyan}-v, --version${C.reset}            Show version
  ${C.cyan}-h, --help${C.reset}               Show help

${C.bold}INSTANT HOTKEYS (Vite-style single-key presses):${C.reset}
  ${C.yellow}p${C.reset}  Pause / Resume approvals       ${C.yellow}m${C.reset}  Toggle Autonomous / Autopilot
  ${C.yellow}s${C.reset}  Live session & lifetime stats  ${C.yellow}c${C.reset}  Show active configuration
  ${C.yellow}h${C.reset}  Help reference guide           ${C.yellow}q${C.reset}  Quit daemon
`);
  process.exit(0);
}


// ── Rule Management Helpers ──
function getSaveTarget(isGlobal, configSource) {
  if (isGlobal) {
    if (!fs.existsSync(GLOBAL_DIR)) fs.mkdirSync(GLOBAL_DIR, { recursive: true });
    return GLOBAL_CONFIG_FILE;
  }
  if (configSource && configSource !== 'default') return configSource;
  return path.join(process.cwd(), '.auto-accept.json');
}

function handleAddRuleCli(listType, rawArgs, cfg, configSource) {
  const isGlobal = rawArgs.includes('-g') || rawArgs.includes('--global');
  const patterns = rawArgs.filter(a => a !== '-g' && a !== '--global');

  if (patterns.length === 0) {
    if (process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`\nEnter keyword pattern to add to ${listType === 'skip' ? 'Skip' : 'Ask'} list: `, (kw) => {
        rl.close();
        if (kw.trim()) {
          handleAddRuleCli(listType, [kw.trim(), ...(isGlobal ? ['-g'] : [])], cfg, configSource);
        } else {
          console.log(`${C.yellow}No keyword entered.${C.reset}`);
          process.exit(0);
        }
      });
      return;
    } else {
      console.error(`${C.red}Error: Keyword pattern required. Example: auto-accept add-ask "npm publish"${C.reset}`);
      process.exit(1);
    }
  }

  const listKey = listType === 'skip' ? 'skipKeywords' : 'askKeywords';
  const listTitle = listType === 'skip' ? 'Directly Skip' : 'Ask for Permission';
  const saveTarget = getSaveTarget(isGlobal, configSource);

  let fileConfig = { ...DEFAULTS };
  if (fs.existsSync(saveTarget)) {
    try { fileConfig = { ...fileConfig, ...JSON.parse(fs.readFileSync(saveTarget, 'utf8')) }; } catch (e) {}
  } else {
    fileConfig = { ...cfg };
  }

  const added = [];
  for (const raw of patterns) {
    const splitKws = raw.split(',').map(s => s.trim()).filter(Boolean);
    for (const kw of splitKws) {
      if (!fileConfig[listKey].includes(kw)) {
        fileConfig[listKey].push(kw);
        added.push(kw);
      }
    }
  }

  try {
    const dir = path.dirname(saveTarget);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(saveTarget, JSON.stringify(fileConfig, null, 2), 'utf8');
    console.log(`
${C.bold}${C.green}✔ Added ${added.length} rule(s) to ${listTitle} list!${C.reset}
  ${added.map(k => `${C.cyan}• "${k}"${C.reset}`).join('\n  ')}
  ${C.dim}Target config: ${saveTarget}${C.reset}

${C.bold}Current ${listTitle} Rules (${fileConfig[listKey].length}):${C.reset}
${fileConfig[listKey].map(k => `  • "${k}"`).join('\n')}
`);
  } catch (e) {
    console.error(`${C.red}✗ Failed to write config: ${e.message}${C.reset}`);
    process.exit(1);
  }
  process.exit(0);
}

function handleRemoveRuleCli(listType, rawArgs, cfg, configSource) {
  const isGlobal = rawArgs.includes('-g') || rawArgs.includes('--global');
  const patterns = rawArgs.filter(a => a !== '-g' && a !== '--global');
  const saveTarget = getSaveTarget(isGlobal, configSource);

  let fileConfig = { ...DEFAULTS };
  if (fs.existsSync(saveTarget)) {
    try { fileConfig = { ...fileConfig, ...JSON.parse(fs.readFileSync(saveTarget, 'utf8')) }; } catch (e) {}
  } else {
    fileConfig = { ...cfg };
  }

  if (patterns.length === 0) {
    if (process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log(`\n${C.bold}Active Rules in ${saveTarget}:${C.reset}`);
      const rules = [];
      if (listType === 'ask' || listType === 'all') {
        console.log(`  ${C.yellow}Ask Permission Rules:${C.reset}`);
        fileConfig.askKeywords.forEach(k => {
          rules.push({ key: 'askKeywords', kw: k });
          console.log(`    [${rules.length}] "${k}"`);
        });
      }
      if (listType === 'skip' || listType === 'all') {
        console.log(`  ${C.magenta}Directly Skip Rules:${C.reset}`);
        fileConfig.skipKeywords.forEach(k => {
          rules.push({ key: 'skipKeywords', kw: k });
          console.log(`    [${rules.length}] "${k}"`);
        });
      }

      rl.question(`\nEnter rule number or keyword to remove: `, (ans) => {
        rl.close();
        if (ans.trim()) {
          const num = parseInt(ans.trim(), 10);
          if (!isNaN(num) && num >= 1 && num <= rules.length) {
            handleRemoveRuleCli(listType, [rules[num - 1].kw, ...(isGlobal ? ['-g'] : [])], cfg, configSource);
          } else {
            handleRemoveRuleCli(listType, [ans.trim(), ...(isGlobal ? ['-g'] : [])], cfg, configSource);
          }
        } else {
          console.log(`${C.yellow}Cancelled.${C.reset}`);
          process.exit(0);
        }
      });
      return;
    } else {
      console.error(`${C.red}Error: Keyword pattern required. Example: auto-accept rm "git reset --hard"${C.reset}`);
      process.exit(1);
    }
  }

  const removed = [];
  for (const raw of patterns) {
    const splitKws = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const kw of splitKws) {
      if (listType === 'ask' || listType === 'all') {
        const idx = fileConfig.askKeywords.findIndex(k => k.toLowerCase() === kw);
        if (idx !== -1) {
          removed.push({ list: 'Ask Permission', kw: fileConfig.askKeywords[idx] });
          fileConfig.askKeywords.splice(idx, 1);
        }
      }
      if (listType === 'skip' || listType === 'all') {
        const idx = fileConfig.skipKeywords.findIndex(k => k.toLowerCase() === kw);
        if (idx !== -1) {
          removed.push({ list: 'Directly Skip', kw: fileConfig.skipKeywords[idx] });
          fileConfig.skipKeywords.splice(idx, 1);
        }
      }
    }
  }

  if (removed.length === 0) {
    console.log(`\n${C.yellow}⚠️ No matching rules found for: ${patterns.join(', ')}${C.reset}\n`);
    process.exit(0);
  }

  try {
    fs.writeFileSync(saveTarget, JSON.stringify(fileConfig, null, 2), 'utf8');
    console.log(`
${C.bold}${C.green}✔ Removed ${removed.length} rule(s)!${C.reset}
  ${removed.map(r => `${C.yellow}• "${r.kw}" (${r.list})${C.reset}`).join('\n  ')}
  ${C.dim}Updated config: ${saveTarget}${C.reset}
`);
  } catch (e) {
    console.error(`${C.red}✗ Failed to write config: ${e.message}${C.reset}`);
    process.exit(1);
  }
  process.exit(0);
}

// ── Config Resolution (Local -> Global -> Defaults) ──
function resolveConfig() {
  const args = process.argv.slice(2);
  const rawFirstArg = args[0] ? args[0].toLowerCase().trim() : '';
  const binName = path.basename(process.argv[1] || '', path.extname(process.argv[1] || '')).toLowerCase();
  let firstArg = rawFirstArg || (
    binName.includes('doctor') ? 'doctor' :
    binName.includes('start') ? 'start' :
    binName.includes('setup') ? 'setup' :
    binName.includes('restart') ? 'restart' :
    binName.includes('update') ? 'update' :
    binName.includes('uninstall') ? 'uninstall' :
    binName.includes('launch') ? 'launch' : ''
  );
  if (['d', 'doc', 'check'].includes(firstArg)) firstArg = 'doctor';
  else if (['l', 'ls', 'rules'].includes(firstArg)) firstArg = 'list';
  else if (['s', 'stat', 'stats'].includes(firstArg)) firstArg = 'status';
  else if (['c', 'cfg', 'config'].includes(firstArg)) firstArg = 'config';
  else if (['r'].includes(firstArg)) firstArg = 'restart';

  if (firstArg === 'init') handleInit();
  if (firstArg === '-h' || firstArg === '--help' || firstArg === 'help') printHelp();
  if (firstArg === '-v' || firstArg === '--version') {
    console.log(`v${PKG_VERSION}`);
    process.exit(0);
  }

  // ── Subcommand: check / agy-check ──
  if (firstArg === 'check' || firstArg === 'agy-check') {
    const scriptPath = path.join(__dirname, 'scripts', 'antigravity_cleaner.py');
    const pyArgs = ['--check', ...args.slice(1)];
    const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
    let res = spawnSync(pyCmd, [scriptPath, ...pyArgs], { stdio: 'inherit' });
    if (res.error && res.error.code === 'ENOENT') {
      res = spawnSync('python', [scriptPath, ...pyArgs], { stdio: 'inherit' });
    }
    process.exit(res.status !== null ? res.status : 0);
  }

  // ── Subcommand: find-temp / agy-find-temp ──
  if (firstArg === 'find-temp' || firstArg === 'agy-find-temp') {
    const scriptPath = path.join(__dirname, 'scripts', 'antigravity_cleaner.py');
    const pyArgs = ['--scan', ...args.slice(1)];
    const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
    let res = spawnSync(pyCmd, [scriptPath, ...pyArgs], { stdio: 'inherit' });
    if (res.error && res.error.code === 'ENOENT') {
      res = spawnSync('python', [scriptPath, ...pyArgs], { stdio: 'inherit' });
    }
    process.exit(res.status !== null ? res.status : 0);
  }

  // ── Subcommand: clean / agy-clean ──
  if (firstArg === 'clean' || firstArg === 'agy-clean') {
    const scriptPath = path.join(__dirname, 'scripts', 'antigravity_cleaner.py');
    const pyArgs = [...args.slice(1)];
    const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
    let res = spawnSync(pyCmd, [scriptPath, ...pyArgs], { stdio: 'inherit' });
    if (res.error && res.error.code === 'ENOENT') {
      res = spawnSync('python', [scriptPath, ...pyArgs], { stdio: 'inherit' });
    }
    process.exit(res.status !== null ? res.status : 0);
  }

  // ── Subcommand: brain / agy-brain ──
  if (firstArg === 'brain' || firstArg === 'agy-brain') {
    const scriptPath = path.join(__dirname, 'scripts', 'antigravity_brain.py');
    const pyArgs = [...args.slice(1)];
    const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
    let res = spawnSync(pyCmd, [scriptPath, ...pyArgs], { stdio: 'inherit' });
    if (res.error && res.error.code === 'ENOENT') {
      res = spawnSync('python', [scriptPath, ...pyArgs], { stdio: 'inherit' });
    }
    process.exit(res.status !== null ? res.status : 0);
  }

  let explicitConfig = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-c' || args[i] === '--config') && args[i + 1]) {
      explicitConfig = path.resolve(args[++i]);
    }
  }

  let configSource = 'default';
  let cfg = { ...DEFAULTS };

  // 1. Explicit config
  if (explicitConfig && fs.existsSync(explicitConfig)) {
    try {
      cfg = { ...cfg, ...JSON.parse(fs.readFileSync(explicitConfig, 'utf8')) };
      configSource = explicitConfig;
    } catch (e) {}
  } else {
    // 2. Local config in current directory
    for (const f of LOCAL_CONFIG_FILES) {
      const localP = path.join(process.cwd(), f);
      if (fs.existsSync(localP)) {
        try {
          cfg = { ...cfg, ...JSON.parse(fs.readFileSync(localP, 'utf8')) };
          configSource = localP;
          break;
        } catch (e) {}
      }
    }
    // 3. Global config
    if (configSource === 'default' && fs.existsSync(GLOBAL_CONFIG_FILE)) {
      try {
        cfg = { ...cfg, ...JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8')) };
        configSource = GLOBAL_CONFIG_FILE;
      } catch (e) {}
    }
  }

  // 4. Normalize loaded mode & Environment Variables
  if (cfg.mode && typeof cfg.mode === 'string') {
    cfg.mode = cfg.mode.toLowerCase().trim();
  }
  if (cfg.mode !== 'autopilot' && cfg.mode !== 'autonomous') {
    cfg.mode = 'autonomous';
  }

  if (process.env.ANTIGRAVITY_CDP_PORT) {
    cfg.cdpPort = parseInt(process.env.ANTIGRAVITY_CDP_PORT, 10) || cfg.cdpPort;
  }
  if (process.env.ANTIGRAVITY_AUTO_SUBMIT_MODE) {
    const envMode = process.env.ANTIGRAVITY_AUTO_SUBMIT_MODE.toLowerCase().trim();
    if (envMode === 'autopilot' || envMode === 'autonomous') {
      cfg.mode = envMode;
    }
  }

  // 5. CLI Flags
  let shouldSave = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--mode=')) {
      const val = a.split('=')[1].toLowerCase().trim();
      if (val === 'autopilot' || val === 'autonomous') {
        cfg.mode = val;
      } else {
        console.error(`${C.red}✗ Invalid mode: "${val}". Allowed modes: autonomous, autopilot${C.reset}`);
        process.exit(1);
      }
    } else if (a.startsWith('-m=')) {
      const val = a.split('=')[1].toLowerCase().trim();
      if (val === 'autopilot' || val === 'autonomous') {
        cfg.mode = val;
      } else {
        console.error(`${C.red}✗ Invalid mode: "${val}". Allowed modes: autonomous, autopilot${C.reset}`);
        process.exit(1);
      }
    } else if (a === '-m' || a === '--mode') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        const val = args[++i].toLowerCase().trim();
        if (val === 'autopilot' || val === 'autonomous') {
          cfg.mode = val;
        } else {
          console.error(`${C.red}✗ Invalid mode: "${val}". Allowed modes: autonomous, autopilot${C.reset}`);
          process.exit(1);
        }
      } else {
        console.error(`${C.red}✗ Missing mode argument for ${a}. Allowed modes: autonomous, autopilot${C.reset}`);
        process.exit(1);
      }
    } else if ((a === '-p' || a === '--port') && args[i + 1]) {
      const pVal = args[++i];
      if (pVal.includes(',')) {
        cfg.cdpPorts = pVal.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
        cfg.cdpPort = cfg.cdpPorts[0] || 0;
      } else {
        cfg.cdpPort = parseInt(pVal, 10) || 0;
      }
    } else if (a === '--ports' && args[i + 1]) {
      cfg.cdpPorts = args[++i].split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
      cfg.cdpPort = cfg.cdpPorts[0] || 0;
    } else if ((a === '-d' || a === '--delay') && args[i + 1]) {
      cfg.safetyDelayMs = Math.max(0, parseInt(args[++i], 10) || 0);
    } else if (a === '--poll' && args[i + 1]) {
      cfg.pollIntervalMs = Math.max(50, parseInt(args[++i], 10) || 250);
    } else if (a === '--ask' && args[i + 1]) {
      cfg.askKeywords = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--skip' && args[i + 1]) {
      cfg.skipKeywords = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--add-ask' && args[i + 1]) {
      const kw = args[++i].trim();
      if (kw && !cfg.askKeywords.includes(kw)) cfg.askKeywords.push(kw);
    } else if (a === '--add-skip' && args[i + 1]) {
      const kw = args[++i].trim();
      if (kw && !cfg.skipKeywords.includes(kw)) cfg.skipKeywords.push(kw);
    } else if (a === '--daemon' || a === '--no-interactive') {
      cfg.daemon = true;
    } else if (a === '--quiet') {
      cfg.quiet = true;
    } else if (a === '--save') {
      shouldSave = true;
    }
  }

  // Ensure arrays and primitives are fully valid
  if (!Array.isArray(cfg.askKeywords)) cfg.askKeywords = [...DEFAULTS.askKeywords];
  if (!Array.isArray(cfg.skipKeywords)) cfg.skipKeywords = [...DEFAULTS.skipKeywords];
  if (!Array.isArray(cfg.cdpPorts)) cfg.cdpPorts = [...DEFAULTS.cdpPorts];

  if (firstArg === 'setup' || firstArg === 'patch') { handleSetup(cfg); process.exit(0); }
  if (firstArg === 'update' || firstArg === 'upgrade') { handleUpdate(); process.exit(0); }
  if (firstArg === 'uninstall' || firstArg === 'remove-all') { handleUninstall(); process.exit(0); }
  if (firstArg === 'kill' || firstArg === 'stop-ide') { killAntigravity(); console.log(`\n  ${C.green}✔ Terminated all Antigravity IDE processes.${C.reset}\n`); process.exit(0); }
  if (firstArg === 'list' || firstArg === 'rules') { handleList(cfg); process.exit(0); }
  if (firstArg === 'add-ask' || firstArg === 'ask' || firstArg === 'add') { handleAddRuleCli('ask', args.slice(1), cfg, configSource); process.exit(0); }
  if (firstArg === 'add-skip' || firstArg === 'skip') { handleAddRuleCli('skip', args.slice(1), cfg, configSource); process.exit(0); }
  if (firstArg === 'rm-ask' || firstArg === 'remove-ask') { handleRemoveRuleCli('ask', args.slice(1), cfg, configSource); process.exit(0); }
  if (firstArg === 'rm-skip' || firstArg === 'remove-skip') { handleRemoveRuleCli('skip', args.slice(1), cfg, configSource); process.exit(0); }
  if (firstArg === 'rm' || firstArg === 'remove') { handleRemoveRuleCli('all', args.slice(1), cfg, configSource); process.exit(0); }

  if (firstArg === 'config') {
    console.log(`\n${C.bold}${C.cyan}Active Configuration (${configSource}):${C.reset}\n${JSON.stringify(cfg, null, 2)}\n`);
    process.exit(0);
  }

  if (firstArg === 'pause') {
    cfg.enabled = false;
    const saveTarget = configSource !== 'default' ? configSource : path.join(process.cwd(), '.auto-accept.json');
    try {
      const dir = path.dirname(saveTarget);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(saveTarget, JSON.stringify(cfg, null, 2), 'utf8');
      console.log(`${C.bold}${C.yellow}⏸ Auto-submit set to PAUSED${C.reset}`);
      console.log(`  ${C.dim}Saved to: ${saveTarget}${C.reset}`);
      console.log(`  ${C.dim}Running daemons will automatically pause within 2 seconds.${C.reset}`);
    } catch (e) {
      console.error(`${C.red}✗ Failed to save config: ${e.message}${C.reset}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (firstArg === 'resume') {
    cfg.enabled = true;
    const saveTarget = configSource !== 'default' ? configSource : path.join(process.cwd(), '.auto-accept.json');
    try {
      const dir = path.dirname(saveTarget);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(saveTarget, JSON.stringify(cfg, null, 2), 'utf8');
      console.log(`${C.bold}${C.green}✔ Auto-submit set to ACTIVE${C.reset}`);
      console.log(`  ${C.dim}Saved to: ${saveTarget}${C.reset}`);
      console.log(`  ${C.dim}Running daemons will automatically resume within 2 seconds.${C.reset}`);
    } catch (e) {
      console.error(`${C.red}✗ Failed to save config: ${e.message}${C.reset}`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (firstArg === 'mode' || firstArg === 'm') {
    const modeArg = args.find((a, idx) => idx > 0 && !a.startsWith('-'));
    if (!modeArg) {
      if (firstArg === 'm') {
        // 'auto-accept m' toggles mode directly
        cfg.mode = cfg.mode === 'autonomous' ? 'autopilot' : 'autonomous';
        const saveTarget = configSource !== 'default' ? configSource : path.join(process.cwd(), '.auto-accept.json');
        try {
          const dir = path.dirname(saveTarget);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(saveTarget, JSON.stringify(cfg, null, 2), 'utf8');
          console.log(`\n${C.bold}${C.green}✔ Operating mode toggled to: ${cfg.mode.toUpperCase()}${C.reset} (${cfg.mode === 'autopilot' ? '100% Hands-Free' : 'Reviews Plans'})`);
          console.log(`  ${C.dim}Config saved: ${saveTarget}${C.reset}`);
          console.log(`  ${C.dim}Running daemons will automatically reload within 2 seconds.${C.reset}\n`);
        } catch (e) {
          console.error(`${C.red}✗ Failed to save config: ${e.message}${C.reset}`);
          process.exit(1);
        }
        process.exit(0);
      } else {
        // 'auto-accept mode' without args shows current mode and toggle hint
        console.log(`
${C.bold}${C.cyan}Antigravity Auto-Submit — Operating Mode${C.reset}

  ${C.bold}Current Mode:${C.reset} ${cfg.mode === 'autopilot' ? `${C.magenta}AUTOPILOT (100% Hands-Free)${C.reset}` : `${C.cyan}AUTONOMOUS (Reviews Plans)${C.reset}`}
  ${C.bold}Config Source:${C.reset} ${configSource}

  ${C.bold}To toggle mode:${C.reset}
    ${C.green}auto-accept m${C.reset}                 (Instantly toggles between Autonomous and Autopilot)

  ${C.bold}To set a specific mode:${C.reset}
    ${C.green}auto-accept mode autonomous${C.reset}   (Safe: auto-approves safe tools, pauses for plan review)
    ${C.green}auto-accept mode autopilot${C.reset}    (100% hands-free: auto-approves tools AND plans)
`);
        process.exit(0);
      }
    }

    const val = modeArg.toLowerCase().trim();
    if (val === 'autopilot' || val === 'autonomous') {
      cfg.mode = val;
      const saveTarget = configSource !== 'default' ? configSource : path.join(process.cwd(), '.auto-accept.json');
      try {
        const dir = path.dirname(saveTarget);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(saveTarget, JSON.stringify(cfg, null, 2), 'utf8');
        console.log(`\n${C.bold}${C.green}✔ Operating mode set to ${val.toUpperCase()}${C.reset} (${val === 'autopilot' ? '100% Hands-Free' : 'Reviews Plans'})`);
        console.log(`  ${C.dim}Saved to: ${saveTarget}${C.reset}`);
        console.log(`  ${C.dim}Running daemons will automatically reload within 2 seconds.${C.reset}\n`);
      } catch (e) {
        console.error(`${C.red}✗ Failed to save config: ${e.message}${C.reset}`);
        process.exit(1);
      }
      process.exit(0);
    } else {
      console.error(`${C.red}✗ Invalid mode: "${modeArg}". Allowed modes: autonomous, autopilot${C.reset}`);
      console.error(`  Example: ${C.cyan}auto-accept mode autopilot${C.reset}`);
      process.exit(1);
    }
  }

  if (shouldSave) {
    const saveTarget = configSource !== 'default' ? configSource : path.join(process.cwd(), '.auto-accept.json');
    try {
      const dir = path.dirname(saveTarget);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(saveTarget, JSON.stringify(cfg, null, 2), 'utf8');
      console.log(`${C.green}✔ Configuration saved to ${saveTarget}${C.reset}`);
    } catch (e) {
      console.error(`${C.red}✗ Failed to save config: ${e.message}${C.reset}`);
    }
  }

  return { config: cfg, configSource };
}

// ── Stats Persistence Manager ──
class StatsManager {
  constructor() {
    this.sessionApprovals = 0;
    this.sessionBlocks = 0;
    this.lifetimeClicks = 0;
    this.lastAction = '';
    this.lastClicked = '';
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        this.lifetimeClicks = parseInt(data.total_clicks, 10) || 0;
        this.lastClicked = data.last_clicked || '';
        this.lastAction = cleanStr(data.last_action || '');
      }
    } catch (e) {}
  }

  recordApproval(action) {
    this.sessionApprovals++;
    this.lifetimeClicks++;
    this.lastClicked = new Date().toISOString().replace('T', ' ').substring(0, 19);
    this.lastAction = cleanStr(action);
    this.save();
  }

  recordBlock() {
    this.sessionBlocks++;
  }

  save() {
    try {
      if (!fs.existsSync(GLOBAL_DIR)) {
        fs.mkdirSync(GLOBAL_DIR, { recursive: true });
      }
      const data = {
        total_clicks: this.lifetimeClicks,
        last_clicked: this.lastClicked,
        last_action: this.lastAction
      };
      const tmpFile = `${STATS_FILE}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpFile, STATS_FILE);
    } catch (e) {}
  }
}

// ── Injected Scanner Script ──
function buildScannerScript(cfg) {
  const askKeywords = Array.isArray(cfg && cfg.askKeywords) ? cfg.askKeywords : DEFAULTS.askKeywords;
  const skipKeywords = Array.isArray(cfg && cfg.skipKeywords) ? cfg.skipKeywords : DEFAULTS.skipKeywords;
  const rawMode = typeof (cfg && cfg.mode) === 'string' ? cfg.mode.toLowerCase().trim() : 'autonomous';
  const modeVal = (rawMode === 'autopilot' ? 'autopilot' : 'autonomous');

  const ask = JSON.stringify(askKeywords.map(k => String(k || '').toLowerCase()));
  const skip = JSON.stringify(skipKeywords.map(k => String(k || '').toLowerCase()));
  const mode = JSON.stringify(modeVal);
  const alwaysAllow = JSON.stringify(Boolean(cfg && cfg.autoSelectAlwaysAllow));

  return `(() => {
    try {
      const askKeywords = ${ask};
      const skipKeywords = ${skip};
      const mode = ${mode};
      const autoSelectAlwaysAllow = ${alwaysAllow};

      const checkKeywords = (text) => {
        const t = String(text || '').toLowerCase();
        for (const kw of skipKeywords) {
          if (kw && t.includes(kw)) return { blocked: true, type: 'skip', kw: kw };
        }
        for (const kw of askKeywords) {
          if (kw && t.includes(kw)) return { blocked: true, type: 'ask', kw: kw };
        }
        return null;
      };

      // Helper to extract full card context without stopping at button outline-none wrappers
      const extractContextText = (btn) => {
        try {
          let curr = btn.parentElement;
          const btnLen = (btn.innerText || btn.textContent || '').trim().length;
          while (curr && curr !== document.body) {
            const t = (curr.innerText || curr.textContent || '').trim();
            if (t.length > btnLen + 10) {
              if (curr.parentElement && curr.parentElement !== document.body && curr.parentElement.innerText && curr.parentElement.innerText.length < t.length + 500) {
                return (curr.parentElement.innerText || curr.parentElement.textContent || '').toLowerCase();
              }
              return t.toLowerCase();
            }
            curr = curr.parentElement;
          }
          const dialog = document.querySelector('[role="dialog"], [role="alertdialog"], [data-testid*="interaction"], [class*="interaction"]');
          if (dialog) {
            return (dialog.innerText || dialog.textContent || '').toLowerCase();
          }
          return document.body ? (document.body.innerText || '').toLowerCase() : '';
        } catch (e) {
          return '';
        }
      };

      const isClicked = (el) => {
        try {
          return Boolean(el && ((el.hasAttribute && el.hasAttribute('data-agy-clicked')) || (el.getAttribute && el.getAttribute('data-agy-clicked'))));
        } catch (e) { return false; }
      };

      const markClicked = (el) => {
        try {
          if (el && el.setAttribute) el.setAttribute('data-agy-clicked', 'true');
        } catch (e) {}
      };

      // ── Tier 1: Antigravity interaction continue button ──
      const continueBtn = document.querySelector('[data-testid="interaction-continue-button"]');
      if (continueBtn && !isClicked(continueBtn)) {
        const rect = continueBtn.getBoundingClientRect();
        const style = window.getComputedStyle(continueBtn);
        if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
          const content = extractContextText(continueBtn);
          const match = checkKeywords(content);
          if (match) {
            const reason = match.type === 'skip' ? 'Directly Skipped: "' + match.kw + '"' : 'Awaiting Permission: "' + match.kw + '"';
            return {
              action: (continueBtn.innerText || 'Submit').trim().replace(/\\s+/g, ' '),
              blocked: true,
              blockedType: match.type,
              matchedKeyword: match.kw,
              blockedReason: reason,
              context: content.substring(0, 120)
            };
          }
          markClicked(continueBtn);

          if (autoSelectAlwaysAllow) {
            try {
              if (document.body) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', keyCode: 50, which: 50, bubbles: true, cancelable: true }));
              const opt2 = document.querySelector('input[type="radio"][value="2"]');
              if (opt2 && !opt2.checked) { opt2.checked = true; opt2.click(); opt2.dispatchEvent(new Event('change', { bubbles: true })); }
            } catch (e) {}
          } else {
            try {
              if (document.body) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', keyCode: 49, which: 49, bubbles: true, cancelable: true }));
              const opt1 = document.querySelector('input[type="radio"][value="1"]');
              if (opt1 && !opt1.checked) { opt1.checked = true; opt1.click(); opt1.dispatchEvent(new Event('change', { bubbles: true })); }
            } catch (e) {}
          }
          if (document.body) {
            try { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })); } catch (e) {}
          }
          const rk = Object.keys(continueBtn).find(k => k.startsWith('__reactProps$'));
          if (rk && continueBtn[rk] && typeof continueBtn[rk].onClick === 'function') {
            try { continueBtn[rk].onClick({ preventDefault: () => {}, stopPropagation: () => {} }); } catch (e) {}
          }
          continueBtn.click();
          continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return { action: (continueBtn.innerText || 'Submit').trim().replace(/\\s+/g, ' '), blocked: false, context: content.substring(0, 100) };
        }
      }

      // ── Shared Negative Keywords for Status / Logs / History Items ──
      const IGNORE_WORDS = [
        'finished', 'completed', 'failed', 'succeeded', 'running',
        'cancelled', 'canceled', 'timed out', 'exit code', 'exit status',
        'collapse', 'expand', 'details', 'output', 'terminal', 'view'
      ];

      // ── Tier 2: Autopilot mode Proceed button ──
      if (mode === 'autopilot') {
        const pbs = Array.from(document.querySelectorAll('button, a[role="button"]'));
        for (const pb of pbs) {
          if (isClicked(pb)) continue;
          if (pb.disabled || (pb.getAttribute && pb.getAttribute('aria-disabled') === 'true')) continue;
          if (pb.getAttribute && pb.getAttribute('aria-expanded') !== null) continue;

          const pt = (pb.innerText || pb.textContent || '').trim().toLowerCase();
          if (pt.length === 0 || pt.length > 30) continue;
          if (IGNORE_WORDS.some(w => pt.includes(w))) continue;

          const ptClean = pt
            .replace(/[\\u21b5\\u23ce\\u21a9\\u2022\\u00b7]/gu, '')
            .replace(/\\s*(\\((?:enter|\\d|ctrl|cmd|opt|alt|[a-z0-9\\s+-]+)\\)|\\[[a-z0-9\\s+-]+\\])$/i, '')
            .trim();

          if (ptClean === 'proceed' || ptClean.includes('proceed with') || ptClean.includes('proceed to execution')) {
            const pr = pb.getBoundingClientRect();
            if (pr.width > 5 && pr.height > 5 && window.getComputedStyle(pb).display !== 'none' && window.getComputedStyle(pb).visibility !== 'hidden') {
              const fullContent = extractContextText(pb);
              const match = checkKeywords(fullContent);
              if (match) {
                const reason = match.type === 'skip' ? 'Directly Skipped: "' + match.kw + '"' : 'Awaiting Permission: "' + match.kw + '"';
                return { action: 'Proceed (Plan)', blocked: true, blockedType: match.type, matchedKeyword: match.kw, blockedReason: reason, context: fullContent.substring(0, 150) };
              }
              markClicked(pb);

              const rk = Object.keys(pb).find(k => k.startsWith('__reactProps$'));
              if (rk && pb[rk] && typeof pb[rk].onClick === 'function') {
                try { pb[rk].onClick({ preventDefault: () => {}, stopPropagation: () => {} }); } catch (e) {}
              }
              pb.click();
              pb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
              return { action: 'Proceed (Plan Auto-Approved)', blocked: false, context: 'Plan Approved in Autopilot Mode' };
            }
          }
        }
      }

      // ── Tier 3: Generic confirmation fallback ──
      const TOOL_BTNS = [
        'submit',
        'always allow',
        'allow once',
        'allow this time',
        'always run',
        'run command',
        'run',
        'run js',
        'run (unsandboxed)',
        'run in terminal',
        'allow',
        'accept step',
        'accept',
        'continue response',
        'continue',
        'proceed anyway'
      ];
      const PLAN_BTNS = [
        'proceed',
        'proceed with plan',
        'always proceed',
        'confirm',
        'yes',
        'ok',
        'accept',
        'approve',
        'got it',
        'start',
        'execute'
      ];

      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"]'));
      for (const btn of candidates) {
        if (isClicked(btn)) continue;
        if (btn.disabled || (btn.getAttribute && btn.getAttribute('aria-disabled') === 'true')) continue;
        if (btn.getAttribute && btn.getAttribute('aria-expanded') !== null) continue;

        const raw = (btn.innerText || btn.textContent || '').trim();
        const text = raw.replace(/\\s+/g, ' ').replace(/[\\u21b5\\u23ce\\u21a9\\u2022\\u00b7]/gu, '').trim().toLowerCase();

        // 1. Length guard: confirmation buttons have short, punchy action labels (<= 30 chars)
        if (text.length === 0 || text.length > 30) continue;

        // 2. Reject completed task indicators, logs, accordions, and output wrappers
        if (IGNORE_WORDS.some(w => text.includes(w))) continue;

        // 3. Strip keyboard accelerator suffixes e.g. "Submit (Enter)", "Allow (1)", "Always Allow (2)", "Run [Ctrl+Enter]"
        const cleanLabel = text
          .replace(/\\s*(\\((?:enter|\\d|ctrl|cmd|opt|alt|[a-z0-9\\s+-]+)\\)|\\[[a-z0-9\\s+-]+\\])$/i, '')
          .trim();

        const isTool = TOOL_BTNS.includes(text) || TOOL_BTNS.includes(cleanLabel);
        const isPlan = mode === 'autopilot' && (PLAN_BTNS.includes(text) || PLAN_BTNS.includes(cleanLabel));
        const allowed = isTool || isPlan;

        if (allowed) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 5 && rect.height > 5 && window.getComputedStyle(btn).visibility !== 'hidden' && window.getComputedStyle(btn).display !== 'none') {
            const fullContent = extractContextText(btn);
            const match = checkKeywords(fullContent);
            if (match) {
              const reason = match.type === 'skip' ? 'Directly Skipped: "' + match.kw + '"' : 'Awaiting Permission: "' + match.kw + '"';
              return { action: raw, blocked: true, blockedType: match.type, matchedKeyword: match.kw, blockedReason: reason, context: fullContent.substring(0, 150) };
            }
            markClicked(btn);

            const rk = Object.keys(btn).find(k => k.startsWith('__reactProps$'));
            if (rk && btn[rk] && typeof btn[rk].onClick === 'function') {
              try { btn[rk].onClick({ preventDefault: () => {}, stopPropagation: () => {} }); } catch (e) {}
            }
            btn.click();
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            if (document.body) {
              try { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })); } catch (e) {}
            }
            return { action: raw, blocked: false, context: fullContent.substring(0, 100) };
          }
        }
      }

      return null;
    } catch (err) {
      return null;
    }
  })()`;
}

// ── Fast CDP Port Discovery ──
async function fetchTargets(port) {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1',
      port: port,
      path: '/json',
      timeout: 200
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : null);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function scanPortRange(start, end) {
  const BATCH_SIZE = 30;
  for (let i = start; i <= end; i += BATCH_SIZE) {
    const batch = [];
    for (let p = i; p < Math.min(i + BATCH_SIZE, end + 1); p++) {
      if (p >= 9220 && p <= 9235) continue; // Dedicated to Kiro IDE
      batch.push((async (port) => {
        const targets = await fetchTargets(port);
        if (targets && targets.length > 0) {
          const wb = selectAllWorkbenchTargets(targets);
          if (wb.length > 0) return { port, targets };
        }
        return null;
      })(p));
    }
    const results = await Promise.all(batch);
    const found = results.find(r => r !== null);
    if (found) return found;
  }
  return null;
}

function findSystemListeningPorts() {
  const { execSync } = require('child_process');
  const ports = new Set();
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 1500 });
      out.split('\n').forEach(l => {
        if (l.includes('LISTENING')) {
          const match = l.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\]):(\d+)/);
          if (match) {
            const p = parseInt(match[1], 10);
            if (p >= 1024 && p <= 65535) ports.add(p);
          }
        }
      });
    } else {
      const out = execSync('lsof -i -P -n 2>/dev/null || ss -tulpn 2>/dev/null', { encoding: 'utf8', timeout: 1500 });
      out.split('\n').forEach(l => {
        const match = l.match(/[:\s](\d+)\s+\(LISTEN\)/) || l.match(/:(\d+)\s/);
        if (match) {
          const p = parseInt(match[1], 10);
          if (p >= 1024 && p <= 65535) ports.add(p);
        }
      });
    }
  } catch (e) {}
  return Array.from(ports);
}

// ── Discovery & Multi-Window Target Selection ──
function selectAllWorkbenchTargets(targets) {
  if (!targets || !Array.isArray(targets)) return [];
  
  // Explicitly exclude non-page targets and internal devtools inspector windows
  const validPages = targets.filter(t => 
    t && t.type === 'page' &&
    t.webSocketDebuggerUrl &&
    (!t.url || !t.url.startsWith('devtools://'))
  );

  // Match workbench / Antigravity editor page targets only.
  // Never match regular external web browsers (chrome://, edge://, chrome-extension://, public web tabs)
  // But DO match Antigravity IDE (vscode-file / workbench) AND Antigravity App (local language server http/https/plugin)
  const workbenchPages = validPages.filter(t => {
    const url = (t.url || '').toLowerCase();
    const title = (t.title || '').toLowerCase();

    // Reject browser-internal tabs and extensions
    if (/^(chrome|edge|chrome-extension|brave|about):/i.test(url)) {
      return false;
    }

    // Strict Isolation: Reject Kiro IDE instances (by install URL or window title)
    if (url.includes('/kiro/') || url.includes('\\kiro\\') || title.endsWith(' - kiro')) {
      return false;
    }

    const isAntigravityTitle = title.includes('antigravity');
    const isAntigravityUrl = url.includes('workbench') || url.includes('vscode-file') || url.includes('vscode-app') || url.includes('antigravity') || url.startsWith('plugin://');
    const isLocalhost = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(url);

    // If it's a web URL (http/https):
    if (/^https?:\/\//i.test(url)) {
      // Standalone Antigravity App strictly serves its interface over loopback (127.0.0.1 / localhost).
      // External web domains (even if browsing Antigravity documentation) must never be matched.
      if (!isLocalhost) {
        return false;
      }
      // For localhost / 127.0.0.1, accept if title or url contains antigravity/workbench
      return isAntigravityTitle || isAntigravityUrl;
    }

    return isAntigravityUrl || isAntigravityTitle;
  });

  return workbenchPages;
}

function selectWorkbenchTarget(targets) {
  const all = selectAllWorkbenchTargets(targets);
  return all.length > 0 ? all[0] : null;
}

async function findCdpEndpoints(preferredPort = 0, candidatePorts = []) {
  const results = [];
  const portsToCheck = new Set();

  if (Array.isArray(candidatePorts) && candidatePorts.length > 0) {
    candidatePorts.forEach(p => portsToCheck.add(p));
  } else if (preferredPort > 0) {
    portsToCheck.add(preferredPort);
  } else {
    // Auto-discovery mode (Antigravity dedicated, strictly excluding Kiro on 9222):
    [9333, 9334, 9335, 9336, 9300].forEach(p => portsToCheck.add(p));
    const active = findSystemListeningPorts();
    active.forEach(p => {
      if (p >= 9220 && p <= 9235) return; // Dedicated to Kiro IDE
      if ((p >= 9300 && p <= 9400) || (p >= 9000 && p <= 9199)) {
        portsToCheck.add(p);
      }
    });
  }

  const checkPromises = Array.from(portsToCheck).map(async (port) => {
    if (port >= 9220 && port <= 9235) return null; // Dedicated to Kiro IDE
    const targets = await fetchTargets(port);
    if (targets && targets.length > 0) {
      const workbenchTargets = selectAllWorkbenchTargets(targets);
      if (workbenchTargets.length > 0) {
        return { port, targets };
      }
    }
    return null;
  });

  const checked = await Promise.all(checkPromises);
  checked.forEach(res => {
    if (res) results.push(res);
  });

  if (results.length === 0 && preferredPort === 0 && (!candidatePorts || candidatePorts.length === 0)) {
    const scanned = await scanPortRange(9330, 9340);
    if (scanned) results.push(scanned);
  }

  return results;
}

async function findCdpEndpoint(preferredPort) {
  const endpoints = await findCdpEndpoints(preferredPort);
  return endpoints.length > 0 ? endpoints[0] : null;
}

// ── Multi-Window Connection Session ──
class WindowSession {
  constructor(target, port, config, stats, onEvent) {
    this.target = target;
    this.id = target.id || target.webSocketDebuggerUrl;
    this.port = port;
    this.url = target.webSocketDebuggerUrl;
    this.title = cleanStr(target.title || 'Antigravity IDE', 45);
    this.config = config;
    this.stats = stats;
    this.onEvent = onEvent;
    this.ws = null;
    this.isConnected = false;
    this.isScanning = false;
    this.pollTimer = null;
    this.scanTimeout = null;
    this.reqId = 1;
    this.lastReportedBlock = '';
    this.lastApprovalKey = '';
    this.lastApprovalTime = 0;
    this.sessionApprovals = 0;
    this.sessionBlocks = 0;
  }

  connect() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      return;
    }

    this.ws.onopen = () => {
      this.isConnected = true;
      this.onEvent('info', ` READY `, `Connected to window: "${this.title}" (Port ${this.port})`, `Target ID: ${this.id}`, C.pillGreen);
      this.startScanner();
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === this.reqId - 1) {
          if (msg.result && msg.result.result) {
            this.handleScanResult(msg.result.result.value);
          } else {
            this.handleScanResult(null);
          }
        }
      } catch (e) {
        this.isScanning = false;
      }
    };

    this.ws.onerror = () => {
      this.destroy();
    };

    this.ws.onclose = () => {
      this.destroy();
    };
  }

  startScanner() {
    this.stopScanner();
    this.pollTimer = setInterval(() => this.scanTick(), this.config.pollIntervalMs);
  }

  stopScanner() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    this.isScanning = false;
  }

  scanTick() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.config.enabled || this.isScanning) return;

    this.isScanning = true;
    if (this.scanTimeout) clearTimeout(this.scanTimeout);
    this.scanTimeout = setTimeout(() => {
      this.isScanning = false;
    }, 5000);

    const script = buildScannerScript(this.config);
    const id = this.reqId++;

    try {
      this.ws.send(JSON.stringify({
        id: id,
        method: 'Runtime.evaluate',
        params: {
          expression: script,
          returnByValue: true
        }
      }));
    } catch (e) {
      if (this.scanTimeout) {
        clearTimeout(this.scanTimeout);
        this.scanTimeout = null;
      }
      this.isScanning = false;
    }
  }

  handleScanResult(outcome) {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    this.isScanning = false;
    if (!outcome) {
      this.lastReportedBlock = '';
      return;
    }

    const actionClean = cleanStr(outcome.action, 40);
    const contextClean = cleanStr(outcome.context, 60);

    if (outcome.blocked) {
      const blockKey = `${outcome.blockedType}:${outcome.matchedKeyword}:${actionClean}`;
      if (blockKey !== this.lastReportedBlock) {
        this.lastReportedBlock = blockKey;
        this.sessionBlocks++;
        this.stats.recordBlock();
        if (outcome.blockedType === 'ask') {
          try { process.stdout.write('\x07'); } catch(e) {}
          this.onEvent('warn', ` PAUSED `, `[${this.title}] ${actionClean}`, `Command contains: "${outcome.matchedKeyword}" (Awaiting your manual click in chat)`, C.pillYellow);
        } else {
          this.onEvent('warn', ` SKIPPED `, `[${this.title}] ${actionClean}`, `Command contains: "${outcome.matchedKeyword}" (Direct Skip Guard)`, C.pillMagenta);
        }
      }
    } else {
      const approvalKey = `${outcome.action}:${outcome.context}`;
      const now = Date.now();
      if (this.lastApprovalKey === approvalKey && (now - this.lastApprovalTime) < 4000) {
        return;
      }
      this.lastApprovalKey = approvalKey;
      this.lastApprovalTime = now;

      this.lastReportedBlock = '';
      this.sessionApprovals++;
      this.stats.recordApproval(outcome.action);
      this.onEvent('info', ` APPROVE `, `[${this.title}] ${actionClean}`, `Lifetime: ${this.stats.lifetimeClicks} (+${this.sessionApprovals} window / +${this.stats.sessionApprovals} total) | ${contextClean}`, C.pillGreen);
    }
  }

  destroy() {
    this.stopScanner();
    if (this.isConnected) {
      this.onEvent('warn', ` DISCON `, `Window disconnected: "${this.title}" (Port ${this.port})`, '', C.pillYellow);
    }
    this.isConnected = false;
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  }
}

// ── Ultra-Modern Terminal Daemon (Multi-Window Concurrent Engine) ──
class AutoSubmitDaemon {
  constructor(config, configSource) {
    this.config = config;
    this.configSource = configSource;
    this.stats = new StatsManager();
    this.sessions = new Map();
    this.pollTimer = null;
    this.portKey = config.cdpPort > 0 ? String(config.cdpPort) : 'auto';
    this.isPrompting = false;
    this.isInteractive = process.stdout.isTTY && !this.config.daemon;
    this.lastConfigFileMtime = 0;
    this.initConfigFileMtime();
  }

  initConfigFileMtime() {
    try {
      const target = this.configSource !== 'default' ? this.configSource : path.join(process.cwd(), '.auto-accept.json');
      if (fs.existsSync(target)) {
        this.lastConfigFileMtime = fs.statSync(target).mtimeMs;
      }
    } catch (e) {}
  }

  checkConfigReload() {
    try {
      const target = this.configSource !== 'default' ? this.configSource : path.join(process.cwd(), '.auto-accept.json');
      if (!fs.existsSync(target)) return;
      const stat = fs.statSync(target);
      if (stat.mtimeMs > this.lastConfigFileMtime) {
        this.lastConfigFileMtime = stat.mtimeMs;
        const fresh = JSON.parse(fs.readFileSync(target, 'utf8'));

        // Check mode change
        if (fresh.mode && typeof fresh.mode === 'string') {
          const newMode = fresh.mode.toLowerCase().trim();
          if ((newMode === 'autopilot' || newMode === 'autonomous') && newMode !== this.config.mode) {
            this.config.mode = newMode;
            const modeDesc = newMode === 'autopilot'
              ? 'AUTOPILOT (100% Hands-Free — auto-approves tools & plans)'
              : 'AUTONOMOUS (Safe — reviews plans, auto-approves safe tools)';
            this.logEvent('info', ` MODE `, `Operating mode updated from config: ${modeDesc}`, '', newMode === 'autopilot' ? C.pillMagenta : C.pillCyan);
          }
        }

        // Check enabled change
        if (fresh.enabled !== undefined && fresh.enabled !== this.config.enabled) {
          this.config.enabled = Boolean(fresh.enabled);
          this.logEvent('info', ` TOGGLE `, `Auto-submit is now ${this.config.enabled ? 'ACTIVE' : 'PAUSED'} (from config)`, '', this.config.enabled ? C.pillGreen : C.pillYellow);
        }

        // Check keywords
        if (Array.isArray(fresh.askKeywords)) {
          this.config.askKeywords = fresh.askKeywords.map(k => String(k).trim()).filter(Boolean);
        }
        if (Array.isArray(fresh.skipKeywords)) {
          this.config.skipKeywords = fresh.skipKeywords.map(k => String(k).trim()).filter(Boolean);
        }
        if (fresh.autoSelectAlwaysAllow !== undefined) {
          this.config.autoSelectAlwaysAllow = Boolean(fresh.autoSelectAlwaysAllow);
        }
        if (fresh.safetyDelayMs !== undefined) {
          this.config.safetyDelayMs = Math.max(0, parseInt(fresh.safetyDelayMs, 10) || 0);
        }
        if (fresh.pollIntervalMs !== undefined) {
          const newPoll = Math.max(50, parseInt(fresh.pollIntervalMs, 10) || 250);
          if (newPoll !== this.config.pollIntervalMs) {
            this.config.pollIntervalMs = newPoll;
            this.startScanner();
          }
        }
      }
    } catch (e) {}
  }

  get isConnected() {
    for (const s of this.sessions.values()) {
      if (s.isConnected) return true;
    }
    return false;
  }

  get activePort() {
    for (const s of this.sessions.values()) {
      if (s.isConnected) return s.port;
    }
    return this.config.cdpPort || 9333;
  }

  get targetTitle() {
    const titles = [];
    for (const s of this.sessions.values()) {
      if (s.isConnected) titles.push(s.title);
    }
    return titles.join(', ') || '';
  }

  get ws() {
    for (const s of this.sessions.values()) {
      if (s.ws) return s.ws;
    }
    return null;
  }

  get isScanning() {
    for (const s of this.sessions.values()) {
      if (s.isScanning) return true;
    }
    return false;
  }

  logEvent(type, badge, action, details = '', color = C.green) {
    if (this.config.quiet && type !== 'error' && type !== 'warn') return;

    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const pill = `${color}${badge}${C.reset}`;
    console.log(`  ${C.gray}${time}${C.reset}  ${pill}  ${C.bold}${action}${C.reset}`);
    if (details) {
      console.log(`            ${C.dim}${details}${C.reset}`);
    }
  }

  printBanner() {
    if (!this.isInteractive) return;

    const statusPill = this.config.enabled
      ? ` ${C.pillGreen} ● ACTIVE ${C.reset}`
      : ` ${C.pillYellow} ⏸ PAUSED ${C.reset}`;

    const modePill = this.config.mode === 'autopilot'
      ? `${C.pillMagenta} 🚀 AUTOPILOT ${C.reset}`
      : `${C.pillCyan} 🛡️ AUTONOMOUS ${C.reset}`;

    const connectedSessions = Array.from(this.sessions.values()).filter(s => s.isConnected);
    const ports = Array.from(new Set(connectedSessions.map(s => s.port)));
    const portStr = connectedSessions.length > 0
      ? `${C.brightGreen}${connectedSessions.length} window(s) connected (${ports.map(p => 'Port ' + p).join(', ')})${C.reset}`
      : `${C.yellow}Searching ports 9000..9400...${C.reset}`;

    console.log(`
  ${C.bold}${C.brightCyan}⚡ ANTIGRAVITY AUTO-SUBMITTER${C.reset} ${C.gray}v${PKG_VERSION}${C.reset}
  ${C.dim}Multi-window autonomous confirmation engine for Google Antigravity IDE${C.reset}

  ${C.dim}╭─────────────────────────────────────────────────────────────╮${C.reset}
  ${C.dim}│${C.reset}  ${C.bold}Status:${C.reset}    ${statusPill}   ${C.bold}Mode:${C.reset} ${modePill}
  ${C.dim}│${C.reset}  ${C.bold}Windows:${C.reset}   ${portStr}
  ${C.dim}│${C.reset}  ${C.bold}Approvals:${C.reset} ${C.bold}${C.white}${this.stats.lifetimeClicks}${C.reset} lifetime (${this.stats.sessionApprovals} session)   ${C.bold}Blocks:${C.reset} ${this.stats.sessionBlocks}
  ${C.dim}│${C.reset}  ${C.bold}Guard:${C.reset}     ${C.yellow}${this.config.askKeywords.length} Ask rules${C.reset}  ${C.gray}|${C.reset}  ${C.magenta}${this.config.skipKeywords.length} Skip rules${C.reset}
  ${C.dim}╰─────────────────────────────────────────────────────────────╯${C.reset}
  ${C.dim}Hotkeys:${C.reset}
    ${C.yellow}p${C.reset} Pause/Resume  •  ${C.yellow}m${C.reset} Mode    •  ${C.yellow}a${C.reset} Add Rule  •  ${C.yellow}r${C.reset} Remove Rule  •  ${C.yellow}l${C.reset} List Rules
    ${C.yellow}s${C.reset} Live Stats    •  ${C.yellow}c${C.reset} Config  •  ${C.yellow}d${C.reset} Doctor    •  ${C.yellow}R${C.reset} Restart IDE  •  ${C.yellow}h${C.reset} Help (?)     •  ${C.yellow}q${C.reset} Quit
`);
  }

  async start() {
    this.printBanner();
    this.setupSignalHandlers();
    if (this.isInteractive) this.setupInstantHotkeys();
    await this.connectLoop();
  }

  async connectLoop() {
    let emptyCycles = 0;
    let warnedUnpatchedRunning = false;

    while (true) {
      try {
        this.checkConfigReload();
        await this.syncWindows();

        const connectedCount = Array.from(this.sessions.values()).filter(s => s.isConnected).length;
        if (connectedCount === 0) {
          emptyCycles++;
          if (emptyCycles >= 4 && !warnedUnpatchedRunning) {
            if (isAntigravityRunning()) {
              warnedUnpatchedRunning = true;
              const portLabel = this.config.cdpPort > 0 ? `port ${this.config.cdpPort}` : 'remote debugging port (9333)';
              console.log(`\n  ${C.bold}${C.yellow}⚠️  Antigravity IDE is open, but ${portLabel} is closed!${C.reset}`);
              console.log(`  ${C.dim}Chromium ignores debug port flags if an existing background instance was already running.${C.reset}`);
              console.log(`  ${C.bold}👉 To fix this safely without losing work:${C.reset}`);
              console.log(`     1. Save work and close Antigravity IDE.`);
              console.log(`     2. If an instance lingers in background, close its specific PID from Task Manager (Details tab).`);
              console.log(`     3. Relaunch Antigravity from your shortcut configured with --remote-debugging-port=9333.`);
              console.log(`  ${C.bold}👉 To fix this right now:${C.reset}`);
              console.log(`     • Press ${C.bold}${C.brightCyan}Shift+R${C.reset} in this terminal to restart IDE with debugging port 9333 instantly!`);
              console.log(`     • Or run: ${C.bold}${C.cyan}auto-accept start${C.reset} (all-in-one easy start)\n`);
            }
          }
        } else {
          emptyCycles = 0;
          warnedUnpatchedRunning = false;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  async syncWindows() {
    const endpoints = await findCdpEndpoints(this.config.cdpPort, this.config.cdpPorts);
    const activeKeys = new Set();

    for (const ep of endpoints) {
      const targets = selectAllWorkbenchTargets(ep.targets);
      for (const t of targets) {
        const key = t.id || t.webSocketDebuggerUrl;
        activeKeys.add(key);

        if (!this.sessions.has(key)) {
          const session = new WindowSession(t, ep.port, this.config, this.stats, (type, badge, action, details, color) => {
            this.logEvent(type, badge, action, details, color);
          });
          this.sessions.set(key, session);
          session.connect();
        } else {
          const session = this.sessions.get(key);
          session.title = cleanStr(t.title || 'Antigravity IDE', 45);
          session.url = t.webSocketDebuggerUrl;
          if (!session.isConnected && !session.ws) {
            session.connect();
          }
        }
      }
    }

    // Prune closed sessions
    for (const [key, session] of this.sessions.entries()) {
      if (!activeKeys.has(key)) {
        session.destroy();
        this.sessions.delete(key);
      }
    }
  }

  startScanner() {
    for (const session of this.sessions.values()) {
      session.startScanner();
    }
  }

  stopScanner() {
    for (const session of this.sessions.values()) {
      session.stopScanner();
    }
  }

  async restartIdeFromTui() {
    const port = (this.config && this.config.cdpPort > 0) ? this.config.cdpPort : 9333;
    console.log(`\n  ${C.bold}${C.brightCyan}🔄 Hotkey triggered: Restarting Antigravity IDE with remote debugging on Port ${port}...${C.reset}`);
    this.logEvent('info', ' RESTART ', `Restarting Antigravity IDE with Port ${port}...`, '', C.pillYellow);
    killAntigravity();
    await new Promise(r => setTimeout(r, 1500));
    launchAntigravityProcess(port);
    this.logEvent('info', ' LAUNCH ', `Antigravity IDE spawned on Port ${port}. Awaiting window...`, '', C.pillGreen);
    console.log(`  ${C.green}✔ Antigravity IDE relaunched! Auto-connecting when window loads...${C.reset}\n`);
  }

  showStats() {
    const activeSessions = Array.from(this.sessions.values());
    console.log(`
  ${C.bold}--- Live Multi-Window Statistics ---${C.reset}
  Windows Attached:   ${activeSessions.length > 0 ? `${C.green}${activeSessions.length} connected${C.reset}` : `${C.yellow}0 (Searching...)${C.reset}`}
  Session Approvals:  ${C.bold}${this.stats.sessionApprovals}${C.reset} total
  Lifetime Approvals: ${C.bold}${this.stats.lifetimeClicks}${C.reset}
  Intercepted Blocks: ${C.bold}${this.stats.sessionBlocks}${C.reset}
  Last Action:        ${this.stats.lastAction || 'None'} (${this.stats.lastClicked || 'N/A'})
`);
    if (activeSessions.length > 0) {
      console.log(`  ${C.bold}Active Window Breakdown:${C.reset}`);
      activeSessions.forEach((s, idx) => {
        const status = s.isConnected ? `${C.green}Connected${C.reset}` : `${C.yellow}Reconnecting${C.reset}`;
        console.log(`    [${idx + 1}] "${s.title}" (Port ${s.port}) — ${status} — Approvals: ${s.sessionApprovals}, Blocks: ${s.sessionBlocks}`);
      });
      console.log('');
    }
  }

  showConfig() {
    console.log(`
  ${C.bold}--- Active Configuration ---${C.reset}
  Source:         ${this.configSource}
  Mode:           ${this.config.mode}
  Port Policy:    ${this.config.cdpPort > 0 ? `Port ${this.config.cdpPort}` : 'Auto-Discover (All Windows & Ports)'}
  Click Delay:    ${this.config.safetyDelayMs}ms
  Poll Interval:  ${this.config.pollIntervalMs}ms
  Ask List:       ${this.config.askKeywords.join(', ') || '(none)'}
  Skip List:      ${this.config.skipKeywords.join(', ') || '(none)'}
`);
  }

  showRulesList() {
    handleList(this.config, false);
  }

  async runDoctorCheck() {
    console.log('');
    await handleDoctor(this.config, false);
  }

  showHelp() {
    console.log(`
  ${C.bold}${C.brightCyan}--- Hotkey Reference & Controls ---${C.reset}
  ${C.bold}Key${C.reset}     ${C.bold}Action${C.reset}           ${C.bold}Description${C.reset}
  ${C.yellow}p${C.reset}       Pause / Resume   Instantly toggles auto-approvals on or off
  ${C.yellow}m${C.reset}       Toggle Mode      Cycles between Autonomous (reviews plans) and Autopilot (100% hands-free)
  ${C.yellow}a${C.reset}       Add Rule         Interactively add a keyword rule to Ask or Skip list without restarting
  ${C.yellow}r${C.reset}       Remove Rule      Interactively remove a keyword rule from Ask or Skip list
  ${C.yellow}l${C.reset}       List Rules       Displays active Ask & Skip keyword rules
  ${C.yellow}s${C.reset}       Live Stats       Displays live session approvals, lifetime approvals, and target window
  ${C.yellow}c${C.reset}       Show Config      Prints active configuration source, ports, and guardrail lists
  ${C.yellow}R${C.reset}  (Shift+R) Restart IDE      Restarts Antigravity IDE with remote debugging port enabled
  ${C.yellow}d${C.reset}       Doctor           Runs immediate connection & environment diagnostic check
  ${C.yellow}h${C.reset} / ${C.yellow}?${C.reset}   Help Reference   Displays this hotkey guide
  ${C.yellow}q${C.reset}       Quit             Cleanly disconnects from Antigravity and exits (or Ctrl+C)
`);
  }

  // Vite-style Instant Keystrokes (no Enter needed)
  setupInstantHotkeys() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true);
      } catch (e) {}
    }

    process.stdin.on('keypress', (str, key) => {
      if (this.isPrompting) return;

      // Ctrl+C or Ctrl+Q or q
      if ((key && key.ctrl && (key.name === 'c' || key.name === 'C')) || str === '\x03') {
        this.shutdown();
        return;
      }

      // Ctrl+L to clear screen & redraw banner
      if ((key && key.ctrl && (key.name === 'l' || key.name === 'L')) || str === '\x0c') {
        if (typeof console.clear === 'function') console.clear();
        this.printBanner();
        return;
      }

      const char = (key && key.name ? key.name.toLowerCase() : (str || '')).toLowerCase();
      const rawStr = str || '';

      // Shift+R or R hotkey to restart Antigravity IDE with debugging port
      if ((key && key.name === 'r' && key.shift) || rawStr === 'R') {
        this.restartIdeFromTui();
        return;
      }

      if (char === 'q') {
        this.shutdown();
        return;
      }

      switch (char) {
        case 'p':
          this.config.enabled = !this.config.enabled;
          this.saveActiveConfig();
          this.logEvent('info', ` TOGGLE `, `Auto-submit is now ${this.config.enabled ? 'ACTIVE' : 'PAUSED'}`, '', this.config.enabled ? C.pillGreen : C.pillYellow);
          break;

        case 'm':
          this.config.mode = this.config.mode === 'autonomous' ? 'autopilot' : 'autonomous';
          this.saveActiveConfig();
          const modeDesc = this.config.mode === 'autopilot'
            ? 'AUTOPILOT (100% Hands-Free — auto-approves tools & plans)'
            : 'AUTONOMOUS (Safe — reviews plans, auto-approves safe tools)';
          this.logEvent('info', ` MODE `, `Switched to: ${modeDesc}`, '', this.config.mode === 'autopilot' ? C.pillMagenta : C.pillCyan);
          break;

        case 'a':
          this.promptAddRule();
          break;

        case 'r':
          this.promptRemoveRule();
          break;

        case 's':
          this.showStats();
          break;

        case 'c':
          this.showConfig();
          break;

        case 'd':
          this.runDoctorCheck();
          break;

        case 'l':
          this.showRulesList();
          break;

        case 'h':
          this.showHelp();
          break;

        default:
          if (rawStr === '?' || char === '?') {
            this.showHelp();
          }
          break;
      }
    });

    process.stdin.resume();
  }

  setupSignalHandlers() {
    const onExit = () => this.shutdown();
    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);
  }

  saveActiveConfig() {
    const target = this.configSource !== 'default' ? this.configSource : path.join(process.cwd(), '.auto-accept.json');
    try {
      const dir = path.dirname(target);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, JSON.stringify(this.config, null, 2), 'utf8');
      if (fs.existsSync(target)) {
        this.lastConfigFileMtime = fs.statSync(target).mtimeMs;
      }
    } catch (e) {}
  }

  promptAddRule() {
    if (!process.stdin.isTTY || this.isPrompting) return;
    this.isPrompting = true;
    try { process.stdin.setRawMode(false); } catch(e) {}
    this.stopScanner();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { rl.close(); } catch(e) {}
      this.isPrompting = false;
      if (process.stdin.isTTY) {
        try { process.stdin.setRawMode(true); } catch(e) {}
      }
      try { process.stdin.resume(); } catch(e) {}
      this.startScanner();
    };

    rl.on('SIGINT', () => {
      console.log(`\n  ${C.dim}Cancelled.${C.reset}`);
      finish();
    });
    rl.on('close', finish);

    console.log(`\n  ${C.bold}${C.cyan}--- Add Guardrail Rule ---${C.reset}`);
    rl.question(`  Target list: (1) Ask for Permission, (2) Skip [1]: `, (choice) => {
      const listKey = (choice.trim() === '2') ? 'skipKeywords' : 'askKeywords';
      const listName = (listKey === 'skipKeywords') ? 'Directly Skip' : 'Ask for Permission';
      rl.question(`  Enter command keyword: `, (kw) => {
        kw = kw.trim();
        if (kw) {
          if (!this.config[listKey].includes(kw)) {
            this.config[listKey].push(kw);
            this.saveActiveConfig();
            this.logEvent('info', ` RULE ADDED `, `Added to ${listName} list: "${kw}"`, '', C.pillGreen);
          } else {
            console.log(`  ${C.yellow}Rule already exists in ${listName} list.${C.reset}`);
          }
        } else {
          console.log(`  ${C.dim}Cancelled (no keyword entered).${C.reset}`);
        }
        finish();
      });
    });
  }

  promptRemoveRule() {
    if (!process.stdin.isTTY || this.isPrompting) return;
    this.isPrompting = true;
    try { process.stdin.setRawMode(false); } catch(e) {}
    this.stopScanner();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { rl.close(); } catch(e) {}
      this.isPrompting = false;
      if (process.stdin.isTTY) {
        try { process.stdin.setRawMode(true); } catch(e) {}
      }
      try { process.stdin.resume(); } catch(e) {}
      this.startScanner();
    };

    rl.on('SIGINT', () => {
      console.log(`\n  ${C.dim}Cancelled.${C.reset}`);
      finish();
    });
    rl.on('close', finish);

    console.log(`\n  ${C.bold}${C.yellow}--- Remove Guardrail Rule ---${C.reset}`);
    const rules = [];
    console.log(`  ${C.bold}Ask Permission Rules:${C.reset}`);
    this.config.askKeywords.forEach((k) => {
      rules.push({ key: 'askKeywords', kw: k });
      console.log(`    [${rules.length}] "${k}"`);
    });
    console.log(`  ${C.bold}Directly Skip Rules:${C.reset}`);
    this.config.skipKeywords.forEach((k) => {
      rules.push({ key: 'skipKeywords', kw: k });
      console.log(`    [${rules.length}] "${k}"`);
    });

    if (rules.length === 0) {
      console.log(`  ${C.dim}No rules to remove.${C.reset}`);
      finish();
      return;
    }

    rl.question(`\n  Enter rule number or keyword to remove (or Enter to cancel): `, (ans) => {
      ans = ans.trim();
      if (ans) {
        let removed = false;
        const num = parseInt(ans, 10);
        if (!isNaN(num) && num >= 1 && num <= rules.length) {
          const item = rules[num - 1];
          this.config[item.key] = this.config[item.key].filter(k => k !== item.kw);
          this.saveActiveConfig();
          this.logEvent('info', ` RULE REMOVED `, `Removed: "${item.kw}"`, '', C.pillYellow);
          removed = true;
        } else {
          const beforeAsk = this.config.askKeywords.length;
          const beforeSkip = this.config.skipKeywords.length;
          this.config.askKeywords = this.config.askKeywords.filter(k => k.toLowerCase() !== ans.toLowerCase());
          this.config.skipKeywords = this.config.skipKeywords.filter(k => k.toLowerCase() !== ans.toLowerCase());
          if (this.config.askKeywords.length !== beforeAsk || this.config.skipKeywords.length !== beforeSkip) {
            this.saveActiveConfig();
            this.logEvent('info', ` RULE REMOVED `, `Removed: "${ans}"`, '', C.pillYellow);
            removed = true;
          }
        }
        if (!removed) {
          console.log(`  ${C.yellow}No matching rule found.${C.reset}`);
        }
      } else {
        console.log(`  ${C.dim}Cancelled.${C.reset}`);
      }
      finish();
    });
  }

  shutdown() {
    console.log(`\n  ${C.yellow}Shutting down auto-submit daemon...${C.reset}\n`);
    releaseDaemonLock(this.portKey);
    this.stopScanner();
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false); } catch (e) {}
    }
    try { process.stdin.pause(); } catch (e) {}
    process.exit(0);
  }
}

// ── Main Entry ──
if (require.main === module) {
  const resolved = resolveConfig() || { config: { ...DEFAULTS }, configSource: 'default' };
  const { config, configSource } = resolved;

  const binName = path.basename(process.argv[1] || '', path.extname(process.argv[1] || '')).toLowerCase();
  const rawFirstArg = (process.argv.slice(2).find(a => !a.startsWith('-')) || '').toLowerCase().trim();
  let firstArg = rawFirstArg || (
    binName.includes('doctor') ? 'doctor' :
    binName.includes('start') ? 'start' :
    binName.includes('setup') ? 'setup' :
    binName.includes('restart') ? 'restart' :
    binName.includes('update') ? 'update' :
    binName.includes('uninstall') ? 'uninstall' :
    binName.includes('launch') ? 'launch' : ''
  );
  if (['d', 'doc', 'check'].includes(firstArg)) firstArg = 'doctor';
  else if (['l', 'ls', 'rules'].includes(firstArg)) firstArg = 'list';
  else if (['s', 'stat', 'stats'].includes(firstArg)) firstArg = 'status';
  else if (['c', 'cfg', 'config'].includes(firstArg)) firstArg = 'config';
  else if (['r'].includes(firstArg)) firstArg = 'restart';
  if (firstArg === 'doctor') {
    handleDoctor(config).catch(err => {
      console.error('Doctor error:', err);
      process.exit(1);
    });
    return;
  }

  if (firstArg === 'start' || process.argv.includes('--start')) {
    handleEasyStart(config, configSource).catch(err => {
      console.error('Easy Start error:', err);
      process.exit(1);
    });
    return;
  }

  if (firstArg === 'restart') {
    handleRestart(config).catch(err => {
      console.error('Restart error:', err);
      process.exit(1);
    });
    return;
  }

  if (firstArg === 'update' || firstArg === 'upgrade') {
    handleUpdate();
    return;
  }

  if (firstArg === 'uninstall' || firstArg === 'remove-all') {
    handleUninstall();
    return;
  }

  if (firstArg === 'kill' || firstArg === 'stop-ide') {
    killAntigravity();
    console.log(`\n  ${C.green}✔ Terminated all Antigravity IDE processes.${C.reset}\n`);
    process.exit(0);
  }

  if (firstArg === 'launch' || firstArg === 'start-ide') {
    handleLaunch(config).catch(err => {
      console.error('Launch error:', err);
      process.exit(1);
    });
    return;
  }

  // JSON Status Check
  if (process.argv.includes('status') || process.argv.includes('--status')) {
    (async () => {
      const endpoints = await findCdpEndpoints(config.cdpPort, config.cdpPorts);
      const stats = new StatsManager();
      const allWindows = [];
      endpoints.forEach(ep => {
        const targets = selectAllWorkbenchTargets(ep.targets);
        targets.forEach(t => {
          allWindows.push({
            id: t.id || t.webSocketDebuggerUrl,
            port: ep.port,
            title: cleanStr(t.title || 'Antigravity IDE', 50),
            url: t.url
          });
        });
      });
      const primaryEndpoint = endpoints[0] || null;
      const primaryTarget = allWindows[0] || null;
      const output = {
        connected: allWindows.length > 0,
        port: primaryEndpoint ? primaryEndpoint.port : null,
        ports: endpoints.map(e => e.port),
        targetTitle: primaryTarget ? primaryTarget.title : null,
        windows: allWindows,
        windowCount: allWindows.length,
        mode: config.mode,
        enabled: config.enabled,
        sessionApprovals: 0,
        lifetimeApprovals: stats.lifetimeClicks,
        lastClicked: stats.lastClicked
      };
      console.log(JSON.stringify(output, null, 2));
      process.exit(allWindows.length > 0 ? 0 : 1);
    })();
  } else {
    const portKey = config.cdpPort > 0 ? String(config.cdpPort) : 'auto';
    const isForce = process.argv.includes('--force') || process.argv.includes('-f');
    const runningPid = acquireDaemonLock(portKey, isForce);
    if (runningPid) {
      console.log(`\n  ${C.yellow}⚠️ Another auto-accept daemon (PID ${runningPid}) is already running on ${portKey === 'auto' ? 'auto-detection' : 'CDP port ' + portKey}.${C.reset}`);
      console.log(`  ${C.dim}Only one daemon should manage ${portKey === 'auto' ? 'auto-detection mode' : 'port ' + portKey} to prevent duplicate submissions.${C.reset}`);
      console.log(`  ${C.dim}To override or replace it, stop PID ${runningPid} or run with: ${C.bold}auto-accept --force${C.reset}\n`);
      process.exit(0);
    }
    process.on('exit', () => releaseDaemonLock(portKey));
    process.on('SIGINT', () => { releaseDaemonLock(portKey); process.exit(0); });
    process.on('SIGTERM', () => { releaseDaemonLock(portKey); process.exit(0); });

    const daemon = new AutoSubmitDaemon(config, configSource);
    daemon.start().catch((err) => {
      releaseDaemonLock(portKey);
      console.error(`${C.red}Fatal daemon error:${C.reset}`, err);
      process.exit(1);
    });
  }
}

module.exports = {
  AutoSubmitDaemon,
  WindowSession,
  StatsManager,
  buildScannerScript,
  findCdpEndpoint,
  findCdpEndpoints,
  selectWorkbenchTarget,
  selectAllWorkbenchTargets,
  acquireDaemonLock,
  releaseDaemonLock,
  getPidFilePath,
  cleanStr,
  DEFAULTS,
  handleAddRuleCli,
  handleRemoveRuleCli,
  getSaveTarget,
  handleEasyStart,
  launchAntigravityProcess,
  handleDoctor,
  handleLaunch,
  handleSetup,
  handleRestart,
  handleUpdate,
  handleUninstall,
  killAntigravity,
  isAntigravityRunning,
  findAntigravityExecutable,
  findAntigravityExecutables,
  printSetupInstructions,
  resolveConfig
};
