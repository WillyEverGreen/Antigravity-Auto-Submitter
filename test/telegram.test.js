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

const tests = [];
function it(name, fn) {
  tests.push({ name, fn });
}

const {
  TelegramClient,
  generatePairingCode,
  loadTelegramConfig,
  saveTelegramConfig,
  extractAttachment,
  splitTelegramMessage,
  getUploadsDir
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
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/open /my/project' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/new' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/recent' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/add /my/cool-proj mycool' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/remove mycool' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/windows' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/switch 1' } });
  client.handleUpdate({ message: { chat: { id: 54321 }, text: '/help' } });

  assert.deepStrictEqual(commandsCalled, ['pause', 'resume', 'checkpoint', 'status', 'open', 'new', 'recent', 'add', 'remove', 'windows', 'switch']);
  assert.strictEqual(sentMessages.length, 12);
  assert(sentMessages[0].text.includes('Handled: pause'));
  assert(sentMessages[1].text.includes('Handled: resume'));
  assert(sentMessages[2].text.includes('Handled: checkpoint'));
  assert(sentMessages[3].text.includes('Handled: status'));
  assert(sentMessages[4].text.includes('Handled: open'));
  assert(sentMessages[5].text.includes('Handled: new'));
  assert(sentMessages[6].text.includes('Handled: recent'));
  assert(sentMessages[7].text.includes('Handled: add'));
  assert(sentMessages[8].text.includes('Handled: remove'));
  assert(sentMessages[9].text.includes('Handled: windows'));
  assert(sentMessages[10].text.includes('Handled: switch'));
  assert(sentMessages[11].text.includes('Mission Control'));
});

it('TelegramClient sends typing indicator when prompt is received', () => {
  const actions = [];
  const client = new TelegramClient({
    botToken: 'dummy-token',
    authorizedChatId: '54321',
    onPromptCallback: () => {}
  });

  client.request = (method, payload) => {
    if (method === 'sendChatAction') actions.push(payload);
    return Promise.resolve({ ok: true });
  };

  client.handleUpdate({ message: { chat: { id: 54321 }, text: 'Hello AI' } });
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].action, 'typing');
  assert.strictEqual(actions[0].chat_id, '54321');

  client.stopTypingIndicator();
  assert.strictEqual(client.typingTimer, null);
});

it('extractAttachment accurately classifies screenshots, documents, and media', () => {
  // Photo
  const photoMsg = {
    photo: [
      { file_id: 'small', width: 100, height: 100 },
      { file_id: 'large', width: 1200, height: 800 }
    ]
  };
  const photoAtt = extractAttachment(photoMsg);
  assert.strictEqual(photoAtt.fileId, 'large');
  assert.strictEqual(photoAtt.type, 'photo');

  // Document
  const docMsg = {
    document: { file_id: 'doc123', file_name: 'test_report.pdf' }
  };
  const docAtt = extractAttachment(docMsg);
  assert.strictEqual(docAtt.fileId, 'doc123');
  assert.strictEqual(docAtt.fileName, 'test_report.pdf');
  assert.strictEqual(docAtt.type, 'document');

  // Voice
  const voiceMsg = { voice: { file_id: 'voice789' } };
  const voiceAtt = extractAttachment(voiceMsg);
  assert.strictEqual(voiceAtt.fileId, 'voice789');
  assert.strictEqual(voiceAtt.type, 'voice');

  // Plain text
  assert.strictEqual(extractAttachment({ text: 'just text' }), null);
});

it('splitTelegramMessage chunks long content preserving paragraph boundaries', () => {
  const shortText = 'Hello world';
  assert.deepStrictEqual(splitTelegramMessage(shortText, 100), ['Hello world']);

  const longText = 'Paragraph 1\n\n' + 'A'.repeat(50) + '\n\n' + 'B'.repeat(50);
  const chunks = splitTelegramMessage(longText, 60);
  assert(chunks.length >= 2);
  assert.strictEqual(chunks[0], 'Paragraph 1');
});

it('TelegramClient downloads attachment and forwards prompt with local path', async () => {
  let forwardedPrompt = null;
  const sentMessages = [];
  const client = new TelegramClient({
    botToken: 'dummy-token',
    authorizedChatId: '54321',
    onPromptCallback: (p) => { forwardedPrompt = p; }
  });

  client.request = (method, payload) => {
    if (method === 'getFile') {
      return Promise.resolve({ file_path: 'photos/file_99.jpg' });
    }
    if (method === 'sendMessage') {
      sentMessages.push(payload);
      return Promise.resolve({ message_id: 100 });
    }
    return Promise.resolve({ ok: true });
  };

  // Mock downloadTelegramFile to write a test dummy file
  client.downloadTelegramFile = async (remotePath, destPath) => {
    fs.writeFileSync(destPath, 'test-image-content', 'utf8');
    return destPath;
  };

  client.handleUpdate({
    message: {
      chat: { id: 54321 },
      photo: [{ file_id: 'ph1', width: 800, height: 600 }],
      caption: 'What is wrong with this error screen?'
    }
  });

  // Allow async download / callback
  await new Promise(r => setTimeout(r, 50));

  assert(forwardedPrompt, 'Prompt must be forwarded to IDE');
  assert(forwardedPrompt.includes('[Attached file:'));
  assert(forwardedPrompt.includes('What is wrong with this error screen?'));
  assert(sentMessages.length >= 1);
  assert(sentMessages[0].text.includes('Received Screenshot'));
  client.stopTypingIndicator();
});

it('TelegramClient sendFormattedResponse sends HTML and falls back on entity error', async () => {
  const sent = [];
  const client = new TelegramClient({
    botToken: 'dummy-token',
    authorizedChatId: '54321'
  });

  let failOnce = true;
  client.request = (method, payload) => {
    if (method === 'sendMessage') {
      if (payload.parse_mode === 'HTML' && failOnce) {
        failOnce = false;
        return Promise.reject(new Error("Bad Request: can't parse entities: tag 'b' is not closed"));
      }
      sent.push(payload);
      return Promise.resolve({ message_id: 1 });
    }
    return Promise.resolve({ ok: true });
  };

  await client.sendFormattedResponse('<b>Hello world</b>');
  assert.strictEqual(sent.length, 1);
  // Must have fallen back to plain text
  assert.strictEqual(sent[0].text, 'Hello world');
  assert.strictEqual(sent[0].parse_mode, undefined);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${t.name}`);
      console.error(`    ${err.message}`);
      process.exitCode = 1;
    }
  }

  try {
    if (fs.existsSync(TEST_CONFIG_PATH)) fs.unlinkSync(TEST_CONFIG_PATH);
  } catch (e) {}

  console.log(`\nResults: ${passed}/${tests.length} Telegram mission control tests passed.`);
  process.exit(process.exitCode || 0);
})();

