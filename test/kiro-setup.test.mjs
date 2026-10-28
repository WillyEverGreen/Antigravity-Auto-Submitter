import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertSwarmReady, executeSwarm, getStatus, KiroSetupError, MIN_SWARM_ACCOUNTS } from '../kiro-agent/kiro-core.mjs';

console.log('🧪 Starting Kiro Setup Guidance Test Suite...\n');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    process.exitCode = 1;
  }
}

function startFakeProxy(accounts) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ accounts, availableAccounts: accounts, stats: {} }));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected promise to reject');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-setup-'));
const closedPort = '59871';
process.env.KIRO_PROXY_HOST = '127.0.0.1';

await test('reports Account Manager missing when no store and proxy is down', async () => {
  process.env.KIRO_STORE_PATH = path.join(tmp, 'absent.json');
  process.env.KIRO_PROXY_PORT = closedPort;
  const err = await rejection(assertSwarmReady('kiro swarm'));
  assert.ok(err instanceof KiroSetupError);
  assert.strictEqual(err.code, 'ACCOUNT_MANAGER_MISSING');
  assert.match(err.message, /Install Kiro Account Manager/);
  assert.match(err.message, /kiro-auto-accept/);
});

await test('reports proxy offline when Account Manager store exists', async () => {
  const store = path.join(tmp, 'kiro-accounts.json');
  fs.writeFileSync(store, 'not-a-real-store');
  process.env.KIRO_STORE_PATH = store;
  process.env.KIRO_PROXY_PORT = closedPort;
  const err = await rejection(assertSwarmReady('kiro parallel'));
  assert.strictEqual(err.code, 'PROXY_OFFLINE');
  assert.match(err.message, /start its API proxy/);
});

await test('status flags a missing Account Manager', async () => {
  process.env.KIRO_STORE_PATH = path.join(tmp, 'absent.json');
  const status = await getStatus();
  assert.strictEqual(status.online, false);
  assert.strictEqual(status.accountManagerInstalled, false);
});

await test('swarm is refused with too few accounts', async () => {
  const server = await startFakeProxy(MIN_SWARM_ACCOUNTS - 1);
  process.env.KIRO_PROXY_PORT = String(server.address().port);
  try {
    const err = await rejection(executeSwarm({ prompt: 'hi' }));
    assert.strictEqual(err.code, 'ACCOUNTS_TOO_FEW');
    assert.match(err.message, new RegExp(`at least ${MIN_SWARM_ACCOUNTS}`));
  } finally {
    server.close();
  }
});

await test('gate passes with enough accounts', async () => {
  const server = await startFakeProxy(MIN_SWARM_ACCOUNTS);
  process.env.KIRO_PROXY_PORT = String(server.address().port);
  try {
    const status = await assertSwarmReady('kiro swarm');
    assert.strictEqual(status.online, true);
  } finally {
    server.close();
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nResults: ${passed}/${total} Kiro setup tests passed cleanly.\n`);
process.exit(process.exitCode || 0);
