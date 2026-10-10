import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { getProxyAuth, ROLE_PROMPTS } from '../kiro-agent/kiro-core.mjs';
import {
  generateRandomMachineId,
  applyAntiBanArmor,
  listAccounts,
  getProxyConfig,
  getAccountManagerSettings,
  getWebhooks,
  getProxyPoolConfig,
  getMachineIdConfig
} from '../kiro-agent/kiro-controller.mjs';

console.log('🧪 Starting Kiro Agent & MCP Subsystem Test Suite...\n');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    process.exitCode = 1;
  }
}

// 1. Core Module Tests
test('ROLE_PROMPTS contains all expected specialized personas', () => {
  const expectedRoles = ['coder', 'reviewer', 'architect', 'tester', 'optimizer', 'researcher', 'general'];
  for (const role of expectedRoles) {
    assert.ok(ROLE_PROMPTS[role], `Missing role prompt for: ${role}`);
    assert.strictEqual(typeof ROLE_PROMPTS[role], 'string');
    assert.ok(ROLE_PROMPTS[role].length > 10, `Role prompt too short for: ${role}`);
  }
});

test('getProxyAuth returns valid host, port, and auth credentials', () => {
  const auth = getProxyAuth();
  assert.ok(auth.host, 'Host should be defined');
  assert.ok(typeof auth.port === 'number', 'Port should be a number');
  assert.ok(auth.port > 1024, 'Port should be valid non-privileged port');
  assert.ok(auth.url.startsWith('http://'), 'URL should have http prefix');
  assert.ok(auth.baseUrl.startsWith('http://'), 'BaseUrl should have http prefix');
});

// 2. Controller & Security Tests
test('generateRandomMachineId generates valid 64-hex character string', () => {
  const id1 = generateRandomMachineId();
  const id2 = generateRandomMachineId();
  assert.strictEqual(typeof id1, 'string');
  assert.strictEqual(id1.length, 64, 'Machine ID must be 64 characters long');
  assert.ok(/^[0-9a-f]{64}$/.test(id1), 'Machine ID must be hexadecimal');
  assert.notStrictEqual(id1, id2, 'Successive machine IDs must be unique');
});

test('applyAntiBanArmor executes and enforces all security shields', () => {
  const result = applyAntiBanArmor();
  assert.strictEqual(result.success, true);
  assert.ok(result.totalAccountsProtected >= 0);
  assert.ok(Array.isArray(result.protectionsApplied));
  assert.ok(result.protectionsApplied.length >= 4);
});

test('listAccounts reads accounts safely without leaking plain tokens', () => {
  const result = listAccounts();
  assert.ok(Array.isArray(result.accounts));
  assert.strictEqual(typeof result.total, 'number');
  // Verify token safety (no raw refresh tokens exposed)
  for (const acc of result.accounts) {
    assert.strictEqual(acc.refreshToken, undefined, 'Plain refresh tokens must never be exposed');
  }
});

test('controller configuration accessors return valid structured objects', () => {
  const proxy = getProxyConfig();
  assert.ok(typeof proxy === 'object' && proxy !== null);

  const am = getAccountManagerSettings();
  assert.ok(typeof am === 'object' && am !== null);
  assert.ok('autoRefreshEnabled' in am);

  const hooks = getWebhooks();
  assert.ok(typeof hooks === 'object' && hooks !== null);
  assert.ok(Array.isArray(hooks.webhooks));

  const pool = getProxyPoolConfig();
  assert.ok(typeof pool === 'object' && pool !== null);
  assert.ok(Array.isArray(pool.proxies));

  const mid = getMachineIdConfig();
  assert.ok(typeof mid === 'object' && mid !== null);
  assert.strictEqual(mid.machineIdConfig.bindMachineIdToAccount, true);
});

// 3. MCP JSON-RPC Protocol Tests
await asyncTest('MCP Server responds to JSON-RPC initialize and lists 13 tools', async () => {
  const mcpScript = path.resolve('kiro-agent/kiro-mcp.mjs');
  const child = spawn('node', [mcpScript], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const responses = [];
  let buffer = '';

  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        try { responses.push(JSON.parse(line.trim())); } catch {}
      }
    }
  });

  // Send initialize request
  const initReq = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  }) + '\n';

  // Send tools/list request
  const toolsReq = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  }) + '\n';

  child.stdin.write(initReq);
  child.stdin.write(toolsReq);

  await new Promise(resolve => setTimeout(resolve, 800));
  child.kill('SIGTERM');

  const initRes = responses.find(r => r.id === 1);
  assert.ok(initRes, 'Expected initialize response');
  assert.ok(initRes.result.serverInfo.name.includes('kiro-agent'), 'Server name should identify as kiro-agent');

  const toolsRes = responses.find(r => r.id === 2);
  assert.ok(toolsRes, 'Expected tools/list response');
  assert.ok(Array.isArray(toolsRes.result.tools));
  assert.ok(toolsRes.result.tools.length >= 13, 'Expected at least 13 registered MCP tools');

  const toolNames = toolsRes.result.tools.map(t => t.name);
  assert.ok(toolNames.includes('kiro_run'));
  assert.ok(toolNames.includes('kiro_parallel_tasks'));
  assert.ok(toolNames.includes('kiro_swarm'));
  assert.ok(toolNames.includes('kiro_code_review'));
  assert.ok(toolNames.includes('kiro_architect_editor'));
  assert.ok(toolNames.includes('kiro_council'));
  assert.ok(toolNames.includes('kiro_universal_setting'));
});

console.log(`\nResults: ${passed}/7 Kiro Agent tests passed cleanly.\n`);
