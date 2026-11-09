/**
 * Automated test suite for Antigravity PowerTools Telegram Remote Mission Control
 * Tests: Pairing, Fail-Closed Security, Remote Approval Callbacks.
 */

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TEST_CONFIG_PATH = path.join(os.tmpdir(), `ag-telegram-test-${process.pid}.json`);
process.env.AG_TELEGRAM_CONFIG_PATH = TEST_CONFIG_PATH;

console.log('🧪 Starting Antigravity PowerTools Telegram Test Suite...\n');

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

const {
  TelegramClient,
  generatePairingCode,
  loadTelegramConfig,
  saveTelegramConfig
} = require('../lib/telegram-mission-control');

it('generatePairingCode generates a 6-digit code and sets expiry', () => {
  const code = generatePairingCode();
  assert(/^\d{6}$/.test(code), 'Pairing code must be 6 digits');
  const cfg = loadTelegramConfig();
  assert.strictEqual(cfg.pairingCode, code);
  assert(cfg.pairingExpires > Date.now());
});

it('TelegramClient fails closed on unauthorized incoming messages', () => {
  let promptReceived = null;
  const client = new TelegramClient({
    botToken: 'dummy-token',
    authorizedChatId: '12345678',
    onPromptCallback: (p) => { promptReceived = p; }
  });

  // Incoming message from unauthorized user 9999999
  client.handleUpdate({
    message: {
      chat: { id: 9999999 },
      text: 'rm -rf /'
    }
  });

  assert.strictEqual(promptReceived, null, 'Unauthorized message must be dropped silently');
});

it('TelegramClient pairs successfully when receiving correct pairing code', () => {
  const code = generatePairingCode();
  const client = new TelegramClient({
    botToken: 'dummy-token',
    pairingCode: code,
    authorizedChatId: null
  });

  // Mock request method on client so it does not make real network call
  let sentMessage = null;
  client.request = (method, payload) => {
    sentMessage = { method, payload };
    return Promise.resolve({ message_id: 1 });
  };

  client.handleUpdate({
    message: {
      chat: { id: 88776655 },
      text: `/pair ${code}`
    }
  });

  assert.strictEqual(client.config.authorizedChatId, '88776655');
  assert.strictEqual(client.config.pairingCode, null);
  assert.strictEqual(sentMessage?.method, 'sendMessage');
});

it('TelegramClient enforces rate limiting on failed pairing attempts', () => {
  const code = '654321';
  const client = new TelegramClient({
    botToken: 'dummy-token',
    pairingCode: code,
    authorizedChatId: null
  });

  const sent = [];
  client.request = (method, payload) => {
    sent.push({ method, payload });
    return Promise.resolve({ message_id: 1 });
  };

  // Attempt 1: wrong code
  client.handleUpdate({ message: { chat: { id: 999111 }, text: '/pair 000000' } });
  assert.strictEqual(client.config.authorizedChatId, null);
  assert(sent[0].payload.text.includes('Invalid pairing code'));

  // Attempt 2: wrong code
  client.handleUpdate({ message: { chat: { id: 999111 }, text: '/pair 111111' } });
  assert.strictEqual(client.config.authorizedChatId, null);

  // Attempt 3: wrong code
  client.handleUpdate({ message: { chat: { id: 999111 }, text: '/pair 222222' } });
  assert.strictEqual(client.config.authorizedChatId, null);

  // Attempt 4: Even with the CORRECT code, rate limiter must block!
  client.handleUpdate({ message: { chat: { id: 999111 }, text: `/pair ${code}` } });
  assert.strictEqual(client.config.authorizedChatId, null, 'Must be blocked by rate limit');
  assert(sent[3].payload.text.includes('Too many failed pairing attempts'));
});

it('TelegramClient rejects callback queries from unauthorized users', () => {
  let approvedReqId = null;
  const client = new TelegramClient({
    botToken: 'dummy-token',
    authorizedChatId: '12345',
    onApprovalCallback: (reqId) => { approvedReqId = reqId; }
  });

  client.request = () => Promise.resolve({});

  // Unauthorized chat id
  client.handleUpdate({
    callback_query: {
      id: 'query-unauth',
      message: { chat: { id: 99999 } },
      data: 'approve:req-evil'
    }
  });

  assert.strictEqual(approvedReqId, null, 'Unauthorized callback must be rejected');

  // Callback query without message using from.id
  client.handleUpdate({
    callback_query: {
      id: 'query-from',
      from: { id: 12345 },
      data: 'approve:req-valid'
    }
  });

  assert.strictEqual(approvedReqId, 'req-valid', 'Authorized from.id callback must be accepted');
});

it('TelegramClient dispatches approval callback when receiving inline button click', () => {
  let approvedReqId = null;
  let approvalDecision = null;

  const client = new TelegramClient({
    botToken: 'dummy-token',
    authorizedChatId: '12345',
    onApprovalCallback: (reqId, decision) => {
      approvedReqId = reqId;
      approvalDecision = decision;
    }
  });

  // Mock request
  client.request = () => Promise.resolve({});

  // Simulate Approve button callback
  client.handleUpdate({
    callback_query: {
      id: 'query-1',
      message: { chat: { id: 12345 } },
      data: 'approve:req-987'
    }
  });

  assert.strictEqual(approvedReqId, 'req-987');
  assert.strictEqual(approvalDecision, true);

  // Simulate Deny button callback
  client.handleUpdate({
    callback_query: {
      id: 'query-2',
      message: { chat: { id: 12345 } },
      data: 'deny:req-654'
    }
  });

  assert.strictEqual(approvedReqId, 'req-654');
  assert.strictEqual(approvalDecision, false);
});

it('TelegramClient dispatches onCommandCallback for control commands', () => {
  const commandsCalled = [];
  const client = new TelegramClient({
    botToken: 'dummy-token',
    authorizedChatId: '54321',
    onCommandCallback: (cmd) => {
      commandsCalled.push(cmd);
      return `Handled: ${cmd}`;
    }
  });

  let sentMessages = [];
  client.request = (method, payload) => {
    if (method === 'sendMessage') sentMessages.push(payload);
    return Promise.resolve({ ok: true });
  };

  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/pause' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/resume' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/checkpoint' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/status' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/help' } });

  assert.deepStrictEqual(commandsCalled, ['pause', 'resume', 'checkpoint', 'status']);
  assert.strictEqual(sentMessages.length, 5);
  assert(sentMessages[0].text.includes('Handled: pause'));
  assert(sentMessages[1].text.includes('Handled: resume'));
  assert(sentMessages[2].text.includes('Handled: checkpoint'));
  assert(sentMessages[3].text.includes('Handled: status'));
  assert(sentMessages[4].text.includes('Mission Control'));
});

try {
  if (fs.existsSync(TEST_CONFIG_PATH)) fs.unlinkSync(TEST_CONFIG_PATH);
} catch (e) {}

console.log(`\nResults: ${passed}/${total} Telegram mission control tests passed.`);
if (process.exitCode) process.exit(process.exitCode);

