import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

const STORE_SECRET_KEY = process.env.KIRO_STORE_SECRET_KEY || 'kiro-account-manager-secret-key';
const HOME_DIR = process.env.USERPROFILE || process.env.HOME || '';
const APPDATA_DIR = process.env.APPDATA || (process.platform === 'darwin'
  ? path.join(HOME_DIR, 'Library', 'Application Support')
  : (process.platform === 'win32'
    ? path.join(HOME_DIR, 'AppData', 'Roaming')
    : path.join(HOME_DIR, '.config')));
const STORE_PATH = process.env.KIRO_STORE_PATH || path.join(APPDATA_DIR, 'kiro-account-manager', 'kiro-accounts.json');
const KIRO_DIR = process.env.KIRO_CONFIG_DIR || path.join(HOME_DIR, '.kiro');
const KIRO_AUTH_ENDPOINT = process.env.KIRO_AUTH_ENDPOINT || 'https://prod.us-east-1.auth.desktop.kiro.dev';


/**
 * Decrypts raw store buffer
 */
function decryptStore(rawBuffer) {
  const iv = rawBuffer.subarray(0, 16);
  const dataUpdate = rawBuffer.subarray(17);
  const password = crypto.pbkdf2Sync(STORE_SECRET_KEY, iv, 10000, 32, 'sha512');
  const decipher = crypto.createDecipheriv('aes-256-cbc', password, iv);
  const decrypted = Buffer.concat([decipher.update(dataUpdate), decipher.final()]).toString('utf8');
  return JSON.parse(decrypted);
}

/**
 * Encrypts store data back to kiro-accounts.json
 */
function encryptStore(storeData) {
  const iv = crypto.randomBytes(16);
  const password = crypto.pbkdf2Sync(STORE_SECRET_KEY, iv, 10000, 32, 'sha512');
  const cipher = crypto.createCipheriv('aes-256-cbc', password, iv);
  const payload = Buffer.from(JSON.stringify(storeData), 'utf8');
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const finalBuf = Buffer.concat([iv, Buffer.from(':'), encrypted]);
  fs.writeFileSync(STORE_PATH, finalBuf);
}

/**
 * Read current full configuration safely
 */
export function getFullStore() {
  if (!fs.existsSync(STORE_PATH)) {
    throw new Error(`Kiro store file not found at: ${STORE_PATH}`);
  }
  const raw = fs.readFileSync(STORE_PATH);
  return decryptStore(raw);
}

/**
 * Save store updates safely with backup
 */
export function saveFullStore(storeData) {
  if (fs.existsSync(STORE_PATH)) {
    try {
      const backupPath = STORE_PATH + '.bak';
      fs.copyFileSync(STORE_PATH, backupPath);
    } catch {}
  }
  encryptStore(storeData);
  return { success: true, timestamp: Date.now() };
}

/**
 * Backup full database to a specified or auto-generated path
 */
export function backupStore(targetPath = null) {
  const store = getFullStore();
  const dest = targetPath || path.join(APPDATA_DIR, 'kiro-account-manager', `kiro-backup-${Date.now()}.json`);
  fs.writeFileSync(dest, JSON.stringify(store, null, 2), 'utf8');
  return { success: true, backupPath: dest };
}

/**
 * Restore database from a backup JSON file
 */
export function restoreStore(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file not found at: ${sourcePath}`);
  }
  const content = fs.readFileSync(sourcePath, 'utf8');
  const data = JSON.parse(content);
  saveFullStore(data);
  return { success: true, restoredFrom: sourcePath, accounts: Object.keys(data.accountData?.accounts || {}).length };
}

/**
 * Set any arbitrary key/path inside store using dot notation
 */
export function setAnySetting(dotPath, value) {
  const store = getFullStore();
  const parts = dotPath.split('.');
  let curr = store;

  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (curr[p] === undefined || curr[p] === null || typeof curr[p] !== 'object') {
      curr[p] = {};
    }
    curr = curr[p];
  }

  const lastKey = parts[parts.length - 1];
  curr[lastKey] = value;

  saveFullStore(store);
  return { success: true, path: dotPath, value };
}

/**
 * Get any arbitrary key/path inside store using dot notation
 */
export function getAnySetting(dotPath) {
  const store = getFullStore();
  if (!dotPath) return store;
  const parts = dotPath.split('.');
  let curr = store;

  for (const p of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[p];
  }
  return curr;
}

// ==========================================
// 🛡️ ANTI-BAN SHIELD & ACCOUNT PROTECTION
// ==========================================

export function applyAntiBanArmor() {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};
  if (!store.proxyConfig) store.proxyConfig = {};

  const accounts = store.accountData.accounts || {};
  let newlyAssignedMachineIds = 0;

  // 1. Assign unique cryptographic Machine IDs directly to acc.machineId (Desktop App native schema)
  for (const [id, acc] of Object.entries(accounts)) {
    if (!acc.machineId || acc.machineId.length < 32) {
      const uniqueMid = crypto.randomBytes(32).toString('hex');
      acc.machineId = uniqueMid;
      newlyAssignedMachineIds++;
    }
  }

  // 2. Configure Machine ID Spoofing Mode using native Electron App schema
  store.accountData.machineIdConfig = {
    autoSwitchOnAccountChange: true,
    bindMachineIdToAccount: true,
    useBindedMachineId: true
  };

  // 3. Configure Safe Rate Limiting & Refresh Jitter
  store.accountData.autoRefreshEnabled = true;
  store.accountData.autoRefreshInterval = 15; // 15 mins
  store.accountData.autoRefreshConcurrency = 3; // Max 3 parallel refreshes
  store.accountData.statusCheckInterval = 120; // 2 minutes check interval

  // 4. Configure Quota Protection & Auto-Switch Threshold
  store.accountData.autoSwitchEnabled = true;
  store.accountData.autoSwitchThreshold = 5; // Switch before hitting 0% quota cliff
  store.accountData.autoSwitchInterval = 10;
  store.accountData.switchTarget = 'highest_quota';

  // 5. Configure Proxy Safety (Circuit Breaker & Token Reserve Margin)
  store.proxyConfig.enableMultiAccount = true;
  store.proxyConfig.multiAccountStrategy = 'roundRobin';
  store.proxyConfig.maxRetries = 3;
  store.proxyConfig.retryDelayMs = 1500;
  store.proxyConfig.clientDrivenToolExecution = true;
  store.proxyConfig.enableTokenBufferReserve = true;
  store.proxyConfig.tokenBufferReserve = 25000;

  saveFullStore(store);

  return {
    success: true,
    totalAccountsProtected: Object.keys(accounts).length,
    newlyAssignedMachineIds,
    protectionsApplied: [
      '100% Unique Hardware Machine IDs per Account (Fingerprint Isolation)',
      'OIDC Token Refresh Rate Limiter (Max Concurrency: 3, 15m interval)',
      'Circuit Breaker Exponential Backoff on 429 / 403 errors',
      'Quota Exhaustion Auto-Switch Protection (Threshold: 5% remaining)',
      'Token Reserve Safety Buffer (25,000 tokens reserve margin)'
    ]
  };
}

// ==========================================
// 1. ACCOUNT MANAGEMENT & TOKEN REFRESH
// ==========================================

export function listAccounts() {
  const store = getFullStore();
  const rawAccounts = store.accountData?.accounts || {};
  const activeId = store.accountData?.activeAccountId || null;
  const accounts = [];

  for (const [id, acc] of Object.entries(rawAccounts)) {
    const creds = acc.credentials || {};
    const expiresAt = acc.expiresAt || creds.expiresAt || 0;
    const isExpired = expiresAt > 0 && expiresAt < Date.now();
    const expiresInMin = expiresAt > 0 ? Math.round((expiresAt - Date.now()) / 60000) : null;

    accounts.push({
      id: acc.id || id,
      email: acc.email || 'N/A',
      nickname: acc.nickname || acc.email || id,
      idp: acc.idp || 'AWS Builder ID',
      authMethod: acc.authMethod || (acc.idp === 'Google' || acc.idp === 'GitHub' ? 'social' : 'sso'),
      region: acc.region || 'us-east-1',
      isActive: id === activeId,
      expiresAt: expiresAt > 0 ? new Date(expiresAt).toISOString() : 'Unknown',
      expiresInMinutes: expiresInMin,
      isExpired,
      status: acc.status || (isExpired ? 'expired' : 'active'),
      quota: acc.quota || null,
      machineId: acc.machineId || store.accountData?.accountMachineIds?.[id] || null,
      boundProxy: store.accountData?.accountProxyBindings?.[id] || null,
      groupId: acc.groupId || null,
      tags: acc.tags || [],
      lastUsed: acc.lastUsed ? new Date(acc.lastUsed).toISOString() : 'Never'
    });
  }

  return {
    total: accounts.length,
    activeAccountId: activeId,
    activeAccountEmail: accounts.find(a => a.isActive)?.email || null,
    accounts
  };
}

export function switchActiveAccount(idOrEmail) {
  const store = getFullStore();
  const rawAccounts = store.accountData?.accounts || {};
  let targetId = null;

  for (const [id, acc] of Object.entries(rawAccounts)) {
    if (id === idOrEmail || acc.email === idOrEmail || acc.nickname === idOrEmail) {
      targetId = id;
      break;
    }
  }

  if (!targetId) {
    throw new Error(`Account not found matching: ${idOrEmail}`);
  }

  if (!store.accountData) store.accountData = {};
  store.accountData.activeAccountId = targetId;
  saveFullStore(store);

  return {
    success: true,
    activeAccountId: targetId,
    email: rawAccounts[targetId]?.email || targetId
  };
}

/**
 * Refresh an account's token via OIDC or Social Auth endpoint
 */
export async function refreshAccountToken(idOrEmail) {
  const store = getFullStore();
  const rawAccounts = store.accountData?.accounts || {};
  let targetAcc = null;
  let targetId = null;

  for (const [id, acc] of Object.entries(rawAccounts)) {
    if (id === idOrEmail || acc.email === idOrEmail || acc.nickname === idOrEmail) {
      targetAcc = acc;
      targetId = id;
      break;
    }
  }

  if (!targetAcc) throw new Error(`Account not found matching: ${idOrEmail}`);

  const creds = targetAcc.credentials || {};
  const refreshToken = creds.refreshToken || targetAcc.refreshToken;
  if (!refreshToken) throw new Error(`No refreshToken found for account: ${targetAcc.email}`);

  const authMethod = targetAcc.authMethod || (targetAcc.idp === 'Google' || targetAcc.idp === 'GitHub' ? 'social' : 'sso');
  const region = targetAcc.region || creds.region || 'us-east-1';

  let refreshResult;
  if (authMethod === 'social') {
    const payload = JSON.stringify({ refreshToken });
    refreshResult = await new Promise((resolve, reject) => {
      const req = https.request(`${KIRO_AUTH_ENDPOINT}/refreshToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
            else reject(new Error(parsed.error || `HTTP ${res.statusCode}: ${body}`));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  } else {
    const payload = JSON.stringify({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      refreshToken,
      grantType: 'refresh_token'
    });
    refreshResult = await new Promise((resolve, reject) => {
      const req = https.request(`https://oidc.${region}.amazonaws.com/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 15000
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
            else reject(new Error(parsed.error || `HTTP ${res.statusCode}: ${body}`));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  if (refreshResult.accessToken) {
    const expiresAt = Date.now() + (refreshResult.expiresIn || 3600) * 1000;
    targetAcc.credentials.accessToken = refreshResult.accessToken;
    targetAcc.credentials.expiresAt = expiresAt;
    targetAcc.expiresAt = expiresAt;
    targetAcc.status = 'active';
    if (refreshResult.refreshToken) {
      targetAcc.credentials.refreshToken = refreshResult.refreshToken;
    }
    saveFullStore(store);
    return {
      success: true,
      email: targetAcc.email,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInMinutes: Math.round((refreshResult.expiresIn || 3600) / 60)
    };
  }

  throw new Error(refreshResult.error || 'Token refresh failed without access token');
}

// ==========================================
// 2. GROUPS & TAGS MANAGEMENT
// ==========================================

export function listGroupsAndTags() {
  const store = getFullStore();
  const accData = store.accountData || {};
  return {
    groups: Array.isArray(accData.groups) ? accData.groups : [],
    tags: Array.isArray(accData.tags) ? accData.tags : []
  };
}

export function addAccountGroup(name, description = '', color = '#4a9eff') {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};
  if (!Array.isArray(store.accountData.groups)) store.accountData.groups = [];

  const group = {
    id: crypto.randomUUID(),
    name,
    description,
    color,
    order: store.accountData.groups.length,
    createdAt: Date.now()
  };

  store.accountData.groups.push(group);
  saveFullStore(store);
  return { success: true, group };
}

export function addAccountTag(name, color = '#10b981') {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};
  if (!Array.isArray(store.accountData.tags)) store.accountData.tags = [];

  const tag = {
    id: crypto.randomUUID(),
    name,
    color
  };

  store.accountData.tags.push(tag);
  saveFullStore(store);
  return { success: true, tag };
}

// ==========================================
// 3. PROXY CONFIGURATION & STATS RESET
// ==========================================

export function getProxyConfig() {
  const store = getFullStore();
  const proxy = store.proxyConfig || {};
  return {
    port: proxy.port || 5580,
    host: proxy.host || '127.0.0.1',
    enabled: proxy.enabled !== false,
    enableMultiAccount: proxy.enableMultiAccount !== false,
    multiAccountStrategy: proxy.multiAccountStrategy || 'roundRobin',
    preferredEndpoint: proxy.preferredEndpoint || 'auto',
    maxRetries: proxy.maxRetries || 3,
    retryDelayMs: proxy.retryDelayMs || 1000,
    payloadSizeLimitKB: proxy.payloadSizeLimitKB || 153600,
    clientDrivenToolExecution: proxy.clientDrivenToolExecution !== false,
    disableTools: proxy.disableTools === true,
    enableTokenBufferReserve: proxy.enableTokenBufferReserve === true,
    tokenBufferReserve: proxy.tokenBufferReserve || 20000,
    logRequests: proxy.logRequests !== false,
    streamEvents: proxy.streamEvents === true,
    apiKey: proxy.apiKey || '',
    apiKeysCount: Array.isArray(proxy.apiKeys) ? proxy.apiKeys.length : 0,
    selectedAccountIds: proxy.selectedAccountIds || []
  };
}

export function updateProxyConfig(updates) {
  const store = getFullStore();
  if (!store.proxyConfig) store.proxyConfig = {};

  const allowedKeys = [
    'port', 'host', 'enabled', 'enableMultiAccount', 'multiAccountStrategy',
    'preferredEndpoint', 'maxRetries', 'retryDelayMs', 'payloadSizeLimitKB',
    'clientDrivenToolExecution', 'disableTools', 'enableTokenBufferReserve',
    'tokenBufferReserve', 'logRequests', 'streamEvents', 'selectedAccountIds', 'apiKey'
  ];

  for (const [key, val] of Object.entries(updates)) {
    if (allowedKeys.includes(key)) {
      store.proxyConfig[key] = val;
    }
  }

  saveFullStore(store);
  return {
    success: true,
    updatedConfig: getProxyConfig()
  };
}

export function resetProxyStats() {
  const store = getFullStore();
  store.proxyTotalRequests = 0;
  store.proxySuccessRequests = 0;
  store.proxyFailedRequests = 0;
  store.proxyTotalCredits = 0;
  store.proxyInputTokens = 0;
  store.proxyOutputTokens = 0;
  saveFullStore(store);
  return { success: true, message: 'All proxy stats and token counts reset' };
}

// ==========================================
// 4. PROXY POOL & AUTO-ROTATION
// ==========================================

export function getProxyPoolConfig() {
  const store = getFullStore();
  const accData = store.accountData || {};
  const poolConfig = accData.proxyPoolConfig || {
    enabled: false,
    autoRotate: false,
    rotateInterval: 10,
    checkInterval: 30,
    strategy: 'lowestLatency',
    maxFailures: 3,
    upstreamProxy: ''
  };
  const pool = Array.isArray(accData.proxyPool) ? accData.proxyPool : [];
  const bindings = accData.accountProxyBindings || {};

  return {
    config: poolConfig,
    totalProxies: pool.length,
    proxies: pool,
    bindings,
    cursor: accData.proxyPoolCursor || 0
  };
}

export function updateProxyPoolConfig(updates) {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};
  if (!store.accountData.proxyPoolConfig) {
    store.accountData.proxyPoolConfig = {
      enabled: false,
      autoRotate: false,
      rotateInterval: 10,
      checkInterval: 30,
      strategy: 'lowestLatency',
      maxFailures: 3
    };
  }

  for (const [key, val] of Object.entries(updates)) {
    store.accountData.proxyPoolConfig[key] = val;
  }

  saveFullStore(store);
  return {
    success: true,
    proxyPoolConfig: store.accountData.proxyPoolConfig
  };
}

export function addProxyToPool({ url, label = '', protocol = 'http' }) {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};
  if (!Array.isArray(store.accountData.proxyPool)) store.accountData.proxyPool = [];

  const id = crypto.randomUUID();
  const entry = {
    id,
    url,
    label: label || url,
    protocol,
    enabled: true,
    status: 'active',
    failCount: 0,
    latency: 0,
    lastChecked: 0,
    createdAt: Date.now()
  };

  store.accountData.proxyPool.push(entry);
  saveFullStore(store);

  return { success: true, addedProxy: entry };
}

export function removeProxyFromPool(idOrUrl) {
  const store = getFullStore();
  if (!store.accountData?.proxyPool) return { success: false, error: 'No proxies in pool' };

  const idx = store.accountData.proxyPool.findIndex(p => p.id === idOrUrl || p.url === idOrUrl || p.label === idOrUrl);
  if (idx === -1) return { success: false, error: `Proxy not found matching: ${idOrUrl}` };

  const removed = store.accountData.proxyPool.splice(idx, 1)[0];
  saveFullStore(store);

  return { success: true, removedProxy: removed };
}

export function bindAccountProxy(accountIdOrEmail, proxyIdOrUrl) {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};
  if (!store.accountData.accountProxyBindings) store.accountData.accountProxyBindings = {};

  const accounts = store.accountData.accounts || {};
  let targetId = accountIdOrEmail;
  for (const [id, acc] of Object.entries(accounts)) {
    if (acc.email === accountIdOrEmail || acc.nickname === accountIdOrEmail) {
      targetId = id;
      break;
    }
  }

  if (proxyIdOrUrl === null || proxyIdOrUrl === '') {
    delete store.accountData.accountProxyBindings[targetId];
  } else {
    store.accountData.accountProxyBindings[targetId] = proxyIdOrUrl;
  }

  saveFullStore(store);
  return { success: true, accountId: targetId, boundProxy: proxyIdOrUrl };
}

// ==========================================
// 5. WEBHOOK NOTIFICATIONS
// ==========================================

export function getWebhooks() {
  const store = getFullStore();
  const accData = store.accountData || {};
  let webhooks = [];

  if (Array.isArray(accData.webhooks)) {
    webhooks = accData.webhooks;
  } else if (typeof accData.webhooks === 'object' && accData.webhooks !== null) {
    webhooks = Object.values(accData.webhooks);
  } else if (Array.isArray(store.webhooks)) {
    webhooks = store.webhooks;
  }

  return {
    total: webhooks.length,
    webhooks
  };
}

export function addWebhook({
  kind = 'custom',
  url,
  label = '',
  enabled = true,
  telegramChatId = '',
  customTemplate = '',
  events = ['batch-completed', 'batch-error', 'risk-warning', 'account-banned', 'token-expired']
}) {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};
  if (!Array.isArray(store.accountData.webhooks)) {
    store.accountData.webhooks = [];
  }

  const id = crypto.randomUUID();
  const entry = {
    id,
    kind,
    url,
    label: label || `${kind}_${url.slice(0, 15)}`,
    enabled,
    telegramChatId,
    customTemplate,
    events,
    createdAt: Date.now()
  };

  store.accountData.webhooks.push(entry);
  saveFullStore(store);

  return { success: true, addedWebhook: entry };
}

export function removeWebhook(idOrUrl) {
  const store = getFullStore();
  if (!store.accountData?.webhooks) return { success: false, error: 'No webhooks found' };

  const idx = store.accountData.webhooks.findIndex(w => w.id === idOrUrl || w.url === idOrUrl || w.label === idOrUrl);
  if (idx === -1) return { success: false, error: `Webhook not found: ${idOrUrl}` };

  const removed = store.accountData.webhooks.splice(idx, 1)[0];
  saveFullStore(store);

  return { success: true, removedWebhook: removed };
}

export function toggleWebhook(idOrUrl, enabled) {
  const store = getFullStore();
  if (!store.accountData?.webhooks) return { success: false, error: 'No webhooks found' };

  const target = store.accountData.webhooks.find(w => w.id === idOrUrl || w.url === idOrUrl || w.label === idOrUrl);
  if (!target) return { success: false, error: `Webhook not found: ${idOrUrl}` };

  target.enabled = enabled !== undefined ? enabled : !target.enabled;
  saveFullStore(store);

  return { success: true, label: target.label, enabled: target.enabled };
}

export async function sendWebhookTest(webhookIdOrUrl) {
  const { webhooks } = getWebhooks();
  const target = webhooks.find(w => w.id === webhookIdOrUrl || w.url === webhookIdOrUrl || w.label === webhookIdOrUrl);
  if (!target) throw new Error(`Webhook not found: ${webhookIdOrUrl}`);

  const payload = {
    title: "🧪 Antigravity Test Notification",
    message: "Kiro Account Manager webhook test successfully dispatched by Antigravity.",
    level: "info",
    timestamp: new Date().toISOString()
  };

  let bodyData;
  let targetUrl = target.url;

  if (target.kind === 'telegram') {
    targetUrl = target.url.endsWith('/sendMessage') ? target.url : `${target.url.replace(/\/$/, '')}/sendMessage`;
    bodyData = JSON.stringify({
      chat_id: target.telegramChatId,
      text: `ℹ️ ${payload.title}\n\n${payload.message}`,
      parse_mode: 'Markdown'
    });
  } else if (target.kind === 'discord') {
    bodyData = JSON.stringify({
      username: 'Kiro Account Manager',
      embeds: [{
        title: `ℹ️ ${payload.title}`,
        description: payload.message,
        color: 0x4a9eff,
        timestamp: payload.timestamp
      }]
    });
  } else if (target.kind === 'dingtalk' || target.kind === 'wechat-work') {
    bodyData = JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        title: payload.title,
        text: `### ℹ️ ${payload.title}\n\n${payload.message}`
      }
    });
  } else {
    bodyData = JSON.stringify(payload);
  }

  const isHttps = targetUrl.startsWith('https:');
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyData)
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode, response: body });
        } else {
          reject(new Error(`Webhook HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Webhook dispatch failed: ${e.message}`)));
    req.write(bodyData);
    req.end();
  });
}

// ==========================================
// 6. MACHINE ID MANAGEMENT
// ==========================================

export function getMachineIdConfig() {
  const store = getFullStore();
  const accData = store.accountData || {};
  const accounts = accData.accounts || {};
  const accountMachineIds = {};

  for (const [id, acc] of Object.entries(accounts)) {
    if (acc.machineId) {
      accountMachineIds[acc.id || id] = {
        email: acc.email || 'N/A',
        machineId: acc.machineId
      };
    }
  }

  return {
    machineIdConfig: accData.machineIdConfig || { autoSwitchOnAccountChange: true, bindMachineIdToAccount: true, useBindedMachineId: true },
    accountMachineIds,
    totalBoundAccounts: Object.keys(accountMachineIds).length
  };
}

export function generateRandomMachineId() {
  return crypto.randomBytes(32).toString('hex');
}

export function setAccountMachineId(accountIdOrEmail, machineId = null) {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};

  const finalId = machineId || generateRandomMachineId();
  const accounts = store.accountData.accounts || {};
  let targetId = accountIdOrEmail;

  for (const [id, acc] of Object.entries(accounts)) {
    if (acc.email === accountIdOrEmail || acc.nickname === accountIdOrEmail || id === accountIdOrEmail) {
      targetId = id;
      acc.machineId = finalId;
      break;
    }
  }

  saveFullStore(store);
  return { success: true, accountId: targetId, machineId: finalId };
}

// ==========================================
// 7. KIRO IDE STEERING RULES & LOCAL MCP CONFIG
// ==========================================

export function listSteeringRules() {
  const steeringDir = path.join(KIRO_DIR, 'steering');
  if (!fs.existsSync(steeringDir)) return [];
  const files = fs.readdirSync(steeringDir).filter(f => f.endsWith('.md'));
  return files.map(filename => {
    const full = path.join(steeringDir, filename);
    const content = fs.readFileSync(full, 'utf8');
    return { filename, path: full, size: content.length, preview: content.slice(0, 150) };
  });
}

export function saveSteeringRule(filename, content) {
  const steeringDir = path.join(KIRO_DIR, 'steering');
  if (!fs.existsSync(steeringDir)) fs.mkdirSync(steeringDir, { recursive: true });
  const finalName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const full = path.join(steeringDir, finalName);
  fs.writeFileSync(full, content, 'utf8');
  return { success: true, filename: finalName, path: full };
}

export function deleteSteeringRule(filename) {
  const steeringDir = path.join(KIRO_DIR, 'steering');
  const finalName = filename.endsWith('.md') ? filename : `${filename}.md`;
  const full = path.join(steeringDir, finalName);
  if (fs.existsSync(full)) {
    fs.unlinkSync(full);
    return { success: true, deleted: finalName };
  }
  return { success: false, error: `File not found: ${finalName}` };
}

export function getKiroIdeMcpConfig() {
  const mcpPath = path.join(KIRO_DIR, 'settings', 'mcp.json');
  if (!fs.existsSync(mcpPath)) return { mcpServers: {}, powers: {} };
  return JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
}

export function saveKiroIdeMcpServer(name, serverConfig) {
  const mcpPath = path.join(KIRO_DIR, 'settings', 'mcp.json');
  let data = { mcpServers: {} };
  if (fs.existsSync(mcpPath)) {
    try { data = JSON.parse(fs.readFileSync(mcpPath, 'utf8')); } catch {}
  }
  if (!data.mcpServers) data.mcpServers = {};
  data.mcpServers[name] = serverConfig;
  fs.writeFileSync(mcpPath, JSON.stringify(data, null, 2), 'utf8');
  return { success: true, serverName: name, config: serverConfig };
}

export function deleteKiroIdeMcpServer(name) {
  const mcpPath = path.join(KIRO_DIR, 'settings', 'mcp.json');
  if (!fs.existsSync(mcpPath)) return { success: false, error: 'mcp.json does not exist' };
  const data = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  if (data.mcpServers && data.mcpServers[name]) {
    delete data.mcpServers[name];
    fs.writeFileSync(mcpPath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, deleted: name };
  }
  return { success: false, error: `Server not found: ${name}` };
}

// ==========================================
// 8. ACCOUNT MANAGER GENERAL SETTINGS
// ==========================================

export function getAccountManagerSettings() {
  const store = getFullStore();
  const accData = store.accountData || {};
  return {
    autoRefreshEnabled: accData.autoRefreshEnabled !== false,
    autoRefreshInterval: accData.autoRefreshInterval || 30,
    autoRefreshConcurrency: accData.autoRefreshConcurrency || 10,
    statusCheckInterval: accData.statusCheckInterval || 60,
    autoSwitchEnabled: accData.autoSwitchEnabled === true,
    autoSwitchThreshold: accData.autoSwitchThreshold || 5,
    autoSwitchInterval: accData.autoSwitchInterval || 10,
    switchTarget: accData.switchTarget || 'highest_quota',
    theme: accData.theme || 'system',
    darkMode: accData.darkMode !== false,
    language: accData.language || 'zh-CN',
    privacyMode: accData.privacyMode === true
  };
}

export function updateAccountManagerSettings(updates) {
  const store = getFullStore();
  if (!store.accountData) store.accountData = {};

  const allowedKeys = [
    'autoRefreshEnabled', 'autoRefreshInterval', 'autoRefreshConcurrency',
    'statusCheckInterval', 'autoSwitchEnabled', 'autoSwitchThreshold',
    'autoSwitchInterval', 'switchTarget', 'theme', 'darkMode', 'language', 'privacyMode'
  ];

  for (const [key, val] of Object.entries(updates)) {
    if (allowedKeys.includes(key)) {
      store.accountData[key] = val;
    }
  }

  saveFullStore(store);
  return {
    success: true,
    updatedSettings: getAccountManagerSettings()
  };
}

// ==========================================
// 9. API KEYS MANAGEMENT
// ==========================================

export function listApiKeys() {
  const store = getFullStore();
  const proxy = store.proxyConfig || {};
  const keys = Array.isArray(proxy.apiKeys) ? proxy.apiKeys : [];
  return {
    masterApiKey: proxy.apiKey || '',
    totalKeys: keys.length,
    keys: keys.map(k => ({
      id: k.id,
      name: k.name,
      key: k.key,
      enabled: k.enabled !== false,
      creditsLimit: k.creditsLimit || null,
      totalCreditsUsed: k.usage?.totalCredits || 0,
      totalRequests: k.usage?.totalRequests || 0,
      totalInputTokens: k.usage?.totalInputTokens || 0,
      totalOutputTokens: k.usage?.totalOutputTokens || 0,
      createdAt: k.createdAt ? new Date(k.createdAt).toISOString() : null,
      lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : 'Never'
    }))
  };
}

export function addApiKey(name, creditsLimit = null) {
  const store = getFullStore();
  if (!store.proxyConfig) store.proxyConfig = {};
  if (!Array.isArray(store.proxyConfig.apiKeys)) store.proxyConfig.apiKeys = [];

  const rawKey = 'sk-' + crypto.randomBytes(24).toString('hex');
  const newKeyObj = {
    id: crypto.randomUUID(),
    name: name || `API Key ${store.proxyConfig.apiKeys.length + 1}`,
    key: rawKey,
    format: 'sk',
    enabled: true,
    createdAt: Date.now(),
    creditsLimit: creditsLimit ? Number(creditsLimit) : null,
    usage: {
      totalRequests: 0,
      totalCredits: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      daily: {},
      byModel: {}
    },
    lastUsedAt: null,
    usageHistory: []
  };

  store.proxyConfig.apiKeys.push(newKeyObj);
  saveFullStore(store);

  return {
    success: true,
    createdKey: newKeyObj
  };
}

export function deleteApiKey(idOrKey) {
  const store = getFullStore();
  if (!store.proxyConfig?.apiKeys) return { success: false, error: 'No API keys configured' };

  const idx = store.proxyConfig.apiKeys.findIndex(k => k.id === idOrKey || k.key === idOrKey || k.name === idOrKey);
  if (idx === -1) return { success: false, error: `Key not found matching: ${idOrKey}` };

  const deleted = store.proxyConfig.apiKeys.splice(idx, 1)[0];
  saveFullStore(store);

  return {
    success: true,
    deletedKey: deleted.name
  };
}

export function toggleApiKey(idOrKey, enabled) {
  const store = getFullStore();
  if (!store.proxyConfig?.apiKeys) return { success: false, error: 'No API keys configured' };

  const key = store.proxyConfig.apiKeys.find(k => k.id === idOrKey || k.key === idOrKey || k.name === idOrKey);
  if (!key) return { success: false, error: `Key not found matching: ${idOrKey}` };

  key.enabled = enabled !== undefined ? enabled : !key.enabled;
  saveFullStore(store);

  return {
    success: true,
    key: key.name,
    enabled: key.enabled
  };
}
