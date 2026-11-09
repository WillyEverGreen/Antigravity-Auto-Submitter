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

function getUploadsDir() {
  const dir = path.join(os.homedir(), '.antigravity-auto-submit', 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function extractAttachment(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const best = msg.photo[msg.photo.length - 1];
    return {
      fileId: best.file_id,
      fileName: `screenshot_${Date.now()}.jpg`,
      type: 'photo',
      label: 'Screenshot / Image',
      icon: '🖼️'
    };
  }
  if (msg.document) {
    return {
      fileId: msg.document.file_id,
      fileName: msg.document.file_name || `document_${Date.now()}`,
      type: 'document',
      label: 'Document / File',
      icon: '📎'
    };
  }
  if (msg.voice) {
    return {
      fileId: msg.voice.file_id,
      fileName: `voice_${Date.now()}.ogg`,
      type: 'voice',
      label: 'Voice Note',
      icon: '🎙️'
    };
  }
  if (msg.audio) {
    return {
      fileId: msg.audio.file_id,
      fileName: msg.audio.file_name || `audio_${Date.now()}.mp3`,
      type: 'audio',
      label: 'Audio File',
      icon: '🎵'
    };
  }
  if (msg.video) {
    return {
      fileId: msg.video.file_id,
      fileName: msg.video.file_name || `video_${Date.now()}.mp4`,
      type: 'video',
      label: 'Video Clip',
      icon: '🎥'
    };
  }
  return null;
}

function splitTelegramMessage(text, maxLen = 3900) {
  if (!text || typeof text !== 'string') return [''];
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf('\n\n', maxLen);
    if (splitIdx <= 0) {
      splitIdx = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitIdx <= 0) {
      splitIdx = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitIdx <= 0) {
      splitIdx = maxLen;
    }
    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  return chunks;
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
    const parseMode = extra.parse_mode !== undefined ? extra.parse_mode : 'Markdown';
    try {
      return await this.request('sendMessage', {
        chat_id: this.config.authorizedChatId,
        text,
        parse_mode: parseMode,
        ...extra
      });
    } catch (err) {
      // If parse mode failed, fallback to plain text so message is never lost
      if (parseMode && /can't parse entities|character.*reserved|tag.*is not closed|wrong.*entity/i.test(err.message)) {
        const plain = text.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        return await this.request('sendMessage', {
          chat_id: this.config.authorizedChatId,
          text: plain,
          ...extra,
          parse_mode: undefined
        }).catch(() => null);
      }
      throw err;
    }
  }

  async sendFormattedResponse(text) {
    if (!this.config.authorizedChatId) return null;
    const chunks = splitTelegramMessage(text, 3900);
    for (const chunk of chunks) {
      try {
        await this.request('sendMessage', {
          chat_id: this.config.authorizedChatId,
          text: chunk,
          parse_mode: 'HTML'
        });
      } catch (err) {
        const plain = chunk.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        await this.request('sendMessage', {
          chat_id: this.config.authorizedChatId,
          text: plain
        }).catch(() => {});
      }
    }
  }

  async downloadTelegramFile(remotePath, destinationPath) {
    const download = (urlStr, redirects = 0) => {
      if (redirects > 3) return Promise.reject(new Error('Too many redirects downloading Telegram file'));
      return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(destinationPath);
        https.get(urlStr, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fileStream.close();
            try { fs.unlinkSync(destinationPath); } catch (e) {}
            return resolve(download(res.headers.location, redirects + 1));
          }
          if (res.statusCode !== 200) {
            fileStream.close();
            try { fs.unlinkSync(destinationPath); } catch (e) {}
            return reject(new Error(`Failed to download file from Telegram: HTTP ${res.statusCode}`));
          }
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close(() => resolve(destinationPath));
          });
        }).on('error', (err) => {
          fileStream.close();
          try { fs.unlinkSync(destinationPath); } catch (e) {}
          reject(err);
        });
      });
    };

    const initialUrl = `https://api.telegram.org/file/bot${this.config.botToken}/${remotePath}`;
    return download(initialUrl);
  }

  async handleIncomingAttachment(attachment, caption, chatId) {
    try {
      this.sendChatAction('upload_document');
      const fileRes = await this.request('getFile', { file_id: attachment.fileId });
      const remotePath = fileRes?.file_path;
      if (!remotePath) throw new Error('Could not retrieve remote file path from Telegram');

      let ext = path.extname(remotePath);
      let baseName = path.basename(attachment.fileName, path.extname(attachment.fileName));
      if (!ext && attachment.fileName) ext = path.extname(attachment.fileName);
      const safeBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'file';
      const targetName = `${Date.now()}_${safeBase}${ext}`;
      const uploadDir = getUploadsDir();
      const localFilePath = path.join(uploadDir, targetName);

      await this.downloadTelegramFile(remotePath, localFilePath);

      const promptText = caption
        ? `[Attached file: ${localFilePath}]\n${caption}`
        : `[Attached file: ${localFilePath}]\nPlease inspect this attached ${attachment.label.toLowerCase()} and assist based on its contents.`;

      if (this.onPromptCallback) {
        this.onPromptCallback(promptText);
        this.startTypingIndicator();
        this.sendMessage(
          `${attachment.icon} <b>Received ${attachment.label}:</b> <code>${path.basename(localFilePath)}</code>\n` +
          `💾 <b>Saved to:</b> <code>${localFilePath}</code>\n\n` +
          `📥 <b>Forwarded prompt to Antigravity IDE:</b>\n<i>"${caption || 'Please inspect attached file'}"</i>\n\n` +
          `⏳ <i>Antigravity AI is thinking...</i>`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    } catch (err) {
      this.sendMessage(`❌ <b>Failed to process attachment:</b> ${err.message}`, { parse_mode: 'HTML' }).catch(() => {});
    }
  }

  async sendChatAction(action = 'typing') {
    if (!this.config.authorizedChatId) return null;
    return this.request('sendChatAction', {
      chat_id: this.config.authorizedChatId,
      action
    }).catch(() => {});
  }

  startTypingIndicator() {
    this.stopTypingIndicator();
    this.sendChatAction('typing');
    this.typingTimer = setInterval(() => {
      this.sendChatAction('typing');
    }, 4500);
    if (this.typingTimer.unref) this.typingTimer.unref();
    this.typingTimeout = setTimeout(() => {
      this.stopTypingIndicator();
    }, 300000); // 5 min maximum
    if (this.typingTimeout.unref) this.typingTimeout.unref();
  }

  stopTypingIndicator() {
    if (this.typingTimer) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
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

      // Check for photo, document, voice, audio, or video attachment
      const attachment = extractAttachment(msg);
      if (attachment) {
        this.handleIncomingAttachment(attachment, msg.caption || '', chatId);
        return;
      }

      const firstWord = rawText.split(/\s+/)[0] || '';
      const cleanCmd = firstWord.toLowerCase().split('@')[0];

      if (cleanCmd === '/help' || cleanCmd === '/start') {
        const helpMsg = `🛰️ *Antigravity PowerTools Mission Control*\n\n` +
          `*📁 Workspaces & Projects:*\n` +
          `• \`/recent\` or \`/projects\` — View recent projects with numbers\n` +
          `• \`/open <name|#>\` — Open project by name, number, or path\n` +
          `• \`/new <name>\` — Create new project folder & open in new window\n` +
          `• \`/add <path> [name]\` — Add project directory alias\n` +
          `• \`/remove <name>\` — Remove a project alias\n` +
          `• \`/windows\` — List all open Antigravity IDE windows\n` +
          `• \`/switch <#>\` — Switch which window receives prompts\n\n` +
          `*⚡ Agent Controls:*\n` +
          `• Send any text — Injected into active Antigravity window\n` +
          `• \`/status\` — View connection health & active target\n` +
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
      } else if (cleanCmd === '/open' || cleanCmd === '/folder') {
        const targetPath = rawText.slice(firstWord.length).trim();
        let msg = '📂 *Opening workspace in Antigravity IDE...*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('open', targetPath);
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (cleanCmd === '/new' || cleanCmd === '/newwindow') {
        const targetPath = rawText.slice(firstWord.length).trim();
        let msg = '🪟 *Opening new Antigravity IDE window...*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('new', targetPath);
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (cleanCmd === '/recent' || cleanCmd === '/projects') {
        let msg = '📁 *Workspaces & Projects:*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('recent');
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (cleanCmd === '/add' || cleanCmd === '/alias') {
        const argStr = rawText.slice(firstWord.length).trim();
        let msg = '🏷️ *Adding project alias...*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('add', argStr);
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (cleanCmd === '/remove' || cleanCmd === '/delete') {
        const argStr = rawText.slice(firstWord.length).trim();
        let msg = '🗑️ *Removing project...*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('remove', argStr);
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (cleanCmd === '/window' || cleanCmd === '/windows') {
        let msg = '🪟 *Checking active Antigravity windows...*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('windows');
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
      } else if (cleanCmd === '/switch') {
        const argStr = rawText.slice(firstWord.length).trim();
        let msg = '🎯 *Switching target window...*';
        if (this.onCommandCallback) {
          const res = this.onCommandCallback('switch', argStr);
          if (res) msg = res;
        }
        this.sendMessage(msg).catch(() => {});
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
        this.startTypingIndicator();
        this.sendMessage(`📥 Forwarded prompt to Antigravity IDE:\n"${rawText}"\n\n⏳ _Antigravity AI is thinking..._`).catch(() => {});
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
    this.stopTypingIndicator();
  }
}

module.exports = {
  loadTelegramConfig,
  saveTelegramConfig,
  generatePairingCode,
  getUploadsDir,
  extractAttachment,
  splitTelegramMessage,
  TelegramClient
};

