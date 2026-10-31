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
let dashboardProvider = null;
const inMemoryLogs = [];

function appendLog(type, text) {
  const time = new Date().toTimeString().substring(0, 8);
  const entry = { time, type, text: strip(text).trim() };
  inMemoryLogs.push(entry);
  if (inMemoryLogs.length > LOG_CAP) inMemoryLogs.shift();
  if (dashboardProvider) dashboardProvider.postLog(entry);
}

function cfg() {
  return vscode.workspace.getConfiguration(SECTION);
}

const GLOBAL_CONFIG_FILE = path.join(os.homedir(), '.antigravity-auto-submit', 'config.json');

function syncGlobalConfigRules(key, list) {
  try {
    if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_FILE, 'utf8'));
      data[key] = list;
      fs.writeFileSync(GLOBAL_CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (e) {}
}

async function addRule(listKey, keyword) {
  const norm = keyword.toLowerCase().trim();
  if (!norm) return;
  const current = (cfg().get(listKey) || []).slice();
  if (!current.map(k => k.toLowerCase().trim()).includes(norm)) {
    current.push(keyword.trim());
    await cfg().update(listKey, current, vscode.ConfigurationTarget.Global);
    syncGlobalConfigRules(listKey, current);
    if (dashboardProvider) dashboardProvider.postState();
    vscode.window.showInformationMessage(`Added "${keyword.trim()}" to ${listKey === 'askKeywords' ? 'Ask' : 'Skip'} rules.`);
  } else {
    vscode.window.showInformationMessage(`"${keyword.trim()}" is already in ${listKey === 'askKeywords' ? 'Ask' : 'Skip'} rules.`);
  }
}

async function removeRule(listKey, keyword) {
  const norm = keyword.toLowerCase().trim();
  const current = (cfg().get(listKey) || []).slice();
  const updated = current.filter(k => k.toLowerCase().trim() !== norm);
  await cfg().update(listKey, updated, vscode.ConfigurationTarget.Global);
  syncGlobalConfigRules(listKey, updated);
  if (dashboardProvider) dashboardProvider.postState();
  vscode.window.showInformationMessage(`Removed "${keyword}" from ${listKey === 'askKeywords' ? 'Ask' : 'Skip'} rules.`);
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
    const detail = clean.replace(/.*APPROVE\s*/, '').trim() || clean;
    if (logView) logView.add('check', detail);
    appendLog('approve', detail);
    if (statsView) statsView.refresh();
    if (dashboardProvider) dashboardProvider.postState();
  } else if (/SKIPPED/i.test(clean)) {
    sessionBlocks++;
    const detail = clean.replace(/.*SKIPPED\s*/, '').trim() || clean;
    if (logView) logView.add('close', detail);
    appendLog('skip', detail);
    if (statsView) statsView.refresh();
    if (dashboardProvider) dashboardProvider.postState();
  } else if (/PAUSED/i.test(clean)) {
    const detail = clean.replace(/.*PAUSED\s*/, '').trim() || clean;
    if (logView) logView.add('bell', detail);
    appendLog('pause', detail);
  } else if (/READY|ONLINE/i.test(clean)) {
    const detail = clean.replace(/.*(?:READY|ONLINE)\s*/, '').trim() || clean;
    if (logView) logView.add('plug', detail);
    appendLog('online', detail);
    if (statusView) statusView.refresh();
    if (dashboardProvider) dashboardProvider.postState();
  } else if (/DISCON|OFFLINE/i.test(clean)) {
    const detail = clean.replace(/.*(?:DISCON|OFFLINE)\s*/, '').trim() || clean;
    if (logView) logView.add('debug-disconnect', detail);
    appendLog('offline', detail);
    if (statusView) statusView.refresh();
    if (dashboardProvider) dashboardProvider.postState();
  } else if (/MODE|TOGGLE/i.test(clean)) {
    const detail = clean.replace(/.*(?:MODE|TOGGLE)\s*/, '').trim() || clean;
    if (logView) logView.add('settings-gear', detail);
    appendLog('info', detail);
    if (statusView) statusView.refresh();
    if (dashboardProvider) dashboardProvider.postState();
  } else if (/error/i.test(clean)) {
    if (logView) logView.add('warning', clean);
    appendLog('error', clean);
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
  appendLog('start', `Daemon started (PID ${proc.pid})`);
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
    appendLog('error', err.message);
    vscode.window.showErrorMessage(useGlobal()
      ? `Could not run "auto-accept": ${err.message}. Install it with: ${NPM_INSTALL}`
      : `Could not run Node ("${nodeExe()}"): ${err.message}. Set antigravityAutoSubmit.nodePath.`);
  });
  proc.on('exit', code => {
    output.appendLine(`[exit] code ${code}`);
    appendLog('stop', `Daemon exited (code ${code})`);
    if (logView) logView.add('debug-stop', `Daemon exited (code ${code})`);
    if (child === proc) child = null;
    daemonStatus = null;
    render();
    refreshViews();
    if (dashboardProvider) dashboardProvider.postState();
  });
  render();
  refreshViews();
  if (dashboardProvider) dashboardProvider.postState();
}

function stop() {
  if (!child) return;
  const proc = child;
  child = null;
  try { proc.kill(); } catch (e) {}
  output.appendLine('[stop] requested');
  appendLog('stop', 'Daemon stopped');
  if (logView) logView.add('debug-stop', 'Daemon stopped');
  daemonStatus = null;
  render();
  refreshViews();
  if (dashboardProvider) dashboardProvider.postState();
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

// ── Dashboard Webview View Provider (OpenCode Minimal Aesthetic) ──

class DashboardViewProvider {
  static viewType = 'antigravityAutoSubmit.dashboardView';

  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'start':
          start();
          break;
        case 'stop':
          stop();
          break;
        case 'toggle':
          if (child) stop(); else start();
          break;
        case 'setMode':
          if (msg.mode) {
            await cfg().update('mode', msg.mode, vscode.ConfigurationTarget.Global);
            render();
            refreshViews();
            this.postState();
          }
          break;
        case 'addRule':
          if (msg.list && msg.keyword) {
            await addRule(msg.list, msg.keyword);
          }
          break;
        case 'removeRule':
          if (msg.list && msg.keyword) {
            await removeRule(msg.list, msg.keyword);
          }
          break;
        case 'setup':
          runInTerminal('setup', 'setup');
          break;
        case 'doctor':
          runInTerminal('doctor', 'doctor');
          break;
        case 'showLog':
          output.show(true);
          break;
        case 'clearLog':
          inMemoryLogs.length = 0;
          if (logView) logView.clear();
          this.postState();
          break;
        case 'openDocs':
          vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
          break;
        case 'refresh':
          if (child) {
            const s = await queryDaemonStatusAsync();
            if (s) daemonStatus = s;
          }
          refreshViews();
          render();
          this.postState();
          break;
        case 'getState':
          this.postState();
          break;
      }
    });

    this.postState();
  }

  postLog(entry) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'log', entry });
    }
  }

  postState() {
    if (!this._view) return;
    const disk = readStats();
    const state = {
      running: !!child,
      mode: cfg().get('mode') || 'autonomous',
      daemonStatus: daemonStatus,
      stats: {
        total: (daemonStatus && daemonStatus.lifetimeApprovals != null) ? daemonStatus.lifetimeApprovals : (disk && disk.total_clicks) || 0,
        session: sessionApprovals,
        blocks: sessionBlocks,
        lastClicked: (daemonStatus && daemonStatus.lastClicked) || (disk && disk.last_clicked) || '',
        lastAction: (disk && disk.last_action) || ''
      },
      rules: {
        askKeywords: cfg().get('askKeywords') || [],
        skipKeywords: cfg().get('skipKeywords') || []
      },
      logs: inMemoryLogs.slice(-60)
    };
    this._view.webview.postMessage({ type: 'state', state });
  }

  _getHtmlForWebview(webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity Auto-Submit</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #0e1015);
      --card-bg: var(--vscode-editor-background, #14171f);
      --border: var(--vscode-widget-border, rgba(255, 255, 255, 0.08));
      --text: var(--vscode-foreground, #e2e8f0);
      --text-muted: var(--vscode-descriptionForeground, #94a3b8);
      --accent-green: #10b981;
      --accent-green-bg: rgba(16, 185, 129, 0.12);
      --accent-red: #ef4444;
      --accent-red-bg: rgba(239, 68, 68, 0.12);
      --accent-amber: #f59e0b;
      --accent-amber-bg: rgba(245, 158, 11, 0.12);
      --accent-blue: #3b82f6;
      --accent-blue-bg: rgba(59, 130, 246, 0.12);
      --input-bg: var(--vscode-input-background, #181b24);
      --input-border: var(--vscode-input-border, rgba(255, 255, 255, 0.12));
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 12px;
      color: var(--text);
      background-color: var(--bg);
      padding: 12px 10px;
      line-height: 1.4;
      user-select: none;
    }

    /* Header card */
    .header-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 10px;
    }
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 20px;
    }
    .status-badge.active {
      color: var(--accent-green);
      background: var(--accent-green-bg);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-badge.stopped {
      color: var(--text-muted);
      background: rgba(148, 163, 184, 0.1);
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .status-badge.nowindow {
      color: var(--accent-amber);
      background: var(--accent-amber-bg);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .status-badge.active .pulse-dot {
      box-shadow: 0 0 8px currentColor;
    }
    
    .btn-toggle {
      border: none;
      outline: none;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .btn-start {
      background: #10b981;
      color: #fff;
    }
    .btn-start:hover {
      background: #059669;
    }
    .btn-stop {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .btn-stop:hover {
      background: rgba(239, 68, 68, 0.25);
    }
    
    .connection-line {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .connection-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      padding: 1px 6px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10px;
    }

    /* Mode Switcher */
    .mode-switcher {
      display: flex;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }
    .mode-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s ease;
    }
    .mode-btn.active {
      background: var(--card-bg);
      color: var(--text);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .mode-hint {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 4px;
      text-align: center;
    }

    /* KPI Metrics Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 4px;
      text-align: center;
    }
    .stat-number {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .stat-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    
    .last-action-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 8px;
      margin-bottom: 10px;
      font-size: 10px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .last-action-text {
      color: var(--text);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-left: 4px;
    }

    /* Rules Manager Section */
    .rules-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 10px;
    }
    .rule-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .rule-tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .rule-tab-btn.active {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      font-weight: 600;
    }
    .rule-count {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.1);
    }
    .tab-desc {
      font-size: 10px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .chips-container {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      min-height: 28px;
      margin-bottom: 10px;
    }
    .rule-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-family: var(--vscode-editor-font-family, monospace);
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      transition: all 0.15s ease;
    }
    .rule-chip.skip {
      border-color: rgba(239, 68, 68, 0.25);
      background: rgba(239, 68, 68, 0.08);
      color: #fca5a5;
    }
    .rule-chip.ask {
      border-color: rgba(245, 158, 11, 0.25);
      background: rgba(245, 158, 11, 0.08);
      color: #fde68a;
    }
    .chip-delete {
      cursor: pointer;
      font-weight: bold;
      opacity: 0.6;
      font-size: 12px;
      padding: 0 2px;
    }
    .chip-delete:hover {
      opacity: 1;
      color: #ef4444;
    }
    .empty-chips {
      font-size: 11px;
      color: var(--text-muted);
      font-style: italic;
      padding: 4px 0;
    }
    
    .add-rule-form {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .rule-input {
      flex: 1;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--text);
      font-size: 11px;
      font-family: var(--vscode-editor-font-family, monospace);
      padding: 5px 8px;
      border-radius: 4px;
      outline: none;
    }
    .rule-input:focus {
      border-color: var(--vscode-focusBorder, #3b82f6);
    }
    .btn-add {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 11px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-add:hover {
      background: #10b981;
      color: #fff;
      border-color: #10b981;
    }

    .presets-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    .preset-pill {
      font-size: 10px;
      font-family: var(--vscode-editor-font-family, monospace);
      background: transparent;
      border: 1px dashed var(--border);
      color: var(--text-muted);
      padding: 1px 6px;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .preset-pill:hover {
      color: var(--text);
      border-color: var(--accent-green);
    }

    /* Quick Tools Grid */
    .tools-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }
    .tool-btn {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 11px;
      padding: 5px 8px;
      border-radius: 5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      justify-content: center;
    }
    .tool-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Live Feed Terminal */
    .feed-card {
      background: #090a0d;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .feed-header {
      background: rgba(255, 255, 255, 0.03);
      padding: 5px 8px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: var(--text-muted);
    }
    .feed-list {
      max-height: 130px;
      overflow-y: auto;
      padding: 6px 8px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .feed-item {
      display: flex;
      gap: 6px;
      line-height: 1.3;
      word-break: break-all;
    }
    .feed-time {
      color: var(--text-muted);
      opacity: 0.6;
      flex-shrink: 0;
    }
    .feed-tag {
      font-size: 9px;
      font-weight: 700;
      padding: 0 4px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .tag-approve { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .tag-skip { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .tag-pause { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .tag-online { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .tag-offline { background: rgba(148, 163, 184, 0.2); color: #94a3b8; }
    .tag-start { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .tag-stop { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .tag-info { background: rgba(255, 255, 255, 0.1); color: var(--text); }
    .feed-msg { color: var(--text); }
    .clear-link {
      cursor: pointer;
      color: var(--text-muted);
    }
    .clear-link:hover { color: var(--text); }
  </style>
</head>
<body>

  <!-- Top Status Card -->
  <div class="header-card">
    <div class="header-row">
      <div id="statusBadge" class="status-badge stopped">
        <span class="pulse-dot"></span>
        <span id="statusText">STOPPED</span>
      </div>
      <button id="toggleBtn" class="btn-toggle btn-start" onclick="toggleDaemon()">
        Start
      </button>
    </div>
    
    <div class="connection-line">
      <span>Connection:</span>
      <span id="connectionPill" class="connection-pill">offline</span>
    </div>

    <!-- Segmented Mode Control -->
    <div class="mode-switcher">
      <button id="btnModeAuto" class="mode-btn active" onclick="setMode('autonomous')">Autonomous</button>
      <button id="btnModePilot" class="mode-btn" onclick="setMode('autopilot')">Autopilot</button>
    </div>
    <div id="modeHint" class="mode-hint">Approves safe tool execution automatically</div>
  </div>

  <!-- KPI Metrics Grid -->
  <div class="stats-grid">
    <div class="stat-card">
      <div id="statTotal" class="stat-number">0</div>
      <div class="stat-label">Approvals</div>
    </div>
    <div class="stat-card">
      <div id="statSession" class="stat-number">0</div>
      <div class="stat-label">Session</div>
    </div>
    <div class="stat-card">
      <div id="statBlocks" class="stat-number">0</div>
      <div class="stat-label">Blocked</div>
    </div>
  </div>

  <!-- Last Action Box -->
  <div class="last-action-box">
    <span>Last:</span>
    <span id="lastActionText" class="last-action-text">No approvals recorded yet</span>
  </div>

  <!-- Safety Rules Manager -->
  <div class="rules-card">
    <div class="rule-tabs">
      <button id="tabSkip" class="rule-tab-btn active" onclick="switchRuleTab('skip')">
        Skip Rules <span id="countSkip" class="rule-count">0</span>
      </button>
      <button id="tabAsk" class="rule-tab-btn" onclick="switchRuleTab('ask')">
        Ask Rules <span id="countAsk" class="rule-count">0</span>
      </button>
    </div>

    <div id="tabDesc" class="tab-desc">
      Prompts matching these keywords are immediately blocked.
    </div>

    <div id="chipsContainer" class="chips-container">
      <span class="empty-chips">Loading rules...</span>
    </div>

    <form class="add-rule-form" onsubmit="handleAddRule(event)">
      <input id="ruleInput" class="rule-input" type="text" placeholder="Add keyword (e.g. rm -rf)..." autocomplete="off" />
      <button type="submit" class="btn-add">+ Add</button>
    </form>

    <div id="presetsRow" class="presets-row"></div>
  </div>

  <!-- Quick Tools -->
  <div class="tools-grid">
    <button class="tool-btn" onclick="triggerCommand('setup')">⚡ Setup Port</button>
    <button class="tool-btn" onclick="triggerCommand('doctor')">🩺 Doctor Check</button>
    <button class="tool-btn" onclick="triggerCommand('refresh')">🔄 Refresh</button>
    <button class="tool-btn" onclick="triggerCommand('showLog')">📄 Output Log</button>
  </div>

  <!-- Live Activity Feed -->
  <div class="feed-card">
    <div class="feed-header">
      <span>LIVE ACTIVITY FEED</span>
      <span class="clear-link" onclick="triggerCommand('clearLog')">Clear</span>
    </div>
    <div id="feedList" class="feed-list">
      <div class="feed-item" style="color:var(--text-muted);font-style:italic;">Waiting for activity...</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentState = null;
    let activeTab = 'skip'; // 'skip' or 'ask'

    const SKIP_PRESETS = ['rm -rf', 'drop table', 'git push --force', 'format c:', 'del /f /s'];
    const ASK_PRESETS = ['git push', 'git reset --hard', 'npm publish', 'prisma migrate'];

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function toggleDaemon() {
      vscode.postMessage({ command: 'toggle' });
    }

    function setMode(mode) {
      vscode.postMessage({ command: 'setMode', mode: mode });
    }

    function switchRuleTab(tab) {
      activeTab = tab;
      document.getElementById('tabSkip').classList.toggle('active', tab === 'skip');
      document.getElementById('tabAsk').classList.toggle('active', tab === 'ask');
      
      const desc = document.getElementById('tabDesc');
      if (tab === 'skip') {
        desc.textContent = 'Prompts matching these keywords are immediately blocked.';
        document.getElementById('ruleInput').placeholder = 'Add skip keyword (e.g. rm -rf)...';
      } else {
        desc.textContent = 'Prompts matching these keywords will pause for your manual review.';
        document.getElementById('ruleInput').placeholder = 'Add ask keyword (e.g. git push)...';
      }
      
      renderRules();
      renderPresets();
    }

    function renderPresets() {
      const row = document.getElementById('presetsRow');
      const presets = activeTab === 'skip' ? SKIP_PRESETS : ASK_PRESETS;
      row.innerHTML = presets.map(p => 
        '<button type="button" class="preset-pill" onclick="addPreset(\\'' + escapeHtml(p) + '\\')">+ ' + escapeHtml(p) + '</button>'
      ).join('');
    }

    function addPreset(kw) {
      const listKey = activeTab === 'skip' ? 'skipKeywords' : 'askKeywords';
      vscode.postMessage({ command: 'addRule', list: listKey, keyword: kw });
    }

    function handleAddRule(e) {
      e.preventDefault();
      const input = document.getElementById('ruleInput');
      const val = input.value.trim();
      if (!val) return;
      const listKey = activeTab === 'skip' ? 'skipKeywords' : 'askKeywords';
      vscode.postMessage({ command: 'addRule', list: listKey, keyword: val });
      input.value = '';
    }

    function removeRule(listType, kw) {
      const listKey = listType === 'skip' ? 'skipKeywords' : 'askKeywords';
      vscode.postMessage({ command: 'removeRule', list: listKey, keyword: kw });
    }

    function triggerCommand(cmd) {
      vscode.postMessage({ command: cmd });
    }

    function renderRules() {
      if (!currentState || !currentState.rules) return;
      const container = document.getElementById('chipsContainer');
      const list = activeTab === 'skip' ? currentState.rules.skipKeywords : currentState.rules.askKeywords;
      
      document.getElementById('countSkip').textContent = currentState.rules.skipKeywords.length;
      document.getElementById('countAsk').textContent = currentState.rules.askKeywords.length;

      if (!list || list.length === 0) {
        container.innerHTML = '<span class="empty-chips">No ' + activeTab + ' rules configured</span>';
        return;
      }

      container.innerHTML = list.map(kw => {
        const safeKw = escapeHtml(kw);
        return '<span class="rule-chip ' + activeTab + '">' +
                 '<span>' + safeKw + '</span>' +
                 '<span class="chip-delete" title="Remove rule" onclick="removeRule(\\'' + activeTab + '\\', \\'' + safeKw + '\\')">&times;</span>' +
               '</span>';
      }).join('');
    }

    function renderAll(state) {
      currentState = state;

      // Status header
      const badge = document.getElementById('statusBadge');
      const text = document.getElementById('statusText');
      const toggle = document.getElementById('toggleBtn');
      const pill = document.getElementById('connectionPill');

      badge.className = 'status-badge';
      if (state.running) {
        toggle.textContent = 'Stop';
        toggle.className = 'btn-toggle btn-stop';

        if (state.daemonStatus && state.daemonStatus.connected) {
          badge.classList.add('active');
          text.textContent = 'ACTIVE';
          pill.textContent = (state.daemonStatus.windowCount || 1) + ' win on port ' + (state.daemonStatus.port || 9333);
        } else {
          badge.classList.add('nowindow');
          text.textContent = 'NO WINDOW';
          pill.textContent = 'port 9333 inactive (reopen from shortcut)';
        }
      } else {
        badge.classList.add('stopped');
        text.textContent = 'STOPPED';
        toggle.textContent = 'Start';
        toggle.className = 'btn-toggle btn-start';
        pill.textContent = 'offline';
      }

      // Mode Switcher
      const isPilot = state.mode === 'autopilot';
      document.getElementById('btnModeAuto').classList.toggle('active', !isPilot);
      document.getElementById('btnModePilot').classList.toggle('active', isPilot);
      document.getElementById('modeHint').textContent = isPilot
        ? 'Approves tools + confirms implementation plan dialogs'
        : 'Approves safe tool execution automatically';

      // KPI stats
      document.getElementById('statTotal').textContent = state.stats.total || 0;
      document.getElementById('statSession').textContent = state.stats.session || 0;
      document.getElementById('statBlocks').textContent = state.stats.blocks || 0;

      // Last action
      const actionEl = document.getElementById('lastActionText');
      if (state.stats.lastAction) {
        actionEl.textContent = state.stats.lastAction + (state.stats.lastClicked ? ' (' + state.stats.lastClicked + ')' : '');
        actionEl.title = state.stats.lastAction;
      } else {
        actionEl.textContent = 'No approvals recorded yet';
      }

      // Rules
      renderRules();
      renderPresets();

      // Feed
      renderFeed(state.logs || []);
    }

    function renderFeed(logs) {
      const feed = document.getElementById('feedList');
      if (!logs || logs.length === 0) {
        feed.innerHTML = '<div class="feed-item" style="color:var(--text-muted);font-style:italic;">Waiting for activity...</div>';
        return;
      }
      feed.innerHTML = logs.map(e => formatFeedItem(e)).join('');
      feed.scrollTop = feed.scrollHeight;
    }

    function formatFeedItem(e) {
      let tagClass = 'tag-info';
      let tagText = (e.type || 'info').toUpperCase();
      if (e.type === 'approve') { tagClass = 'tag-approve'; tagText = 'APPROVE'; }
      else if (e.type === 'skip') { tagClass = 'tag-skip'; tagText = 'BLOCKED'; }
      else if (e.type === 'pause') { tagClass = 'tag-pause'; tagText = 'PAUSED'; }
      else if (e.type === 'online') { tagClass = 'tag-online'; tagText = 'ONLINE'; }
      else if (e.type === 'offline') { tagClass = 'tag-offline'; tagText = 'OFFLINE'; }
      else if (e.type === 'start') { tagClass = 'tag-start'; tagText = 'START'; }
      else if (e.type === 'stop') { tagClass = 'tag-stop'; tagText = 'STOP'; }

      return '<div class="feed-item">' +
               '<span class="feed-time">' + escapeHtml(e.time || '') + '</span>' +
               '<span class="feed-tag ' + tagClass + '">' + tagText + '</span>' +
               '<span class="feed-msg">' + escapeHtml(e.text || '') + '</span>' +
             '</div>';
    }

    function appendFeedItem(entry) {
      const feed = document.getElementById('feedList');
      const empty = feed.querySelector('.feed-item[style*="font-style:italic"]');
      if (empty) feed.innerHTML = '';
      feed.insertAdjacentHTML('beforeend', formatFeedItem(entry));
      feed.scrollTop = feed.scrollHeight;
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'state') {
        renderAll(msg.state);
      } else if (msg.type === 'log') {
        appendFeedItem(msg.entry);
      }
    });

    // Request initial state on load
    vscode.postMessage({ command: 'getState' });
  </script>
</body>
</html>`;
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

  dashboardProvider = new DashboardViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DashboardViewProvider.viewType, dashboardProvider),
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
    render();
    if (dashboardProvider) dashboardProvider.postState();
  });
  reg('clearLog', () => {
    inMemoryLogs.length = 0;
    logView.clear();
    if (dashboardProvider) dashboardProvider.postState();
  });
  reg('addRule', async () => {
    const list = await vscode.window.showQuickPick(
      [
        { label: 'skipKeywords', description: 'Never approve prompts matching this keyword (Skip)' },
        { label: 'askKeywords', description: 'Pause and ask for manual confirmation (Ask)' }
      ],
      { placeHolder: 'Select rule list' }
    );
    if (!list) return;
    const kw = await vscode.window.showInputBox({
      prompt: `Enter keyword pattern to add to ${list.label === 'askKeywords' ? 'Ask' : 'Skip'} rules`,
      placeHolder: 'e.g. npm publish, drop database'
    });
    if (!kw || !kw.trim()) return;
    await addRule(list.label, kw.trim());
  });
  reg('removeRule', async () => {
    const currentSkip = cfg().get('skipKeywords') || [];
    const currentAsk = cfg().get('askKeywords') || [];
    const items = [
      ...currentSkip.map(k => ({ label: k, description: 'Skip list (Never approve)', list: 'skipKeywords' })),
      ...currentAsk.map(k => ({ label: k, description: 'Ask list (Manual review)', list: 'askKeywords' }))
    ];
    if (items.length === 0) {
      vscode.window.showInformationMessage('No active rules to remove.');
      return;
    }
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select rule keyword to remove' });
    if (!pick) return;
    await removeRule(pick.list, pick.label);
  });

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
