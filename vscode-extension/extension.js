'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const SECTION = 'antigravityAutoSubmit';

let statusItem;
let output;
let child = null;
let extensionPath = '';

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

// Command and leading args that launch the daemon, bundled or from a global npm install.
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

function render() {
  const mode = cfg().get('mode');
  if (child) {
    statusItem.text = `$(rocket) AGY: ${mode}`;
    statusItem.tooltip = 'Antigravity Auto-Submit is running. Click to stop.';
    statusItem.backgroundColor = undefined;
  } else {
    statusItem.text = '$(circle-slash) AGY: off';
    statusItem.tooltip = 'Antigravity Auto-Submit is stopped. Click to start.';
    statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  statusItem.show();
}

function start() {
  if (child) {
    vscode.window.showInformationMessage('Antigravity Auto-Submit is already running.');
    return;
  }
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
  proc.stdout.on('data', d => output.append(d.toString()));
  proc.stderr.on('data', d => output.append(d.toString()));
  proc.on('error', err => {
    output.appendLine(`[error] ${err.message}`);
    vscode.window.showErrorMessage(useGlobal()
      ? `Could not run "auto-accept": ${err.message}. Install it with: ${NPM_INSTALL}`
      : `Could not run Node ("${nodeExe()}"): ${err.message}. Set antigravityAutoSubmit.nodePath.`);
  });
  proc.on('exit', code => {
    output.appendLine(`[exit] code ${code}`);
    if (child === proc) child = null;
    render();
  });
  render();
}

function stop() {
  if (!child) return;
  const proc = child;
  child = null;
  try { proc.kill(); } catch (e) { /* already gone */ }
  output.appendLine('[stop] requested');
  render();
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
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    shell: d.shell,
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

function activate(context) {
  extensionPath = context.extensionPath;
  output = vscode.window.createOutputChannel('Antigravity Auto-Submit');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = 'antigravityAutoSubmit.toggle';

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
    `${context.extension.id}#antigravityAutoSubmit.gettingStarted`,
    false
  ));

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(SECTION)) {
        render();
        restartIfRunning();
      }
    }),
    statusItem,
    output,
    { dispose: stop }
  );

  render();
  if (!context.globalState.get('welcomed')) {
    context.globalState.update('welcomed', true);
    vscode.commands.executeCommand('antigravityAutoSubmit.openWalkthrough');
  }
  if (cfg().get('autoStart')) start();
}

function deactivate() {
  stop();
}

module.exports = { activate, deactivate };
