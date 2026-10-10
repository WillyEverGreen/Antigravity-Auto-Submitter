#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  getStatus,
  listModels,
  executeTask,
  executeParallel,
  executeSwarm,
  executeCodeReview,
  getProxyAuth
} from './kiro-core.mjs';
import { executeArchitectEditor } from './engine-architect-editor.mjs';
import { executeCouncil } from './engine-council.mjs';
import {
  applyAntiBanArmor,
  listAccounts,
  switchActiveAccount,
  refreshAccountToken,
  getProxyConfig,
  updateProxyConfig,
  resetProxyStats,
  getAccountManagerSettings,
  updateAccountManagerSettings,
  listApiKeys,
  addApiKey,
  deleteApiKey,
  toggleApiKey,
  getProxyPoolConfig,
  updateProxyPoolConfig,
  addProxyToPool,
  removeProxyFromPool,
  bindAccountProxy,
  getWebhooks,
  addWebhook,
  removeWebhook,
  toggleWebhook,
  sendWebhookTest,
  getMachineIdConfig,
  generateRandomMachineId,
  setAccountMachineId,
  listSteeringRules,
  saveSteeringRule,
  deleteSteeringRule,
  getKiroIdeMcpConfig,
  saveKiroIdeMcpServer,
  deleteKiroIdeMcpServer,
  listGroupsAndTags,
  addAccountGroup,
  addAccountTag,
  backupStore,
  restoreStore,
  setAnySetting,
  getAnySetting
} from './kiro-controller.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function printHelp() {
  console.log(`
⚡ Kiro Agent & Autonomous Control Suite (Kiro Swarm)

🛡️ Anti-Ban & Account Protection:
  kiro armor                           🛡️ Apply full Anti-Ban Armor (Fingerprint Isolation & Rate Limits)
  kiro protect                         Alias for kiro armor

Core Execution Commands:
  kiro status                          Check Kiro proxy health & active account pool
  kiro models                          List all available Kiro models, limits & credits
  kiro run <prompt> [options]          Execute single task on chosen model
  kiro parallel -f <file.json>         Execute multiple tasks in parallel across accounts
  kiro swarm <prompt> [options]        Multi-model consensus (Sonnet, DeepSeek, Qwen, MiniMax)
  kiro review <filePath> [options]     Multi-agent parallel code review (Security, Logic, Perf)

Account & Token Management:
  kiro accounts [list]                 List all 20 managed accounts with status, auth & quotas
  kiro accounts switch <idOrEmail>     Switch local active account in Kiro IDE
  kiro token refresh <idOrEmail>       Trigger live token refresh for an account (OIDC/Social)
  kiro groups [list | add <name>]      Manage account groups
  kiro tags [list | add <name>]        Manage account tags

Proxy & API Keys:
  kiro config [get | set <k> <v>]      Inspect or update proxy configuration
  kiro reset-stats                     Reset proxy request statistics and token counters
  kiro keys [list | add | del | tog]   Manage API keys and credit ceilings

Proxy Pool & Auto-Rotation:
  kiro pool [list | add | rm | set]    Manage upstream proxy pool & auto-rotation
  kiro pool bind <account> <proxyUrl>  Bind specific account to an outbound proxy

Webhook Notifications:
  kiro webhook [list | add | test]     Manage notification webhooks (Discord, Telegram, DingTalk)

Machine ID & Anti-Detection:
  kiro machine-id [show | gen | set]   Generate and assign 64-hex machine IDs to accounts

Kiro IDE Steering Rules & MCP:
  kiro steering [list | add | del]     Manage Kiro IDE steering rules (~/.kiro/steering/)
  kiro ide-mcp [list | add | del]      Manage Kiro IDE local MCP servers (~/.kiro/settings/mcp.json)

Backup & Restore:
  kiro backup [path]                   Backup entire database to JSON
  kiro restore <path>                  Restore entire database from JSON

Universal Dynamic Settings:
  kiro get <dot.path>                  Read ANY arbitrary field (e.g. accountData.autoRefreshInterval)
  kiro set <dot.path> <value>          Modify ANY arbitrary field anywhere in Kiro store!

Execution Options:
  -m, --model <model>       Model name (default: claude-sonnet-4.5)
  -r, --role <role>         Role persona (coder, reviewer, architect, tester, optimizer, general)
  -c, --concurrency <num>   Max parallel workers (default: 8)
  -f, --file <filePath>     Input tasks JSON file or code file
  -o, --out <filePath>      Save output report to file
  -t, --temperature <temp>  Sampling temperature (default: 0.2)
  --json                    Output raw JSON format
  --help                    Show this help message
`);
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-m' || a === '--model') flags.model = argv[++i];
    else if (a === '-r' || a === '--role') flags.role = argv[++i];
    else if (a === '-c' || a === '--concurrency') flags.concurrency = parseInt(argv[++i], 10);
    else if (a === '-f' || a === '--file') flags.file = argv[++i];
    else if (a === '-o' || a === '--out') flags.out = argv[++i];
    else if (a === '-t' || a === '--temperature') flags.temperature = parseFloat(argv[++i]);
    else if (a === '--json') flags.json = true;
    else if (!a.startsWith('-')) flags._.push(a);
  }
  return flags;
}

const flags = parseFlags(args);

async function main() {
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  // --- ANTI-BAN ARMOR ---
  if (command === 'armor' || command === 'protect') {
    console.log('\n🛡️ Applying Anti-Ban Armor & Account Protection Shield...\n');
    const res = applyAntiBanArmor();
    console.log(`✅ Shield Status: FULLY ACTIVE`);
    console.log(`  Protected Accounts:        ${res.totalAccountsProtected}`);
    console.log(`  Isolated Machine IDs:      ${res.newlyAssignedMachineIds} assigned / verified`);
    console.log('\n🔒 Protections Enforced:');
    res.protectionsApplied.forEach(p => console.log(`  ✓ ${p}`));
    return;
  }

  // --- UNIVERSAL GET / SET ---
  if (command === 'get') {
    const pathKey = flags._[1];
    const val = getAnySetting(pathKey);
    if (flags.json || typeof val === 'object') {
      console.log(JSON.stringify(val, null, 2));
    } else {
      console.log(`${pathKey} = ${val}`);
    }
    return;
  }

  if (command === 'set') {
    const pathKey = flags._[1];
    let val = flags._[2];
    if (!pathKey || val === undefined) {
      console.error('Error: Usage: kiro set <dot.path> <value>');
      process.exit(1);
    }
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (!isNaN(Number(val))) val = Number(val);
    else if (val.startsWith('{') || val.startsWith('[')) {
      try { val = JSON.parse(val); } catch {}
    }

    const res = setAnySetting(pathKey, val);
    console.log(`\n✅ Successfully updated [${res.path} = ${typeof res.value === 'object' ? JSON.stringify(res.value) : res.value}]`);
    return;
  }

  // --- TOKEN REFRESH ---
  if (command === 'token') {
    const sub = flags._[1] || 'refresh';
    if (sub === 'refresh') {
      const target = flags._[2];
      if (!target) {
        console.error('Error: Please specify account email or ID to refresh token for.');
        process.exit(1);
      }
      try {
        console.log(`🔄 Refreshing token for ${target}...`);
        const res = await refreshAccountToken(target);
        console.log(`✅ Token successfully refreshed! Expires at: ${res.expiresAt} (in ${res.expiresInMinutes}m)`);
      } catch (e) {
        console.error(`❌ Token refresh failed: ${e.message}`);
      }
      return;
    }
  }

  // --- STEERING RULES ---
  if (command === 'steering') {
    const sub = flags._[1] || 'list';
    if (sub === 'list' || sub === 'ls') {
      const rules = listSteeringRules();
      if (flags.json) {
        console.log(JSON.stringify(rules, null, 2));
        return;
      }
      console.log(`\n📜 Kiro IDE Steering Rules (~/.kiro/steering/ - ${rules.length} Total):\n`);
      if (rules.length === 0) {
        console.log('  No steering rules found. Add one with: kiro steering add <filename> "<content>"');
      } else {
        rules.forEach(r => {
          console.log(`  📄 ${r.filename} (${r.size} bytes)`);
          console.log(`     Preview: ${r.preview}...\n`);
        });
      }
      return;
    }

    if (sub === 'add') {
      const filename = flags._[2];
      const content = flags._[3] || (flags.file ? fs.readFileSync(flags.file, 'utf8') : '');
      if (!filename || !content) {
        console.error('Error: Usage: kiro steering add <filename> "<content>" OR -f <file>');
        process.exit(1);
      }
      const res = saveSteeringRule(filename, content);
      console.log(`\n✅ Saved steering rule: ${res.filename} (${res.path})`);
      return;
    }

    if (sub === 'del' || sub === 'rm') {
      const filename = flags._[2];
      const res = deleteSteeringRule(filename);
      if (res.success) {
        console.log(`\n🗑️ Deleted steering rule: ${res.deleted}`);
      } else {
        console.error(`Error: ${res.error}`);
      }
      return;
    }
  }

  // --- KIRO IDE LOCAL MCP SERVERS ---
  if (command === 'ide-mcp') {
    const sub = flags._[1] || 'list';
    if (sub === 'list' || sub === 'ls') {
      const cfg = getKiroIdeMcpConfig();
      if (flags.json) {
        console.log(JSON.stringify(cfg, null, 2));
        return;
      }
      console.log('\n🧩 Kiro IDE Configured MCP Servers (~/.kiro/settings/mcp.json):\n');
      const servers = cfg.mcpServers || {};
      for (const [name, server] of Object.entries(servers)) {
        console.log(`  • ${name}: ${server.command || server.url} ${server.args ? server.args.join(' ') : ''} ${server.disabled ? '(🔴 Disabled)' : '(🟢 Enabled)'}`);
      }
      return;
    }

    if (sub === 'add') {
      const name = flags._[2];
      let configJson = flags._[3];
      if (!name || !configJson) {
        console.error('Error: Usage: kiro ide-mcp add <serverName> \'<jsonConfig>\'');
        process.exit(1);
      }
      try {
        const parsed = JSON.parse(configJson);
        const res = saveKiroIdeMcpServer(name, parsed);
        console.log(`\n✅ Saved Kiro IDE MCP server: ${res.serverName}`);
      } catch (e) {
        console.error(`Error: Invalid JSON config: ${e.message}`);
      }
      return;
    }

    if (sub === 'del' || sub === 'rm') {
      const name = flags._[2];
      const res = deleteKiroIdeMcpServer(name);
      if (res.success) {
        console.log(`\n🗑️ Deleted Kiro IDE MCP server: ${res.deleted}`);
      } else {
        console.error(`Error: ${res.error}`);
      }
      return;
    }
  }

  // --- GROUPS & TAGS ---
  if (command === 'groups') {
    const sub = flags._[1] || 'list';
    if (sub === 'list' || sub === 'ls') {
      const { groups } = listGroupsAndTags();
      console.log(`\n📁 Account Groups (${groups.length} Total):\n`);
      groups.forEach(g => console.log(`  • [${g.name}] (Color: ${g.color}) - ${g.description || 'No description'}`));
      return;
    }
    if (sub === 'add') {
      const name = flags._[2];
      const desc = flags._[3] || '';
      const color = flags._[4] || '#4a9eff';
      const res = addAccountGroup(name, desc, color);
      console.log(`\n✅ Added account group: ${res.group.name}`);
      return;
    }
  }

  if (command === 'tags') {
    const sub = flags._[1] || 'list';
    if (sub === 'list' || sub === 'ls') {
      const { tags } = listGroupsAndTags();
      console.log(`\n🏷️ Account Tags (${tags.length} Total):\n`);
      tags.forEach(t => console.log(`  • ${t.name} (Color: ${t.color})`));
      return;
    }
    if (sub === 'add') {
      const name = flags._[2];
      const color = flags._[3] || '#10b981';
      const res = addAccountTag(name, color);
      console.log(`\n✅ Added account tag: ${res.tag.name}`);
      return;
    }
  }

  // --- BACKUP & RESTORE ---
  if (command === 'backup') {
    const dest = flags._[1] || null;
    const res = backupStore(dest);
    console.log(`\n💾 Successfully backed up database to:\n  ${res.backupPath}`);
    return;
  }

  if (command === 'restore') {
    const src = flags._[1];
    if (!src) {
      console.error('Error: Please provide source backup JSON path.');
      process.exit(1);
    }
    const res = restoreStore(src);
    console.log(`\n♻️ Successfully restored database (${res.accounts} accounts) from:\n  ${res.restoredFrom}`);
    return;
  }

  // --- RESET STATS ---
  if (command === 'reset-stats') {
    const res = resetProxyStats();
    console.log(`\n🧹 ${res.message}`);
    return;
  }

  // --- PROXY POOL ---
  if (command === 'pool' || command === 'proxy-pool') {
    const sub = flags._[1] || 'list';
    if (sub === 'list' || sub === 'ls') {
      const data = getProxyPoolConfig();
      if (flags.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log('\n🌐 Proxy Pool & Auto-Rotation Configuration:');
      console.log(`  Auto-Rotate:    ${data.config.autoRotate ? '🟢 Enabled' : '🔴 Disabled'}`);
      console.log(`  Interval:       ${data.config.rotateInterval || 10} min`);
      console.log(`  Strategy:       ${data.config.strategy || 'lowestLatency'}`);
      console.log(`  Total Proxies:  ${data.totalProxies}`);
      console.log(`  Upstream Relay: ${data.config.upstreamProxy || 'Direct'}\n`);

      if (data.totalProxies > 0) {
        console.log('ID'.padEnd(12) + 'URL'.padEnd(35) + 'Status'.padEnd(12) + 'Label');
        console.log('='.repeat(75));
        data.proxies.forEach(p => {
          console.log(
            p.id.slice(0, 10).padEnd(12) +
            p.url.slice(0, 33).padEnd(35) +
            (p.enabled ? '🟢 Enabled' : '🔴 Disabled').padEnd(12) +
            (p.label || '')
          );
        });
      }
      return;
    }

    if (sub === 'add') {
      const url = flags._[2];
      const label = flags._[3] || '';
      if (!url) {
        console.error('Error: Please provide a proxy URL (e.g. http://1.2.3.4:8080 or socks5://user:pass@host:port)');
        process.exit(1);
      }
      const res = addProxyToPool({ url, label });
      console.log(`\n✅ Added proxy to pool: ${res.addedProxy.url} (ID: ${res.addedProxy.id.slice(0, 8)})`);
      return;
    }

    if (sub === 'rm' || sub === 'remove' || sub === 'del') {
      const target = flags._[2];
      const res = removeProxyFromPool(target);
      if (res.success) {
        console.log(`\n🗑️ Removed proxy from pool: ${res.removedProxy.url}`);
      } else {
        console.error(`Error: ${res.error}`);
      }
      return;
    }

    if (sub === 'set') {
      const key = flags._[2];
      let val = flags._[3];
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(Number(val))) val = Number(val);

      const res = updateProxyPoolConfig({ [key]: val });
      console.log(`\n✅ Updated proxy pool config: [${key} = ${val}]`);
      return;
    }

    if (sub === 'bind') {
      const account = flags._[2];
      const proxyUrl = flags._[3] || null;
      const res = bindAccountProxy(account, proxyUrl);
      console.log(`\n🔗 Account ${res.accountId} bound to proxy: ${res.boundProxy || 'None (Direct)'}`);
      return;
    }
  }

  // --- WEBHOOKS ---
  if (command === 'webhook' || command === 'webhooks') {
    const sub = flags._[1] || 'list';
    if (sub === 'list' || sub === 'ls') {
      const data = getWebhooks();
      if (flags.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log(`\n🔔 Webhook Notifications (${data.total} Total):\n`);
      if (data.total === 0) {
        console.log('  No webhooks configured yet. Add one with: kiro webhook add <kind> <url>');
      } else {
        console.log('Kind'.padEnd(14) + 'Label'.padEnd(25) + 'Status'.padEnd(12) + 'URL');
        console.log('='.repeat(80));
        data.webhooks.forEach(w => {
          console.log(
            w.kind.padEnd(14) +
            (w.label || w.kind).slice(0, 23).padEnd(25) +
            (w.enabled ? '🟢 Enabled' : '🔴 Disabled').padEnd(12) +
            w.url.slice(0, 30) + '...'
          );
        });
      }
      return;
    }

    if (sub === 'add') {
      const kind = flags._[2] || 'custom';
      const url = flags._[3];
      const label = flags._[4] || '';
      if (!url) {
        console.error('Error: Usage: kiro webhook add <kind> <url> [label]');
        console.error('Kinds: dingtalk, wechat-work, telegram, discord, feishu, custom');
        process.exit(1);
      }
      const res = addWebhook({ kind, url, label });
      console.log(`\n✅ Added webhook: ${res.addedWebhook.label} (${res.addedWebhook.kind})`);
      return;
    }

    if (sub === 'rm' || sub === 'remove' || sub === 'del') {
      const target = flags._[2];
      const res = removeWebhook(target);
      if (res.success) {
        console.log(`\n🗑️ Removed webhook: ${res.removedWebhook.label}`);
      } else {
        console.error(`Error: ${res.error}`);
      }
      return;
    }

    if (sub === 'toggle') {
      const target = flags._[2];
      const res = toggleWebhook(target);
      if (res.success) {
        console.log(`\n🔄 Webhook "${res.label}" is now: ${res.enabled ? '🟢 Enabled' : '🔴 Disabled'}`);
      } else {
        console.error(`Error: ${res.error}`);
      }
      return;
    }

    if (sub === 'test') {
      const target = flags._[2];
      if (!target) {
        console.error('Error: Specify webhook ID, label or URL to test.');
        process.exit(1);
      }
      try {
        console.log(`\n🧪 Dispatching test message to webhook: ${target}...`);
        const res = await sendWebhookTest(target);
        console.log(`✅ Webhook test delivered successfully (Status ${res.status})!`);
      } catch (e) {
        console.error(`❌ Webhook test failed: ${e.message}`);
      }
      return;
    }
  }

  // --- MACHINE ID ---
  if (command === 'machine-id' || command === 'mid') {
    const sub = flags._[1] || 'show';
    if (sub === 'show') {
      const data = getMachineIdConfig();
      if (flags.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log('\n💻 Machine ID & Spoofing Configuration:\n');
      console.log(`  Auto Spoof: ${data.machineIdConfig.autoSpoof ? '🟢 Enabled' : '🔴 Disabled'}`);
      console.log(`  Mode:       ${data.machineIdConfig.mode || 'per-account'}`);
      console.log(`  Bound IDs:  ${Object.keys(data.accountMachineIds).length} accounts`);
      return;
    }

    if (sub === 'gen' || sub === 'generate') {
      const id = generateRandomMachineId();
      console.log(`\n✨ Generated Random Machine ID (64-hex):\n  ${id}`);
      return;
    }

    if (sub === 'set') {
      const account = flags._[2];
      const id = flags._[3] || null;
      if (!account) {
        console.error('Error: Usage: kiro machine-id set <accountEmailOrId> [machineId]');
        process.exit(1);
      }
      const res = setAccountMachineId(account, id);
      console.log(`\n✅ Set Machine ID for ${res.accountId}:\n  ${res.machineId}`);
      return;
    }
  }

  // --- STATUS ---
  if (command === 'status') {
    const status = await getStatus();
    if (flags.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    console.log('\n📡 Kiro Proxy Connection Status:');
    console.log(`  Status:       ${status.online ? '🟢 ONLINE' : '🔴 OFFLINE'}`);
    console.log(`  Endpoint:     ${status.baseUrl}`);
    console.log(`  API Key:      ${status.hasApiKey ? '✅ Auto-configured' : '⚠️ Missing'}`);
    if (status.online && status.proxyStatus) {
      const ps = status.proxyStatus;
      console.log(`  Active Pool:  ${ps.availableAccounts || status.configuredAccounts || 0} accounts`);
      if (ps.stats) {
        console.log(`  Total Req:    ${ps.stats.totalRequests}`);
        console.log(`  Success Req:  ${ps.stats.successRequests}`);
        console.log(`  Failed Req:   ${ps.stats.failedRequests}`);
        console.log(`  Total Tokens: ${ps.stats.totalTokens?.toLocaleString() || 0}`);
      }
    } else if (status.error) {
      console.log(`  Error:        ${status.error}`);
    }
    return;
  }

  // --- MODELS ---
  if (command === 'models') {
    try {
      const models = await listModels();
      if (flags.json) {
        console.log(JSON.stringify(models, null, 2));
        return;
      }
      console.log(`\n📋 Available Kiro Models (${models.length} Total):\n`);
      console.log(
        'ID'.padEnd(32) +
        'Rate/Credit'.padEnd(14) +
        'Context'.padEnd(12) +
        'Max Out'.padEnd(10) +
        'Name'
      );
      console.log('='.repeat(80));
      for (const m of models) {
        const rate = `${m.rateMultiplier}x ${m.rateUnit}`;
        const ctx = `${Math.round(m.contextLength / 1000)}K`;
        const out = `${Math.round(m.maxTokens / 1000)}K`;
        console.log(
          m.id.padEnd(32) +
          rate.padEnd(14) +
          ctx.padEnd(12) +
          out.padEnd(10) +
          m.name
        );
      }
    } catch (e) {
      console.error(`Failed to retrieve models: ${e.message}`);
    }
    return;
  }

  // --- ACCOUNTS MANAGEMENT ---
  if (command === 'accounts' || command === 'acc') {
    const sub = flags._[1] || 'list';
    if (sub === 'list' || sub === 'ls') {
      const data = listAccounts();
      if (flags.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log(`\n👥 Managed Accounts (${data.total} Total | Active: ${data.activeAccountEmail || 'None'}):\n`);
      console.log(
        '#'.padEnd(4) +
        'Email / ID'.padEnd(36) +
        'IdP'.padEnd(14) +
        'Region'.padEnd(12) +
        'Status'.padEnd(10) +
        'Active'
      );
      console.log('='.repeat(82));
      data.accounts.forEach((acc, i) => {
        const idx = `[${i + 1}]`.padEnd(4);
        const email = (acc.email || acc.id).slice(0, 34).padEnd(36);
        const idp = acc.idp.slice(0, 12).padEnd(14);
        const reg = acc.region.padEnd(12);
        const stat = (acc.isExpired ? '⚠️ Expired' : '🟢 Active').padEnd(10);
        const active = acc.isActive ? '⭐ ACTIVE' : '';
        console.log(`${idx}${email}${idp}${reg}${stat}${active}`);
      });
      return;
    }

    if (sub === 'switch') {
      const target = flags._[2];
      if (!target) {
        console.error('Error: Please specify account email or ID to switch to.');
        process.exit(1);
      }
      const res = switchActiveAccount(target);
      console.log(`\n⭐ Switched active Kiro IDE account to: ${res.email}`);
      return;
    }
  }

  // --- PROXY CONFIG MANAGEMENT ---
  if (command === 'config' || command === 'cfg') {
    const sub = flags._[1] || 'get';
    if (sub === 'get') {
      const cfg = getProxyConfig();
      if (flags.json) {
        console.log(JSON.stringify(cfg, null, 2));
        return;
      }
      console.log('\n⚙️ Current Proxy Configuration:\n');
      for (const [k, v] of Object.entries(cfg)) {
        console.log(`  ${k.padEnd(28)}: ${v}`);
      }
      return;
    }

    if (sub === 'set') {
      const key = flags._[2];
      let val = flags._[3];
      if (!key || val === undefined) {
        console.error('Error: Usage: kiro config set <key> <value>');
        process.exit(1);
      }
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(Number(val))) val = Number(val);

      const res = updateProxyConfig({ [key]: val });
      console.log(`\n✅ Updated proxy config [${key} = ${val}]`);
      return;
    }
  }

  // --- ACCOUNT MANAGER SETTINGS ---
  if (command === 'settings' || command === 'pref') {
    const sub = flags._[1] || 'get';
    if (sub === 'get') {
      const settings = getAccountManagerSettings();
      if (flags.json) {
        console.log(JSON.stringify(settings, null, 2));
        return;
      }
      console.log('\n🛠️ Account Manager Settings:\n');
      for (const [k, v] of Object.entries(settings)) {
        console.log(`  ${k.padEnd(28)}: ${v}`);
      }
      return;
    }

    if (sub === 'set') {
      const key = flags._[2];
      let val = flags._[3];
      if (!key || val === undefined) {
        console.error('Error: Usage: kiro settings set <key> <value>');
        process.exit(1);
      }
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(Number(val))) val = Number(val);

      const res = updateAccountManagerSettings({ [key]: val });
      console.log(`\n✅ Updated setting [${key} = ${val}]`);
      return;
    }
  }

  // --- API KEYS MANAGEMENT ---
  if (command === 'keys' || command === 'key') {
    const sub = flags._[1] || 'list';
    if (sub === 'list' || sub === 'ls') {
      const data = listApiKeys();
      if (flags.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log(`\n🔑 Configured API Keys (${data.totalKeys} Total):\n`);
      console.log(`  Master Key: ${data.masterApiKey || 'None'}\n`);
      console.log(
        'Name'.padEnd(20) +
        'Key'.padEnd(30) +
        'Status'.padEnd(10) +
        'Credits Used'.padEnd(16) +
        'Requests'
      );
      console.log('='.repeat(85));
      data.keys.forEach(k => {
        const name = k.name.slice(0, 18).padEnd(20);
        const masked = (k.key.slice(0, 10) + '...' + k.key.slice(-4)).padEnd(30);
        const stat = (k.enabled ? '🟢 Enabled' : '🔴 Disabled').padEnd(10);
        const cred = `${k.totalCreditsUsed.toFixed(3)} / ${k.creditsLimit || '∞'}`.padEnd(16);
        console.log(`${name}${masked}${stat}${cred}${k.totalRequests}`);
      });
      return;
    }

    if (sub === 'add') {
      const name = flags._[2] || `Key_${Date.now()}`;
      const limit = flags._[3] ? Number(flags._[3]) : null;
      const res = addApiKey(name, limit);
      console.log(`\n✅ Created API Key "${res.createdKey.name}":\n`);
      console.log(`  Key:     ${res.createdKey.key}`);
      console.log(`  Limit:   ${res.createdKey.creditsLimit || 'Unlimited'}`);
      return;
    }

    if (sub === 'del' || sub === 'delete' || sub === 'rm') {
      const target = flags._[2];
      if (!target) {
        console.error('Error: Please specify key ID, name or key string to delete.');
        process.exit(1);
      }
      const res = deleteApiKey(target);
      if (res.success) {
        console.log(`\n🗑️ Deleted API Key: ${res.deletedKey}`);
      } else {
        console.error(`Error: ${res.error}`);
      }
      return;
    }

    if (sub === 'toggle') {
      const target = flags._[2];
      const res = toggleApiKey(target);
      if (res.success) {
        console.log(`\n🔄 API Key "${res.key}" is now: ${res.enabled ? '🟢 Enabled' : '🔴 Disabled'}`);
      } else {
        console.error(`Error: ${res.error}`);
      }
      return;
    }
  }

  // --- RUN / EXEC ---
  if (command === 'run' || command === 'exec') {
    const prompt = flags._.slice(1).join(' ') || (flags.file ? fs.readFileSync(flags.file, 'utf8') : null);
    if (!prompt) {
      console.error('Error: Please provide a prompt or a file with -f <filePath>');
      process.exit(1);
    }

    const model = flags.model || 'claude-sonnet-4.5';
    const role = flags.role || 'coder';
    const temperature = flags.temperature !== undefined ? flags.temperature : 0.2;

    process.stderr.write(`🤖 Executing on [${model}] (Role: ${role})...\n`);
    const res = await executeTask({ prompt, model, role, temperature });

    if (flags.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      if (res.success) {
        if (flags.out) {
          fs.writeFileSync(flags.out, res.content, 'utf8');
          console.log(`\n✅ Output saved to ${flags.out} (${res.durationMs}ms)`);
        } else {
          console.log('\n' + res.content);
        }
      } else {
        console.error(`\n❌ Error: ${res.error}`);
        process.exit(1);
      }
    }
    return;
  }

  // --- PARALLEL / BATCH ---
  if (command === 'parallel' || command === 'batch') {
    let tasks = [];
    if (flags.file) {
      const content = fs.readFileSync(flags.file, 'utf8');
      tasks = JSON.parse(content);
    } else {
      console.error('Error: Please provide a tasks JSON file with -f <filePath>');
      process.exit(1);
    }

    const concurrency = flags.concurrency || 8;
    const defaultModel = flags.model || 'claude-sonnet-4.5';
    const defaultRole = flags.role || 'coder';

    console.log(`\n⚡ Starting Parallel Execution: ${tasks.length} tasks across account pool (Concurrency: ${concurrency})...`);

    const result = await executeParallel({
      tasks,
      defaultModel,
      defaultRole,
      concurrency,
      onProgress: ({ completed, total, latest }) => {
        const symbol = latest.success ? '✓' : '✗';
        process.stderr.write(`  [${completed}/${total}] ${symbol} ${latest.id} (${latest.model}) - ${latest.durationMs || 0}ms\n`);
      }
    });

    console.log(`\n🎉 Completed in ${(result.totalDurationMs / 1000).toFixed(2)}s | Success: ${result.successful}/${result.total}`);

    if (flags.out) {
      fs.writeFileSync(flags.out, JSON.stringify(result, null, 2), 'utf8');
      console.log(`Saved full batch results to ${flags.out}`);
    } else if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  // --- SWARM ---
  if (command === 'swarm') {
    const prompt = flags._.slice(1).join(' ') || (flags.file ? fs.readFileSync(flags.file, 'utf8') : null);
    if (!prompt) {
      console.error('Error: Please provide a prompt for the swarm.');
      process.exit(1);
    }

    const models = flags.model ? flags.model.split(',') : ['claude-sonnet-4.5', 'deepseek-3.2', 'qwen3-coder-next', 'minimax-m2.5'];
    console.log(`\n🐝 Launching AI Model Swarm: [${models.join(', ')}] in parallel...`);

    const res = await executeSwarm({ prompt, models });
    if (flags.json) {
      console.log(JSON.stringify(res, null, 2));
    } else if (res.success) {
      if (flags.out) {
        fs.writeFileSync(flags.out, res.finalSolution, 'utf8');
        console.log(`\n✅ Swarm consensus saved to ${flags.out}`);
      } else {
        console.log('\n=== 🐝 SWARM CONSENSUS SYNTHESIS ===\n');
        console.log(res.finalSolution);
      }
    } else {
      console.error(`Swarm error: ${res.error}`);
    }
    return;
  }

  // --- REVIEW ---
  if (command === 'review') {
    const filePath = flags.file || flags._[1];
    if (!filePath || !fs.existsSync(filePath)) {
      console.error('Error: Please provide a valid code file to review.');
      process.exit(1);
    }

    const code = fs.readFileSync(filePath, 'utf8');
    console.log(`\n🔍 Dispatching Multi-Agent Parallel Review on ${filePath}...`);
    const res = await executeCodeReview({ code, context: `File: ${path.basename(filePath)}` });

    if (flags.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`\n📊 Review Completed in ${(res.durationMs / 1000).toFixed(2)}s:\n`);
      for (const rev of res.reviews) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📌 ${rev.title} (Model: ${rev.model})`);
        console.log('='.repeat(70));
        console.log(rev.content);
      }
    }
    return;
  }

  // --- ARCHITECT-EDITOR ---
  if (command === 'arch' || command === 'architect') {
    const prompt = flags._.slice(1).join(' ') || (flags.file ? fs.readFileSync(flags.file, 'utf8') : null);
    if (!prompt) {
      console.error('Error: Please provide a prompt or a file with -f <filePath>');
      process.exit(1);
    }
    console.log(`⚡ Running Architect-Editor Dual Engine...\nPrompt: "${prompt}"\n`);
    const res = await executeArchitectEditor({ prompt });
    if (res.success) {
      console.log(`\n✅ Completed in ${res.totalDurationMs}ms (Tokens: ${res.totalTokens})`);
      console.log(`  • Architect (${res.architect?.model}): ${res.architect?.durationMs}ms (${res.architect?.tokens} tokens)`);
      console.log(`  • Editor (${res.editor?.model}): ${res.editor?.durationMs}ms (${res.editor?.tokens} tokens)`);
      console.log('\n--- Implementation ---\n');
      console.log(res.finalCode);
    } else {
      console.error(`\n❌ Error: ${res.error}`);
      process.exit(1);
    }
    return;
  }

  // --- COUNCIL ---
  if (command === 'council') {
    const prompt = flags._.slice(1).join(' ') || (flags.file ? fs.readFileSync(flags.file, 'utf8') : null);
    if (!prompt) {
      console.error('Error: Please provide a prompt for the council.');
      process.exit(1);
    }
    console.log(`🏛️ Convening 4-Model LLM Council (Sonnet 4.5, DeepSeek 3.2, Qwen3, MiniMax)...\n`);
    const res = await executeCouncil({ prompt });
    if (res.success) {
      console.log(`\n✅ Council Concluded in ${(res.totalDurationMs / 1000).toFixed(1)}s\n`);
      console.log(res.finalSolution);
    } else {
      console.error(`Council error: ${res.error}`);
      process.exit(1);
    }
    return;
  }

  // --- BENCHMARK ---
  if (command === 'benchmark') {
    console.log('🏁 Running Live Benchmark: Kiro V1 Baseline vs Kiro V2 Architect-Editor...\n');
    const testPrompt = 'Implement a thread-safe Ring Buffer queue in TypeScript with overflow policies and iterator support.';
    console.log('[1/2] Testing Kiro V2 (Architect-Editor)...');
    const t0 = Date.now();
    const v2Res = await executeArchitectEditor({ prompt: testPrompt });
    const v2Time = Date.now() - t0;
    console.log(`  V2 Result: ${v2Res.success ? 'SUCCESS' : 'FAILED'} in ${v2Time}ms (${v2Res.totalTokens} tokens)`);
    console.log('\n📊 Summary:');
    console.log(`  • Kiro V2 (Architect-Editor): ${(v2Time / 1000).toFixed(1)}s`);
    console.log(`  • Kiro V1 Baseline (Observed): ~106.2s`);
    console.log(`  • Speedup Factor: ${(106200 / v2Time).toFixed(1)}x faster! 🚀`);
    return;
  }

  if (flags._.length > 0) {
    const prompt = flags._.join(' ');
    const model = flags.model || 'claude-sonnet-4.5';
    const role = flags.role || 'coder';
    const res = await executeTask({ prompt, model, role });
    if (res.success) {
      console.log(res.content);
    } else {
      console.error(`Error: ${res.error}`);
    }
    return;
  }

  printHelp();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
