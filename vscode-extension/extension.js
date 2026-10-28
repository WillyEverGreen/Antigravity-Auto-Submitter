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

function daemonPath() {
  return path.join(extensionPath, 'daemon', 'auto-accept.js');
}

function nodeExe() {
  return cfg().get('nodePath') || 'node';
}

function buildArgs() {
  const c = cfg();
  const args = [daemonPath(), '--daemon', '--mode', c.get('mode') || 'autonomous'];
  const port = c.get('cdpPort');
  if (port > 0) args.push('--port', String(port));
  const ask = c.get('askKeywords') || [];
  const skip = c.get('skipKeywords') || [];
  if (ask.length) args.push('--ask', ask.join(','));
  if (skip.length) args.push('--skip', skip.join(','));
  return args;
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
  if (!fs.existsSync(daemonPath())) {
    vscode.window.showErrorMessage('Bundled daemon not found. Reinstall the extension.');
    return;
  }
  const proc = spawn(nodeExe(), buildArgs(), {
    env: { ...process.env, NO_COLOR: '1' },
    windowsHide: true
  });
  child = proc;
  output.appendLine(`[start] pid ${proc.pid} mode=${cfg().get('mode')}`);
  proc.stdout.on('data', d => output.append(d.toString()));
  proc.stderr.on('data', d => output.append(d.toString()));
  proc.on('error', err => {
    output.appendLine(`[error] ${err.message}`);
    vscode.window.showErrorMessage(`Could not run Node ("${nodeExe()}"): ${err.message}. Set antigravityAutoSubmit.nodePath.`);
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
  const res = spawnSync(nodeExe(), [daemonPath(), '--status'], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
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
  const quoted = `"${daemonPath()}"`;
  term.sendText(`${nodeExe()} ${quoted} ${subcommand}`);
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
  if (cfg().get('autoStart')) start();
}

function deactivate() {
  stop();
}

module.exports = { activate, deactivate };
