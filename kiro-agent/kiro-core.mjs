/**
 * Kiro Agent V2 - High-Performance Multi-Model Core (kiro-core.mjs)
 * 
 * Supports both V2 High-Performance Swarm Engines (Architect-Editor, LLM Council)
 * and 100% Backward Compatibility with V1 APIs (executeTask, executeSwarm, executeParallel).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_PROXY_HOST = '127.0.0.1';
const DEFAULT_PROXY_PORT = 5580;
const STORE_SECRET_KEY = process.env.KIRO_STORE_SECRET_KEY || 'kiro-account-manager-secret-key';

export const MIN_SWARM_ACCOUNTS = Math.max(1, parseInt(process.env.KIRO_MIN_ACCOUNTS || '3', 10) || 3);

/**
 * Setup problem the user can fix (missing Account Manager, offline proxy, too few accounts).
 * `message` is already user-facing; `code` lets callers branch.
 */
export class KiroSetupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'KiroSetupError';
    this.code = code;
  }
}

function setupMessage(code, detail = {}) {
  const manager = 'Kiro Account Manager';
  switch (code) {
    case 'ACCOUNT_MANAGER_MISSING':
      return [
        `Kiro Account Manager was not found on this machine (no kiro-accounts.json).`,
        `The kiro-agent commands (run, swarm, parallel, review, MCP tools) route through its local proxy.`,
        ``,
        `To use them:`,
        `  1. Install ${manager} and sign in to your Kiro account(s).`,
        `  2. Start its API proxy (default ${detail.baseUrl || 'http://127.0.0.1:5580'}).`,
        `  3. Re-run this command. Check with: kiro status`,
        ``,
        `Only want auto-approval inside the Kiro IDE? That needs no proxy: run "kiro-auto-accept".`
      ].join('\n');
    case 'PROXY_OFFLINE':
      return [
        `The Kiro proxy at ${detail.baseUrl || 'http://127.0.0.1:5580'} is not running.`,
        ``,
        `Open Kiro Account Manager and start its API proxy, then retry. Check with: kiro status`,
        `If the proxy uses another host or port, set KIRO_PROXY_HOST / KIRO_PROXY_PORT.`
      ].join('\n');
    case 'ACCOUNTS_TOO_FEW':
      return [
        `"${detail.feature || 'This command'}" needs at least ${MIN_SWARM_ACCOUNTS} Kiro accounts in the pool, but only ${detail.count} ${detail.count === 1 ? 'is' : 'are'} available.`,
        ``,
        `Swarm, parallel and multi-model review spread requests across accounts to avoid rate limits.`,
        `Add more accounts in ${manager}, then retry.`,
        `Single-model commands (kiro run) work with one account.`,
        `To lower the requirement, set KIRO_MIN_ACCOUNTS.`
      ].join('\n');
    default:
      return detail.message || 'Kiro setup problem.';
  }
}

let cachedAuth = null;
let lastAuthCheck = 0;

/**
 * Decrypts kiro-accounts.json from electron-store Conf structure
 */
function decryptConfData(rawBuffer, secret) {
  try {
    const iv = rawBuffer.subarray(0, 16);
    const dataUpdate = rawBuffer.subarray(17);
    const password = crypto.pbkdf2Sync(secret, iv, 10000, 32, 'sha512');
    const decipher = crypto.createDecipheriv('aes-256-cbc', password, iv);
    const decrypted = Buffer.concat([decipher.update(dataUpdate), decipher.final()]).toString('utf8');
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

/**
 * Locate and read local Kiro Account Manager settings & API key
 */
export function getProxyAuth(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedAuth && (now - lastAuthCheck < 30000)) {
    return cachedAuth;
  }

  let host = process.env.KIRO_PROXY_HOST || DEFAULT_PROXY_HOST;
  let port = parseInt(process.env.KIRO_PROXY_PORT || DEFAULT_PROXY_PORT, 10);
  let apiKey = process.env.KIRO_API_KEY || '';
  let accountsCount = 0;
  let storeFound = false;

  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || (process.platform === 'darwin'
    ? path.join(homeDir, 'Library', 'Application Support')
    : (process.platform === 'win32'
      ? path.join(homeDir, 'AppData', 'Roaming')
      : path.join(homeDir, '.config')));
  const storePath = process.env.KIRO_STORE_PATH || path.join(appData, 'kiro-account-manager', 'kiro-accounts.json');

  if (fs.existsSync(storePath)) {
    storeFound = true;
    try {
      const raw = fs.readFileSync(storePath);
      const storeData = decryptConfData(raw, STORE_SECRET_KEY);
      if (storeData) {
        if (storeData.proxyConfig) {
          port = storeData.proxyConfig.port || port;
          host = storeData.proxyConfig.host || host;
          if (!apiKey) {
            if (storeData.proxyConfig.apiKey) {
              apiKey = storeData.proxyConfig.apiKey;
            } else if (Array.isArray(storeData.proxyConfig.apiKeys)) {
              const active = storeData.proxyConfig.apiKeys.find(k => k.enabled && k.key);
              if (active) apiKey = active.key;
            }
          }
        }
        if (storeData.accountData && Array.isArray(storeData.accountData.accounts)) {
          accountsCount = storeData.accountData.accounts.length;
        }
      }
    } catch {
      // fallback
    }
  }

  const baseUrl = `http://${host}:${port}`;
  cachedAuth = {
    baseUrl,
    url: baseUrl,
    host,
    port,
    apiKey,
    accountsCount,
    storeFound,
    discoveredAt: now
  };
  lastAuthCheck = now;
  return cachedAuth;
}

const sharedHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 16,
  timeout: 120000
});

const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50MB limit

/**
 * Perform an HTTP JSON request to Kiro Proxy with connection reuse & timeout guard
 */
export async function proxyRequest(urlPath, method = 'GET', data = null, customHeaders = {}) {
  const auth = getProxyAuth();
  const headers = {
    'Accept': 'application/json',
    ...customHeaders
  };

  if (auth.apiKey) {
    headers['Authorization'] = `Bearer ${auth.apiKey}`;
  }

  let postBody = null;
  if (data !== null) {
    postBody = typeof data === 'string' ? data : JSON.stringify(data);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(postBody);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const safeReject = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const req = http.request({
      agent: sharedHttpAgent,
      hostname: auth.host,
      port: auth.port,
      path: urlPath,
      method,
      headers,
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', chunk => {
        body += chunk;
        if (body.length > MAX_RESPONSE_BYTES) {
          req.destroy();
          safeReject(new Error(`Response exceeded maximum allowed size of 50MB on ${urlPath}`));
        }
      });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          safeResolve({ status: res.statusCode, data: parsed });
        } else {
          const errMsg = (parsed && parsed.error && parsed.error.message) || (typeof parsed === 'string' ? parsed : `HTTP ${res.statusCode}`);
          const err = new Error(errMsg);
          err.status = res.statusCode;
          err.body = parsed;
          safeReject(err);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      safeReject(new Error(`Kiro proxy request timed out after 120s on ${urlPath}`));
    });

    req.on('error', (e) => {
      const refused = ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(e.code);
      if (refused) {
        const code = auth.storeFound ? 'PROXY_OFFLINE' : 'ACCOUNT_MANAGER_MISSING';
        safeReject(new KiroSetupError(code, setupMessage(code, { baseUrl: auth.baseUrl })));
      } else {
        safeReject(new Error(`Cannot connect to Kiro Proxy on ${auth.baseUrl}: ${e.message}`));
      }
    });

    if (postBody) req.write(postBody);
    req.end();
  });
}

/**
 * Check Proxy Health and 20-Account Pool Status
 */
export async function getStatus() {
  const auth = getProxyAuth(true);
  try {
    const res = await proxyRequest('/');
    return {
      online: true,
      baseUrl: auth.baseUrl,
      hasApiKey: !!auth.apiKey,
      accounts: res.data?.accounts || auth.accountsCount,
      availableAccounts: res.data?.availableAccounts || auth.accountsCount,
      configuredAccounts: auth.accountsCount,
      stats: res.data?.stats || {},
      proxyStatus: res.data
    };
  } catch (err) {
    return {
      online: false,
      baseUrl: auth.baseUrl,
      hasApiKey: !!auth.apiKey,
      configuredAccounts: auth.accountsCount,
      accountManagerInstalled: !!auth.storeFound,
      error: err.message
    };
  }
}

/**
 * List available models from Kiro Proxy
 */
export async function listModels() {
  const res = await proxyRequest('/v1/models');
  const models = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
  
  return models.map(m => ({
    id: m.id,
    name: m.name || m.id,
    description: m.description || '',
    family: m.family || '',
    contextLength: m.context_length || m.limit?.context || 200000,
    maxTokens: m.max_tokens || m.limit?.output || 64000
  }));
}

/**
 * Role System Prompts for Specialized Personas
 */
export const ROLE_PROMPTS = {
  architect: "You are a Principal Software Architect. Focus exclusively on system design, component boundaries, invariants, API contracts, and high-signal execution blueprints.",
  editor: "You are a Surgical Code Editor. Follow the architect's blueprint precisely to generate concise, correct, production-grade implementations and diffs.",
  coder: "You are an elite principal software engineer. Provide complete, correct, optimal, and elegant code implementations with clean architecture and strict edge-case handling.",
  reviewer: "You are a senior security & code quality reviewer. Deeply inspect the code for subtle bugs, security vulnerabilities, edge-case regressions, and architectural antipatterns. Be direct and actionable.",
  critic: "You are a Blind Peer Reviewer. Objectively critique the solution for subtle logic bugs, race conditions, edge-case regressions, and algorithmic complexity.",
  judge: "You are a Supreme Technical Arbiter. Weigh conflicting peer evaluations objectively and select or synthesize the definitive gold-standard solution.",
  tester: "You are a senior QA engineer. Generate comprehensive unit tests, integration tests, fuzzing vectors, and edge-case boundary checks.",
  researcher: "You are a senior research analyst. Provide structured, factual, detailed, and high-signal syntheses of the provided information.",
  optimizer: "You are a high-performance computing and algorithmic optimization expert. Identify hotspots, memory bottlenecks, latency issues, and provide optimized algorithms.",
  general: "You are an expert AI assistant designed for high-accuracy reasoning and execution."
};

/**
 * Low-level execution of a single task on a specific model
 */
export async function executeRaw({
  prompt,
  model = 'claude-sonnet-4.5',
  systemPrompt = null,
  role = 'coder',
  temperature = 0.2,
  maxTokens = 4096,
  retries = 2
}) {
  const sys = systemPrompt || ROLE_PROMPTS[role] || ROLE_PROMPTS.coder;
  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: prompt }
  ];

  let lastErr = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const startTime = Date.now();
      const res = await proxyRequest('/v1/chat/completions', 'POST', {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      });

      const choice = res.data?.choices?.[0];
      const content = choice?.message?.content || '';
      const usage = res.data?.usage || {};
      const durationMs = Date.now() - startTime;

      return {
        success: true,
        model: res.data?.model || model,
        content,
        usage,
        durationMs,
        role
      };
    } catch (err) {
      lastErr = err;
      if (attempt <= retries) {
        const isRateLimit = lastErr?.status === 429;
        const baseDelay = isRateLimit ? 2500 : 1000;
        const delay = Math.min(30000, baseDelay * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  return {
    success: false,
    model,
    error: lastErr?.message || 'Execution failed',
    role
  };
}

/**
 * Backward-Compatible V1 API: Single Task Execution
 */
export async function executeTask({
  prompt,
  model = 'claude-sonnet-4.5',
  role = 'coder',
  systemPrompt = null,
  temperature = 0.2,
  maxTokens = 4096,
  retries = 2
}) {
  return executeRaw({ prompt, model, role, systemPrompt, temperature, maxTokens, retries });
}

/**
 * Gate for multi-account features. Throws KiroSetupError with next steps
 * when the proxy is unreachable or the pool is too small.
 */
export async function assertSwarmReady(feature) {
  const status = await getStatus();
  if (!status.online) {
    const code = status.accountManagerInstalled ? 'PROXY_OFFLINE' : 'ACCOUNT_MANAGER_MISSING';
    throw new KiroSetupError(code, setupMessage(code, { baseUrl: status.baseUrl }));
  }
  const count = Number(status.availableAccounts ?? status.accounts ?? status.configuredAccounts ?? 0);
  if (count < MIN_SWARM_ACCOUNTS) {
    throw new KiroSetupError('ACCOUNTS_TOO_FEW', setupMessage('ACCOUNTS_TOO_FEW', { feature, count }));
  }
  return status;
}

/**
 * Backward-Compatible V1 API: Swarm Execution (Mapped to LLM Council)
 */
export async function executeSwarm({
  prompt,
  models = ['claude-sonnet-4.5', 'deepseek-3.2', 'qwen3-coder-next', 'minimax-m2.5'],
  synthesizeModel = 'claude-sonnet-4.5'
}) {
  await assertSwarmReady('kiro swarm');
  const { executeCouncil } = await import('./engine-council.mjs');
  return executeCouncil({
    prompt,
    councilModels: models,
    chairmanModel: synthesizeModel
  });
}

/**
 * Backward-Compatible V1 API: Parallel Tasks
 */
export async function executeParallel({
  tasks,
  concurrency = 8,
  defaultModel = 'claude-sonnet-4.5',
  defaultRole = 'coder',
  onProgress = null
}) {
  await assertSwarmReady('kiro parallel');
  const { executeParallelBatch } = await import('./engine-router.mjs');
  return executeParallelBatch({
    tasks: tasks.map(t => ({
      id: t.id,
      prompt: t.prompt,
      model: t.model || defaultModel,
      mode: 'auto'
    })),
    concurrency,
    onProgress
  });
}

/**
 * Backward-Compatible V1 API: Code Review
 */
export async function executeCodeReview({
  code,
  context = '',
  focus = ['security', 'correctness', 'performance', 'architecture']
}) {
  await assertSwarmReady('kiro review');
  const reviewPrompt = `Perform a comprehensive multi-dimensional code audit focusing on ${focus.join(', ')}.\n\nCode to review:\n\`\`\`\n${code}\n\`\`\`\n\nContext:\n${context}`;
  const { executeCouncil } = await import('./engine-council.mjs');
  const res = await executeCouncil({
    prompt: reviewPrompt,
    councilModels: ['claude-sonnet-4.5', 'deepseek-3.2'],
    chairmanModel: 'claude-sonnet-4.5'
  });
  return {
    ...res,
    durationMs: res.totalDurationMs || res.durationMs || 0,
    reviews: res.reviews || [
      { title: 'Logic & Correctness Audit', model: 'deepseek-3.2', content: res.peerReviews?.logicAudit || 'Audit complete.' },
      { title: 'Architecture & Security Audit', model: 'claude-sonnet-4.5', content: res.peerReviews?.architectureAudit || 'Audit complete.' },
      { title: 'Consensus & Recommendations', model: 'claude-sonnet-4.5', content: res.finalSolution || 'Audit complete.' }
    ]
  };
}
