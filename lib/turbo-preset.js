/**
 * Antigravity PowerTools — IDE Turbo Mode Preset Applicator
 * 
 * Fine-tunes Antigravity IDE and VS Code settings for minimum input latency,
 * optimized memory ceilings, and file watcher pruning.
 * 
 * Invariants: Zero third-party dependencies, atomic write (.tmp -> rename),
 * BOM-tolerant parsing, fail-safe dry-run.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const TURBO_PRESET = {
  'files.watcherExclude': {
    '**/.git/objects/**': true,
    '**/.git/subtree-cache/**': true,
    '**/node_modules/**': true,
    '**/.hg/store/**': true,
    '**/dist/**': true,
    '**/.next/**': true,
    '**/.venv/**': true,
    '**/.gemini/**': true
  },
  'search.exclude': {
    '**/node_modules': true,
    '**/bower_components': true,
    '**/*.code-search': true,
    '**/dist': true,
    '**/.git': true
  },
  'editor.cursorBlinking': 'blink',
  'editor.smoothScrolling': false,
  'workbench.list.smoothScrolling': false,
  'typescript.tsserver.maxTsServerMemory': 1536,
  'typescript.disableAutomaticTypeAcquisition': true,
  'git.autofetch': false,
  'telemetry.telemetryLevel': 'off'
};

function getSettingsPath() {
  const home = os.homedir();
  const platform = process.platform;
  const candidates = [];

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    candidates.push(
      path.join(appData, 'Antigravity IDE', 'User', 'settings.json'),
      path.join(appData, 'Code', 'User', 'settings.json')
    );
  } else if (platform === 'darwin') {
    candidates.push(
      path.join(home, 'Library', 'Application Support', 'Antigravity IDE', 'User', 'settings.json'),
      path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json')
    );
  } else {
    candidates.push(
      path.join(home, '.config', 'Antigravity IDE', 'User', 'settings.json'),
      path.join(home, '.config', 'Code', 'User', 'settings.json')
    );
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // Default to primary candidate even if not yet created
}

function stripJsonComments(str) {
  let insideString = false;
  let stringChar = '';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    const next = str[i + 1];

    if (insideString) {
      result += ch;
      if (ch === '\\') {
        i++;
        if (i < str.length) result += str[i];
      } else if (ch === stringChar) {
        insideString = false;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      insideString = true;
      stringChar = ch;
      result += ch;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < str.length && str[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < str.length - 1 && !(str[i] === '*' && str[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    result += ch;
    i++;
  }
  return result;
}

function readSettings(filePath) {
  if (!fs.existsSync(filePath)) return {};
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const cleaned = stripJsonComments(content).trim();
  if (!cleaned) return {};
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse settings at ${filePath}: ${err.message}`);
  }
}

function writeSettingsAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const rand = crypto.randomBytes(6).toString('hex');
  let tmpFile = `${filePath}.tmp.${process.pid}.${rand}`;
  const json = JSON.stringify(data, null, 2) + '\n';
  try {
    fs.writeFileSync(tmpFile, json, 'utf8');
    fs.renameSync(tmpFile, filePath);
    tmpFile = null;
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile); } catch (e) {}
    }
  }
}

function auditTurboSettings(options = {}) {
  const filePath = options.settingsPath || getSettingsPath();
  const current = readSettings(filePath);
  const diff = [];
  let isCompliant = true;

  for (const [key, presetVal] of Object.entries(TURBO_PRESET)) {
    const curVal = current[key];
    if (typeof presetVal === 'object' && presetVal !== null) {
      const curObj = (typeof curVal === 'object' && curVal !== null) ? curVal : {};
      const missingKeys = Object.keys(presetVal).filter(k => curObj[k] !== presetVal[k]);
      if (missingKeys.length > 0) {
        isCompliant = false;
        diff.push({ key, current: curObj, recommended: presetVal, missing: missingKeys });
      }
    } else {
      if (curVal !== presetVal) {
        isCompliant = false;
        diff.push({ key, current: curVal, recommended: presetVal });
      }
    }
  }

  return { filePath, isCompliant, diff, preset: TURBO_PRESET };
}

function applyTurboPreset(options = {}) {
  const filePath = options.settingsPath || getSettingsPath();
  const dryRun = Boolean(options.dryRun);
  const current = readSettings(filePath);
  const updated = { ...current };

  for (const [key, presetVal] of Object.entries(TURBO_PRESET)) {
    if (typeof presetVal === 'object' && presetVal !== null) {
      updated[key] = { ...(updated[key] || {}), ...presetVal };
    } else {
      updated[key] = presetVal;
    }
  }

  if (!dryRun) {
    writeSettingsAtomic(filePath, updated);
  }

  return {
    filePath,
    dryRun,
    appliedKeys: Object.keys(TURBO_PRESET),
    settings: updated
  };
}

module.exports = {
  TURBO_PRESET,
  getSettingsPath,
  readSettings,
  writeSettingsAtomic,
  auditTurboSettings,
  applyTurboPreset
};
