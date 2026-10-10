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
  let accountsCount = 20;

  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || (process.platform === 'darwin'
    ? path.join(homeDir, 'Library', 'Application Support')
    : (process.platform === 'win32'
      ? path.join(homeDir, 'AppData', 'Roaming')
      : path.join(homeDir, '.config')));
  const storePath = process.env.KIRO_STORE_PATH || path.join(appData, 'kiro-account-manager', 'kiro-accounts.json');

  if (fs.existsSync(storePath)) {
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
    discoveredAt: now
  };
  lastAuthCheck = now;
  return cachedAuth;
}

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
    const req = http.request({
      hostname: auth.host,
      port: auth.port,
      path: urlPath,
      method,
      headers,
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: parsed });
        } else {
          const errMsg = (parsed && parsed.error && parsed.error.message) || (typeof parsed === 'string' ? parsed : `HTTP ${res.statusCode}`);
          const err = new Error(errMsg);
          err.status = res.statusCode;
          err.body = parsed;
          reject(err);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Kiro proxy request timed out after 120s on ${urlPath}`));
    });

    req.on('error', (e) => reject(new Error(`Cannot connect to Kiro Proxy on ${auth.baseUrl}: ${e.message}`)));

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
        await new Promise(r => setTimeout(r, 800 * attempt));
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
 * Backward-Compatible V1 API: Swarm Execution (Mapped to LLM Council)
 */
export async function executeSwarm({
  prompt,
  models = ['claude-sonnet-4.5', 'deepseek-3.2', 'qwen3-coder-next', 'minimax-m2.5'],
  synthesizeModel = 'claude-sonnet-4.5'
}) {
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
  defaultRole = 'coder'
}) {
  const { executeParallelBatch } = await import('./engine-router.mjs');
  return executeParallelBatch({
    tasks: tasks.map(t => ({
      id: t.id,
      prompt: t.prompt,
      model: t.model || defaultModel,
      mode: 'auto'
    })),
    concurrency
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
  const reviewPrompt = `Perform a comprehensive multi-dimensional code audit focusing on ${focus.join(', ')}.\n\nCode to review:\n\`\`\`\n${code}\n\`\`\`\n\nContext:\n${context}`;
  const { executeCouncil } = await import('./engine-council.mjs');
  return executeCouncil({
    prompt: reviewPrompt,
    councilModels: ['claude-sonnet-4.5', 'deepseek-3.2'],
    chairmanModel: 'claude-sonnet-4.5'
  });
}
