#!/usr/bin/env node
/**
 * Kiro Auto-Accept Daemon
 * Autonomous confirmation & approval automation for Kiro IDE via Chrome DevTools Protocol (CDP).
 *
 * Dedicated Port: 9222 (Port Range: 9220-9230)
 * Strictly isolated from Antigravity IDE (Port 9333 / 9330-9340).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync, spawn } = require('child_process');

let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  try {
    WebSocket = require(path.join(__dirname, 'node_modules', 'ws'));
  } catch (err) {
    // Will be reported by doctor if missing
  }
}

const PKG_VERSION = '1.0.0';
const GLOBAL_DIR = path.join(os.homedir(), '.kiro-auto-accept');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_DIR, 'config.json');
const STATS_FILE = path.join(GLOBAL_DIR, 'stats.json');
const PID_DIR = path.join(os.tmpdir(), 'kiro-auto-accept');
const LOCAL_CONFIG_FILES = ['.kiro-auto-accept.json', 'kiro-auto-accept.json'];

const DEFAULTS = {
  enabled: true,
  mode: 'autonomous', // 'autonomous' | 'autopilot'
  cdpPort: 0,         // 0 = auto-detect 9222 / 9220-9230
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

// Colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  brightYellow: '\x1b[93m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  pillGreen: '\x1b[42m\x1b[30m\x1b[1m',
  pillYellow: '\x1b[43m\x1b[30m\x1b[1m',
  pillMagenta: '\x1b[45m\x1b[37m\x1b[1m',
  pillRed: '\x1b[41m\x1b[37m\x1b[1m',
};

function cleanStr(str, max = 50) {
  if (!str) return '';
  const s = String(str).replace(/[\r\n\t]+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

// ─── PID Lock Helpers ───
function getPidFilePath(portKey = 'auto') {
  const safeKey = String(portKey).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(PID_DIR, `daemon_${safeKey}.pid`);
}

function acquireDaemonLock(portKey = 'auto', force = false) {
  if (typeof portKey === 'boolean') {
    force = portKey;
    portKey = 'auto';
  }
  if (!fs.existsSync(PID_DIR)) {
    try { fs.mkdirSync(PID_DIR, { recursive: true }); } catch (e) {}
  }
  const pidFile = getPidFilePath(portKey);
  if (fs.existsSync(pidFile)) {
    try {
      const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (oldPid && !isNaN(oldPid)) {
        let isAlive = false;
        try {
          process.kill(oldPid, 0);
          isAlive = true;
        } catch (e) {
          isAlive = false;
        }
        if (isAlive) {
          if (force) {
            try { process.kill(oldPid, 'SIGTERM'); } catch (e) {}
          } else {
            return { locked: false, runningPid: oldPid };
          }
        }
      }
    } catch (e) {}
  }
  try {
    fs.writeFileSync(pidFile, String(process.pid), 'utf8');
    return { locked: true };
  } catch (e) {
    return { locked: false, error: e.message };
  }
}

function releaseDaemonLock(portKey = 'auto') {
  if (typeof portKey !== 'string' && typeof portKey !== 'number') portKey = 'auto';
  try {
    const pidFile = getPidFilePath(portKey);
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  } catch (e) {}
}

// ─── Subcommands: init, list, doctor ───
function handleInit() {
  const target = path.join(process.cwd(), '.kiro-auto-accept.json');
  if (fs.existsSync(target)) {
    console.log(`${C.yellow}Configuration file already exists:${C.reset} ${target}`);
    process.exit(0);
  }
  try {
    fs.writeFileSync(target, JSON.stringify(DEFAULTS, null, 2), 'utf8');
    console.log(`${C.green}✔ Created local configuration:${C.reset} ${target}`);
  } catch (e) {
    console.error(`${C.red}✖ Failed to create configuration:${C.reset}`, e.message);
  }
  process.exit(0);
}

function handleList(cfg) {
  console.log(`\n${C.bold}${C.brightCyan}⚡ Kiro Auto-Accept Active Rules${C.reset}\n`);
  console.log(`  ${C.bold}Status:${C.reset}        ${cfg.enabled ? `${C.green}Enabled ✔${C.reset}` : `${C.red}Disabled ✖${C.reset}`}`);
  console.log(`  ${C.bold}Mode:${C.reset}          ${cfg.mode === 'autopilot' ? `${C.magenta}AUTOPILOT (100% hands-free)${C.reset}` : `${C.cyan}AUTONOMOUS (Approval required)${C.reset}`}`);
  console.log(`  ${C.bold}CDP Port:${C.reset}      ${cfg.cdpPort > 0 ? cfg.cdpPort : 'Auto-Detect (9222 / 9220-9230)'}`);
  console.log(`  ${C.bold}Always-Allow:${C.reset}  ${cfg.autoSelectAlwaysAllow ? `${C.green}Yes${C.reset}` : `${C.dim}No${C.reset}`}`);
  console.log(`  ${C.bold}Safety Delay:${C.reset}  ${cfg.safetyDelayMs}ms`);
  console.log(`  ${C.bold}Poll Rate:${C.reset}     ${cfg.pollIntervalMs}ms\n`);
  console.log(`  ${C.yellow}🛡️ Ask Permission Keywords (${cfg.askKeywords.length}):${C.reset}`);
  cfg.askKeywords.forEach(k => console.log(`    • "${k}"`));
  console.log(`\n  ${C.magenta}🚫 Skip Keywords (${cfg.skipKeywords.length}):${C.reset}`);
  cfg.skipKeywords.forEach(k => console.log(`    • "${k}"`));
  console.log('');
  process.exit(0);
}

async function handleDoctor(cfg, shouldExit = true) {
  console.log(`\n${C.bold}${C.brightCyan}⚡ Kiro Auto-Accept — System Doctor${C.reset}\n`);

  // 1. Node.js check
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  const nodeOk = major >= 18;
  console.log(`  ${C.bold}Node.js Version:${C.reset}     ${nodeVer} ${nodeOk ? `${C.green}✔ (Supported: >=18.0.0)${C.reset}` : `${C.red}✖ (Requires Node.js 18+)${C.reset}`}`);
  console.log(`  ${C.bold}Operating System:${C.reset}   ${process.platform} (${os.type()} ${os.release()})`);

  // 2. WebSocket library check
  if (!WebSocket) {
    console.log(`  ${C.bold}WebSocket Library:${C.reset} ${C.red}✖ ws package not found! Run npm install ws${C.reset}`);
  } else {
    console.log(`  ${C.bold}WebSocket Library:${C.reset} ${C.green}✔ ws ready${C.reset}`);
  }

  // 3. Executable check
  const exe = findKiroExecutable();
  console.log(`  ${C.bold}Kiro IDE Binary:${C.reset}   ${exe ? `${C.cyan}${cleanStr(exe, 60)}${C.reset} ${C.green}✔${C.reset}` : `${C.yellow}Not found in standard paths ⚠️${C.reset}`}`);

  // 4. CDP Port check
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
        const label = t.type === 'iframe' ? 'Kiro Chat Webview' : cleanStr(t.title || 'Kiro IDE', 55);
        console.log(`  ${C.bold}Target [${winCount}]:${C.reset}        ${C.cyan}"${label}"${C.reset} (Port ${ep.port}, ${t.type}) ✔`);
      });
    });
    console.log(`  ${C.bold}Confirmation Engine:${C.reset}${C.green} Ready for multi-target auto-approvals! (${winCount} target(s)) ✔${C.reset}\n`);
    console.log(`  ${C.bold}${C.green}Status:${C.reset} All systems operational! Run ${C.bold}kiro-auto-accept${C.reset} to start the daemon.\n`);
  } else {
    console.log(`  ${C.bold}CDP Port Status:${C.reset}    ${C.yellow}No active port detected ⚠️${C.reset}                                     \n`);
    const isRunning = isKiroRunning();
    console.log(`  ${C.bold}Process Status:${C.reset}     ${isRunning ? `${C.yellow}Kiro IDE is RUNNING (without debug port) ⚠️${C.reset}` : `${C.dim}Kiro IDE is not running${C.reset}`}\n`);

    if (isRunning) {
      console.log(`  ${C.bold}${C.red}✗ ROOT CAUSE IDENTIFIED:${C.reset}`);
      console.log(`  Kiro IDE is currently open, but was started without ${C.yellow}--remote-debugging-port=9222${C.reset}.`);
      console.log(`  Electron/Chromium cannot attach a debugging port to an already-running process.\n`);
      console.log(`  ${C.bold}👉 QUICK FIX:${C.reset}`);
      console.log(`     • Run: ${C.bold}${C.cyan}kiro-auto-accept restart${C.reset} (closes old process and restarts with Port 9222)`);
      console.log(`     • OR close Kiro IDE and open it from the ${C.bold}"Kiro IDE (Debug)"${C.reset} shortcut.\n`);
    } else {
      printSetupInstructions();
    }
  }
  if (shouldExit) process.exit(0);
}

// ─── Process Management Helpers ───
function isKiroRunning() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /NH 2>nul', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return /kiro(\.exe)?/i.test(out);
    } else {
      const out = execSync('pgrep -i kiro 2>/dev/null', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return !!(out && out.trim());
    }
  } catch (e) {
    return false;
  }
}

function killKiro() {
  try {
    if (process.platform === 'win32') {
      try { execSync('taskkill /F /IM "Kiro.exe" /T 2>nul', { stdio: 'ignore' }); } catch (e) {}
    } else if (process.platform === 'darwin') {
      try { execSync('pkill -9 -f Kiro 2>/dev/null', { stdio: 'ignore' }); } catch (e) {}
    } else {
      try { execSync('pkill -9 -f kiro 2>/dev/null', { stdio: 'ignore' }); } catch (e) {}
    }
    return true;
  } catch (e) {
    return false;
  }
}

function findKiroExecutable() {
  if (process.env.KIRO_PATH && fs.existsSync(process.env.KIRO_PATH)) {
    return process.env.KIRO_PATH;
  }
  if (process.env.KIRO_EXE && fs.existsSync(process.env.KIRO_EXE)) {
    return process.env.KIRO_EXE;
  }

  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Kiro', 'Kiro.exe'),
      path.join(process.env.PROGRAMFILES || '', 'Kiro', 'Kiro.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Kiro', 'Kiro.exe')
    ];
    const found = candidates.find(c => fs.existsSync(c));
    if (found) return found;

    try {
      const out = execSync('where kiro 2>nul', { encoding: 'utf8' }).trim().split(/[\r\n]+/)[0];
      if (out && fs.existsSync(out)) return out;
    } catch (e) {}

    return null;
  } else if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Kiro.app/Contents/MacOS/Kiro',
      path.join(os.homedir(), 'Applications', 'Kiro.app', 'Contents', 'MacOS', 'Kiro')
    ];
    const found = candidates.find(c => fs.existsSync(c));
    if (found) return found;
    try {
      const out = execSync('which kiro 2>/dev/null', { encoding: 'utf8' }).trim();
      if (out && fs.existsSync(out)) return out;
    } catch (e) {}
    return null;
  } else {
    const candidates = [
      '/usr/bin/kiro',
      '/usr/local/bin/kiro',
      path.join(os.homedir(), '.local', 'bin', 'kiro')
    ];
    const found = candidates.find(c => fs.existsSync(c));
    if (found) return found;
    try {
      const out = execSync('which kiro 2>/dev/null', { encoding: 'utf8' }).trim();
      if (out && fs.existsSync(out)) return out;
    } catch (e) {}
    return null;
  }
}

function launchKiroProcess(port = 9222) {
  const exe = findKiroExecutable();
  if (!exe) {
    console.error(`\n${C.red}✖ Could not automatically locate Kiro IDE executable on this device.${C.reset}\n`);
    printSetupInstructions();
    return false;
  }

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
  const port = (cfg && cfg.cdpPort > 0) ? cfg.cdpPort : 9222;
  console.log(`\n${C.bold}${C.brightCyan}🔄 Restarting Kiro IDE with remote debugging enabled on Port ${port}...${C.reset}`);

  if (isKiroRunning()) {
    console.log(`  ${C.yellow}Closing existing Kiro IDE processes...${C.reset}`);
    killKiro();
    await new Promise(r => setTimeout(r, 1500));
  } else {
    console.log(`  ${C.dim}No existing Kiro IDE process running.${C.reset}`);
  }

  return handleLaunch(cfg, true, shouldExit);
}

async function handleLaunch(cfg, forceRestart = false, shouldExit = true) {
  const port = (cfg && cfg.cdpPort > 0) ? cfg.cdpPort : 9222;
  const isForce = forceRestart || process.argv.includes('--force') || process.argv.includes('-f') || process.argv.includes('--restart') || process.argv.includes('restart');

  if (isForce && isKiroRunning()) {
    console.log(`  ${C.yellow}Closing existing Kiro IDE processes (--force)...${C.reset}`);
    killKiro();
    await new Promise(r => setTimeout(r, 1200));
  }

  if (!isForce) {
    const endpoints = await findCdpEndpoints(port, []);
    if (endpoints.length > 0) {
      console.log(`\n  ${C.yellow}ℹ Kiro IDE is already running and connected on port ${port}!${C.reset}`);
      console.log(`  ${C.dim}Run ${C.bold}kiro-auto-accept${C.reset}${C.dim} to start the confirmation daemon.${C.reset}`);
      console.log(`  ${C.dim}(To force restart anyway, run: ${C.bold}kiro-auto-accept restart${C.reset}${C.dim})${C.reset}\n`);
      if (shouldExit) process.exit(0);
      return true;
    }

    if (isKiroRunning()) {
      console.log(`\n  ${C.bold}${C.yellow}⚠️ Kiro IDE is already running WITHOUT remote debugging enabled!${C.reset}`);
      console.log(`  ${C.dim}Electron/Chromium cannot attach port ${port} to an already-running process.${C.reset}\n`);
      console.log(`  ${C.bold}👉 To fix this instantly:${C.reset}`);
      console.log(`     • Run: ${C.bold}${C.cyan}kiro-auto-accept restart${C.reset}  (closes old process and starts fresh with port ${port})`);
      console.log(`     • OR close Kiro IDE completely and reopen from "Kiro IDE (Debug)" shortcut\n`);
      if (shouldExit) process.exit(0);
      return false;
    }
  }

  console.log(`\n${C.bold}${C.brightCyan}🚀 Auto-launching Kiro IDE with remote debugging enabled on Port ${port}...${C.reset}`);
  const exe = findKiroExecutable();
  console.log(`  ${C.bold}Executable:${C.reset} ${C.green}${exe || 'Unknown'}${C.reset}\n`);

  const ok = launchKiroProcess(port);
  if (!ok) {
    if (shouldExit) process.exit(1);
    return false;
  }

  console.log(`${C.green}✔ Kiro IDE process spawned successfully!${C.reset}`);
  console.log(`  ${C.dim}Run kiro-auto-accept to begin auto-approvals.${C.reset}\n`);
  if (shouldExit) process.exit(0);
  return true;
}

async function handleEasyStart(cfg, configSource) {
  const port = (cfg && cfg.cdpPort > 0) ? cfg.cdpPort : 9222;
  const endpoints = await findCdpEndpoints(port, cfg.cdpPorts || []);

  if (endpoints.length === 0) {
    const isRunning = isKiroRunning();
    if (isRunning) {
      console.log(`\n  ${C.bold}${C.yellow}⚠️ Kiro IDE is running but Port ${port} is not responding.${C.reset}`);
      console.log(`  ${C.dim}Attempting automatic restart with debugging enabled...${C.reset}\n`);
      await handleRestart(cfg, false);
    } else {
      console.log(`\n  ${C.cyan}Kiro IDE is not running. Launching with port ${port}...${C.reset}\n`);
      await handleLaunch(cfg, false, false);
    }

    // Wait for CDP to become active
    process.stdout.write(`  ${C.bold}Waiting for Kiro IDE CDP on port ${port}...${C.reset} `);
    let connected = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 600));
      const testEps = await findCdpEndpoints(port, cfg.cdpPorts || []);
      if (testEps.length > 0) {
        connected = true;
        break;
      }
      process.stdout.write('.');
    }
    console.log(connected ? ` ${C.green}Ready! ✔${C.reset}\n` : ` ${C.yellow}Continuing... ⚠️${C.reset}\n`);
  }

  const portKey = cfg.cdpPort > 0 ? String(cfg.cdpPort) : 'auto';
  const isForce = process.argv.includes('--force') || process.argv.includes('-f');
  const lock = acquireDaemonLock(portKey, isForce);

  if (!lock.locked) {
    const runningPid = lock.runningPid || 'unknown';
    console.log(`\n  ${C.yellow}⚠️ Another kiro-auto-accept daemon is already running (PID: ${runningPid})${C.reset}`);
    console.log(`  ${C.dim}To override, run: ${C.bold}kiro-auto-accept --force${C.reset}\n`);
    process.exit(0);
  }

  process.on('exit', () => releaseDaemonLock(portKey));
  process.on('SIGINT', () => { releaseDaemonLock(portKey); process.exit(0); });
  process.on('SIGTERM', () => { releaseDaemonLock(portKey); process.exit(0); });

  const daemon = new AutoAcceptDaemon(cfg, configSource);
  daemon.start().catch((err) => {
    releaseDaemonLock(portKey);
    console.error(`${C.red}Fatal daemon error:${C.reset}`, err);
    process.exit(1);
  });
}

function handleSetup(cfg) {
  const port = (cfg && cfg.cdpPort > 0) ? cfg.cdpPort : 9222;
  console.log(`\n${C.bold}${C.brightCyan}🔧 Kiro Auto-Accept - Automatic Shortcut & Environment Setup${C.reset}\n`);

  if (process.platform === 'win32') {
    const exe = findKiroExecutable();
    if (!exe) {
      console.log(`  ${C.yellow}⚠️ Kiro IDE executable not found in standard paths.${C.reset}`);
      printSetupInstructions();
      process.exit(0);
    }

    const safeExe = exe.replace(/\\/g, '\\\\');
    const psScript = `
      \$ProgressPreference = 'SilentlyContinue'
      \$shell = New-Object -ComObject WScript.Shell
      \$desktop = [Environment]::GetFolderPath('Desktop')
      \$startMenu = [Environment]::GetFolderPath('Programs')
      \$oneDriveDesktop = "C:\\Users\\\$env:USERNAME\\OneDrive\\Desktop"
      \$exe = "${safeExe}"
      \$exeDir = Split-Path \$exe -Parent
      \$args = "--remote-debugging-port=${port}"

      \$targets = @(
        (Join-Path \$desktop "Kiro IDE (Debug).lnk"),
        (Join-Path \$startMenu "Kiro IDE (Debug).lnk"),
        (Join-Path \$startMenu "Kiro.lnk")
      )
      if (Test-Path \$oneDriveDesktop) {
        \$targets += (Join-Path \$oneDriveDesktop "Kiro IDE (Debug).lnk")
      }

      \$count = 0
      foreach (\$linkPath in \$targets) {
        try {
          \$dir = Split-Path \$linkPath -Parent
          if (!(Test-Path \$dir)) { New-Item -ItemType Directory -Path \$dir -Force | Out-Null }
          \$sc = \$shell.CreateShortcut(\$linkPath)
          \$sc.TargetPath = \$exe
          \$sc.Arguments = \$args
          \$sc.WorkingDirectory = \$exeDir
          \$sc.IconLocation = "\$exe,0"
          \$sc.Save()
          \$count++
        } catch {}
      }
      Write-Output \$count
    `;

    try {
      const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
      const count = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, { encoding: 'utf8' }).trim();
      console.log(`  ${C.green}✔ Successfully configured ${count} Kiro IDE shortcuts with Port ${port}!${C.reset}`);
      console.log(`    ${C.dim}• Desktop: "Kiro IDE (Debug).lnk"${C.reset}`);
      console.log(`    ${C.dim}• Start Menu: "Kiro IDE (Debug).lnk" & "Kiro.lnk"${C.reset}`);
      console.log(`    ${C.dim}• Debug Port: ${C.yellow}${port}${C.reset}\n`);
      console.log(`  ${C.cyan}Launch Kiro IDE using any of these shortcuts, then run:${C.reset} ${C.bold}kiro-auto-accept${C.reset}\n`);
    } catch (e) {
      console.error(`  ${C.red}✖ Failed to update shortcuts automatically:${C.reset}`, e.message);
    }
  } else {
    printSetupInstructions();
  }
  process.exit(0);
}

function printSetupInstructions() {
  console.log(`  ${C.bold}${C.cyan}───────────────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`  ${C.bold}${C.brightCyan}📋 SETUP INSTRUCTIONS:${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}───────────────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`
  Kiro IDE requires the remote debugging port for CDP communication.
  
  ${C.bold}Option 1 (Recommended):${C.reset} Use the automatic launcher
    Run: ${C.bold}${C.green}kiro-auto-accept launch${C.reset}
  
  ${C.bold}Option 2:${C.reset} Manual launch with debugging port
    Close Kiro IDE completely, then launch it with:
    ${C.cyan}kiro --remote-debugging-port=9222${C.reset}
  
  ${C.bold}Option 3:${C.reset} Create a permanent shortcut
    Run: ${C.bold}${C.yellow}kiro-auto-accept setup${C.reset} (configures Desktop and Start Menu shortcuts)
  
  After launching with the debug port:
    Run: ${C.bold}${C.green}kiro-auto-accept${C.reset} to start the auto-accept daemon
`);
}

// ─── Config Loading ───
function loadConfig() {
  let cfg = { ...DEFAULTS };
  let source = 'defaults';

  if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
    try {
      const globalCfg = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8'));
      cfg = { ...cfg, ...globalCfg };
      source = 'global';
    } catch (e) {}
  }

  for (const fname of LOCAL_CONFIG_FILES) {
    const local = path.join(process.cwd(), fname);
    if (fs.existsSync(local)) {
      try {
        const localCfg = JSON.parse(fs.readFileSync(local, 'utf8'));
        cfg = { ...cfg, ...localCfg };
        source = 'local';
        break;
      } catch (e) {}
    }
  }

  const modeArg = process.argv.find(a => a.startsWith('--mode='));
  if (modeArg) {
    const modeVal = modeArg.split('=')[1];
    if (modeVal === 'autopilot' || modeVal === 'autonomous') {
      cfg.mode = modeVal;
      source = 'cli';
    }
  }
  if (process.argv.includes('--autopilot')) {
    cfg.mode = 'autopilot';
    source = 'cli';
  }
  if (process.argv.includes('--autonomous')) {
    cfg.mode = 'autonomous';
    source = 'cli';
  }

  const portArg = process.argv.find(a => a.startsWith('--port='));
  if (portArg) {
    const portVal = parseInt(portArg.split('=')[1], 10);
    if (portVal > 0) {
      cfg.cdpPort = portVal;
      source = 'cli';
    }
  }

  if (process.argv.includes('--always-allow') || process.argv.includes('--auto-allow')) {
    cfg.autoSelectAlwaysAllow = true;
  }

  if (process.argv.includes('--quiet') || process.argv.includes('-q')) {
    cfg.quiet = true;
  }

  return { cfg, source };
}

// ─── CDP Discovery & Target Selection ───
async function findCdpEndpoints(portHint = 0, explicitPorts = []) {
  const candidates = [];
  if (portHint > 0) {
    if (!(portHint >= 9300 && portHint <= 9400)) {
      candidates.push(portHint);
    }
  }
  if (explicitPorts && explicitPorts.length > 0) {
    explicitPorts.forEach(p => {
      if (p >= 9300 && p <= 9400) return; // Strict exclusion of Antigravity ports
      candidates.push(p);
    });
  }
  if (candidates.length === 0) {
    candidates.push(9222); // Default Kiro debug port
    for (let p = 9220; p <= 9230; p++) {
      if (p !== 9222) candidates.push(p);
    }
  }

  const results = [];
  for (const port of candidates) {
    if (port >= 9300 && port <= 9400) continue; // Antigravity isolation
    const targets = await fetchCdpTargets(port);
    if (targets && targets.length > 0) {
      const wb = selectAllWorkbenchTargets(targets);
      if (wb.length > 0) {
        results.push({ port, targets: wb });
      }
    }
  }
  return results;
}

async function fetchCdpTargets(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, { timeout: 1000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(Array.isArray(data) ? data : []);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function selectAllWorkbenchTargets(targets) {
  if (!targets || !Array.isArray(targets)) return [];
  return targets.filter(t => {
    if (!t || !t.webSocketDebuggerUrl) return false;
    const url = (t.url || '').toLowerCase();
    const title = (t.title || '').toLowerCase();

    // STRICT ISOLATION: Never match Antigravity targets
    if (url.includes('antigravity') || title.endsWith(' - antigravity ide') || title.endsWith(' - antigravity')) return false;

    // Reject regular browser tabs and devtools
    if (/^(https?|chrome|edge|chrome-extension|brave|about|devtools):/i.test(url)) return false;

    // Match Kiro workbench page OR Kiro Agent webview iframe
    const isKiroWorkbench = (t.type === 'page' && (url.includes('/kiro/') || url.includes('\\kiro\\') || url.includes('workbench') || title.includes('kiro')));
    const isKiroWebview = ((t.type === 'iframe' || t.type === 'webview' || t.type === 'page') && (url.includes('kiroagent') || url.includes('vscode-webview')));

    return isKiroWorkbench || isKiroWebview;
  });
}

// ─── Injected Scanner Script (Multi-Document & Kiro Button Matching) ───
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

      const isClicked = (el) => {
        try {
          return Boolean(el && ((el.hasAttribute && el.hasAttribute('data-kiro-clicked')) || (el.getAttribute && el.getAttribute('data-kiro-clicked'))));
        } catch (e) { return false; }
      };

      const markClicked = (el) => {
        try {
          if (el && el.setAttribute) el.setAttribute('data-kiro-clicked', 'true');
          setTimeout(() => { try { if (el && el.removeAttribute) el.removeAttribute('data-kiro-clicked'); } catch (e) {} }, 3000);
        } catch (e) {}
      };

      // Collect all searchable documents (main document, active-frame, and any nested iframes)
      const docs = [document];
      const activeFrame = document.getElementById('active-frame');
      if (activeFrame) {
        try {
          const d = activeFrame.contentDocument || activeFrame.contentWindow.document;
          if (d && !docs.includes(d)) docs.push(d);
        } catch(e) {}
      }
      document.querySelectorAll('iframe').forEach(f => {
        try {
          const d = f.contentDocument || f.contentWindow.document;
          if (d && !docs.includes(d)) docs.push(d);
        } catch(e) {}
      });

      const APPROVAL_EXACT = ['allow', 'always allow', 'approve', 'accept', 'continue', 'proceed', 'yes', 'ok', 'confirm', 'run', 'execute', 'run command'];
      const IGNORE_CLASSES = ['collapsible-toggle', 'tab-bar-item-close', 'model-selector-trigger', 'kiro-agent-selector-trigger'];

      for (const doc of docs) {
        const candidates = Array.from(doc.querySelectorAll('button, .kiro-button, [role="button"], input[type="submit"], [class*="approve"], [class*="submit"], [class*="continue"]'));
        
        // If autoSelectAlwaysAllow is enabled, look for "always allow" first
        let targetBtn = null;
        if (autoSelectAlwaysAllow) {
          targetBtn = candidates.find(b => {
            if (isClicked(b)) return false;
            const cls = (b.className || '').toString();
            if (IGNORE_CLASSES.some(c => cls.includes(c))) return false;
            const t = (b.innerText || b.textContent || '').trim().replace(/\\s+/g, ' ').toLowerCase();
            return t === 'always allow' || t === 'always approve';
          });
        }

        if (!targetBtn) {
          for (const btn of candidates) {
            if (isClicked(btn)) continue;
            const cls = (btn.className || '').toString();
            if (IGNORE_CLASSES.some(c => cls.includes(c))) continue;

            const raw = (btn.innerText || btn.textContent || '').trim();
            const text = raw.replace(/\\s+/g, ' ').toLowerCase();
            
            const isMatch = APPROVAL_EXACT.includes(text) ||
                            (APPROVAL_EXACT.some(k => text === k || (text.startsWith(k + ' ') && !text.includes('deny') && !text.includes('cancel'))));
            
            if (isMatch || (mode === 'autopilot' && (text === 'proceed' || text.includes('proceed')))) {
              targetBtn = btn;
              break;
            }
          }
        }

        if (targetBtn) {
          const btn = targetBtn;
          const raw = (btn.innerText || btn.textContent || '').trim();
          const rect = btn.getBoundingClientRect();
          const win = doc.defaultView || window;
          const style = win.getComputedStyle ? win.getComputedStyle(btn) : null;
          
          if (rect.width > 0 && rect.height > 0 && (!style || (style.visibility !== 'hidden' && style.display !== 'none'))) {
            // Extract context text
            const panel = btn.closest('.agent-interaction-panel') || 
                          btn.closest('.agent-interaction-panel-content-container') ||
                          btn.closest('.permission-request') ||
                          btn.closest('.session-view-input');
            const fullContent = (panel ? panel.innerText : (btn.parentElement ? btn.parentElement.innerText : '')).trim();
            
            const match = checkKeywords(fullContent);
            if (match) {
              const reason = match.type === 'skip' ? 'Directly Skipped: "' + match.kw + '"' : 'Awaiting Permission: "' + match.kw + '"';
              return {
                action: raw,
                blocked: true,
                blockedType: match.type,
                matchedKeyword: match.kw,
                blockedReason: reason,
                context: fullContent.substring(0, 150)
              };
            }

            markClicked(btn);

            // Try React props click handler first
            const rk = Object.keys(btn).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            if (rk && btn[rk] && typeof btn[rk].onClick === 'function') {
              try { btn[rk].onClick({ preventDefault: () => {}, stopPropagation: () => {} }); } catch (e) {}
            }

            // Mouse events dispatch
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evtType => {
              try {
                btn.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: win }));
              } catch(e) {}
            });
            try { btn.click(); } catch(e) {}

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

// ─── CDP Request Helper ───
function sendCdpRequest(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!WebSocket) return reject(new Error('WebSocket module (ws) not available'));
    const ws = new WebSocket(wsUrl);
    const id = Date.now();
    
    const timeout = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      reject(new Error('CDP request timeout'));
    }, 4000);
    
    ws.on('open', () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    
    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data);
        if (response.id === id) {
          clearTimeout(timeout);
          try { ws.close(); } catch (e) {}
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      } catch (e) {
        reject(e);
      }
    });
    
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ─── Stats Manager ───
class StatsManager {
  constructor() {
    this.accepted = 0;
    this.skipped = 0;
    this.asked = 0;
    this.startTime = Date.now();
    this.loadStats();
  }

  loadStats() {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        this.accepted = data.accepted || 0;
        this.skipped = data.skipped || 0;
        this.asked = data.asked || 0;
      }
    } catch (e) {}
  }

  saveStats() {
    try {
      if (!fs.existsSync(GLOBAL_DIR)) {
        fs.mkdirSync(GLOBAL_DIR, { recursive: true });
      }
      fs.writeFileSync(STATS_FILE, JSON.stringify({
        accepted: this.accepted,
        skipped: this.skipped,
        asked: this.asked,
        startTime: this.startTime,
        lastUpdate: Date.now()
      }, null, 2), 'utf8');
    } catch (e) {}
  }

  recordApproval() {
    this.accepted++;
    this.saveStats();
  }

  recordBlock() {
    this.skipped++;
    this.saveStats();
  }

  recordAsk() {
    this.asked++;
    this.saveStats();
  }
}

// ─── Main Daemon Class ───
class AutoAcceptDaemon {
  constructor(cfg, configSource) {
    this.cfg = cfg;
    this.configSource = configSource;
    this.endpoints = [];
    this.running = false;
    this.stats = new StatsManager();
    this.lastReportedBlock = '';
    this._lastRefresh = 0;
  }

  async start() {
    if (!this.cfg.enabled) {
      console.log(`${C.yellow}Auto-accept is disabled in config. Enable it to run the daemon.${C.reset}`);
      process.exit(0);
    }

    console.log(`\n${C.bold}${C.brightCyan}⚡ Kiro Auto-Accept Daemon Starting...${C.reset}`);
    console.log(`  ${C.bold}Config Source:${C.reset} ${this.configSource}`);
    console.log(`  ${C.bold}Mode:${C.reset}          ${this.cfg.mode === 'autopilot' ? `${C.magenta}AUTOPILOT (100% hands-free)${C.reset}` : `${C.cyan}AUTONOMOUS${C.reset}`}`);
    console.log(`  ${C.bold}Always-Allow:${C.reset}  ${this.cfg.autoSelectAlwaysAllow ? `${C.green}Enabled${C.reset}` : `${C.dim}Disabled (Uses "Allow")${C.reset}`}`);
    console.log(`  ${C.bold}Safety Delay:${C.reset}  ${this.cfg.safetyDelayMs}ms`);
    console.log(`  ${C.bold}Poll Interval:${C.reset} ${this.cfg.pollIntervalMs}ms\n`);

    this.endpoints = await findCdpEndpoints(this.cfg.cdpPort, this.cfg.cdpPorts);
    if (this.endpoints.length === 0) {
      console.log(`${C.red}✖ No active Kiro IDE instances with remote debugging found.${C.reset}`);
      console.log(`${C.yellow}Run ${C.bold}kiro-auto-accept doctor${C.reset}${C.yellow} for diagnostics.${C.reset}\n`);
      process.exit(1);
    }

    let totalTargets = 0;
    this.endpoints.forEach(ep => {
      const targets = selectAllWorkbenchTargets(ep.targets);
      totalTargets += targets.length;
      console.log(`${C.green}✔ Connected to port ${ep.port} (${targets.length} target(s) / webview(s))${C.reset}`);
    });

    console.log(`\n${C.bold}${C.green}✔ Daemon is now monitoring ${totalTargets} Kiro IDE target(s)... (Port ${this.endpoints[0].port})${C.reset}`);
    console.log(`${C.dim}Press Ctrl+C to stop.${C.reset}\n`);

    this.running = true;
    this.poll();
  }

  async poll() {
    if (!this.running) return;

    try {
      // Periodically refresh endpoints to pick up newly opened Kiro chat/webview panels
      if (!this._lastRefresh || Date.now() - this._lastRefresh > 2000) {
        this._lastRefresh = Date.now();
        const fresh = await findCdpEndpoints(this.cfg.cdpPort, this.cfg.cdpPorts);
        if (fresh && fresh.length > 0) {
          this.endpoints = fresh;
        }
      }

      for (const ep of this.endpoints) {
        const targets = selectAllWorkbenchTargets(ep.targets);
        for (const target of targets) {
          await this.processTarget(ep.port, target);
        }
      }
    } catch (err) {}

    setTimeout(() => this.poll(), this.cfg.pollIntervalMs);
  }

  async processTarget(port, target) {
    if (!target.webSocketDebuggerUrl) return;

    try {
      const script = buildScannerScript(this.cfg);
      const result = await sendCdpRequest(target.webSocketDebuggerUrl, 'Runtime.evaluate', {
        expression: script,
        returnByValue: true
      });

      if (result && result.value) {
        const outcome = result.value;

        if (outcome.blocked) {
          const blockKey = `${outcome.blockedType}:${outcome.matchedKeyword}:${outcome.action}`;
          if (blockKey !== this.lastReportedBlock) {
            this.lastReportedBlock = blockKey;

            if (outcome.blockedType === 'ask') {
              this.stats.recordAsk();
              console.log(`${C.yellow}⚠️ PAUSED:${C.reset} "${outcome.action}" — ${outcome.blockedReason}`);
            } else {
              this.stats.recordBlock();
              console.log(`${C.magenta}🚫 SKIPPED:${C.reset} "${outcome.action}" — ${outcome.blockedReason}`);
            }
          }
        } else if (outcome.action) {
          this.lastReportedBlock = '';
          this.stats.recordApproval();
          console.log(`${C.green}✔ APPROVED:${C.reset} "${outcome.action}" (Total approved: ${this.stats.accepted})`);
          if (outcome.context) {
            console.log(`  ${C.dim}Command: "${cleanStr(outcome.context, 80)}"${C.reset}`);
          }
        }
      }
    } catch (e) {
      // Normal when target temporarily reloads
    }
  }
}

// ─── CLI Entry Point ───
async function main() {
  const args = process.argv.slice(2);
  const { cfg, source } = loadConfig();

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`kiro-auto-accept v${PKG_VERSION}`);
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${C.bold}${C.brightCyan}Kiro Auto-Accept${C.reset} v${PKG_VERSION}

${C.bold}USAGE:${C.reset}
  ${C.cyan}kiro-auto-accept${C.reset}              Start daemon (default)
  ${C.cyan}kiro-auto-accept start${C.reset}        Launch IDE + start daemon
  ${C.cyan}kiro-auto-accept init${C.reset}         Create .kiro-auto-accept.json in current dir
  ${C.cyan}kiro-auto-accept list${C.reset}         Show active rules
  ${C.cyan}kiro-auto-accept doctor${C.reset}       System diagnostics
  ${C.cyan}kiro-auto-accept setup${C.reset}        Configure shortcuts with debug port 9222
  ${C.cyan}kiro-auto-accept launch${C.reset}       Launch Kiro IDE with debug port 9222
  ${C.cyan}kiro-auto-accept restart${C.reset}      Restart Kiro IDE with debug port 9222

${C.bold}OPTIONS:${C.reset}
  --mode=autopilot       100% hands-free mode
  --mode=autonomous      Review plans before execution
  --always-allow         Auto-select "Always allow" button
  --port=9222            Specific CDP port
  --quiet, -q            Minimal output
  --force, -f            Force restart/override locks
  --help, -h             Show this help
  --version, -v          Show version

${C.bold}EXAMPLES:${C.reset}
  kiro-auto-accept
  kiro-auto-accept start --mode=autopilot
  kiro-auto-accept doctor
`);
    process.exit(0);
  }

  const cmd = args[0];

  if (cmd === 'init') {
    handleInit();
  } else if (cmd === 'list') {
    handleList(cfg);
  } else if (cmd === 'doctor') {
    await handleDoctor(cfg);
  } else if (cmd === 'setup') {
    handleSetup(cfg);
  } else if (cmd === 'launch') {
    await handleLaunch(cfg);
  } else if (cmd === 'restart') {
    await handleRestart(cfg);
  } else if (cmd === 'start') {
    await handleEasyStart(cfg, source);
  } else {
    // Default: start daemon
    await handleEasyStart(cfg, source);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`${C.red}Fatal error:${C.reset}`, err);
    process.exit(1);
  });
}

module.exports = { AutoAcceptDaemon, loadConfig, findCdpEndpoints, selectAllWorkbenchTargets, buildScannerScript };
