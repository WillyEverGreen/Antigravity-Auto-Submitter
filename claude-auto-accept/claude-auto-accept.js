#!/usr/bin/env node
/**
 * Claude Auto-Accept CLI & Native PreToolUse Hook Engine
 *
 * Auto-approves safe tool permissions in Claude Code CLI via native PreToolUse hooks.
 * Preserves strict keyword guardrails (askKeywords / skipKeywords) and file protection.
 *
 * Features:
 * - Native PreToolUse hook for Claude Code (no background daemon required)
 * - Safe autonomous & 100% hands-free autopilot modes
 * - Keyword guardrails (pauses for "git push", blocks "rm -rf")
 * - Protected file shield (.env, .git/, credentials)
 * - 1-Click setup & uninstall for local and global .claude/settings.json
 * - Atomic stats persistence and interactive CLI management
 *
 * Author: WillyEverGreen / advdi
 * License: MIT
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ── Package Metadata ──
const PKG_VERSION = '1.0.0';

// ── Paths ──
const GLOBAL_DIR = path.join(os.homedir(), '.claude-auto-accept');
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_DIR, 'config.json');
const GLOBAL_STATS_FILE = path.join(GLOBAL_DIR, 'stats.json');
const LOCAL_CONFIG_FILES = ['.claude-auto-accept.json', 'claude-auto-accept.config.json'];

// ── Default Safety Profile ──
const DEFAULTS = {
  enabled: true,
  mode: 'autonomous', // 'autonomous' | 'autopilot'
  askKeywords: [
    'git push',
    'git reset --hard',
    'sudo',
    'npm publish',
    'terraform apply',
    'deploy'
  ],
  skipKeywords: [
    'rm -rf',
    'drop table',
    'git push --force',
    'format c:',
    'del /f /s /q c:',
    'kubectl delete'
  ],
  protectedFiles: [
    '.env',
    '.env.*',
    '*.key',
    '*.pem',
    'id_rsa*',
    '.git/*'
  ],
  autoApproveReadOnly: true,
  autoApproveEdits: true
};

// ── ANSI Styling & Badges ──
const isTty = process.stdout.isTTY && !process.env.NO_COLOR;
const C = {
  reset:        isTty ? '\x1b[0m' : '',
  bold:         isTty ? '\x1b[1m' : '',
  dim:          isTty ? '\x1b[2m' : '',
  cyan:         isTty ? '\x1b[36m' : '',
  brightCyan:   isTty ? '\x1b[96m' : '',
  green:        isTty ? '\x1b[32m' : '',
  brightGreen:  isTty ? '\x1b[92m' : '',
  yellow:       isTty ? '\x1b[33m' : '',
  brightYellow: isTty ? '\x1b[93m' : '',
  red:          isTty ? '\x1b[31m' : '',
  magenta:      isTty ? '\x1b[35m' : '',
  gray:         isTty ? '\x1b[90m' : '',
  pillGreen:    isTty ? '\x1b[1m\x1b[42m\x1b[30m' : '',
  pillYellow:   isTty ? '\x1b[1m\x1b[43m\x1b[30m' : '',
  pillCyan:     isTty ? '\x1b[1m\x1b[46m\x1b[30m' : '',
  pillMagenta:  isTty ? '\x1b[1m\x1b[45m\x1b[30m' : '',
  pillRed:      isTty ? '\x1b[1m\x1b[41m\x1b[37m' : ''
};

// ── Config Resolution ──
function resolveConfig(customCwd = null) {
  const searchDir = customCwd || process.cwd();

  // 1. Check local directory
  for (const filename of LOCAL_CONFIG_FILES) {
    const localPath = path.join(searchDir, filename);
    if (fs.existsSync(localPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(localPath, 'utf8'));
        return { config: { ...DEFAULTS, ...parsed }, source: localPath };
      } catch (e) {}
    }
  }

  // 2. Check global config (~/.claude-auto-accept/config.json)
  if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8'));
      return { config: { ...DEFAULTS, ...parsed }, source: GLOBAL_CONFIG_FILE };
    } catch (e) {}
  }

  return { config: { ...DEFAULTS }, source: 'default' };
}

// ── Stats Persistence ──
class ClaudeStatsManager {
  constructor() {
    this.lifetimeApprovals = 0;
    this.lifetimeBlocks = 0;
    this.lastAction = '';
    this.lastTimestamp = '';
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(GLOBAL_STATS_FILE)) {
        const data = JSON.parse(fs.readFileSync(GLOBAL_STATS_FILE, 'utf8'));
        this.lifetimeApprovals = data.lifetimeApprovals || 0;
        this.lifetimeBlocks = data.lifetimeBlocks || 0;
        this.lastAction = data.lastAction || '';
        this.lastTimestamp = data.lastTimestamp || '';
      }
    } catch (e) {}
  }

  recordDecision(decision, toolName, summary) {
    if (decision === 'allow') {
      this.lifetimeApprovals++;
    } else if (decision === 'deny') {
      this.lifetimeBlocks++;
    }
    this.lastAction = `${decision.toUpperCase()}: [${toolName}] ${summary}`.slice(0, 100);
    this.lastTimestamp = new Date().toISOString();
    this.save();
  }

  save() {
    try {
      if (!fs.existsSync(GLOBAL_DIR)) {
        fs.mkdirSync(GLOBAL_DIR, { recursive: true });
      }
      const tmpPath = `${GLOBAL_STATS_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify({
        lifetimeApprovals: this.lifetimeApprovals,
        lifetimeBlocks: this.lifetimeBlocks,
        lastAction: this.lastAction,
        lastTimestamp: this.lastTimestamp
      }, null, 2), 'utf8');
      fs.renameSync(tmpPath, GLOBAL_STATS_FILE);
    } catch (e) {}
  }
}

// ── Glob-Style Pattern Matcher ──
function matchPattern(filePath, pattern) {
  if (!filePath || !pattern) return false;
  const normPath = filePath.replace(/\\/g, '/');
  const baseName = path.basename(normPath);

  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1);
    return baseName.endsWith(ext) || normPath.endsWith(ext);
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return baseName.startsWith(prefix) || normPath.includes(prefix);
  }
  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(baseName) || new RegExp(escaped, 'i').test(normPath);
  }
  return baseName === pattern || normPath.includes(pattern);
}

// ── Decision Evaluator Core ──
function evaluateDecision(payload, config = DEFAULTS) {
  if (!payload || typeof payload !== 'object') {
    return {
      decision: 'ask',
      reason: 'Empty or invalid hook payload received.'
    };
  }

  if (config.enabled === false) {
    return {
      decision: 'ask',
      reason: 'Auto-accept is paused in configuration.'
    };
  }

  const toolName = payload.tool_name || payload.tool || '';
  const toolInput = payload.tool_input || payload.parameters || {};
  const mode = (config.mode || 'autonomous').toLowerCase();

  // 1. Shell Execution (Bash / PowerShell)
  if (toolName === 'Bash' || toolName === 'PowerShell') {
    const command = String(toolInput.command || '').trim();
    const lowerCmd = command.toLowerCase();

    // Check Skip/Deny Keywords first (highest priority)
    for (const kw of (config.skipKeywords || [])) {
      if (kw && lowerCmd.includes(kw.toLowerCase())) {
        return {
          decision: 'deny',
          reason: `Blocked: Command contains forbidden keyword "${kw}"`
        };
      }
    }

    // Check Ask Keywords
    for (const kw of (config.askKeywords || [])) {
      if (kw && lowerCmd.includes(kw.toLowerCase())) {
        return {
          decision: 'ask',
          reason: `Paused for review: Command contains sensitive keyword "${kw}"`
        };
      }
    }

    // Safe command
    return {
      decision: 'allow',
      reason: `Auto-approved safe ${toolName} execution: ${command.slice(0, 60)}`
    };
  }

  // 2. File Writes / Edits (Write / Edit)
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = String(toolInput.file_path || '').trim();
    const normPath = filePath.replace(/\\/g, '/');

    // Protect sensitive files (.env, credentials, .git)
    for (const pattern of (config.protectedFiles || [])) {
      if (pattern && matchPattern(normPath, pattern)) {
        return {
          decision: 'ask',
          reason: `Paused for review: Modifying protected file matching "${pattern}"`
        };
      }
    }

    if (config.autoApproveEdits !== false) {
      return {
        decision: 'allow',
        reason: `Auto-approved file modification: ${path.basename(filePath)}`
      };
    }

    return {
      decision: 'ask',
      reason: `File modification requires confirmation in configuration.`
    };
  }

  // 3. Read-Only Tools (Read, Glob, Grep, etc.)
  const readOnlyTools = ['Read', 'Glob', 'Grep', 'NotebookEdit', 'ListAgents', 'ListMcpResourcesTool', 'ReadMcpResourceTool', 'ReadMcpResourceDirTool'];
  if (readOnlyTools.includes(toolName) || toolName.startsWith('Read') || toolName.startsWith('List') || toolName.startsWith('Get')) {
    if (config.autoApproveReadOnly !== false) {
      return {
        decision: 'allow',
        reason: `Auto-approved read-only tool: ${toolName}`
      };
    }
  }

  // 4. Autopilot Mode covers all other tool operations
  if (mode === 'autopilot') {
    return {
      decision: 'allow',
      reason: `Autopilot mode: Auto-approved ${toolName}`
    };
  }

  // Default: Allow standard tools in autonomous mode
  return {
    decision: 'allow',
    reason: `Auto-approved tool: ${toolName}`
  };
}

// ── Hook Handler (stdin JSON -> stdout JSON) ──
function handleHookExecution() {
  let input = '';
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (chunk) => {
    input += chunk;
  });

  process.stdin.on('end', () => {
    let payload = null;
    try {
      if (input && input.trim()) {
        payload = JSON.parse(input.trim());
      }
    } catch (e) {
      // Non-JSON input
    }

    const customCwd = (payload && payload.cwd) ? payload.cwd : null;
    const { config } = resolveConfig(customCwd);
    const { decision, reason } = evaluateDecision(payload, config);

    // Record stats
    try {
      const stats = new ClaudeStatsManager();
      const tool = (payload && (payload.tool_name || payload.tool)) || 'Unknown';
      const summary = reason || '';
      stats.recordDecision(decision, tool, summary);
    } catch (e) {}

    const response = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: reason
      }
    };

    process.stdout.write(JSON.stringify(response) + '\n');
    process.exit(0);
  });
}

// ── Settings File Hook Manager ──
function getSettingsPath(isGlobal = false) {
  if (isGlobal) {
    return path.join(os.homedir(), '.claude', 'settings.json');
  }
  return path.join(process.cwd(), '.claude', 'settings.json');
}

function installHookInSettings(isGlobal = false) {
  const settingsPath = getSettingsPath(isGlobal);
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      settings = {};
    }
  }

  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.PreToolUse)) {
    settings.hooks.PreToolUse = [];
  }

  const hookCommand = `node "${path.resolve(__filename)}" --hook`;

  // Check if our hook already exists
  let existingGroup = settings.hooks.PreToolUse.find(g => {
    return g && Array.isArray(g.hooks) && g.hooks.some(h => h.command && h.command.includes('claude-auto-accept'));
  });

  const hookEntry = {
    type: 'command',
    command: hookCommand,
    timeout: 30,
    statusMessage: 'Checking auto-approval rules...',
    onFailure: 'continue'
  };

  if (existingGroup) {
    // Update command in existing group
    existingGroup.hooks = existingGroup.hooks.filter(h => !h.command || !h.command.includes('claude-auto-accept'));
    existingGroup.hooks.push(hookEntry);
  } else {
    // Add new group matching all tools
    settings.hooks.PreToolUse.push({
      matcher: '.*',
      hooks: [hookEntry]
    });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return settingsPath;
}

function uninstallHookFromSettings(isGlobal = false) {
  const settingsPath = getSettingsPath(isGlobal);
  if (!fs.existsSync(settingsPath)) return false;

  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    return false;
  }

  if (!settings.hooks || !Array.isArray(settings.hooks.PreToolUse)) {
    return false;
  }

  let removed = false;
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(group => {
    if (!group || !Array.isArray(group.hooks)) return true;
    const beforeLen = group.hooks.length;
    group.hooks = group.hooks.filter(h => !h.command || !h.command.includes('claude-auto-accept'));
    if (group.hooks.length !== beforeLen) removed = true;
    return group.hooks.length > 0;
  });

  if (settings.hooks.PreToolUse.length === 0) {
    delete settings.hooks.PreToolUse;
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks.PreToolUse;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return removed;
}

function isHookInstalled(isGlobal = false) {
  const settingsPath = getSettingsPath(isGlobal);
  if (!fs.existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.hooks && Array.isArray(settings.hooks.PreToolUse)) {
      return settings.hooks.PreToolUse.some(group =>
        group && Array.isArray(group.hooks) && group.hooks.some(h => h.command && h.command.includes('claude-auto-accept'))
      );
    }
  } catch (e) {}
  return false;
}

// ── CLI Handlers ──
function printBanner() {
  console.log(`
  ${C.bold}${C.brightCyan}Claude Auto-Accept CLI${C.reset} ${C.dim}v${PKG_VERSION}${C.reset}
  ${C.dim}Native PreToolUse Hook Engine for Claude Code${C.reset}
`);
}

function handleSetup(args) {
  printBanner();
  const isGlobal = args.includes('--global') || args.includes('-g');
  const targetPath = installHookInSettings(isGlobal);

  console.log(`  ${C.pillGreen} INSTALLED ${C.reset}  ${C.bold}PreToolUse hook registered successfully!${C.reset}`);
  console.log(`  ${C.gray}Settings file:${C.reset}  ${C.cyan}${targetPath}${C.reset}`);
  console.log(`  ${C.gray}Scope:${C.reset}          ${isGlobal ? 'Global (~/.claude/settings.json)' : 'Project (.claude/settings.json)'}\n`);
  console.log(`  Claude Code will now automatically evaluate tool approvals against your guardrails.`);
  console.log(`  Run ${C.yellow}claude-auto-accept status${C.reset} to verify anytime.\n`);
}

function handleUninstall(args) {
  printBanner();
  const isGlobal = args.includes('--global') || args.includes('-g');
  const removed = uninstallHookFromSettings(isGlobal);
  const targetPath = getSettingsPath(isGlobal);

  if (removed) {
    console.log(`  ${C.pillYellow} REMOVED ${C.reset}  ${C.bold}PreToolUse hook uninstalled.${C.reset}`);
    console.log(`  ${C.gray}Settings file:${C.reset}  ${C.cyan}${targetPath}${C.reset}\n`);
  } else {
    console.log(`  ${C.yellow}No claude-auto-accept hook found in ${targetPath}.${C.reset}\n`);
  }
}

function handleStatus() {
  printBanner();
  const { config, source } = resolveConfig();
  const localInstalled = isHookInstalled(false);
  const globalInstalled = isHookInstalled(true);
  const stats = new ClaudeStatsManager();

  console.log(`  ${C.bold}--- Installation Status ---${C.reset}`);
  console.log(`  Project Hook (.claude/settings.json): ${localInstalled ? C.green + '✓ Active' : C.dim + 'Not installed'}${C.reset}`);
  console.log(`  Global Hook  (~/.claude/settings.json): ${globalInstalled ? C.green + '✓ Active' : C.dim + 'Not installed'}${C.reset}`);

  console.log(`\n  ${C.bold}--- Active Configuration ---${C.reset}`);
  console.log(`  Config Source:     ${C.cyan}${source}${C.reset}`);
  console.log(`  Operating Mode:    ${config.mode === 'autopilot' ? C.pillMagenta + ' AUTOPILOT ' : C.pillCyan + ' AUTONOMOUS '}${C.reset}`);
  console.log(`  Status:            ${config.enabled ? C.green + 'Active' : C.yellow + 'Paused'}${C.reset}`);
  console.log(`  Ask Keywords:      ${C.yellow}${config.askKeywords.join(', ')}${C.reset}`);
  console.log(`  Skip Keywords:     ${C.red}${config.skipKeywords.join(', ')}${C.reset}`);
  console.log(`  Protected Files:   ${C.gray}${config.protectedFiles.join(', ')}${C.reset}`);

  console.log(`\n  ${C.bold}--- Approval Statistics ---${C.reset}`);
  console.log(`  Lifetime Approvals: ${C.brightGreen}${stats.lifetimeApprovals}${C.reset}`);
  console.log(`  Lifetime Blocks:    ${C.red}${stats.lifetimeBlocks}${C.reset}`);
  if (stats.lastAction) {
    console.log(`  Last Action:        ${C.dim}${stats.lastAction}${C.reset}`);
  }
  console.log('');
}

function handleInit() {
  const target = path.join(process.cwd(), '.claude-auto-accept.json');
  if (fs.existsSync(target)) {
    console.log(`  ${C.yellow}Configuration file already exists: ${target}${C.reset}`);
    return;
  }
  fs.writeFileSync(target, JSON.stringify(DEFAULTS, null, 2), 'utf8');
  console.log(`  ${C.green}✔ Created .claude-auto-accept.json with default safety rules.${C.reset}`);
}

function handleDoctor() {
  printBanner();
  console.log(`  ${C.bold}--- System Diagnostics ---${C.reset}`);
  console.log(`  Node.js Version:   ${process.version} ${process.version.startsWith('v18') || process.version.startsWith('v20') || process.version.startsWith('v22') || process.version.startsWith('v24') ? C.green + '✓' : C.yellow + '⚠️'}${C.reset}`);
  console.log(`  Platform:          ${process.platform} (${process.arch})`);
  console.log(`  Local Settings:    ${fs.existsSync(getSettingsPath(false)) ? C.green + 'Found' : C.dim + 'None'}${C.reset}`);
  console.log(`  Global Settings:   ${fs.existsSync(getSettingsPath(true)) ? C.green + 'Found' : C.dim + 'None'}${C.reset}`);

  // Test evaluation
  const safeTest = evaluateDecision({ tool_name: 'Bash', tool_input: { command: 'git status' } });
  const blockTest = evaluateDecision({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } });
  const askTest = evaluateDecision({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } });

  console.log(`\n  ${C.bold}--- Rule Engine Verification ---${C.reset}`);
  console.log(`  Safe Command (git status):       ${safeTest.decision === 'allow' ? C.green + '✓ ALLOW' : C.red + '✗ FAIL'}${C.reset}`);
  console.log(`  Blocked Command (rm -rf):        ${blockTest.decision === 'deny' ? C.green + '✓ DENY' : C.red + '✗ FAIL'}${C.reset}`);
  console.log(`  Sensitive Command (git push):    ${askTest.decision === 'ask' ? C.green + '✓ ASK' : C.red + '✗ FAIL'}${C.reset}`);
  console.log(`\n  All diagnostics completed cleanly.\n`);
}

function printHelp() {
  printBanner();
  console.log(`
  ${C.bold}USAGE:${C.reset}
    claude-auto-accept <command> [options]

  ${C.bold}COMMANDS:${C.reset}
    setup, install       Register PreToolUse hook in .claude/settings.json
    uninstall, remove    Remove hook from .claude/settings.json
    status               Display active rules, hook status, and stats
    doctor               Run diagnostic checks on rules and settings
    init                 Create .claude-auto-accept.json in current folder
    mode [mode]          Get or set mode (autonomous | autopilot)
    add-ask <pattern>    Add sensitive keyword requiring manual confirmation
    add-skip <pattern>   Add forbidden keyword that is immediately denied
    rm <pattern>         Remove keyword from rules
    test                 Run rule evaluator simulation

  ${C.bold}OPTIONS:${C.reset}
    -g, --global         Apply setup / uninstall to ~/.claude/settings.json
    --hook               Run in headless hook mode (called by Claude Code)
    -h, --help           Show help
    -v, --version        Show version
`);
}

// ── Main Entrypoint ──
function main() {
  const args = process.argv.slice(2);
  const isHookMode = args.includes('--hook') || (!process.stdin.isTTY && !args.some(a => ['setup', 'install', 'uninstall', 'status', 'doctor', 'init', 'mode', 'test', 'help', '-h', '--help', '-v', '--version'].includes(a)));

  if (isHookMode) {
    handleHookExecution();
    return;
  }

  const cmd = (args[0] || '').toLowerCase();

  switch (cmd) {
    case 'setup':
    case 'install':
      handleSetup(args);
      break;

    case 'uninstall':
    case 'remove':
      handleUninstall(args);
      break;

    case 'status':
      handleStatus();
      break;

    case 'init':
      handleInit();
      break;

    case 'doctor':
      handleDoctor();
      break;

    case 'mode':
      if (args[1]) {
        const newMode = args[1].toLowerCase();
        if (newMode === 'autopilot' || newMode === 'autonomous') {
          const target = path.join(process.cwd(), '.claude-auto-accept.json');
          const { config } = resolveConfig();
          config.mode = newMode;
          fs.writeFileSync(target, JSON.stringify(config, null, 2), 'utf8');
          console.log(`  ${C.green}✔ Operating mode updated to: ${newMode}${C.reset}`);
        } else {
          console.log(`  ${C.red}Invalid mode. Use 'autonomous' or 'autopilot'.${C.reset}`);
        }
      } else {
        const { config } = resolveConfig();
        console.log(`  Active mode: ${C.cyan}${config.mode}${C.reset}`);
      }
      break;

    case 'add-ask':
      if (args[1]) {
        const { config } = resolveConfig();
        const kw = args.slice(1).join(' ').trim();
        if (!config.askKeywords.includes(kw)) {
          config.askKeywords.push(kw);
          fs.writeFileSync(path.join(process.cwd(), '.claude-auto-accept.json'), JSON.stringify(config, null, 2), 'utf8');
          console.log(`  ${C.green}✔ Added to ask keywords: "${kw}"${C.reset}`);
        }
      }
      break;

    case 'add-skip':
      if (args[1]) {
        const { config } = resolveConfig();
        const kw = args.slice(1).join(' ').trim();
        if (!config.skipKeywords.includes(kw)) {
          config.skipKeywords.push(kw);
          fs.writeFileSync(path.join(process.cwd(), '.claude-auto-accept.json'), JSON.stringify(config, null, 2), 'utf8');
          console.log(`  ${C.green}✔ Added to skip keywords: "${kw}"${C.reset}`);
        }
      }
      break;

    case 'rm':
      if (args[1]) {
        const { config } = resolveConfig();
        const kw = args.slice(1).join(' ').trim();
        config.askKeywords = config.askKeywords.filter(k => k !== kw);
        config.skipKeywords = config.skipKeywords.filter(k => k !== kw);
        fs.writeFileSync(path.join(process.cwd(), '.claude-auto-accept.json'), JSON.stringify(config, null, 2), 'utf8');
        console.log(`  ${C.green}✔ Removed keyword: "${kw}"${C.reset}`);
      }
      break;

    case 'test':
      handleDoctor();
      break;

    case '-v':
    case '--version':
      console.log(`claude-auto-accept v${PKG_VERSION}`);
      break;

    case '-h':
    case '--help':
    case 'help':
    default:
      printHelp();
      break;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULTS,
  resolveConfig,
  evaluateDecision,
  matchPattern,
  installHookInSettings,
  uninstallHookFromSettings,
  isHookInstalled,
  ClaudeStatsManager
};
