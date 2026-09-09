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

// ── Package Metadata ──
let PKG_VERSION = '1.3.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  if (pkg.version) PKG_VERSION = pkg.version;
} catch (e) {}

// ── Paths ──
const GLOBAL_DIR = path.join(os.homedir(), '.antigravity-auto-submit');
const STATS_FILE = path.join(GLOBAL_DIR, 'stats.json');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_DIR, 'config.json');
const LOCAL_CONFIG_FILES = ['.auto-accept.json', 'auto-accept.config.json'];

// ── Default Safety Profile ──
const DEFAULTS = {
  enabled: true,
  mode: 'autonomous', // 'autonomous' | 'autopilot'
  cdpPort: 0,         // 0 = auto-detect 9333 / scan 9000-9400
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
  if (!s) return '';
  const cleaned = String(s)
    .replace(/[\r\n\t\u21b5\u23ce\u21a9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + '...';
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
function handleList(cfg) {
  console.log(`
${C.bold}${C.cyan}Antigravity Auto-Submit — Active Rules${C.reset}

  ${C.bold}Operating Mode:${C.reset} ${cfg.mode === 'autopilot' ? `${C.magenta}AUTOPILOT (100% Hands-Free)${C.reset}` : `${C.cyan}AUTONOMOUS (Reviews Plans)${C.reset}`}
  ${C.bold}Click Delay:${C.reset}    ${cfg.safetyDelayMs}ms

  ${C.yellow}✋ Ask Permission List (${cfg.askKeywords.length} rules):${C.reset}
${cfg.askKeywords.map(k => `    • "${k}"`).join('\n') || '    (none)'}

  ${C.magenta}⏩ Directly Skip List (${cfg.skipKeywords.length} rules):${C.reset}
${cfg.skipKeywords.map(k => `    • "${k}"`).join('\n') || '    (none)'}
`);
  process.exit(0);
}

// ── Subcommand: doctor (Connection & Setup Guide) ──
async function handleDoctor(cfg) {
  console.log(`\n${C.bold}${C.brightCyan}⚡ Antigravity Auto-Submitter — System Doctor${C.reset}\n`);

  // 1. Node.js check
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  const nodeOk = major >= 18;
  console.log(`  ${C.bold}Node.js Version:${C.reset}     ${nodeVer} ${nodeOk ? `${C.green}✔ (Supported: >=18.0.0)${C.reset}` : `${C.red}✗ (Requires Node.js 18+)${C.reset}`}`);
  console.log(`  ${C.bold}Operating System:${C.reset}   ${process.platform} (${os.type()} ${os.release()})`);

  // 2. CDP Port check
  process.stdout.write(`  ${C.bold}CDP Port Status:${C.reset}    Scanning ports (9333, 9222, 9000-9400)...\r`);
  const endpoint = await findCdpEndpoint(cfg.cdpPort);

  if (endpoint) {
    const target = selectWorkbenchTarget(endpoint.targets);
    console.log(`  ${C.bold}CDP Port Status:${C.reset}    ${C.green}Connected on port ${endpoint.port} ✔${C.reset}                                 `);
    console.log(`  ${C.bold}Target Window:${C.reset}      ${C.cyan}"${cleanStr(target ? target.title : 'Antigravity IDE', 60)}"${C.reset} ✔`);
    console.log(`  ${C.bold}Confirmation Engine:${C.reset}${C.green} Ready for auto-approvals! ✔${C.reset}\n`);
    console.log(`  ${C.bold}${C.green}Status:${C.reset} All systems operational! Run ${C.bold}auto-accept${C.reset} to start the daemon.\n`);
  } else {
    console.log(`  ${C.bold}CDP Port Status:${C.reset}    ${C.yellow}No active port detected ⚠️${C.reset}                                     \n`);
    printSetupInstructions();
  }
  process.exit(0);
}

function printSetupInstructions() {
  console.log(`  ${C.bold}${C.cyan}──────────────────────────────────────────────────────────────────${C.reset}`);
  console.log(`  ${C.bold}${C.brightCyan}👉 HOW TO CONNECT ANTIGRAVITY IDE (1-Minute Setup):${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}──────────────────────────────────────────────────────────────────${C.reset}\n`);
  console.log(`  Antigravity IDE must be launched with remote debugging enabled (${C.bold}--remote-debugging-port=9333${C.reset}).\n`);

  if (process.platform === 'win32') {
    console.log(`  ${C.bold}${C.yellow}Windows Setup:${C.reset}`);
    console.log(`    ${C.bold}Option A (Desktop Shortcut - Recommended):${C.reset}`);
    console.log(`      1. Right-click your ${C.cyan}Antigravity IDE${C.reset} shortcut -> ${C.bold}Properties${C.reset}`);
    console.log(`      2. In the ${C.bold}Target${C.reset} field, add ${C.yellow}--remote-debugging-port=9333${C.reset} to the end:`);
    console.log(`         ${C.dim}"...\\Antigravity IDE.exe" --remote-debugging-port=9333${C.reset}`);
    console.log(`      3. Click OK and launch Antigravity from that shortcut.\n`);
    console.log(`    ${C.bold}Option B (Terminal / PowerShell):${C.reset}`);
    console.log(`      ${C.cyan}& "C:\\Users\\advdi\\AppData\\Local\\Programs\\Antigravity IDE\\Antigravity IDE.exe" --remote-debugging-port=9333${C.reset}\n`);
  } else if (process.platform === 'darwin') {
    console.log(`  ${C.bold}${C.yellow}macOS Setup:${C.reset}`);
    console.log(`    Launch Antigravity from Terminal:`);
    console.log(`      ${C.cyan}open -a "Antigravity" --args --remote-debugging-port=9333${C.reset}\n`);
  } else {
    console.log(`  ${C.bold}${C.yellow}Linux Setup:${C.reset}`);
    console.log(`    Launch Antigravity from Terminal:`);
    console.log(`      ${C.cyan}antigravity --remote-debugging-port=9333${C.reset}\n`);
  }

  console.log(`  ${C.dim}Once Antigravity launches, auto-accept will automatically connect instantly!${C.reset}\n`);
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
  ${C.green}auto-accept init${C.reset}          Generate .auto-accept.json in the current directory
  ${C.green}auto-accept status${C.reset}        Query live Antigravity IDE status as JSON
  ${C.green}auto-accept list${C.reset}          List active keywords and mode configuration
  ${C.green}auto-accept doctor${C.reset}        Diagnose Antigravity connection & print setup guide
  ${C.green}auto-accept add-ask <kw>${C.reset}    Add keyword to Ask list (manual permission)
  ${C.green}auto-accept add-skip <kw>${C.reset}   Add keyword to Skip list (direct skip)
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
  ${C.yellow}h${C.reset}  Redraw status banner           ${C.yellow}q${C.reset}  Quit daemon
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

  let fileConfig = { ...DEFAULTS,
  handleAddRuleCli,
  handleRemoveRuleCli,
  getSaveTarget
};
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
  const firstArg = args[0] ? args[0].toLowerCase() : '';

  if (firstArg === 'init') handleInit();
  if (firstArg === '-h' || firstArg === '--help' || firstArg === 'help') printHelp();
  if (firstArg === '-v' || firstArg === '--version') {
    console.log(`v${PKG_VERSION}`);
    process.exit(0);
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

  // 4. Environment Variables
  if (process.env.ANTIGRAVITY_CDP_PORT) {
    cfg.cdpPort = parseInt(process.env.ANTIGRAVITY_CDP_PORT, 10) || cfg.cdpPort;
  }
  if (process.env.ANTIGRAVITY_AUTO_SUBMIT_MODE) {
    cfg.mode = process.env.ANTIGRAVITY_AUTO_SUBMIT_MODE;
  }

  // 5. CLI Flags
  let shouldSave = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '-m' || a === '--mode') && args[i + 1]) {
      const val = args[++i].toLowerCase();
      if (val === 'autopilot' || val === 'autonomous') cfg.mode = val;
    } else if ((a === '-p' || a === '--port') && args[i + 1]) {
      cfg.cdpPort = parseInt(args[++i], 10) || 0;
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

  if (firstArg === 'list') handleList(cfg);
  if (firstArg === 'doctor' || firstArg === 'check' || firstArg === 'setup') handleDoctor(cfg);
  if (firstArg === 'add-ask' || firstArg === 'ask' || firstArg === 'add') handleAddRuleCli('ask', args.slice(1), cfg, configSource);
  if (firstArg === 'add-skip' || firstArg === 'skip') handleAddRuleCli('skip', args.slice(1), cfg, configSource);
  if (firstArg === 'rm-ask' || firstArg === 'remove-ask') handleRemoveRuleCli('ask', args.slice(1), cfg, configSource);
  if (firstArg === 'rm-skip' || firstArg === 'remove-skip') handleRemoveRuleCli('skip', args.slice(1), cfg, configSource);
  if (firstArg === 'rm' || firstArg === 'remove') handleRemoveRuleCli('all', args.slice(1), cfg, configSource);

  if (shouldSave) {
    const saveTarget = configSource !== 'default' ? configSource : path.join(process.cwd(), '.auto-accept.json');
    try {
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
      fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
  }
}

// ── Injected Scanner Script ──
function buildScannerScript(cfg) {
  const ask = JSON.stringify(cfg.askKeywords.map(k => k.toLowerCase()));
  const skip = JSON.stringify(cfg.skipKeywords.map(k => k.toLowerCase()));
  const mode = JSON.stringify(cfg.mode);
  const alwaysAllow = JSON.stringify(cfg.autoSelectAlwaysAllow);

  return `(() => {
    const askKeywords = ${ask};
    const skipKeywords = ${skip};
    const mode = ${mode};
    const autoSelectAlwaysAllow = ${alwaysAllow};

    const checkKeywords = (text) => {
      for (const kw of skipKeywords) {
        if (kw && text.includes(kw)) return { blocked: true, type: 'skip', kw: kw };
      }
      for (const kw of askKeywords) {
        if (kw && text.includes(kw)) return { blocked: true, type: 'ask', kw: kw };
      }
      return null;
    };

    // Helper to extract full card context without stopping at button outline-none wrappers
    const extractContextText = (btn) => {
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
      return (document.body.innerText || '').toLowerCase();
    };

    // ── Tier 1: Antigravity interaction continue button ──
    const continueBtn = document.querySelector('[data-testid="interaction-continue-button"]');
    if (continueBtn) {
      const rect = continueBtn.getBoundingClientRect();
      const style = window.getComputedStyle(continueBtn);
      if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
        const content = extractContextText(continueBtn);
        const match = checkKeywords(content);
        if (match) {
          const reason = match.type === 'skip' ? 'Directly Skipped: "' + match.kw + '"' : 'Awaiting Permission: "' + match.kw + '"';
          return {
            action: (continueBtn.innerText || 'Submit').trim().replace(/\s+/g, ' '),
            blocked: true,
            blockedType: match.type,
            matchedKeyword: match.kw,
            blockedReason: reason,
            context: content.substring(0, 120)
          };
        }
        if (autoSelectAlwaysAllow) {
          try {
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', keyCode: 50, which: 50, bubbles: true, cancelable: true }));
            const opt2 = document.querySelector('input[type="radio"][value="2"]');
            if (opt2 && !opt2.checked) { opt2.checked = true; opt2.click(); opt2.dispatchEvent(new Event('change', { bubbles: true })); }
          } catch(e) {}
        } else {
          try {
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', keyCode: 49, which: 49, bubbles: true, cancelable: true }));
            const opt1 = document.querySelector('input[type="radio"][value="1"]');
            if (opt1 && !opt1.checked) { opt1.checked = true; opt1.click(); opt1.dispatchEvent(new Event('change', { bubbles: true })); }
          } catch(e) {}
        }
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        const rk = Object.keys(continueBtn).find(k => k.startsWith('__reactProps$'));
        if (rk && continueBtn[rk] && typeof continueBtn[rk].onClick === 'function') {
          try { continueBtn[rk].onClick({ preventDefault: () => {}, stopPropagation: () => {} }); } catch(e) {}
        }
        continueBtn.click();
        continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return { action: (continueBtn.innerText || 'Submit').trim().replace(/\s+/g, ' '), blocked: false, context: content.substring(0, 100) };
      }
    }

    // ── Tier 2: Autopilot mode Proceed button ──
    if (mode === 'autopilot') {
      const pbs = Array.from(document.querySelectorAll('button, a[role="button"]'));
      for (const pb of pbs) {
        const pt = (pb.innerText || pb.textContent || '').trim().toLowerCase();
        if (pt === 'proceed' || pt.includes('proceed with')) {
          const pr = pb.getBoundingClientRect();
          if (pr.width > 5 && pr.height > 5 && window.getComputedStyle(pb).display !== 'none' && window.getComputedStyle(pb).visibility !== 'hidden') {
            const fullContent = extractContextText(pb);
            const match = checkKeywords(fullContent);
            if (match) {
              const reason = match.type === 'skip' ? 'Directly Skipped: "' + match.kw + '"' : 'Awaiting Permission: "' + match.kw + '"';
              return { action: 'Proceed (Plan)', blocked: true, blockedType: match.type, matchedKeyword: match.kw, blockedReason: reason, context: fullContent.substring(0, 150) };
            }
            const rk = Object.keys(pb).find(k => k.startsWith('__reactProps$'));
            if (rk && pb[rk] && typeof pb[rk].onClick === 'function') {
              try { pb[rk].onClick({ preventDefault: () => {}, stopPropagation: () => {} }); } catch(e) {}
            }
            pb.click();
            pb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return { action: 'Proceed (Plan Auto-Approved)', blocked: false, context: 'Plan Approved in Autopilot Mode' };
          }
        }
      }
    }

    // ── Tier 3: Generic confirmation fallback ──
    const candidates = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"]'));
    for (const btn of candidates) {
      const raw = (btn.innerText || btn.textContent || '').trim();
      const text = raw.replace(/\\s+/g, ' ').replace(/[\u21b5\u23ce\u21a9\u2022\u00b7]/gu, '').trim().toLowerCase();
      const TOOL_BTNS = ['submit','always allow','run','run command','allow this time','allow','proceed anyway','continue','accept'];
      const PLAN_BTNS = ['proceed','confirm','yes','ok','accept','approve','got it','start','execute'];
      const allowed = TOOL_BTNS.includes(text) || (mode === 'autopilot' && PLAN_BTNS.includes(text));
      if (allowed) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 5 && rect.height > 5 && window.getComputedStyle(btn).visibility !== 'hidden' && window.getComputedStyle(btn).display !== 'none') {
          const fullContent = extractContextText(btn);
          const match = checkKeywords(fullContent);
          if (match) {
            const reason = match.type === 'skip' ? 'Directly Skipped: "' + match.kw + '"' : 'Awaiting Permission: "' + match.kw + '"';
            return { action: raw, blocked: true, blockedType: match.type, matchedKeyword: match.kw, blockedReason: reason, context: fullContent.substring(0, 150) };
          }
          const rk = Object.keys(btn).find(k => k.startsWith('__reactProps$'));
          if (rk && btn[rk] && typeof btn[rk].onClick === 'function') {
            try { btn[rk].onClick({ preventDefault: () => {}, stopPropagation: () => {} }); } catch(e) {}
          }
          btn.click();
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
          return { action: raw, blocked: false, context: fullContent.substring(0, 100) };
        }
      }
    }

    return null;
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
      batch.push((async (port) => {
        const targets = await fetchTargets(port);
        return targets ? { port, targets } : null;
      })(p));
    }
    const results = await Promise.all(batch);
    const found = results.find(r => r !== null);
    if (found) return found;
  }
  return null;
}

async function findCdpEndpoint(preferredPort) {
  if (preferredPort > 0) {
    const targets = await fetchTargets(preferredPort);
    if (targets && targets.length > 0) return { port: preferredPort, targets };
  }

  const commonPorts = [9333, 9222, 9229, 9300];
  for (const p of commonPorts) {
    if (p === preferredPort) continue;
    const targets = await fetchTargets(p);
    if (targets && targets.length > 0) return { port: p, targets };
  }

  return await scanPortRange(9000, 9400);
}

function selectWorkbenchTarget(targets) {
  if (!targets || !targets.length) return null;
  const page = targets.find(t =>
    t.type === 'page' &&
    t.webSocketDebuggerUrl &&
    (t.url.includes('workbench') || t.title.toLowerCase().includes('antigravity'))
  );
  if (page) return page;

  return targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || null;
}

// ── Ultra-Modern Terminal Daemon ──
class AutoSubmitDaemon {
  constructor(config, configSource) {
    this.config = config;
    this.configSource = configSource;
    this.stats = new StatsManager();
    this.ws = null;
    this.pollTimer = null;
    this.isScanning = false;
    this.isConnected = false;
    this.activePort = config.cdpPort || 9333;
    this.targetTitle = '';
    this.reqId = 1;
    this.lastReportedBlock = '';
    this.isPrompting = false;
    this.isInteractive = process.stdout.isTTY && !this.config.daemon;
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

    const portStr = this.isConnected
      ? `${C.brightGreen}http://127.0.0.1:${this.activePort} (Connected)${C.reset}`
      : `${C.yellow}Searching ports 9000..9400...${C.reset}`;

    console.log(`
  ${C.bold}${C.brightCyan}⚡ ANTIGRAVITY AUTO-SUBMITTER${C.reset} ${C.gray}v${PKG_VERSION}${C.reset}
  ${C.dim}Autonomous confirmation engine for Google Antigravity IDE${C.reset}

  ${C.dim}╭─────────────────────────────────────────────────────────────╮${C.reset}
  ${C.dim}│${C.reset}  ${C.bold}Status:${C.reset}    ${statusPill}   ${C.bold}Mode:${C.reset} ${modePill}
  ${C.dim}│${C.reset}  ${C.bold}CDP Port:${C.reset}  ${portStr}
  ${C.dim}│${C.reset}  ${C.bold}Approvals:${C.reset} ${C.bold}${C.white}${this.stats.lifetimeClicks}${C.reset} lifetime (${this.stats.sessionApprovals} session)   ${C.bold}Blocks:${C.reset} ${this.stats.sessionBlocks}
  ${C.dim}│${C.reset}  ${C.bold}Guard:${C.reset}     ${C.yellow}${this.config.askKeywords.length} Ask rules${C.reset}  ${C.gray}|${C.reset}  ${C.magenta}${this.config.skipKeywords.length} Skip rules${C.reset}
  ${C.dim}╰─────────────────────────────────────────────────────────────╯${C.reset}
  ${C.dim}Hotkeys:${C.reset}
    ${C.yellow}p${C.reset} Pause/Resume  •  ${C.yellow}m${C.reset} Mode  •  ${C.yellow}a${C.reset} Add Rule  •  ${C.yellow}r${C.reset} Remove Rule
    ${C.yellow}s${C.reset} Live Stats    •  ${C.yellow}c${C.reset} Config •  ${C.yellow}h${C.reset} Help (?)  •  ${C.yellow}q${C.reset} Quit
`);
  }

  async start() {
    this.printBanner();
    this.setupSignalHandlers();
    if (this.isInteractive) this.setupInstantHotkeys();
    await this.connectLoop();
  }

  async connectLoop() {
    while (true) {
      if (!this.isConnected) {
        const endpoint = await findCdpEndpoint(this.config.cdpPort);
        if (endpoint) {
          const target = selectWorkbenchTarget(endpoint.targets);
          if (target) {
            this.activePort = endpoint.port;
            this.targetTitle = cleanStr(target.title || 'Antigravity IDE', 50);
            await this.openWebSocket(target.webSocketDebuggerUrl);
          }
        }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  async openWebSocket(url) {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      return;
    }

    this.ws.onopen = () => {
      this.isConnected = true;
      this.logEvent('info', ` READY `, `Connected to Antigravity IDE (Port ${this.activePort})`, `Target: "${this.targetTitle}"`, C.pillGreen);
      this.startScanner();
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === this.reqId - 1 && msg.result && msg.result.result) {
          this.handleScanResult(msg.result.result.value);
        }
      } catch (e) {}
    };

    this.ws.onerror = () => {
      this.cleanupConnection();
    };

    this.ws.onclose = () => {
      this.cleanupConnection();
    };
  }

  cleanupConnection() {
    this.stopScanner();
    if (this.isConnected) {
      this.logEvent('warn', ` DISCON `, `Antigravity IDE disconnected. Reconnecting...`, '', C.pillYellow);
    }
    this.isConnected = false;
    this.ws = null;
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
    this.isScanning = false;
  }

  scanTick() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.config.enabled || this.isScanning) return;

    this.isScanning = true;
    const script = buildScannerScript(this.config);
    const id = this.reqId++;

    this.ws.send(JSON.stringify({
      id: id,
      method: 'Runtime.evaluate',
      params: {
        expression: script,
        returnByValue: true
      }
    }));
  }

  handleScanResult(outcome) {
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
        this.stats.recordBlock();
        if (outcome.blockedType === 'ask') {
          try { process.stdout.write('\x07'); } catch(e) {}
        this.logEvent('warn', ` PAUSED `, actionClean, `Command contains: "${outcome.matchedKeyword}" (Awaiting your manual click in chat)`, C.pillYellow);
        } else {
          this.logEvent('warn', ` SKIPPED `, actionClean, `Command contains: "${outcome.matchedKeyword}" (Direct Skip Guard)`, C.pillMagenta);
        }
      }
    } else {
      this.lastReportedBlock = '';
      this.stats.recordApproval(outcome.action);
      this.logEvent('info', ` APPROVE `, actionClean, `Lifetime: ${this.stats.lifetimeClicks} (+${this.stats.sessionApprovals} session) | ${contextClean}`, C.pillGreen);
    }
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
      if (!key) return;

      // Ctrl+C or q
      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        this.shutdown();
        return;
      }

      switch (key.name) {
        case 'p':
          this.config.enabled = !this.config.enabled;
          this.logEvent('info', ` TOGGLE `, `Auto-submit is now ${this.config.enabled ? 'ACTIVE' : 'PAUSED'}`, '', this.config.enabled ? C.pillGreen : C.pillYellow);
          break;

        case 'm':
          this.config.mode = this.config.mode === 'autonomous' ? 'autopilot' : 'autonomous';
          this.logEvent('info', ` MODE `, `Switched to: ${this.config.mode.toUpperCase()}`, '', C.pillCyan);
          break;

        case 'a':
          this.promptAddRule();
          break;

        case 'r':
          this.promptRemoveRule();
          break;

        case 's':
          console.log(`
  ${C.bold}--- Live Statistics ---${C.reset}
  Connection:         ${this.isConnected ? `${C.green}Connected (Port ${this.activePort})${C.reset}` : `${C.yellow}Disconnected${C.reset}`}
  Target Window:      ${this.targetTitle || 'N/A'}
  Session Approvals:  ${C.bold}${this.stats.sessionApprovals}${C.reset}
  Lifetime Approvals: ${C.bold}${this.stats.lifetimeClicks}${C.reset}
  Intercepted Blocks: ${C.bold}${this.stats.sessionBlocks}${C.reset}
  Last Action:        ${this.stats.lastAction || 'None'} (${this.stats.lastClicked || 'N/A'})
`);
          break;

        case 'c':
          console.log(`
  ${C.bold}--- Active Configuration ---${C.reset}
  Source:         ${this.configSource}
  Mode:           ${this.config.mode}
  Click Delay:    ${this.config.safetyDelayMs}ms
  Poll Interval:  ${this.config.pollIntervalMs}ms
  Ask List:       ${this.config.askKeywords.join(', ')}
  Skip List:      ${this.config.skipKeywords.join(', ')}
`);
          break;

        case 'h':
        case '?':
          console.log(`
  ${C.bold}${C.brightCyan}--- Hotkey Reference & Controls ---${C.reset}
  ${C.bold}Key${C.reset}     ${C.bold}Action${C.reset}           ${C.bold}Description${C.reset}
  ${C.yellow}p${C.reset}       Pause / Resume   Instantly toggles auto-approvals on or off
  ${C.yellow}m${C.reset}       Toggle Mode      Cycles between Autonomous (reviews plans) and Autopilot (100% hands-free)
  ${C.yellow}a${C.reset}       Add Rule         Interactively add a keyword rule to Ask or Skip list without restarting
  ${C.yellow}r${C.reset}       Remove Rule      Interactively remove a keyword rule from Ask or Skip list
  ${C.yellow}s${C.reset}       Live Stats       Displays live session approvals, lifetime approvals, blocks, and target window
  ${C.yellow}c${C.reset}       Show Config      Prints active configuration source, ports, and guardrail lists
  ${C.yellow}h${C.reset} / ${C.yellow}?${C.reset}   Help Reference   Displays this hotkey guide
  ${C.yellow}q${C.reset}       Quit             Cleanly disconnects from Antigravity and exits (or Ctrl+C)
`);
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
    } catch (e) {}
  }

  promptAddRule() {
    if (!process.stdin.isTTY || this.isPrompting) return;
    this.isPrompting = true;
    try { process.stdin.setRawMode(false); } catch(e) {}
    this.stopScanner();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const finish = () => {
      rl.close();
      this.isPrompting = false;
      if (process.stdin.isTTY) {
        try { process.stdin.setRawMode(true); } catch(e) {}
      }
      this.startScanner();
    };

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
    const finish = () => {
      rl.close();
      this.isPrompting = false;
      if (process.stdin.isTTY) {
        try { process.stdin.setRawMode(true); } catch(e) {}
      }
      this.startScanner();
    };

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
    this.stopScanner();
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false); } catch (e) {}
    }
    process.exit(0);
  }
}

// ── Main Entry ──
if (require.main === module) {
  const { config, configSource } = resolveConfig();

  // JSON Status Check
  if (process.argv.includes('status') || process.argv.includes('--status')) {
    (async () => {
      const endpoint = await findCdpEndpoint(config.cdpPort);
      const stats = new StatsManager();
      const output = {
        connected: !!endpoint,
        port: endpoint ? endpoint.port : null,
        targetTitle: endpoint ? selectWorkbenchTarget(endpoint.targets)?.title || null : null,
        mode: config.mode,
        enabled: config.enabled,
        sessionApprovals: 0,
        lifetimeApprovals: stats.lifetimeClicks,
        lastClicked: stats.lastClicked
      };
      console.log(JSON.stringify(output, null, 2));
      process.exit(endpoint ? 0 : 1);
    })();
  } else {
    const daemon = new AutoSubmitDaemon(config, configSource);
    daemon.start().catch((err) => {
      console.error(`${C.red}Fatal daemon error:${C.reset}`, err);
      process.exit(1);
    });
  }
}

module.exports = {
  AutoSubmitDaemon,
  StatsManager,
  buildScannerScript,
  findCdpEndpoint,
  selectWorkbenchTarget,
  cleanStr,
  DEFAULTS,
  handleAddRuleCli,
  handleRemoveRuleCli,
  getSaveTarget
};
