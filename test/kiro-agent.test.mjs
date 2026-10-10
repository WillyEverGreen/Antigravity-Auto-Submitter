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
import { fitToContextBudget, estimateTokens, MODEL_CONTEXT_LIMITS, chunkPrompt } from '../kiro-agent/engine-context-budget.mjs';
import { semanticRoute, scorePrompt } from '../kiro-agent/engine-semantic-router.mjs';
import { scoreOutputQuality, buildCorrectionPrompt } from '../kiro-agent/engine-quality-retry.mjs';
import { validateCodeSyntax } from '../kiro-agent/engine-verifier.mjs';

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

// 2b. V2.1 Engine Suite Tests
test('engine-context-budget calculates budgets and trims context safely', () => {
  const est = estimateTokens('Hello world, this is a test string');
  assert.ok(est > 0 && est < 20);
  assert.ok(MODEL_CONTEXT_LIMITS['claude-sonnet-4.5'] >= 200000);

  // Normal prompt fits without truncation
  const normal = fitToContextBudget({ prompt: 'Write hello world', context: 'const x = 1;', model: 'claude-sonnet-4.5' });
  assert.strictEqual(normal.truncated, false);
  assert.strictEqual(normal.prompt, 'Write hello world');

  // Huge context gets trimmed
  const hugeContext = 'x'.repeat(400000);
  const trimmed = fitToContextBudget({ prompt: 'Short task', context: hugeContext, model: 'deepseek-3.2' });
  assert.strictEqual(trimmed.truncated, true);
  assert.ok(trimmed.context.length < hugeContext.length);

  // Chunking works with overlap and terminates cleanly
  const chunks = chunkPrompt('Line 1\nLine 2\nLine 3\nLine 4\nLine 5', 20, 5);
  assert.ok(Array.isArray(chunks));
  assert.ok(chunks.length >= 1);
});

test('engine-semantic-router scores 8 signals and picks optimal topology', () => {
  const fastRouting = semanticRoute('Quick one liner: say hello in Python', null);
  assert.strictEqual(fastRouting.mode, 'fast');
  assert.strictEqual(fastRouting.model, 'claude-haiku-4.5');

  const archRouting = semanticRoute('Refactor this distributed microservice architecture across 12 files', null);
  assert.strictEqual(archRouting.mode, 'architect-editor');

  const councilRouting = semanticRoute('Critical consensus needed: evaluate security vulnerability in cryptographic auth token', null);
  assert.strictEqual(councilRouting.mode, 'council');

  const signals = scorePrompt('Refactor complex architecture with deep reasoning');
  assert.ok(signals.complexity > 0);
  assert.ok(signals.refactor > 0);
});

test('engine-quality-retry evaluates code completeness and generates feedback', () => {
  const goodCode = '```javascript\nfunction solve(n) {\n  let sum = 0;\n  for (let i = 0; i < n; i++) sum += i;\n  return sum;\n}\nexport default solve;\n```';
  const goodScore = scoreOutputQuality(goodCode, 'Implement function to solve sum');
  assert.ok(goodScore.score >= 60, `Expected score >= 60, got ${goodScore.score}`);
  assert.ok(goodScore.dimensions.concreteness > 50);

  const placeholderCode = 'TODO: implement this later // placeholder';
  const badScore = scoreOutputQuality(placeholderCode, 'Implement full parser');
  assert.ok(badScore.score < 60, `Placeholder should score low, got ${badScore.score}`);

  const correction = buildCorrectionPrompt('Implement full parser', placeholderCode, badScore.issues, 1);
  assert.ok(correction.includes('quality issues'));
});

test('engine-verifier detects syntax errors and verifies valid code', () => {
  const valid = validateCodeSyntax('function test() { return 42; }');
  assert.strictEqual(valid.valid, true);

  const broken = validateCodeSyntax('function test() { return 42;');
  assert.strictEqual(broken.valid, false);
  assert.ok(broken.error.length > 0);
});

// 3. MCP JSON-RPC Protocol Tests
await asyncTest('MCP Server responds to JSON-RPC initialize and lists 14 tools', async () => {
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
  assert.ok(toolsRes.result.tools.length >= 14, `Expected at least 14 registered MCP tools, got ${toolsRes.result.tools.length}`);

  const toolNames = toolsRes.result.tools.map(t => t.name);
  assert.ok(toolNames.includes('kiro_run'));
  assert.ok(toolNames.includes('kiro_smart_route'), 'MCP server must register kiro_smart_route');
  assert.ok(toolNames.includes('kiro_parallel_tasks'));
  assert.ok(toolNames.includes('kiro_swarm'));
  assert.ok(toolNames.includes('kiro_code_review'));
  assert.ok(toolNames.includes('kiro_architect_editor'));
  assert.ok(toolNames.includes('kiro_council'));
  assert.ok(toolNames.includes('kiro_universal_setting'));
});

console.log(`\nResults: ${passed}/11 Kiro Agent tests passed cleanly.\n`);
