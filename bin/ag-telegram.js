#!/usr/bin/env node
/**
 * Antigravity PowerTools — Telegram Remote Mission Control CLI
 * 
 * Usage:
 *   ag-telegram                          Show status and quick instructions
 *   ag-telegram setup [options]          All-in-one setup wizard
 *   ag-telegram --token <botToken>       Set and verify your BotFather API token
 *   ag-telegram --pair                   Generate 6-digit code & listen for pairing
 *   ag-telegram --send "Test alert"      Send a test approval card to your paired Telegram
 *   ag-telegram --listen                 Start interactive long-polling daemon
 *   ag-telegram --reset                  Reset credentials and unpair
 */

'use strict';

const readline = require('node:readline');
const {
  generatePairingCode,
  loadTelegramConfig,
  saveTelegramConfig,
  TelegramClient
} = require('../lib/telegram-mission-control');

console.log('\n📱 \x1b[1mAntigravity PowerTools — Telegram Remote Mission Control\x1b[0m\n');

const args = process.argv.slice(2);

function promptUser(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans.trim()); }));
}

async function main() {
  const cfg = loadTelegramConfig();

  // 1. Reset
  if (args.includes('--reset') || args.includes('reset')) {
    saveTelegramConfig({ botToken: '', authorizedChatId: null, pairingCode: null, pairingExpires: null });
    console.log('✓ Telegram configuration reset. All credentials cleared.');
    process.exit(0);
  }

  // 2. All-in-one Setup Wizard (ag-telegram setup)
  if (args.includes('setup') || args.includes('--setup')) {
    let token = '';
    const tokenIdx = args.findIndex(a => a === '--token' || a === '-t');
    if (tokenIdx !== -1 && args[tokenIdx + 1]) {
      token = args[tokenIdx + 1].trim();
    } else if (cfg.botToken) {
      token = cfg.botToken;
      console.log(`Using existing bot token: ${token.slice(0, 10)}...`);
    } else {
      console.log('Setup Steps:');
      console.log('  1. Open Telegram, search for \x1b[36m@BotFather\x1b[0m, and send \x1b[33m/newbot\x1b[0m');
      console.log('  2. Choose a bot name and username (e.g. MyAntigravityBot)');
      console.log('  3. Copy the HTTP API token BotFather gives you.\n');
      token = await promptUser('Paste your BotFather API Token: ');
    }

    if (!token) {
      console.error('\x1b[31m✗ No token provided. Setup aborted.\x1b[0m');
      process.exit(1);
    }

    console.log('\nVerifying bot token with Telegram servers...');
    const client = new TelegramClient({ botToken: token });
    let me;
    try {
      me = await client.request('getMe');
      cfg.botToken = token;
      saveTelegramConfig(cfg);
      console.log(`\x1b[32m✓ Bot verified successfully!\x1b[0m`);
      console.log(`  Bot Name:     \x1b[1m${me.first_name}\x1b[0m`);
      console.log(`  Username:     @${me.username}`);
      console.log(`  Bot Link:     \x1b[36mhttps://t.me/${me.username}\x1b[0m`);
    } catch (err) {
      console.error(`\x1b[31m✗ Token verification failed:\x1b[0m ${err.message}`);
      process.exit(1);
    }

    const code = generatePairingCode();
    console.log(`\n🔑 \x1b[1mYour Telegram pairing code is:\x1b[0m \x1b[36m\x1b[1m${code}\x1b[0m (valid for 15 minutes)`);
    console.log(`\n👉 Open your bot: \x1b[36mhttps://t.me/${me.username}\x1b[0m and send:`);
    console.log(`\x1b[33m/pair ${code}\x1b[0m\n`);
    console.log('Waiting for pairing message from Telegram (press Ctrl+C to cancel)...');

    let paired = false;
    const interval = setInterval(() => {
      const liveCfg = loadTelegramConfig();
      if (liveCfg.authorizedChatId && !liveCfg.pairingCode) {
        paired = true;
        clearInterval(interval);
        client.stopPolling();
        console.log(`\n\x1b[32m🎉 Success! Paired with Telegram Chat ID: ${liveCfg.authorizedChatId}\x1b[0m`);
        console.log('Sending test confirmation card to your phone...');
        client.config.authorizedChatId = liveCfg.authorizedChatId;
        client.sendApprovalPrompt({
          command: 'Antigravity PowerTools: Welcome & Test Card',
          workspace: process.cwd(),
          reqId: 'welcome'
        }).then(() => {
          console.log(`\x1b[32m✓ Test card sent to your Telegram!\x1b[0m Tap [Approve] or [Deny] in Telegram.`);
          console.log('\nSetup complete! You can now start the listener with: \x1b[36mag-telegram --listen\x1b[0m\n');
          process.exit(0);
        }).catch(() => {
          process.exit(0);
        });
      }
    }, 1500);

    await client.startPolling();
    return;
  }

  // 3. Set token
  const tokenIdx = args.findIndex(a => a === '--token' || a === '--set-token');
  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    const rawToken = args[tokenIdx + 1].trim();
    console.log('Verifying bot token with Telegram servers...');
    const client = new TelegramClient({ botToken: rawToken });
    try {
      const me = await client.request('getMe');
      cfg.botToken = rawToken;
      saveTelegramConfig(cfg);
      console.log(`\x1b[32m✓ Bot verified successfully!\x1b[0m`);
      console.log(`  Bot Name:     \x1b[1m${me.first_name}\x1b[0m`);
      console.log(`  Username:     @${me.username}`);
      console.log(`  Bot ID:       ${me.id}`);
      console.log(`\nNext step: Run \x1b[36mag-telegram --pair\x1b[0m to link your personal Telegram account.`);
      process.exit(0);
    } catch (err) {
      console.error(`\x1b[31m✗ Token verification failed:\x1b[0m ${err.message}`);
      console.error('Please make sure you copied the full HTTP API token from @BotFather.');
      process.exit(1);
    }
  }

  // 4. Pair
  if (args.includes('--pair') || args.includes('pair')) {
    if (!cfg.botToken) {
      console.error('\x1b[31m✗ No bot token configured yet.\x1b[0m');
      console.log('\nRun \x1b[36mag-telegram setup\x1b[0m to run the step-by-step wizard.');
      process.exit(1);
    }

    const code = generatePairingCode();
    console.log(`🔑 \x1b[1mYour Telegram pairing code is:\x1b[0m \x1b[36m\x1b[1m${code}\x1b[0m (valid for 15 minutes)`);
    console.log('\nOpen your bot on Telegram and send:');
    console.log(`\x1b[33m/pair ${code}\x1b[0m\n`);
    console.log('Waiting for pairing message from Telegram (press Ctrl+C to cancel)...');

    const client = new TelegramClient({
      onPromptCallback: (prompt) => {
        console.log(`[Prompt Received from Telegram] ${prompt}`);
      }
    });

    let paired = false;
    const interval = setInterval(() => {
      const liveCfg = loadTelegramConfig();
      if (liveCfg.authorizedChatId && !liveCfg.pairingCode) {
        paired = true;
        clearInterval(interval);
        client.stopPolling();
        console.log(`\n\x1b[32m🎉 Success! Paired with Telegram Chat ID: ${liveCfg.authorizedChatId}\x1b[0m`);
        console.log('You can now test sending an alert with:');
        console.log('\x1b[36mag-telegram --send "Test alert from Antigravity IDE"\x1b[0m\n');
        process.exit(0);
      }
    }, 1500);

    await client.startPolling();
    return;
  }

  // 5. Send test message
  const sendIdx = args.indexOf('--send');
  if (sendIdx !== -1) {
    if (!cfg.botToken || !cfg.authorizedChatId) {
      console.error('\x1b[31m✗ Bot is not paired yet.\x1b[0m');
      console.log('Run \x1b[36mag-telegram setup\x1b[0m first.');
      process.exit(1);
    }

    const messageText = args.slice(sendIdx + 1).join(' ') || 'Test alert from Antigravity PowerTools';
    console.log(`Dispatching test guardrail alert to Telegram (Chat ID: ${cfg.authorizedChatId})...`);

    const client = new TelegramClient();
    try {
      await client.sendApprovalPrompt({
        command: messageText,
        workspace: process.cwd(),
        reqId: `test-${Date.now()}`
      });
      console.log(`\x1b[32m✓ Alert sent successfully!\x1b[0m Check your Telegram app for the [Approve] / [Deny] card.`);
      process.exit(0);
    } catch (err) {
      console.error(`\x1b[31m✗ Failed to send message:\x1b[0m ${err.message}`);
      process.exit(1);
    }
  }

  // 6. Stop background daemon
  if (args.includes('stop') || args.includes('--stop')) {
    const fs = require('node:fs');
    const { getPidFilePath } = require('../auto-accept');
    const pidFile = getPidFilePath('auto');
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        process.kill(pid);
        try { fs.unlinkSync(pidFile); } catch (e) {}
        console.log(`\x1b[32m✔ Stopped background daemon (PID ${pid})\x1b[0m`);
      } catch (err) {
        console.log(`\x1b[33mDaemon process was not running.\x1b[0m`);
      }
    } else {
      console.log(`\x1b[33mNo background daemon is currently running.\x1b[0m`);
    }
    process.exit(0);
  }

  // 7. Background Daemon Start (ag-telegram start)
  if (args.includes('start') || args.includes('--daemon')) {
    if (!cfg.botToken || !cfg.authorizedChatId) {
      console.error('\x1b[31m✗ Cannot start: bot is not configured and paired.\x1b[0m');
      console.log('Run \x1b[36mag-telegram setup\x1b[0m first.');
      process.exit(1);
    }
    const { spawn } = require('node:child_process');
    const path = require('node:path');
    const os = require('node:os');
    const fs = require('node:fs');
    const logDir = path.join(os.homedir(), '.antigravity-auto-submit');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const outLog = fs.openSync(path.join(logDir, 'daemon.log'), 'a');
    const errLog = fs.openSync(path.join(logDir, 'daemon.err'), 'a');
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'auto-accept.js'), 'daemon'], {
      detached: true,
      stdio: ['ignore', outLog, errLog],
      windowsHide: true,
      cwd: path.join(__dirname, '..')
    });
    child.unref();
    console.log(`\x1b[32m✔ Antigravity Mission Control started in background (PID ${child.pid})\x1b[0m`);
    console.log(`  Telegram bot is now listening 24/7 for approvals and remote prompts.`);
    console.log(`  Logs: ${path.join(logDir, 'daemon.log')}`);
    console.log(`  To stop at any time: \x1b[36mag-telegram stop\x1b[0m\n`);
    process.exit(0);
  }

  // 8. Foreground Interactive Listen (ag-telegram --listen)
  if (args.includes('--listen') || args.includes('listen')) {
    if (!cfg.botToken || !cfg.authorizedChatId) {
      console.error('\x1b[31m✗ Cannot start: bot is not configured and paired.\x1b[0m');
      console.log('Run \x1b[36mag-telegram setup\x1b[0m first.');
      process.exit(1);
    }

    const { AutoSubmitDaemon, resolveConfig } = require('../auto-accept');
    const { config, configSource } = resolveConfig(['daemon']);
    config.quiet = false;
    const daemon = new AutoSubmitDaemon(config, configSource);
    console.log(`⚡ \x1b[32mAntigravity Mission Control Daemon Starting...\x1b[0m (Chat ID: ${cfg.authorizedChatId})`);
    await daemon.start();
    return;
  }

  // Default: Status & help
  console.log(`Status:`);
  console.log(`  Bot Token:   ${cfg.botToken ? '\x1b[32mConfigured\x1b[0m' : '\x1b[31mNot Configured\x1b[0m'}`);
  console.log(`  Paired Chat: ${cfg.authorizedChatId ? '\x1b[32mPaired (' + cfg.authorizedChatId + ')\x1b[0m' : '\x1b[33mNot Paired\x1b[0m'}`);
  console.log(`  Active Code: ${cfg.pairingCode ? '\x1b[36m' + cfg.pairingCode + '\x1b[0m' : 'None'}`);

  console.log('\nCommands:');
  console.log('  \x1b[36mag-telegram setup\x1b[0m                Run the 1-click interactive setup wizard');
  console.log('  \x1b[36mag-telegram --token <token>\x1b[0m      Set your BotFather HTTP API token');
  console.log('  \x1b[36mag-telegram --pair\x1b[0m               Generate pairing code and link your phone');
  console.log('  \x1b[36mag-telegram --send "<msg>"\x1b[0m       Send a test approval card to Telegram');
  console.log('  \x1b[36mag-telegram --listen\x1b[0m             Start live mission control listener');
  console.log('  \x1b[36mag-telegram --reset\x1b[0m              Clear credentials and unpair\n');
}

main().catch(err => {
  console.error('\x1b[31mError:\x1b[0m', err.message);
  process.exit(1);
});
