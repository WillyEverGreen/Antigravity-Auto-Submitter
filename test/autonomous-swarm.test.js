/**
 * Automated test suite for Antigravity PowerTools Autonomous Swarm & Adversarial Loop
 * Tests: Adversarial Critic, Anti-Cheat Invariants, Live Steering, Shadow TDD.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

console.log('🧪 Starting Antigravity PowerTools Autonomous Swarm Test Suite...\n');

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
    process.exitCode = 1;
  }
}

const { AdversarialCritic, MidFlightSteering } = require('../lib/autonomous-swarm');
const { ShadowTddRunner } = require('../lib/shadow-tdd');

// ── 1. Adversarial Critic & Anti-Cheat Invariants ──
it('AdversarialCritic approves clean diffs and issues HMAC approval token', () => {
  const critic = new AdversarialCritic({ secret: 'test-secret' });
  const cleanDiff = `
diff --git a/src/calc.js b/src/calc.js
+function add(a, b) {
+  return a + b;
+}
`;
  const res = critic.evaluateDiff(cleanDiff);
  assert.strictEqual(res.approved, true);
  assert(res.token.startsWith('CRITIC_APPROVAL_'));
  assert.strictEqual(critic.verifyApprovalToken(res.token, cleanDiff), true);
  // Tampered diff must fail verification
  assert.strictEqual(critic.verifyApprovalToken(res.token, cleanDiff + '\n+malicious()'), false);
});

it('AdversarialCritic rejects skipped tests in diff', () => {
  const critic = new AdversarialCritic();
  const badDiff = `
diff --git a/test/math.test.js b/test/math.test.js
-test('should calculate taxes', () => {
+test.skip('should calculate taxes', () => {
`;
  const res = critic.evaluateDiff(badDiff);
  assert.strictEqual(res.approved, false);
  assert.strictEqual(res.token, null);
  assert(res.feedback.includes('Skipped test suite detected'));
});

it('AdversarialCritic rejects weakened assertions and swallowed errors', () => {
  const critic = new AdversarialCritic();
  const badDiff1 = `
+expect(true).toBe(true);
`;
  const res1 = critic.evaluateDiff(badDiff1);
  assert.strictEqual(res1.approved, false);
  assert(res1.feedback.includes('Trivial tautological assertion'));

  const badDiff2 = `
+try { doRisk(); } catch (e) {}
`;
  const res2 = critic.evaluateDiff(badDiff2);
  assert.strictEqual(res2.approved, false);
  assert(res2.feedback.includes('Swallowed empty catch block'));
});

// ── 2. Mid-Flight Live Steering ──
it('MidFlightSteering reads STEERING.md and archives it safely', () => {
  const tmpDir = path.join(os.tmpdir(), `test-steer-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const steering = new MidFlightSteering(tmpDir);
  assert.strictEqual(steering.hasSteering(), false);

  const steerFile = path.join(tmpDir, 'STEERING.md');
  fs.writeFileSync(steerFile, 'Switch to JWT bearer tokens in auth headers\n', 'utf8');
  assert.strictEqual(steering.hasSteering(), true);

  const steer = steering.readAndConsumeSteering();
  assert.strictEqual(steer.instruction, 'Switch to JWT bearer tokens in auth headers');
  assert.strictEqual(steering.hasSteering(), false);
  assert.strictEqual(fs.existsSync(path.join(tmpDir, '.STEERING.md.last')), true);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
});

// ── 3. Shadow TDD Pipeline ──
it('ShadowTddRunner rejects if Red phase tests pass prematurely', () => {
  // Pass node command that succeeds ('node -e "process.exit(0)"')
  const runner = new ShadowTddRunner({ testCommand: 'node -e "process.exit(0)"' });
  assert.throws(() => {
    runner.runRedPhase();
  }, /Shadow TDD Red Phase Violation/);
});

it('ShadowTddRunner validates Red and Green phases cleanly', () => {
  // Red phase: test fails
  const redRunner = new ShadowTddRunner({ testCommand: 'node -e "process.exit(1)"' });
  const redRecord = redRunner.runRedPhase();
  assert.strictEqual(redRecord.testsFailedAsExpected, true);

  // Green phase: test passes
  const greenRunner = new ShadowTddRunner({ testCommand: 'node -e "process.exit(0)"' });
  const greenRecord = greenRunner.runGreenPhase();
  assert.strictEqual(greenRecord.testsPassed, true);
});

console.log(`\nResults: ${passed}/${total} Autonomous swarm tests passed.`);
if (process.exitCode) process.exit(process.exitCode);

