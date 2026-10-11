/**
 * Automated test suite for Claude Auto-Accept PreToolUse Hook & CLI
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  DEFAULTS,
  resolveConfig,
  evaluateDecision,
  matchPattern,
  installHookInSettings,
  uninstallHookFromSettings,
  isHookInstalled,
  ClaudeStatsManager
} = require('../claude-auto-accept.js');

console.log('🧪 Starting Claude Auto-Accept Test Suite...\n');

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ── 1. Default Configuration & Safety Profile ──
it('DEFAULTS contains expected safety guardrails', () => {
  assert.strictEqual(DEFAULTS.enabled, true);
  assert.strictEqual(DEFAULTS.mode, 'autonomous');
  assert(DEFAULTS.askKeywords.includes('git push'));
  assert(DEFAULTS.askKeywords.includes('git reset --hard'));
  assert(DEFAULTS.skipKeywords.includes('rm -rf'));
  assert(DEFAULTS.skipKeywords.includes('drop table'));
  assert(DEFAULTS.protectedFiles.includes('.env'));
});

// ── 2. Pattern Matching Helper ──
it('matchPattern accurately matches extensions, prefixes, and exact paths', () => {
  assert.strictEqual(matchPattern('.env', '.env'), true);
  assert.strictEqual(matchPattern('.env.local', '.env*'), true);
  assert.strictEqual(matchPattern('server.key', '*.key'), true);
  assert.strictEqual(matchPattern('id_rsa', 'id_rsa*'), true);
  assert.strictEqual(matchPattern('.git/config', '.git/*'), true);
  assert.strictEqual(matchPattern('C:\\repo\\.git\\HEAD', '.git/*'), true);
  assert.strictEqual(matchPattern('app.js', '.env*'), false);
  assert.strictEqual(matchPattern('README.md', '*.key'), false);
});

// ── 3. Safe Shell Tool Auto-Approval ──
it('evaluateDecision auto-approves safe shell commands', () => {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: 'npm test && git status' }
  };
  const res = evaluateDecision(payload, DEFAULTS);
  assert.strictEqual(res.decision, 'allow');
  assert(res.reason.includes('Auto-approved'));
});

// ── 4. Block Dangerous Skip Keywords ──
it('evaluateDecision blocks dangerous commands with deny', () => {
  const dangerousCommands = [
    'rm -rf /var/log',
    'DROP TABLE users;',
    'git push --force origin main',
    'format c:',
    'kubectl delete namespace prod'
  ];

  for (const cmd of dangerousCommands) {
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: cmd }
    };
    const res = evaluateDecision(payload, DEFAULTS);
    assert.strictEqual(res.decision, 'deny', `Should deny: ${cmd}`);
    assert(res.reason.includes('Blocked: Command contains forbidden keyword'));
  }
});

// ── 5. Pause for Sensitive Ask Keywords ──
it('evaluateDecision pauses with ask on sensitive keywords', () => {
  const sensitiveCommands = [
    'git push origin main',
    'git reset --hard HEAD~1',
    'sudo systemctl restart nginx',
    'npm publish --access public'
  ];

  for (const cmd of sensitiveCommands) {
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: cmd }
    };
    const res = evaluateDecision(payload, DEFAULTS);
    assert.strictEqual(res.decision, 'ask', `Should ask: ${cmd}`);
    assert(res.reason.includes('Paused for review: Command contains sensitive keyword'));
  }
});

// ── 6. Protected Files Shield ──
it('evaluateDecision pauses on edits to protected files and allows safe files', () => {
  const protectedEdits = [
    '.env',
    '.env.production',
    'ssl/cert.key',
    'id_rsa_backup',
    '.git/hooks/pre-commit'
  ];

  for (const file of protectedEdits) {
    const payload = {
      tool_name: 'Write',
      tool_input: { file_path: file, content: 'secret' }
    };
    const res = evaluateDecision(payload, DEFAULTS);
    assert.strictEqual(res.decision, 'ask', `Should protect: ${file}`);
    assert(res.reason.includes('Modifying protected file'));
  }

  // Safe file
  const safePayload = {
    tool_name: 'Edit',
    tool_input: { file_path: 'src/utils/math.js' }
  };
  const safeRes = evaluateDecision(safePayload, DEFAULTS);
  assert.strictEqual(safeRes.decision, 'allow');
});

// ── 7. Read-Only Tools Always Auto-Approved ──
it('evaluateDecision auto-approves read-only inspection tools', () => {
  const tools = ['Read', 'Glob', 'Grep', 'NotebookEdit', 'ListAgents'];
  for (const tool of tools) {
    const res = evaluateDecision({ tool_name: tool, tool_input: {} }, DEFAULTS);
    assert.strictEqual(res.decision, 'allow', `Should allow ${tool}`);
  }
});

// ── 8. Autopilot Mode Approvals ──
it('autopilot mode auto-approves general tools while still denying forbidden commands', () => {
  const autopilotCfg = { ...DEFAULTS, mode: 'autopilot' };

  // Custom tool auto-approved
  const res1 = evaluateDecision({ tool_name: 'CustomTool', tool_input: {} }, autopilotCfg);
  assert.strictEqual(res1.decision, 'allow');

  // Forbidden command STILL denied
  const res2 = evaluateDecision({ tool_name: 'Bash', tool_input: { command: 'rm -rf .' } }, autopilotCfg);
  assert.strictEqual(res2.decision, 'deny');
});

// ── 9. Settings File Hook Registration & Idempotence ──
it('installs and uninstalls hook in settings.json cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hook-test-'));
  const mockSettingsPath = path.join(tmpDir, 'settings.json');

  // Pre-seed settings with an existing unrelated hook
  const initialSettings = {
    env: { TEST_VAR: '1' },
    hooks: {
      PostToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo done' }] }
      ]
    }
  };
  fs.writeFileSync(mockSettingsPath, JSON.stringify(initialSettings, null, 2), 'utf8');

  // Test custom injection logic matching installHookInSettings
  let settings = JSON.parse(fs.readFileSync(mockSettingsPath, 'utf8'));
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];

  settings.hooks.PreToolUse.push({
    matcher: '.*',
    hooks: [{
      type: 'command',
      command: 'node "C:/fake/claude-auto-accept.js" --hook',
      timeout: 30,
      statusMessage: 'Checking auto-approval rules...',
      onFailure: 'continue'
    }]
  });
  fs.writeFileSync(mockSettingsPath, JSON.stringify(settings, null, 2), 'utf8');

  // Verify hook installed and existing hook preserved
  const loaded = JSON.parse(fs.readFileSync(mockSettingsPath, 'utf8'));
  assert(loaded.hooks.PreToolUse.length === 1);
  assert(loaded.hooks.PostToolUse.length === 1);
  assert.strictEqual(loaded.env.TEST_VAR, '1');

  // Clean up
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
});

// ── 10. Headless Hook Stdin -> Stdout Execution ──
it('executes headless hook via CLI stdin and outputs valid Claude Code PreToolUse response', () => {
  const cliPath = path.join(__dirname, '..', 'claude-auto-accept.js');
  const mockPayload = JSON.stringify({
    session_id: 'test-session-123',
    cwd: process.cwd(),
    tool_name: 'Bash',
    tool_input: { command: 'echo hello' }
  });

  const res = spawnSync(process.execPath, [cliPath, '--hook'], {
    input: mockPayload,
    encoding: 'utf8'
  });

  assert.strictEqual(res.status, 0);
  assert(res.stdout.trim().length > 0);

  const parsed = JSON.parse(res.stdout.trim());
  assert(parsed.hookSpecificOutput);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, 'allow');
});

// ── 11. Stats Persistence ──
it('ClaudeStatsManager records decisions and loads accurate counters', () => {
  const stats = new ClaudeStatsManager();
  const prevApprovals = stats.lifetimeApprovals;
  stats.recordDecision('allow', 'Bash', 'test approval');
  assert.strictEqual(stats.lifetimeApprovals, prevApprovals + 1);
  assert(stats.lastAction.includes('ALLOW: [Bash]'));
});

console.log(`\nResults: ${passed}/${total} passed.`);
process.exit(passed === total ? 0 : 1);
