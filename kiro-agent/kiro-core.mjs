import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';

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
  } catch (err) {
    return null;
  }
}

/**
 * Discovers proxy URL and active API key dynamically
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
    } catch (e) {
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
 * Perform an HTTP JSON request to Kiro Proxy
 */
async function proxyRequest(urlPath, method = 'GET', data = null, customHeaders = {}) {
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
 * Check Proxy Health and Status
 */
export async function getStatus() {
  const auth = getProxyAuth(true);
  try {
    const res = await proxyRequest('/');
    return {
      online: true,
      baseUrl: auth.baseUrl,
      hasApiKey: !!auth.apiKey,
      configuredAccounts: auth.accountsCount,
      proxyStatus: res.data
    };
  } catch (err) {
    return {
      online: false,
      baseUrl: auth.baseUrl,
      hasApiKey: !!auth.apiKey,
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
    maxTokens: m.max_tokens || m.limit?.output || 64000,
    rateMultiplier: m.rateMultiplier !== undefined ? m.rateMultiplier : (m.cost?.rateMultiplier || 1.0),
    rateUnit: m.rateUnit || 'Credit',
    capabilities: m.capabilities || {},
    inputTypes: m.inputTypes || ['TEXT']
  }));
}

/**
 * Role System Prompts
 */
export const ROLE_PROMPTS = {
  coder: "You are an elite principal software engineer. Provide complete, correct, optimal, and elegant code implementations with clean architecture and strict edge-case handling.",
  reviewer: "You are a senior security & code quality reviewer. Deeply inspect the code for subtle bugs, security vulnerabilities, edge-case regressions, and architectural antipatterns. Be direct and actionable.",
  architect: "You are a master system architect. Provide high-level architectural designs, component breakdowns, data models, scalability analysis, and trade-off considerations.",
  tester: "You are a senior QA engineer. Generate comprehensive unit tests, integration tests, fuzzing vectors, and edge-case boundary checks.",
  researcher: "You are a senior research analyst. Provide structured, factual, detailed, and high-signal syntheses of the provided information.",
  optimizer: "You are a high-performance computing and algorithmic optimization expert. Identify hotspots, memory bottlenecks, latency issues, and provide optimized algorithms.",
  general: "You are an expert AI assistant designed for high-accuracy reasoning and execution."
};

/**
 * Single Task Execution via Kiro Proxy
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
  const sys = systemPrompt || ROLE_PROMPTS[role] || ROLE_PROMPTS.general;
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
        await new Promise(r => setTimeout(r, 1000 * attempt));
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
 * Parallel Task Batch Execution
 * Concurrently dispatches an array of tasks across Kiro's account pool.
 */
export async function executeParallel({
  tasks,
  defaultModel = 'claude-sonnet-4.5',
  defaultRole = 'coder',
  concurrency = 8,
  temperature = 0.2,
  maxTokens = 4096,
  onProgress = null
}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { total: 0, completed: 0, failed: 0, results: [] };
  }

  const results = new Array(tasks.length);
  let currentIndex = 0;
  let activeWorkers = 0;
  let completedCount = 0;
  const startTime = Date.now();

  return new Promise((resolve) => {
    function startNext() {
      if (currentIndex >= tasks.length) {
        if (activeWorkers === 0) {
          const totalDurationMs = Date.now() - startTime;
          const successful = results.filter(r => r.success).length;
          resolve({
            total: tasks.length,
            completed: tasks.length,
            successful,
            failed: tasks.length - successful,
            totalDurationMs,
            results
          });
        }
        return;
      }

      const taskIndex = currentIndex++;
      const rawTask = tasks[taskIndex];
      const task = typeof rawTask === 'string' ? { prompt: rawTask } : rawTask;
      const taskId = task.id || `task-${taskIndex + 1}`;
      const taskModel = task.model || defaultModel;
      const taskRole = task.role || defaultRole;
      const taskSystem = task.systemPrompt || null;

      activeWorkers++;

      executeTask({
        prompt: task.prompt,
        model: taskModel,
        role: taskRole,
        systemPrompt: taskSystem,
        temperature: task.temperature !== undefined ? task.temperature : temperature,
        maxTokens: task.maxTokens || maxTokens
      }).then((res) => {
        results[taskIndex] = {
          id: taskId,
          taskIndex,
          prompt: task.prompt,
          title: task.title || `Task #${taskIndex + 1}`,
          ...res
        };
      }).catch((err) => {
        results[taskIndex] = {
          id: taskId,
          taskIndex,
          prompt: task.prompt,
          title: task.title || `Task #${taskIndex + 1}`,
          success: false,
          model: taskModel,
          error: err.message
        };
      }).finally(() => {
        activeWorkers--;
        completedCount++;
        if (typeof onProgress === 'function') {
          onProgress({
            completed: completedCount,
            total: tasks.length,
            latest: results[taskIndex]
          });
        }
        startNext();
      });
    }

    const initialWorkers = Math.min(concurrency, tasks.length);
    for (let i = 0; i < initialWorkers; i++) {
      startNext();
    }
  });
}

/**
 * Swarm Consensus Execution
 * Dispatches the same prompt to multiple different models in parallel,
 * then synthesizes their answers into an optimal final response.
 */
export async function executeSwarm({
  prompt,
  models = ['claude-sonnet-4.5', 'deepseek-3.2', 'qwen3-coder-next', 'minimax-m2.5'],
  synthesizeModel = 'claude-sonnet-4.5',
  role = 'coder'
}) {
  const swarmTasks = models.map((m) => ({
    id: `swarm-${m}`,
    title: `Model ${m}`,
    model: m,
    role,
    prompt
  }));

  const batchResult = await executeParallel({
    tasks: swarmTasks,
    concurrency: models.length
  });

  const modelResponses = batchResult.results
    .filter(r => r.success)
    .map(r => `### Solution from ${r.model}:\n\n${r.content}`)
    .join('\n\n---\n\n');

  if (!modelResponses) {
    return {
      success: false,
      error: 'All swarm models failed to generate answers',
      swarmResults: batchResult.results
    };
  }

  const synthesisPrompt = `You are the lead synthesizer. The user posed the following prompt:

<USER_PROMPT>
${prompt}
</USER_PROMPT>

Below are solutions independently generated in parallel by multiple advanced AI models (${models.join(', ')}):

${modelResponses}

Your objective:
1. Compare and evaluate the strengths and weaknesses of each solution.
2. Filter out any bugs, hallucinated code, or sub-optimal patterns.
3. Synthesize the single absolute BEST, most robust, cleanest, and complete unified solution.
4. Output the final refined solution clearly.`;

  const finalSynthesis = await executeTask({
    prompt: synthesisPrompt,
    model: synthesizeModel,
    role: 'architect',
    maxTokens: 8192
  });

  return {
    success: finalSynthesis.success,
    modelsUsed: models,
    synthesizeModel,
    finalSolution: finalSynthesis.content,
    swarmAnswers: batchResult.results,
    durationMs: batchResult.totalDurationMs + (finalSynthesis.durationMs || 0)
  };
}

/**
 * Multi-Angle Parallel Code Review
 */
export async function executeCodeReview({
  code,
  context = '',
  focus = ['security', 'correctness', 'performance', 'architecture']
}) {
  const reviewTasks = [
    {
      id: 'rev-security',
      title: 'Security & Vulnerability Analysis',
      model: 'claude-sonnet-4.5',
      role: 'reviewer',
      prompt: `Review the following code strictly focusing on SECURITY vulnerabilities, injection vectors, memory/credential leakage, authentication flaws, and privilege issues.\n\nContext: ${context}\n\nCode:\n\`\`\`\n${code}\n\`\`\``
    },
    {
      id: 'rev-correctness',
      title: 'Correctness & Edge-Case Audit',
      model: 'deepseek-3.2',
      role: 'reviewer',
      prompt: `Review the following code strictly focusing on LOGIC ERRORS, concurrency hazards, boundary condition bugs, null/undefined crashes, and unhandled exceptions.\n\nContext: ${context}\n\nCode:\n\`\`\`\n${code}\n\`\`\``
    },
    {
      id: 'rev-performance',
      title: 'Performance & Algorithmic Hotspots',
      model: 'qwen3-coder-next',
      role: 'optimizer',
      prompt: `Review the following code strictly focusing on PERFORMANCE, time/space algorithmic complexity, unnecessary allocations, I/O bottlenecks, and caching opportunities.\n\nContext: ${context}\n\nCode:\n\`\`\`\n${code}\n\`\`\``
    },
    {
      id: 'rev-architecture',
      title: 'Architecture & Clean Code Standards',
      model: 'minimax-m2.5',
      role: 'architect',
      prompt: `Review the following code strictly focusing on CLEAN ARCHITECTURE, modularity, type safety, maintainability, and naming conventions.\n\nContext: ${context}\n\nCode:\n\`\`\`\n${code}\n\`\`\``
    }
  ];

  const selectedTasks = reviewTasks.filter(t => focus.some(f => t.id.includes(f)));
  const batchResult = await executeParallel({
    tasks: selectedTasks.length > 0 ? selectedTasks : reviewTasks,
    concurrency: 4
  });

  return {
    success: true,
    totalReviews: batchResult.results.length,
    reviews: batchResult.results,
    durationMs: batchResult.totalDurationMs
  };
}
