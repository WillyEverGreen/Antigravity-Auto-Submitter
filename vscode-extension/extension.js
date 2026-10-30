'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const SECTION = 'antigravityAutoSubmit';
const STATS_FILE = path.join(os.homedir(), '.antigravity-auto-submit', 'stats.json');
const LOG_CAP = 150;

let statusItem;
let output;
let child = null;
let extensionPath = '';
let statusView;
let statsView;
let actionsView;
let logView;
let pollTimer = null;
let daemonStatus = null;
let sessionApprovals = 0;
let sessionBlocks = 0;

function cfg() {
  return vscode.workspace.getConfiguration(SECTION);
}

const REPO_URL = 'https://github.com/WillyEverGreen/Antigravity-Auto-Submitter';
const NPM_INSTALL = 'npm install -g antigravity-auto-submit';

function daemonPath() {
  return path.join(extensionPath, 'daemon', 'auto-accept.js');
}

function nodeExe() {
  return cfg().get('nodePath') || 'node';
}

function useGlobal() {
  return cfg().get('daemonSource') === 'global';
}

function daemonCommand(extra = []) {
  if (useGlobal()) return { cmd: 'auto-accept', args: extra, shell: true };
  return { cmd: nodeExe(), args: [daemonPath(), ...extra], shell: false };
}

function buildArgs() {
  const c = cfg();
  const args = ['--daemon', '--mode', c.get('mode') || 'autonomous'];
  const port = c.get('cdpPort');
  if (port > 0) args.push('--port', String(port));
  const ask = c.get('askKeywords') || [];
  const skip = c.get('skipKeywords') || [];
  if (ask.length) args.push('--ask', ask.join(','));
  if (skip.length) args.push('--skip', skip.join(','));
  return args.concat(c.get('extraArgs') || []);
}

function nodeMajor() {
  const res = spawnSync(nodeExe(), ['-v'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (res.error || res.status !== 0) return null;
  return parseInt(String(res.stdout).trim().replace(/^v/, '').split('.')[0], 10);
}

function readStats() {
  try {
    if (fs.existsSync(STATS_FILE)) return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch (e) {}
  return null;
}

function queryDaemonStatusAsync() {
  return new Promise((resolve) => {
    try {
      const d = daemonCommand(['--status']);
      const proc = spawn(d.cmd, d.args, {
        windowsHide: true, shell: d.shell,
        env: { ...process.env, NO_COLOR: '1' }
      });
      let out = '';
      const timer = setTimeout(() => {
        try { proc.kill(); } catch (e) {}
        resolve(null);
      }, 4000);
      proc.stdout.on('data', chunk => { out += chunk; });
      proc.on('close', code => {
        clearTimeout(timer);
        if (code === 0) {
          try { resolve(JSON.parse(out)); return; } catch (e) {}
        }
        resolve(null);
      });
      proc.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    } catch (err) {
      resolve(null);
    }
  });
}

function queryDaemonStatus() {
  const d = daemonCommand(['--status']);
  try {
    const res = spawnSync(d.cmd, d.args, {
      encoding: 'utf8', timeout: 5000, windowsHide: true, shell: d.shell,
      env: { ...process.env, NO_COLOR: '1' }
    });
    return JSON.parse(res.stdout);
  } catch (e) {
    return null;
  }
}

function reportEnvironment() {
  const major = nodeMajor();
  const lines = [];
  if (major === null) lines.push(`Node.js not found ("${nodeExe()}"). Install Node 22+ or set antigravityAutoSubmit.nodePath.`);
  else if (major < 22) lines.push(`Node.js v${major} is too old. The daemon needs Node 22+ (built-in WebSocket).`);
  else lines.push(`Node.js v${major} OK.`);
  if (useGlobal()) lines.push(`Using global daemon. If it is missing, run: ${NPM_INSTALL}`);
  const res = spawnSync(daemonCommand(['--status']).cmd, daemonCommand(['--status']).args, {
    encoding: 'utf8', timeout: 15000, windowsHide: true, shell: useGlobal(), env: { ...process.env, NO_COLOR: '1' }
  });
  try {
    const s = JSON.parse(res.stdout);
    lines.push(s.connected
      ? `Debug port OK: ${s.windowCount} window(s) on port ${s.port}.`
      : 'No IDE debug port found. Run "Add Debug Port to IDE Shortcuts (setup)" and restart the IDE from the patched shortcut.');
  } catch (e) {
    lines.push('Could not read daemon status. See "Show Daemon Log".');
  }
  const ok = major !== null && major >= 22;
  (ok ? vscode.window.showInformationMessage : vscode.window.showWarningMessage)(lines.join(' '));
  output.appendLine(`[env] ${lines.join(' | ')}`);
}

function setCtx(running) {
  vscode.commands.executeCommand('setContext', 'antigravityAutoSubmit.running', running);
}

function render() {
  const mode = cfg().get('mode');
  if (child) {
    if (daemonStatus && !daemonStatus.connected) {
      statusItem.text = `$(warning) AGY: no window`;
      statusItem.tooltip = `Antigravity Auto-Submit daemon is running (${mode}), but NO IDE window is connected. Restart Antigravity from the patched shortcut (with --remote-debugging-port=9333).`;
      statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusItem.text = `$(rocket) AGY: ${mode}`;
      statusItem.tooltip = `Antigravity Auto-Submit is running (${mode}). Click to stop.`;
      statusItem.backgroundColor = undefined;
    }
    setCtx(true);
  } else {
    statusItem.text = '$(circle-slash) AGY: off';
    statusItem.tooltip = 'Antigravity Auto-Submit is stopped. Click to start.';
    statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    setCtx(false);
  }
  statusItem.show();
}

function refreshViews() {
  if (statusView) statusView.refresh();
  if (statsView) statsView.refresh();
  if (actionsView) actionsView.refresh();
}

// ── strip ANSI ──
// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
function strip(s) { return s.replace(ANSI_RE, ''); }

function parseDaemonLine(raw) {
  const clean = strip(raw).trim();
  if (!clean) return;
  if (/APPROVE/i.test(clean)) {
    sessionApprovals++;
    logView.add('check', clean.replace(/.*APPROVE\s*/, '').trim() || clean);
    statsView.refresh();
  } else if (/SKIPPED/i.test(clean)) {
    sessionBlocks++;
    logView.add('close', clean.replace(/.*SKIPPED\s*/, '').trim() || clean);
    statsView.refresh();
  } else if (/PAUSED/i.test(clean)) {
    logView.add('bell', clean.replace(/.*PAUSED\s*/, '').trim() || clean);
  } else if (/READY|ONLINE/i.test(clean)) {
    logView.add('plug', clean.replace(/.*(?:READY|ONLINE)\s*/, '').trim() || clean);
    statusView.refresh();
  } else if (/DISCON|OFFLINE/i.test(clean)) {
    logView.add('debug-disconnect', clean.replace(/.*(?:DISCON|OFFLINE)\s*/, '').trim() || clean);
    statusView.refresh();
  } else if (/MODE|TOGGLE/i.test(clean)) {
    logView.add('settings-gear', clean.replace(/.*(?:MODE|TOGGLE)\s*/, '').trim() || clean);
    statusView.refresh();
  } else if (/error/i.test(clean)) {
    logView.add('warning', clean);
  }
}

// ── Daemon lifecycle ──

function start() {
  if (child) {
    vscode.window.showInformationMessage('Antigravity Auto-Submit is already running.');
    return;
  }
  sessionApprovals = 0;
  sessionBlocks = 0;
  if (!useGlobal() && !fs.existsSync(daemonPath())) {
    vscode.window.showErrorMessage('Bundled daemon not found. Reinstall the extension.');
    return;
  }
  const major = nodeMajor();
  if (!useGlobal() && (major === null || major < 22)) {
    vscode.window.showErrorMessage(
      major === null
        ? `Node.js not found ("${nodeExe()}"). Install Node 22+ or set antigravityAutoSubmit.nodePath.`
        : `Node.js v${major} is too old. Auto-Submit needs Node 22+.`
    );
    return;
  }
  const d = daemonCommand(buildArgs());
  const proc = spawn(d.cmd, d.args, {
    env: { ...process.env, NO_COLOR: '1' },
    windowsHide: true,
    shell: d.shell
  });
  child = proc;
  output.appendLine(`[start] pid ${proc.pid} mode=${cfg().get('mode')}`);
  if (logView) logView.add('debug-start', `Daemon started (PID ${proc.pid})`);
  proc.stdout.on('data', buf => {
    const text = buf.toString();
    output.append(text);
    if (logView) {
      const parts = text.split('\n');
      for (let i = 0; i < parts.length; i++) parseDaemonLine(parts[i]);
    }
  });
  proc.stderr.on('data', buf => {
    const text = buf.toString();
    output.append(text);
    if (logView) logView.add('warning', strip(text).trim());
  });
  proc.on('error', err => {
    output.appendLine(`[error] ${err.message}`);
    if (logView) logView.add('warning', err.message);
    vscode.window.showErrorMessage(useGlobal()
      ? `Could not run "auto-accept": ${err.message}. Install it with: ${NPM_INSTALL}`
      : `Could not run Node ("${nodeExe()}"): ${err.message}. Set antigravityAutoSubmit.nodePath.`);
  });
  proc.on('exit', code => {
    output.appendLine(`[exit] code ${code}`);
    if (logView) logView.add('debug-stop', `Daemon exited (code ${code})`);
    if (child === proc) child = null;
    daemonStatus = null;
    render();
    refreshViews();
  });
  render();
  refreshViews();
}

function stop() {
  if (!child) return;
  const proc = child;
  child = null;
  try { proc.kill(); } catch (e) {}
  output.appendLine('[stop] requested');
  if (logView) logView.add('debug-stop', 'Daemon stopped');
  daemonStatus = null;
  render();
  refreshViews();
}

function restartIfRunning() {
  if (!child) return;
  stop();
  setTimeout(start, 500);
}

async function setMode() {
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'autonomous', description: 'Approve tool prompts only (per-command gating)' },
      { label: 'autopilot', description: 'Also confirm implementation plan dialogs (hands-free)' }
    ],
    { placeHolder: 'Select auto-submit mode' }
  );
  if (!pick) return;
  await cfg().update('mode', pick.label, vscode.ConfigurationTarget.Global);
}

function showStatus() {
  const d = daemonCommand(['--status']);
  const res = spawnSync(d.cmd, d.args, {
    encoding: 'utf8', timeout: 15000, windowsHide: true, shell: d.shell,
    env: { ...process.env, NO_COLOR: '1' }
  });
  if (res.error) {
    vscode.window.showErrorMessage(`Status check failed: ${res.error.message}`);
    return;
  }
  try {
    const s = JSON.parse(res.stdout);
    if (s.connected) {
      vscode.window.showInformationMessage(
        `Connected: ${s.windowCount} window(s) on port ${s.port}. Mode: ${s.mode}. Lifetime approvals: ${s.lifetimeApprovals}.`
      );
    } else {
      vscode.window.showWarningMessage(
        'No Antigravity window with remote debugging found. Run "Add Debug Port to IDE Shortcuts" and restart the IDE.'
      );
    }
  } catch (e) {
    output.appendLine(res.stdout || res.stderr || 'No status output');
    output.show(true);
  }
}

function runInTerminal(name, subcommand) {
  const term = vscode.window.createTerminal({ name: `AGY ${name}` });
  term.show();
  term.sendText(useGlobal() ? `auto-accept ${subcommand}` : `${nodeExe()} "${daemonPath()}" ${subcommand}`);
}

// ── Tree items ──

function item(label, opts) {
  const ti = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  if (opts.desc !== undefined) ti.description = String(opts.desc);
  if (opts.icon) ti.iconPath = new vscode.ThemeIcon(opts.icon);
  if (opts.tip) ti.tooltip = opts.tip;
  if (opts.cmd) ti.command = { command: opts.cmd, title: label };
  if (opts.ctx) ti.contextValue = opts.ctx;
  return ti;
}

// ── Status view ──

class StatusProvider {
  constructor() {
    this._fire = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._fire.event;
  }
  refresh() { this._fire.fire(); }
  getTreeItem(e) { return e; }
  getChildren() {
    const running = !!child;
    const mode = cfg().get('mode') || 'autonomous';
    const items = [];

    items.push(item('Daemon', {
      desc: running ? 'running' : 'stopped',
      icon: running ? 'circle-filled' : 'circle-outline'
    }));

    items.push(item('Mode', {
      desc: mode,
      icon: 'dash',
      cmd: 'antigravityAutoSubmit.setMode'
    }));

    if (running && daemonStatus) {
      items.push(item('Connection', {
        desc: daemonStatus.connected
          ? `${daemonStatus.windowCount} window(s) on port ${daemonStatus.port}`
          : 'no windows',
        icon: daemonStatus.connected ? 'circle-filled' : 'circle-outline'
      }));
      if (daemonStatus.windows) {
        for (const w of daemonStatus.windows) {
          items.push(item(`  ${w.title}`, { desc: String(w.port), icon: 'dash' }));
        }
      }
    } else if (running) {
      items.push(item('Connection', { desc: 'polling...', icon: 'circle-outline' }));
    } else {
      items.push(item('Connection', { desc: 'offline', icon: 'circle-outline' }));
    }

    const nodeVer = nodeMajor();
    items.push(item('Node.js', {
      desc: nodeVer !== null ? `v${nodeVer}` : 'not found',
      icon: nodeVer !== null && nodeVer >= 22 ? 'circle-filled' : 'circle-outline'
    }));

    const c = cfg();
    items.push(item('Ask rules', { desc: String((c.get('askKeywords') || []).length), icon: 'dash' }));
    items.push(item('Skip rules', { desc: String((c.get('skipKeywords') || []).length), icon: 'dash' }));

    return items;
  }
}

// ── Stats view ──

class StatsProvider {
  constructor() {
    this._fire = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._fire.event;
  }
  refresh() { this._fire.fire(); }
  getTreeItem(e) { return e; }
  getChildren() {
    const s = daemonStatus || {};
    const disk = readStats();
    const total = s.lifetimeApprovals != null ? s.lifetimeApprovals : (disk && disk.total_clicks) || 0;
    const lastTime = s.lastClicked || (disk && disk.last_clicked) || '';
    const lastAction = (disk && disk.last_action) || '';

    const items = [];
    items.push(item('Approvals', { desc: String(total), icon: 'dash' }));
    if (child) {
      items.push(item('Session approvals', { desc: String(sessionApprovals), icon: 'dash' }));
    }
    if (sessionBlocks > 0) {
      items.push(item('Guardrail blocks', { desc: String(sessionBlocks), icon: 'dash' }));
    }
    if (lastTime) items.push(item('Last approval', { desc: lastTime, icon: 'dash' }));
    if (lastAction) {
      const short = lastAction.length > 60 ? lastAction.substring(0, 57) + '...' : lastAction;
      items.push(item('Last action', { desc: short, icon: 'dash', tip: lastAction }));
    }
    if (!total && !lastTime) items.push(item('No data yet', { desc: '', icon: 'dash' }));
    return items;
  }
}

// ── Actions view ──

class ActionsProvider {
  constructor() {
    this._fire = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._fire.event;
  }
  refresh() { this._fire.fire(); }
  getTreeItem(e) { return e; }
  getChildren() {
    const running = !!child;
    const items = [];
    items.push(item(running ? 'Stop' : 'Start', {
      icon: running ? 'debug-stop' : 'debug-start',
      cmd: running ? 'antigravityAutoSubmit.stop' : 'antigravityAutoSubmit.start'
    }));
    items.push(item('Switch mode', { icon: 'dash', cmd: 'antigravityAutoSubmit.setMode' }));
    items.push(item('Diagnostics', { icon: 'dash', cmd: 'antigravityAutoSubmit.doctor' }));
    items.push(item('Setup debug port', { icon: 'dash', cmd: 'antigravityAutoSubmit.setup' }));
    items.push(item('Check environment', { icon: 'dash', cmd: 'antigravityAutoSubmit.checkEnvironment' }));
    items.push(item('Output log', { icon: 'dash', cmd: 'antigravityAutoSubmit.showLog' }));
    items.push(item('Docs', { icon: 'dash', cmd: 'antigravityAutoSubmit.openDocs' }));
    items.push(item('Walkthrough', { icon: 'dash', cmd: 'antigravityAutoSubmit.openWalkthrough' }));
    return items;
  }
}

// ── Log view ──

class LogProvider {
  constructor() {
    this._fire = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._fire.event;
    this._entries = [];
  }
  refresh() { this._fire.fire(); }
  getTreeItem(e) { return e; }
  add(icon, msg) {
    if (!msg) return;
    const t = new Date().toLocaleTimeString('en-US', { hour12: false });
    this._entries.unshift({ icon, msg, t });
    if (this._entries.length > LOG_CAP) this._entries.length = LOG_CAP;
    this.refresh();
  }
  clear() { this._entries = []; this.refresh(); }
  getChildren() {
    if (!this._entries.length) return [item('waiting for activity', { icon: 'dash' })];
    return this._entries.map(e => item(e.msg, { desc: e.t, icon: e.icon }));
  }
}

// ── Polling ──

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!child) {
      if (daemonStatus) { daemonStatus = null; refreshViews(); render(); }
      return;
    }
    const s = await queryDaemonStatusAsync();
    if (s && child) {
      daemonStatus = s;
      statusView.refresh();
      statsView.refresh();
      render();
    }
  }, 5000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── Activation ──

function activate(context) {
  extensionPath = context.extensionPath;
  output = vscode.window.createOutputChannel('Antigravity Auto-Submit');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'antigravityAutoSubmit.toggle';

  statusView = new StatusProvider();
  statsView = new StatsProvider();
  actionsView = new ActionsProvider();
  logView = new LogProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('antigravityAutoSubmit.statusView', statusView),
    vscode.window.registerTreeDataProvider('antigravityAutoSubmit.statsView', statsView),
    vscode.window.registerTreeDataProvider('antigravityAutoSubmit.actionsView', actionsView),
    vscode.window.registerTreeDataProvider('antigravityAutoSubmit.logView', logView)
  );

  const reg = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(`${SECTION}.${id}`, fn));
  reg('start', start);
  reg('stop', stop);
  reg('toggle', () => (child ? stop() : start()));
  reg('setMode', setMode);
  reg('showStatus', showStatus);
  reg('setup', () => runInTerminal('setup', 'setup'));
  reg('doctor', () => runInTerminal('doctor', 'doctor'));
  reg('showLog', () => output.show(true));
  reg('openDocs', () => vscode.env.openExternal(vscode.Uri.parse(REPO_URL)));
  reg('copyInstall', async () => {
    await vscode.env.clipboard.writeText(NPM_INSTALL);
    vscode.window.showInformationMessage(`Copied: ${NPM_INSTALL}`);
  });
  reg('checkEnvironment', reportEnvironment);
  reg('openWalkthrough', () => vscode.commands.executeCommand(
    'workbench.action.openWalkthrough',
    `${(context.extension && context.extension.id) || 'WillyEverGreen.antigravity-auto-submit'}#antigravityAutoSubmit.gettingStarted`,
    false
  ));
  reg('refreshDashboard', async () => {
    if (child) { const s = await queryDaemonStatusAsync(); if (s) daemonStatus = s; }
    refreshViews();
    logView.refresh();
  });
  reg('clearLog', () => logView.clear());

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(SECTION)) {
        render();
        refreshViews();
        restartIfRunning();
      }
    }),
    statusItem,
    output,
    { dispose: () => { stop(); stopPolling(); } }
  );

  render();
  startPolling();
  if (!context.globalState.get('welcomed')) {
    context.globalState.update('welcomed', true);
    vscode.commands.executeCommand('antigravityAutoSubmit.openWalkthrough');
  }
  if (cfg().get('autoStart')) start();
}

function deactivate() {
  stop();
  stopPolling();
}

module.exports = { activate, deactivate };
