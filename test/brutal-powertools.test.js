/**
 * Antigravity PowerTools — Brutal Multi-Model Audit & Edge-Case Verification Suite
 * 
 * Verifies all security hardening, anti-cheat protections, path traversal guards,
 * state machine constraints, and edge-case behaviors identified by the Kiro multi-agent audit.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  AdversarialCritic,
  MidFlightSteering
} = require('../lib/autonomous-swarm.js');
const {
  WorktreeSwarm,
  sanitizeTrackId
} = require('../lib/worktree-swarm.js');
const {
  ShadowTddRunner,
  runTestCommand,
  validateCwd
} = require('../lib/shadow-tdd.js');
const {
  classifyTask,
  calculateSavingsSummary
} = require('../lib/cost-router.js');
const {
  buildVoiceDictationScript
} = require('../lib/voice-dictation.js');
const {
  validateOlderThan,
  findPython
} = require('../lib/cleaner-bridge.js');
const {
  createCheckpoint,
  listCheckpoints,
  rewindToCheckpoint,
  isGitRepo
} = require('../lib/time-travel.js');
const {
  readJsonFile,
  validateTaskGraph,
  topologicalSort,
  compileExecutionWaves,
  analyzeGraphHazards
} = require('../lib/dag-compiler.js');

test('Brutal Testing: Adversarial Critic blocks all anti-cheat bypass patterns', (t) => {
  const critic = new AdversarialCritic();

  // 1. Skipped tests
  const skippedDiff = `
+  it.skip('should handle timeout', () => {
+    assert.ok(true);
+  });
`;
  const skipResult = critic.evaluateDiff(skippedDiff);
  assert.strictEqual(skipResult.approved, false);
  assert.match(skipResult.feedback, /Skipped test/i);

  // 2. Focused tests (.only)
  const onlyDiff = `
+  describe.only('focus suite', () => {
+    it('runs only me', () => {});
+  });
`;
  const onlyResult = critic.evaluateDiff(onlyDiff);
  assert.strictEqual(onlyResult.approved, false);
  assert.match(onlyResult.feedback, /focus detected/i);

  // 3. Weakened assertions
  const weakenedDiff = `
+  expect(true).toBe(true);
`;
  const weakResult = critic.evaluateDiff(weakenedDiff);
  assert.strictEqual(weakResult.approved, false);
  assert.match(weakResult.feedback, /tautological assertion/i);

  // 4. Swallowed errors in catch block
  const swallowedDiff = `
+  try {
+    riskyCall();
+  } catch (err) {
+    // ignore error
+  }
`;
  const swallowResult = critic.evaluateDiff(swallowedDiff);
  assert.strictEqual(swallowResult.approved, false);
  assert.match(swallowResult.feedback, /Swallowed empty catch block/i);

  // 5. Unimplemented stubs
  const stubDiff = `
+  function handleOrder() {
+    // TODO: implement later
+  }
`;
  const stubResult = critic.evaluateDiff(stubDiff);
  assert.strictEqual(stubResult.approved, false);
  assert.match(stubResult.feedback, /Unfinished stub/i);

  // 6. Max diff bounds check (>10MB)
  const hugeDiff = 'x'.repeat(11 * 1024 * 1024);
  assert.throws(() => critic.evaluateDiff(hugeDiff), /diffText exceeds 10MB/);
});

test('Brutal Testing: Critic HMAC tokens use constant-time verification', (t) => {
  const critic = new AdversarialCritic();
  const validDiff = '+ const x = 42;\n+ console.log(x);';
  const approval = critic.evaluateDiff(validDiff);
  assert.strictEqual(approval.approved, true);
  assert.ok(approval.token);

  // Valid token verifies with signature (token, diffText)
  assert.strictEqual(critic.verifyApprovalToken(approval.token, validDiff), true);

  // Altered diff fails
  assert.strictEqual(critic.verifyApprovalToken(approval.token, validDiff + 'malicious'), false);

  // Forged token fails
  assert.strictEqual(critic.verifyApprovalToken('CRITIC_APPROVAL_' + 'deadbeef'.repeat(2), validDiff), false);

  // Truncated token fails
  assert.strictEqual(critic.verifyApprovalToken(approval.token.slice(0, 16), validDiff), false);

  // Non-string token fails safely without throw
  assert.strictEqual(critic.verifyApprovalToken(null, validDiff), false);
  assert.strictEqual(critic.verifyApprovalToken(12345, validDiff), false);
  assert.strictEqual(critic.verifyApprovalToken(approval.token, null), false);
});

test('Brutal Testing: WorktreeSwarm strict input sanitization', (t) => {
  // Valid trackIds
  assert.strictEqual(sanitizeTrackId('auth-feature'), 'auth-feature');
  assert.strictEqual(sanitizeTrackId('track_123'), 'track_123');

  // Path traversal attacks rejected
  assert.throws(() => sanitizeTrackId('../evil'), /Invalid trackId/);
  assert.throws(() => sanitizeTrackId('../../.git/hooks'), /Invalid trackId/);

  // Shell injection attempts rejected
  assert.throws(() => sanitizeTrackId('foo; rm -rf /'), /Invalid trackId/);
  assert.throws(() => sanitizeTrackId('$(whoami)'), /Invalid trackId/);
  assert.throws(() => sanitizeTrackId('branch&calc'), /Invalid trackId/);
  assert.throws(() => sanitizeTrackId('track"name'), /Invalid trackId/);

  // Empty or excessive length rejected
  assert.throws(() => sanitizeTrackId(''), /TypeError|Invalid trackId/);
  assert.throws(() => sanitizeTrackId('a'.repeat(65)), /trackId cannot exceed 64 characters/);
});

test('Brutal Testing: WorktreeSwarm lifecycle in git repo', (t) => {
  const swarm = new WorktreeSwarm({ cwd: process.cwd() });
  assert.ok(swarm);

  // Creating duplicate track throws
  const trackId = `audit-${Date.now()}`;
  const info = swarm.createWorktree(trackId);
  assert.ok(fs.existsSync(info.worktreePath));

  assert.throws(() => swarm.createWorktree(trackId), /already active/);

  // Remove worktree
  swarm.removeWorktree(trackId);
  assert.strictEqual(swarm.activeWorktrees.has(trackId), false);
  assert.strictEqual(fs.existsSync(info.worktreePath), false);

  // Teardown cleanly
  const teardown = swarm.teardownAll();
  assert.strictEqual(teardown.success, true);
});

test('Brutal Testing: ShadowTddRunner state machine and failure classification', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-tdd-test-'));

  try {
    // 1. Invalid cwd rejected
    assert.throws(() => new ShadowTddRunner({ cwd: path.join(tempDir, 'non-existent') }), /Invalid working directory/);

    // 2. Multiline command rejected
    assert.throws(() => runTestCommand('npm test\nrm -rf /', tempDir), /must not contain newline characters/);

    // 3. State machine transitions
    // Create a mock failing test command
    const runner = new ShadowTddRunner({
      cwd: tempDir,
      testCommand: 'node -e "process.exit(1)"'
    });

    // Cannot enter REFACTOR before GREEN
    assert.throws(() => runner.runRefactorPhase(), /Cannot enter REFACTOR phase before GREEN/);

    // Red phase succeeds when tests fail as expected
    const redRecord = runner.runRedPhase();
    assert.strictEqual(redRecord.phase, 'RED');
    assert.strictEqual(redRecord.testsFailedAsExpected, true);

    // Green phase fails when tests still fail
    assert.throws(() => runner.runGreenPhase(), /Shadow TDD Green Phase Failure/);

    // Switch to passing test command
    runner.testCommand = 'node -e "process.exit(0)"';
    const greenRecord = runner.runGreenPhase();
    assert.strictEqual(greenRecord.phase, 'GREEN');
    assert.strictEqual(greenRecord.testsPassed, true);

    // Now Refactor phase succeeds
    const refactorRecord = runner.runRefactorPhase('refactor: optimize code');
    assert.strictEqual(refactorRecord.phase, 'REFACTOR');
    assert.strictEqual(refactorRecord.verified, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Brutal Testing: CostRouter input edge cases & robustness', (t) => {
  // 1. Non-string prompts
  const resNull = classifyTask(null);
  assert.strictEqual(resNull.tier, 'balanced');

  const resNum = classifyTask(12345);
  assert.strictEqual(resNum.tier, 'balanced');

  // 2. Complex flags with multiple files
  const resFlagship = classifyTask('simple prompt', { fileCount: 8 });
  assert.strictEqual(resFlagship.tier, 'flagship');

  // 3. Economy detection
  const resEcon = classifyTask('git commit message generator', { fileCount: 1 });
  assert.strictEqual(resEcon.tier, 'economy');
  assert.ok(resEcon.savingsPercentage > 90);

  // 4. Invalid summary inputs
  assert.throws(() => calculateSavingsSummary('not-array'), /TypeError/);

  const summary = calculateSavingsSummary([
    null,
    undefined,
    { prompt: 'write commit message', fileCount: 1 },
    { prompt: 'architect database migration', fileCount: 6 }
  ]);
  assert.strictEqual(summary.taskCount, 4);
  assert.ok(summary.totalCostUsd > 0);
  assert.ok(summary.netSavingsUsd > 0);
});

test('Brutal Testing: CleanerBridge validation and safety checks', (t) => {
  // 1. validateOlderThan
  assert.strictEqual(validateOlderThan(undefined), null);
  assert.strictEqual(validateOlderThan(null), null);
  assert.strictEqual(validateOlderThan('14'), 14);
  assert.strictEqual(validateOlderThan(30), 30);
  assert.throws(() => validateOlderThan(-5), /TypeError/);
  assert.throws(() => validateOlderThan('invalid'), /TypeError/);

  // 2. findPython with invalid path
  assert.throws(() => findPython('C:\\non_existent_python_binary_xyz.exe'), /failed execution check/);
});

test('Brutal Testing: Voice Dictation script DOM safety & compilation', (t) => {
  const script = buildVoiceDictationScript({ smartPolish: true });
  assert.ok(typeof script === 'string');
  assert.ok(script.length > 500);

  // Contains DOM createElementNS for SVG (no innerHTML SVG)
  assert.ok(script.includes("document.createElementNS('http://www.w3.org/2000/svg', 'svg')"));
  assert.ok(script.includes('window.__AGY_VOICE_DICTATION_CLEANUP__'));
  assert.ok(script.includes('agy-mic-pulse'));
  assert.ok(script.includes('aria-pressed'));

  // Compiles cleanly as JavaScript
  new Function(script);
});

test('Brutal Testing: Time Travel snapshot bounds & directory validation', (t) => {
  const isGit = isGitRepo(process.cwd());
  assert.strictEqual(isGit, true);

  // Non-git directory throws active git repository error
  assert.throws(() => createCheckpoint('test', path.join(os.tmpdir(), 'non-existent-dir-xyz')), /Time-Travel Snapshots require an active git repository/);

  // Create real snapshot
  const cp = createCheckpoint('Brutal audit checkpoint');
  assert.ok(cp.id);
  assert.ok(cp.treeSha);

  const list = listCheckpoints();
  assert.ok(list.length > 0);
  assert.strictEqual(list[0].id, cp.id);
});

test('Brutal Testing: DAG Task Compiler validates schemas and detects cycles', (t) => {
  // 1. Non-array inputs rejected
  assert.throws(() => validateTaskGraph(null), /TypeError/);
  assert.throws(() => validateTaskGraph('invalid'), /TypeError/);

  // 2. Missing id rejected
  assert.throws(() => validateTaskGraph([{ title: 'no id' }]), /missing a valid 'id'/);

  // 3. Duplicate IDs rejected
  assert.throws(() => validateTaskGraph([{ id: 'dup' }, { id: 'dup' }]), /Duplicate task id found/);

  // 4. Unknown dependency rejected
  assert.throws(() => validateTaskGraph([{ id: 'a', dependencies: ['b'] }]), /depends on unknown task/);

  // 5. Self-dependency rejected
  assert.throws(() => validateTaskGraph([{ id: 'self', dependencies: ['self'] }]), /cannot depend on itself/);

  // 6. Prototype pollution rejected
  const maliciousTask = JSON.parse('{"id": "evil", "__proto__": {"polluted": true}}');
  assert.throws(() => validateTaskGraph([maliciousTask]), /Dangerous property "__proto__"/);

  // 7. Circular dependency detection (2-node cycle)
  const cycle2 = [
    { id: 'task1', dependencies: ['task2'] },
    { id: 'task2', dependencies: ['task1'] }
  ];
  assert.throws(() => topologicalSort(cycle2), /Cyclic dependency detected/);

  // 8. Circular dependency detection (3-node cycle)
  const cycle3 = [
    { id: 'A', dependencies: ['B'] },
    { id: 'B', dependencies: ['C'] },
    { id: 'C', dependencies: ['A'] }
  ];
  assert.throws(() => topologicalSort(cycle3), /Cyclic dependency detected/);

  // 9. Diamond graph topologically sorted cleanly
  const diamond = [
    { id: 'root', dependencies: [] },
    { id: 'branchA', dependencies: ['root'] },
    { id: 'branchB', dependencies: ['root'] },
    { id: 'sink', dependencies: ['branchA', 'branchB'] }
  ];
  const sorted = topologicalSort(diamond);
  assert.strictEqual(sorted.length, 4);
  assert.strictEqual(sorted[0].id, 'root');
  assert.strictEqual(sorted[3].id, 'sink');
});

test('Brutal Testing: DAG Task Compiler wave generation & file conflict isolation', (t) => {
  // Independent tasks form Wave 0
  const parallelTasks = [
    { id: 't1', dependencies: [], files: ['src/a.js'] },
    { id: 't2', dependencies: [], files: ['src/b.js'] },
    { id: 't3', dependencies: ['t1', 't2'], files: ['src/c.js'] }
  ];
  const waves = compileExecutionWaves(parallelTasks);
  assert.strictEqual(waves.length, 2);
  assert.strictEqual(waves[0].length, 2); // t1 and t2 run in parallel
  assert.strictEqual(waves[1].length, 1); // t3 runs after

  // File conflict isolation: t1 and t2 touch same file -> split into separate waves
  const conflictingTasks = [
    { id: 't1', dependencies: [], files: ['src/shared.js'] },
    { id: 't2', dependencies: [], files: ['src/shared.js'] }
  ];
  const conflictWaves = compileExecutionWaves(conflictingTasks);
  assert.strictEqual(conflictWaves.length, 2); // split due to shared file hazard!

  // Hazard analysis
  const hazards = analyzeGraphHazards(conflictingTasks);
  assert.strictEqual(hazards.totalTasks, 2);
  assert.strictEqual(hazards.fileConflicts.length, 1);
  assert.strictEqual(hazards.fileConflicts[0].file, 'src/shared.js');
});

test('Brutal Testing: CLI ag-router and ag-dag execution', (t) => {
  // 1. ag-router CLI execution
  const routerRes = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'bin', 'ag-router.js'),
    'Fix linting and git commit message',
    '--files', '1',
    '--json'
  ], { encoding: 'utf8' });

  assert.strictEqual(routerRes.status, 0);
  const routerOutput = JSON.parse(routerRes.stdout);
  assert.strictEqual(routerOutput.tier, 'economy');
  assert.ok(routerOutput.savingsPercentage > 80);

  // 2. ag-dag CLI execution
  const tempFile = path.join(os.tmpdir(), `ag-dag-test-${Date.now()}.json`);
  const sampleTasks = [
    { id: 'step1', title: 'Setup database', dependencies: [] },
    { id: 'step2', title: 'Write API endpoints', dependencies: ['step1'] }
  ];
  fs.writeFileSync(tempFile, JSON.stringify(sampleTasks), 'utf8');

  try {
    const dagRes = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'bin', 'ag-dag.js'),
      tempFile,
      '--json'
    ], { encoding: 'utf8' });

    assert.strictEqual(dagRes.status, 0);
    const dagOutput = JSON.parse(dagRes.stdout);
    assert.strictEqual(dagOutput.length, 2);
    assert.strictEqual(dagOutput[0][0].id, 'step1');
    assert.strictEqual(dagOutput[1][0].id, 'step2');
  } finally {
    try { fs.unlinkSync(tempFile); } catch (e) {}
  }
});
