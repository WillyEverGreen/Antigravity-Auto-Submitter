/**
 * Antigravity PowerTools — Telegram Remote Mission Control
 * 
 * Production-grade, zero-dependency Telegram bot engine using native Node `node:https`.
 * Operates 100% locally via HTTPS long-polling (zero inbound ports or cloud relays).
 * 
 * Features:
 * - One-time pairing code with fail-closed chatId authentication.
 * - Real-time push alerts on high-risk guardrails with inline [Approve] / [Deny] buttons.
 * - Bidirectional remote chat prompting & task completion alerts.
 */

'use strict';

const https = require('node:https');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function getConfigPath() {
  return process.env.AG_TELEGRAM_CONFIG_PATH || path.join(os.homedir(), '.antigravity-auto-submit', 'telegram.json');
}

function loadTelegramConfig(customPath) {
  const cfgPath = customPath || getConfigPath();
  if (!fs.existsSync(cfgPath)) return { botToken: '', authorizedChatId: null, pairingCode: null };
  try {
    let raw = fs.readFileSync(cfgPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch (e) {
    return { botToken: '', authorizedChatId: null, pairingCode: null };
  }
}

function saveTelegramConfig(config, customPath) {
  const cfgPath = customPath || getConfigPath();
  const dir = path.dirname(cfgPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const rand = crypto.randomBytes(6).toString('hex');
  let tmp = `${cfgPath}.tmp.${process.pid}.${rand}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, cfgPath);
    try { fs.chmodSync(cfgPath, 0o600); } catch (e) {}
    tmp = null;
  } finally {
    if (tmp && fs.existsSync(tmp)) {
      try { fs.unlinkSync(tmp); } catch (e) {}
    }
  }
}

function generatePairingCode() {
  const code = crypto.randomInt(100000, 1000000).toString();
  const cfg = loadTelegramConfig();
  cfg.pairingCode = code;
  cfg.pairingExpires = Date.now() + 15 * 60 * 1000; // 15 min expiry
  saveTelegramConfig(cfg);
  return code;
}

class TelegramClient {
  constructor(options = {}) {
    this.config = { ...loadTelegramConfig(), ...options };
    this.polling = false;
    this.offset = 0;
    this.abortController = null;
    this.pairingAttempts = new Map();
    this.onApprovalCallback = options.onApprovalCallback || null;
    this.onPromptCallback = options.onPromptCallback || null;
    this.onCommandCallback = options.onCommandCallback || null;
  }

  get isConfigured() {
    return Boolean(this.config.botToken);
  }

  get isPaired() {
    return Boolean(this.config.authorizedChatId);
  }

  async request(method, payload = {}) {
    if (!this.config.botToken) throw new Error('Telegram botToken is not configured.');
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${this.config.botToken}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 35000
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (!parsed.ok) return reject(new Error(parsed.description || 'Telegram API Error'));
            resolve(parsed.result);
          } catch (err) {
            reject(new Error(`Failed to parse Telegram response: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('Telegram request timeout')); });
      req.write(data);
      req.end();
    });
  }

  async sendMessage(text, extra = {}) {
    if (!this.config.authorizedChatId) return null;
    return this.request('sendMessage', {
      chat_id: this.config.authorizedChatId,
      text,
      parse_mode: 'Markdown',
      ...extra
    });
  }

  async sendApprovalPrompt(promptInfo) {
    const text = `🚨 *Antigravity PowerTools Guardrail Alert*\n\n` +
      `*Action:* \`${promptInfo.command || 'Approval Prompt'}\`\n` +
      `*Workspace:* ${promptInfo.workspace || 'Antigravity IDE'}\n` +
      `*Reason:* Guardrail keyword matched or sensitive action paused.`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve:${promptInfo.reqId || Date.now()}` },
          { text: '❌ Deny', callback_data: `deny:${promptInfo.reqId || Date.now()}` }
        ]
      ]
    };

    return this.sendMessage(text, { reply_markup: inlineKeyboard });
  }

  async sendTaskCompletion(summary) {
    const icon = summary.success ? '✅' : '❌';
    const text = `${icon} *Task Completed:* ${summary.task}\n\n` +
      `*Exit Code:* \`${summary.exitCode ?? 0}\`\n` +
      `*Files Modified:* ${summary.modifiedCount || 0}\n` +
      `*Duration:* ${summary.duration || '0s'}`;

    return this.sendMessage(text);
  }

  handleUpdate(update) {
    // 1. Process Message (Pairing or remote prompting)
    if (update.message) {
      const msg = update.message;
      const chatId = String(msg.chat?.id || '');
      const rawText = (msg.text || '').trim();
      const parts = rawText.split(/\s+/);
      const isPairCmd = parts[0].toLowerCase().split('@')[0] === '/pair';

      // Check pairing command with timing-safe comparison and rate limiting
      if (isPairCmd) {
        const now = Date.now();
        const record = this.pairingAttempts.get(chatId) || { count: 0, resetAt: now + 60000 };
        if (now > record.resetAt) {
          record.count = 0;
          record.resetAt = now + 60000;
        }

        if (record.count >= 3) {
          this.request('sendMessage', {
            chat_id: chatId,
            text: '🛑 *Too many failed pairing attempts.* Please wait 1 minute before trying again.'
          }).catch(() => {});
          return;
        }

        const candidateCode = parts[1] || '';
        let codeMatches = false;
        if (this.config.pairingCode && candidateCode) {
          const expectedBuf = Buffer.from(String(this.config.pairingCode));
          const actualBuf = Buffer.from(String(candidateCode));
          if (expectedBuf.length === actualBuf.length) {
            codeMatches = crypto.timingSafeEqual(expectedBuf, actualBuf);
          }
        }

        if (!codeMatches) {
          record.count++;
          this.pairingAttempts.set(chatId, record);
          this.request('sendMessage', {
            chat_id: chatId,
            text: '❌ *Invalid pairing code.* Check the code generated in Antigravity IDE.'
          }).catch(() => {});
          return;
        }

        if (this.config.pairingExpires && Date.now() > this.config.pairingExpires) {
          this.request('sendMessage', {
            chat_id: chatId,
            text: '⚠️ *Pairing code has expired.* Please generate a new code from the CLI or extension.'
          }).catch(() => {});
          return;
        }

        this.pairingAttempts.delete(chatId);
        this.config.authorizedChatId = chatId;
        this.config.pairingCode = null;
        this.config.pairingExpires = null;
        saveTelegramConfig(this.config);
        this.request('sendMessage', {
          chat_id: chatId,
          text: '🎉 *Paired Successfully with Antigravity PowerTools!*\nYou will now receive remote approval prompts and task updates.'
        }).catch(() => {});
        return;
      }

      // Security check: Ignore unauthorized users (Fail-Closed)
      if (!this.config.authorizedChatId || chatId !== String(this.config.authorizedChatId)) return;

      const firstWord = rawText.split(/\s+/)[0] || '';
      const cleanCmd = firstWord.toLowerCase().split('@')[0];

      if (cleanCmd === '/help' || cleanCmd === '/start') {
        const helpMsg = `🛰️ *Antigravity PowerTools Mission Control*\n\n` +
          `• *1-Tap Approvals:* Tap [✅ Approve] or [❌ Deny] on alerts\n` +
          `• *Remote Prompt:* Send any message to inject into Antigravity IDE\n` +
          `• \`/status\` — View connection health & stats\n` +
          `• \`/pause\` — Temporarily pause auto-approvals in IDE\n` +
          `• \`/resume\` — Resume auto-approvals in IDE\n` +
          `• \`/checkpoint\` — Save an instant git snapshot\n` +
          `• \`/help\` — Show this menu`;
        this.sendMessage(helpMsg).catch(() => {});
      } else if (cleanCmd === '/status') {
        let statusMsg = '⚡ *PowerTools Telegram Mission Control is Online.*';
        if (this.onCommandCallback) {
          const extra = this.onCommandCallback('status');
          if (extra) statusMsg += `\n\n${extra}`;
        }
        this.sendMessage(statusMsg).catch(() => {});
      } else if (cleanCmd === '/pause') {
        let msg = '⏸ *Auto-submit paused remotely.*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('pause');
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (cleanCmd === '/resume') {
        let msg = '▶️ *Auto-submit resumed remotely.*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('resume');
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (cleanCmd === '/checkpoint') {
        let msg = '🏷️ *Creating checkpoint...*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('checkpoint');
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (rawText && !rawText.startsWith('/') && this.onPromptCallback) {
        this.onPromptCallback(rawText);
        this.sendMessage(`📥 Forwarded prompt to Antigravity IDE:\n"${rawText}"`).catch(() => {});
      }
    }

    // 2. Process Callback Query (Approve / Deny buttons)
    if (update.callback_query) {
      const query = update.callback_query;
      const chatId = String(query.message?.chat?.id || query.from?.id || '');
      if (!this.config.authorizedChatId || chatId !== String(this.config.authorizedChatId)) return;

      const data = query.data || '';
      const [action, reqId] = data.split(':');

      if (action === 'approve') {
        if (this.onApprovalCallback) this.onApprovalCallback(reqId, true);
        this.request('answerCallbackQuery', {
          callback_query_id: query.id,
          text: '✅ Approved in Antigravity IDE'
        }).catch(() => {});
      } else if (action === 'deny') {
        if (this.onApprovalCallback) this.onApprovalCallback(reqId, false);
        this.request('answerCallbackQuery', {
          callback_query_id: query.id,
          text: '❌ Denied'
        }).catch(() => {});
      }
    }
  }

  async startPolling() {
    if (!this.config.botToken) return;
    this.polling = true;

    while (this.polling) {
      try {
        const updates = await this.request('getUpdates', {
          offset: this.offset,
          timeout: 25
        });

        if (Array.isArray(updates)) {
          for (const u of updates) {
            this.handleUpdate(u);
            this.offset = Math.max(this.offset, u.update_id + 1);
          }
        }
      } catch (err) {
        if (!this.polling) break;
        // Exponential backoff on transient errors
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  }

  stopPolling() {
    this.polling = false;
  }
}

module.exports = {
  loadTelegramConfig,
  saveTelegramConfig,
  generatePairingCode,
  TelegramClient
};

