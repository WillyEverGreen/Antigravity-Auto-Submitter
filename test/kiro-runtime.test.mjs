// Run:  node --test test/kiro-runtime.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Blackboard, BlackboardTimeoutError, BlackboardValidationError, BlackboardAbortError } from '../kiro-agent/blackboard.mjs';
import { DagScheduler, DagError, buildGraph, topoLayers } from '../kiro-agent/dag-scheduler.mjs';
import { A2ABus, BusLimitError } from '../kiro-agent/a2a-bus.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Blackboard ----------
test('waitFor resolves when value is set later', async () => {
  const bb = new Blackboard();
  const p = bb.waitFor('x', { timeoutMs: 500 });
  bb.set('x', 42);
  assert.equal(await p, 42);
});

test('waitFor resolves immediately for existing value (no lost wakeup)', async () => {
  const bb = new Blackboard();
  bb.set('x', 'early');
  assert.equal(await bb.waitFor('x', { timeoutMs: 100 }), 'early');
});

test('many waiters on one key all resolve', async () => {
  const bb = new Blackboard();
  const ps = Array.from({ length: 50 }, () => bb.waitFor('k', { timeoutMs: 500 }));
  bb.set('k', 'v');
  assert.deepEqual(await Promise.all(ps), Array(50).fill('v'));
});

test('waitFor times out', async () => {
  const bb = new Blackboard();
  await assert.rejects(bb.waitFor('nope', { timeoutMs: 30 }), BlackboardTimeoutError);
});

test('waitFor honours AbortSignal', async () => {
  const bb = new Blackboard();
  const ac = new AbortController();
  const p = bb.waitFor('nope', { timeoutMs: 1000, signal: ac.signal });
  ac.abort();
  await assert.rejects(p, BlackboardAbortError);
});

test('TTL expires entries', async () => {
  const bb = new Blackboard();
  bb.set('t', 1, { ttlMs: 30 });
  assert.equal(bb.get('t'), 1);
  await wait(60);
  assert.equal(bb.get('t'), undefined);
  assert.equal(bb.has('t'), false);
});

test('schema validation rejects bad writes and accepts good ones', () => {
  const bb = new Blackboard();
  bb.defineSchema('schema:*', { type: 'object', required: ['tables'], properties: { tables: { type: 'array', items: { type: 'string' } } } });
  assert.throws(() => bb.set('schema:auth', { tables: [1] }), BlackboardValidationError);
  assert.throws(() => bb.set('schema:auth', {}), BlackboardValidationError);
  assert.equal(bb.set('schema:auth', { tables: ['users'] }).ok, true);
});

test('optimistic version check prevents lost update', () => {
  const bb = new Blackboard();
  bb.set('c', 1);
  const v = bb.meta('c').version;
  assert.equal(bb.set('c', 2, { ifVersion: v }).ok, true);
  assert.equal(bb.set('c', 3, { ifVersion: v }).ok, false);
  assert.equal(bb.get('c'), 2);
});

test('close() rejects pending waiters and does not leak timers', async () => {
  const bb = new Blackboard();
  const p = bb.waitFor('z', { timeoutMs: 60_000 });
  bb.close();
  await assert.rejects(p, BlackboardAbortError);
});

// ---------- DAG ----------
test('cycle detection reports the cycle', () => {
  const tasks = [{ id: 'a', dependsOn: ['c'] }, { id: 'b', dependsOn: ['a'] }, { id: 'c', dependsOn: ['b'] }];
  assert.throws(() => buildGraph(tasks), (e) => e instanceof DagError && /cycle/.test(e.message) && e.details.cycle.length === 4);
});

test('unknown dependency and self-dependency are rejected', () => {
  assert.throws(() => buildGraph([{ id: 'a', dependsOn: ['ghost'] }]), /unknown/);
  assert.throws(() => buildGraph([{ id: 'a', dependsOn: ['a'] }]), DagError);
});

test('topoLayers groups by depth', () => {
  const layers = topoLayers([
    { id: 'db' }, { id: 'api', dependsOn: ['db'] }, { id: 'ui', dependsOn: ['api'] }, { id: 'docs' },
  ]);
  assert.deepEqual(layers.map((l) => l.sort()), [['db', 'docs'], ['api'], ['ui']]);
});

test('runs in dependency order and never exceeds concurrency', async () => {
  const order = [];
  let live = 0, peak = 0;
  const tasks = [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' },
    { id: 'e', dependsOn: ['a', 'b', 'c', 'd'] },
  ];
  const s = new DagScheduler({ concurrency: 2 });
  const res = await s.run(tasks, async (t) => {
    live++; peak = Math.max(peak, live);
    await wait(15);
    live--; order.push(t.id);
    return t.id.toUpperCase();
  });
  assert.equal(res.ok, true);
  assert.equal(peak, 2);
  assert.equal(order.at(-1), 'e');
});

test('downstream receives upstream results and blackboard gets result:<id>', async () => {
  const bb = new Blackboard();
  const s = new DagScheduler({ concurrency: 3 });
  const res = await s.run(
    [{ id: 'schema' }, { id: 'routes', dependsOn: ['schema'] }],
    async (t, ctx) => (t.id === 'schema' ? { tables: ['users'] } : { usedTables: ctx.inputs.schema.tables }),
    { bb });
  assert.deepEqual(res.results.routes, { usedTables: ['users'] });
  assert.deepEqual(bb.get('result:schema'), { tables: ['users'] });
});

test('failure skips only the dependent branch, independent branch finishes', async () => {
  const s = new DagScheduler({ concurrency: 4 });
  const res = await s.run(
    [{ id: 'bad' }, { id: 'child', dependsOn: ['bad'] }, { id: 'grandchild', dependsOn: ['child'] }, { id: 'indep' }],
    async (t) => { if (t.id === 'bad') throw new Error('boom'); return 'ok'; });
  assert.deepEqual(res.failed, ['bad']);
  assert.deepEqual(res.skipped.sort(), ['child', 'grandchild']);
  assert.deepEqual(res.done, ['indep']);
  assert.equal(res.ok, false);
});

test('retry escalates model instead of repeating the same call', async () => {
  const seen = [];
  const s = new DagScheduler({ backoffMs: 1 });
  const res = await s.run(
    [{ id: 't', model: 'haiku', escalate: ['sonnet'], ['retries']: 1 }],
    async (t, ctx) => { seen.push(ctx.model); if (ctx.attempt === 1) throw new Error('weak'); return 'fixed'; });
  assert.deepEqual(seen, ['haiku', 'sonnet']);
  assert.equal(res.ok, true);
});

test('verification failure triggers the same cascade', async () => {
  const s = new DagScheduler({ verify: async (t, r) => (r === 'bad-syntax' ? 'syntax error' : true), backoffMs: 1 });
  const res = await s.run(
    [{ id: 'gen' }, { id: 'use', dependsOn: ['gen'] }],
    async () => 'bad-syntax');
  assert.deepEqual(res.failed, ['gen']);
  assert.deepEqual(res.skipped, ['use']);
  assert.match(res.errors.gen, /verification failed: syntax error/);
});

test('repair policy rescues a failed node and unblocks dependents', async () => {
  const s = new DagScheduler({ repair: async () => 'patched', backoffMs: 1 });
  const res = await s.run(
    [{ id: 'x', onFailure: 'repair' }, { id: 'y', dependsOn: ['x'] }],
    async (t, ctx) => { if (t.id === 'x') throw new Error('nope'); return `y saw ${ctx.inputs.x}`; });
  assert.equal(res.ok, true);
  assert.equal(res.results.y, 'y saw patched');
});

test('continue policy lets dependents run after an advisory failure', async () => {
  const s = new DagScheduler({});
  const res = await s.run(
    [{ id: 'lint', onFailure: 'continue' }, { id: 'build', dependsOn: ['lint'] }],
    async (t) => { if (t.id === 'lint') throw new Error('style'); return 'built'; });
  assert.deepEqual(res.done, ['build']);
  assert.deepEqual(res.failed, ['lint']);
});

test('abort policy stops scheduling new work', async () => {
  const s = new DagScheduler({ concurrency: 1 });
  const res = await s.run(
    [{ id: 'a', onFailure: 'abort' }, { id: 'b' }, { id: 'c' }],
    async (t) => { if (t.id === 'a') throw new Error('fatal'); return 'ok'; });
  assert.deepEqual(res.failed, ['a']);
  assert.deepEqual(res.skipped.sort(), ['b', 'c']);
});

// ---------- A2A bus ----------
test('bus answers from blackboard first (zero responder calls)', async () => {
  const bb = new Blackboard(); bb.set('db:pool', 'pool');
  const bus = new A2ABus(bb);
  const r = await bus.ask('routes', { question: 'export name of DB pool?', bbKeys: ['db:pool'] });
  assert.equal(r.answer, 'pool');
  assert.equal(bus.stats().responderCalls, 0);
});

test('bus routes to responder, caches, and clips long answers', async () => {
  const bus = new A2ABus(new Blackboard(), { maxAnswerChars: 10 });
  let calls = 0;
  bus.registerResponder('orchestrator', ['*'], async () => { calls++; return 'x'.repeat(100); });
  const a = await bus.ask('w1', { question: 'What is X?' });
  const b = await bus.ask('w2', { question: 'what is   x?' });   // normalised duplicate
  assert.equal(a.answer.length, 10);
  assert.equal(b.source, 'cache');
  assert.equal(calls, 1);
});

test('per-agent budget stops runaway asking', async () => {
  const bus = new A2ABus(new Blackboard(), { maxQuestionsPerAgent: 2, maxQuestionsPerPair: 99 });
  bus.registerResponder('o', ['*'], async ({ question }) => `re:${question}`);
  await bus.ask('w', { question: 'q1' });
  await bus.ask('w', { question: 'q2' });
  await assert.rejects(bus.ask('w', { question: 'q3' }), (e) => e instanceof BusLimitError && e.code === 'agent-budget');
});

test('ping-pong between two agents is cut off by the pair budget', async () => {
  const bb = new Blackboard();
  const bus = new A2ABus(bb, { maxQuestionsPerPair: 2, maxQuestionsPerAgent: 99, maxMessagesPerThread: 99 });
  // each peer answers by asking the other — the classic runaway loop
  bus.registerResponder('A', ['a'], async ({ question, thread, hop }) => (await bus.ask('A', { question: `ctr:${question}`, topic: 'b', thread, hop: hop + 1 })).answer);
  bus.registerResponder('B', ['b'], async ({ question, thread, hop }) => (await bus.ask('B', { question: `ctr:${question}`, topic: 'a', thread, hop: hop + 1 })).answer);
  await assert.rejects(bus.ask('orch', { question: 'start', topic: 'a' }), BusLimitError);
  assert.ok(bus.stats().responderCalls <= 6, `too many calls: ${bus.stats().responderCalls}`);
});

test('hop limit rejects deep chains', async () => {
  const bus = new A2ABus(new Blackboard(), { maxHops: 1 });
  bus.registerResponder('o', ['*'], async () => 'x');
  await assert.rejects(bus.ask('w', { question: 'q', hop: 2 }), (e) => e.code === 'hops');
});

test('no responder and timeouts surface as typed errors', async () => {
  const bus = new A2ABus(new Blackboard(), { answerTimeoutMs: 20 });
  await assert.rejects(bus.ask('w', { question: 'q', topic: 'zzz' }), (e) => e.code === 'no-responder');
  bus.registerResponder('slow', ['*'], () => new Promise(() => {}));
  await assert.rejects(bus.ask('w', { question: 'q2' }), (e) => e.code === 'unanswered');
});

// ---------- end-to-end ----------
test('end-to-end: DAG + blackboard + bus', async () => {
  const bb = new Blackboard();
  const bus = new A2ABus(bb);
  bus.registerResponder('orchestrator', ['*'], async () => 'use named export `pool` from db.mjs');
  const s = new DagScheduler({ concurrency: 3 });
  const res = await s.run(
    [{ id: 'schema' }, { id: 'routes', dependsOn: ['schema'] }, { id: 'tests', dependsOn: ['schema'] }],
    async (t, ctx) => {
      if (t.id === 'schema') return { tables: ['users'] };
      const hint = await bus.ask(t.id, { question: 'DB pool export name?', bbKeys: ['pool-name'] });
      return `${t.id}:${ctx.inputs.schema.tables[0]}:${hint.source}`;
    }, { bb });
  assert.equal(res.ok, true);
  assert.equal(bus.stats().responderCalls, 1);   // second asker hit the cache
});

