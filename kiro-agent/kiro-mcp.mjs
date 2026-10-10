#!/usr/bin/env node
import readline from 'node:readline';
import {
  getStatus,
  listModels,
  executeTask,
  executeParallel,
  executeSwarm,
  executeCodeReview,
  ROLE_PROMPTS
} from './kiro-core.mjs';
import { executeArchitectEditor } from './engine-architect-editor.mjs';
import { executeCouncil } from './engine-council.mjs';
import { routeTask } from './engine-router.mjs';
import {
  listAccounts,
  switchActiveAccount,
  getProxyConfig,
  updateProxyConfig,
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
  setAnySetting,
  getAnySetting
} from './kiro-controller.mjs';

const TOOLS = [
  {
    name: 'kiro_run',
    description: 'Execute a single task/prompt on any Kiro IDE model (Claude Sonnet 4.5, DeepSeek 3.2, Qwen3 Coder Next, MiniMax M2.5, GLM-5, Claude Haiku 4.5, etc.) with custom agent roles.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The task description, prompt, or instructions for the Kiro model.'
        },
        model: {
          type: 'string',
          description: 'Model ID to use. Options: claude-sonnet-4.5 (default), deepseek-3.2, qwen3-coder-next, minimax-m2.5, glm-5, claude-haiku-4.5, claude-3.7-sonnet, simple-task, auto.'
        },
        role: {
          type: 'string',
          enum: ['coder', 'reviewer', 'architect', 'tester', 'optimizer', 'researcher', 'general'],
          description: 'Specialized agent persona for task optimization. Default: coder.'
        },
        temperature: {
          type: 'number',
          description: 'Sampling temperature (0.0 - 1.0). Default: 0.2.'
        },
        maxTokens: {
          type: 'number',
          description: 'Max generation tokens. Default: 4096.'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'kiro_parallel_tasks',
    description: 'Execute multiple subtasks simultaneously in parallel across Kiro\'s 20-account proxy pool. Highly efficient for batch code analysis, concurrent file generation, multi-prompt testing, or bulk transformations.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'List of tasks to execute concurrently.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique identifier for the task' },
              title: { type: 'string', description: 'Short task title' },
              prompt: { type: 'string', description: 'Prompt / instructions for this task' },
              model: { type: 'string', description: 'Model for this specific task (optional)' },
              role: { type: 'string', description: 'Role persona for this specific task (optional)' }
            },
            required: ['prompt']
          }
        },
        concurrency: {
          type: 'number',
          description: 'Maximum concurrent worker threads across the account pool (default: 8).'
        },
        defaultModel: {
          type: 'string',
          description: 'Default model for tasks that do not specify one (default: claude-sonnet-4.5).'
        },
        defaultRole: {
          type: 'string',
          description: 'Default role for tasks (default: coder).'
        }
      },
      required: ['tasks']
    }
  },
  {
    name: 'kiro_swarm',
    description: 'Launch an AI Model Swarm: dispatches the same task to multiple diverse models in parallel (Sonnet 4.5, DeepSeek 3.2, Qwen3 Coder, MiniMax M2.5), compares their solutions, and synthesizes a single master consensus output.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The complex problem, architectural challenge, or algorithm to solve.'
        },
        models: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of model IDs to include in the swarm (default: claude-sonnet-4.5, deepseek-3.2, qwen3-coder-next, minimax-m2.5).'
        },
        synthesizeModel: {
          type: 'string',
          description: 'Model used to judge and synthesize all solutions (default: claude-sonnet-4.5).'
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'kiro_code_review',
    description: 'Perform a comprehensive 4-dimension parallel code review: Security & Vulnerabilities, Logic & Edge-Cases, Algorithmic Performance Hotspots, and Clean Architecture.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code content to review.'
        },
        context: {
          type: 'string',
          description: 'File path, purpose, or architectural context.'
        },
        focus: {
          type: 'array',
          items: { type: 'string', enum: ['security', 'correctness', 'performance', 'architecture'] },
          description: 'Specific dimensions to focus on (default: all 4).'
        }
      },
      required: ['code']
    }
  },
  {
    name: 'kiro_list_models',
    description: 'List all available models in Kiro IDE proxy with their context limits, credit rates, and capabilities.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'kiro_status',
    description: 'Check Kiro Proxy connection health, active account pool status, and usage statistics.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'kiro_get_config',
    description: 'Retrieve full Kiro Proxy settings and Account Manager configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['all', 'proxy', 'settings', 'accounts', 'keys', 'pool', 'webhooks', 'machine_id'],
          description: 'Which configuration section to retrieve (default: all).'
        }
      }
    }
  },
  {
    name: 'kiro_set_config',
    description: 'Update any Kiro Proxy setting or Account Manager setting.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['proxy', 'account_manager', 'proxy_pool'],
          description: 'Target configuration domain.'
        },
        settings: {
          type: 'object',
          description: 'Key-value map of settings to update.'
        }
      },
      required: ['target', 'settings']
    }
  },
  {
    name: 'kiro_manage_accounts',
    description: 'Inspect or switch active accounts across the 20 managed accounts.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'switch'],
          description: 'Action to perform.'
        },
        accountIdOrEmail: {
          type: 'string',
          description: 'Target account email or ID (required when action is switch).'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'kiro_manage_proxy_pool',
    description: 'Configure outbound proxy pool, auto-rotation, and account proxy bindings.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'remove', 'bind', 'configure'],
          description: 'Action to perform.'
        },
        url: { type: 'string', description: 'Proxy URL (for add)' },
        label: { type: 'string', description: 'Proxy label (for add)' },
        proxyIdOrUrl: { type: 'string', description: 'Proxy ID or URL (for remove or bind)' },
        accountIdOrEmail: { type: 'string', description: 'Account email or ID (for bind)' },
        config: { type: 'object', description: 'Pool settings object (autoRotate, rotateInterval, strategy, upstreamProxy)' }
      },
      required: ['action']
    }
  },
  {
    name: 'kiro_manage_webhooks',
    description: 'Manage notification webhooks (Telegram, Discord, DingTalk, WeChat Work, Feishu, Custom).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'remove', 'toggle', 'test'],
          description: 'Action to perform.'
        },
        kind: {
          type: 'string',
          enum: ['telegram', 'discord', 'dingtalk', 'wechat-work', 'feishu', 'custom'],
          description: 'Webhook provider kind.'
        },
        url: { type: 'string', description: 'Webhook endpoint URL' },
        label: { type: 'string', description: 'Label identifier' },
        telegramChatId: { type: 'string', description: 'Telegram chat ID' },
        webhookIdOrUrl: { type: 'string', description: 'Webhook ID or URL (for remove, toggle, test)' }
      },
      required: ['action']
    }
  },
  {
    name: 'kiro_manage_machine_id',
    description: 'Inspect, generate random 64-hex machine IDs, and assign device IDs to accounts.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['show', 'generate', 'set'],
          description: 'Action to perform.'
        },
        accountIdOrEmail: { type: 'string', description: 'Account to bind machine ID to (for set)' },
        machineId: { type: 'string', description: 'Custom machine ID string (optional, random if omitted)' }
      },
      required: ['action']
    }
  },
  {
    name: 'kiro_universal_setting',
    description: 'Get or set ANY arbitrary setting anywhere in the Kiro Account Manager store using dot notation (e.g. accountData.autoRefreshInterval or proxyConfig.port).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set'],
          description: 'Get or set value.'
        },
        path: {
          type: 'string',
          description: 'Dot-notation path inside store (e.g. proxyConfig.enableMultiAccount or accountData.proxyPoolConfig.strategy).'
        },
        value: {
          description: 'Value to set (boolean, string, number, object, array).'
        }
      },
      required: ['action', 'path']
    }
  },
  {
    name: 'kiro_architect_editor',
    description: 'High-speed dual-model coding engine (Aider pattern). Dispatches architecture blueprinting to Claude Sonnet 4.5 and code diff implementation to Claude Haiku 4.5. Completes in ~13-18s.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Task or feature to implement.' },
        architectModel: { type: 'string', description: 'Model for architecture (default: claude-sonnet-4.5).' },
        editorModel: { type: 'string', description: 'Model for code implementation (default: claude-haiku-4.5).' },
        context: { type: 'string', description: 'Optional context or file contents.' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'kiro_council',
    description: '4-Model Blind Peer-Review LLM Council (Karpathy/Swarms pattern). Concurrently queries Sonnet 4.5, DeepSeek 3.2, Qwen3, and MiniMax, conducts anonymized peer reviews, and synthesizes gold-standard consensus.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Critical algorithm, security audit, or architecture decision.' },
        chairmanModel: { type: 'string', description: 'Chairman model for final synthesis (default: claude-sonnet-4.5).' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'kiro_smart_route',
    description: 'Execute task via Kiro V2.1 Autonomous Semantic Router with Dual-Gated Verification (Syntax Self-Healing + DeepSeek Blind Critic Loop) and Context Budget protection.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The task description or prompt to execute.' },
        mode: {
          type: 'string',
          enum: ['auto', 'architect-editor', 'council', 'logic', 'fast', 'direct'],
          description: 'Execution mode topology. Default: auto (analyzed by 8-dimensional semantic router).'
        },
        model: { type: 'string', description: 'Optional model override.' },
        context: { type: 'string', description: 'Optional background context or file content.' },
        autoVerify: { type: 'boolean', description: 'Enable Gate 1 syntax verification & self-healing. Default: true.' },
        autoCritic: { type: 'boolean', description: 'Enable Gate 2 blind DeepSeek peer review critic & patch loop. Default: true.' },
        qualityThreshold: { type: 'number', description: 'Quality threshold 0-100 for critic patch triggering. Default: 82.' }
      },
      required: ['prompt']
    }
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'kiro_architect_editor': {
      const res = await executeArchitectEditor({
        prompt: args.prompt,
        architectModel: args.architectModel || 'claude-sonnet-4.5',
        editorModel: args.editorModel || 'claude-haiku-4.5',
        context: args.context || ''
      });
      return {
        content: [{ type: 'text', text: res.success ? res.finalCode : `[Error] ${res.error}` }],
        isError: !res.success
      };
    }

    case 'kiro_council': {
      const res = await executeCouncil({
        prompt: args.prompt,
        chairmanModel: args.chairmanModel || 'claude-sonnet-4.5'
      });
      return {
        content: [{ type: 'text', text: res.success ? res.finalSolution : `[Council Error] ${res.error}` }],
        isError: !res.success
      };
    }

    case 'kiro_smart_route': {
      const res = await routeTask({
        prompt: args.prompt,
        mode: args.mode || 'auto',
        model: args.model || null,
        context: args.context || '',
        autoVerify: args.autoVerify !== undefined ? args.autoVerify : true,
        autoCritic: args.autoCritic !== undefined ? args.autoCritic : true,
        qualityThreshold: args.qualityThreshold || 82
      });
      const outputText = res.finalCode || res.finalSolution || res.content || '';
      const summaryTag = res.success
        ? `\n\n[Topology: ${res.pattern || res.routeReason || 'Auto'}${res.criticScore !== undefined ? ` | Critic Score: ${res.criticScore}/100` : ''}${res.criticImproved ? ' (Critic Patched)' : ''}${res.healed ? ' (Syntax Healed)' : ''}]`
        : '';
      return {
        content: [{ type: 'text', text: res.success ? (outputText + summaryTag) : `[Router Error] ${res.error}` }],
        isError: !res.success
      };
    }

    case 'kiro_run': {
      if (args.model === 'auto') {
        const routeRes = await routeTask({ prompt: args.prompt });
        const outputText = routeRes.finalCode || routeRes.finalSolution || routeRes.content || '';
        return {
          content: [{ type: 'text', text: routeRes.success ? outputText : `[Error] ${routeRes.error}` }],
          isError: !routeRes.success
        };
      }
      const res = await executeTask({
        prompt: args.prompt,
        model: args.model || 'claude-sonnet-4.5',
        role: args.role || 'coder',
        temperature: args.temperature !== undefined ? args.temperature : 0.2,
        maxTokens: args.maxTokens || 4096
      });
      return {
        content: [{ type: 'text', text: res.success ? res.content : `[Error] ${res.error}` }],
        isError: !res.success
      };
    }

    case 'kiro_parallel_tasks': {
      const concurrency = Math.min(Math.max(1, args.concurrency || 8), 50);
      const res = await executeParallel({
        tasks: args.tasks,
        defaultModel: args.defaultModel || 'claude-sonnet-4.5',
        defaultRole: args.defaultRole || 'coder',
        concurrency
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }

    case 'kiro_swarm': {
      const res = await executeSwarm({
        prompt: args.prompt,
        models: args.models || ['claude-sonnet-4.5', 'deepseek-3.2', 'qwen3-coder-next', 'minimax-m2.5'],
        synthesizeModel: args.synthesizeModel || 'claude-sonnet-4.5'
      });
      return {
        content: [{ type: 'text', text: res.success ? res.finalSolution : `[Swarm Error] ${res.error}` }],
        isError: !res.success
      };
    }

    case 'kiro_code_review': {
      const res = await executeCodeReview({
        code: args.code,
        context: args.context || '',
        focus: args.focus || ['security', 'correctness', 'performance', 'architecture']
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }

    case 'kiro_list_models': {
      const models = await listModels();
      return { content: [{ type: 'text', text: JSON.stringify(models, null, 2) }] };
    }

    case 'kiro_status': {
      const status = await getStatus();
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    }

    case 'kiro_get_config': {
      const target = args.target || 'all';
      let result = {};
      if (target === 'all' || target === 'proxy') result.proxy = getProxyConfig();
      if (target === 'all' || target === 'settings') result.settings = getAccountManagerSettings();
      if (target === 'all' || target === 'accounts') result.accounts = listAccounts();
      if (target === 'all' || target === 'keys') result.keys = listApiKeys();
      if (target === 'all' || target === 'pool') result.pool = getProxyPoolConfig();
      if (target === 'all' || target === 'webhooks') result.webhooks = getWebhooks();
      if (target === 'all' || target === 'machine_id') result.machineId = getMachineIdConfig();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'kiro_set_config': {
      const { target, settings } = args;
      let res;
      if (target === 'proxy') res = updateProxyConfig(settings || {});
      else if (target === 'proxy_pool') res = updateProxyPoolConfig(settings || {});
      else res = updateAccountManagerSettings(settings || {});
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }

    case 'kiro_manage_accounts': {
      if (args.action === 'list') {
        const accs = listAccounts();
        return { content: [{ type: 'text', text: JSON.stringify(accs, null, 2) }] };
      }
      if (args.action === 'switch') {
        const res = switchActiveAccount(args.accountIdOrEmail);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      throw new Error(`Unknown action: ${args.action}`);
    }

    case 'kiro_manage_proxy_pool': {
      if (args.action === 'list') {
        const data = getProxyPoolConfig();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (args.action === 'add') {
        const res = addProxyToPool({ url: args.url, label: args.label });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      if (args.action === 'remove') {
        const res = removeProxyFromPool(args.proxyIdOrUrl);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      if (args.action === 'bind') {
        const res = bindAccountProxy(args.accountIdOrEmail, args.proxyIdOrUrl);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      if (args.action === 'configure') {
        const res = updateProxyPoolConfig(args.config || {});
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      throw new Error(`Unknown action: ${args.action}`);
    }

    case 'kiro_manage_webhooks': {
      if (args.action === 'list') {
        const data = getWebhooks();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (args.action === 'add') {
        const res = addWebhook({
          kind: args.kind,
          url: args.url,
          label: args.label,
          telegramChatId: args.telegramChatId
        });
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      if (args.action === 'remove') {
        const res = removeWebhook(args.webhookIdOrUrl);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      if (args.action === 'toggle') {
        const res = toggleWebhook(args.webhookIdOrUrl);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      if (args.action === 'test') {
        const res = await sendWebhookTest(args.webhookIdOrUrl);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      throw new Error(`Unknown action: ${args.action}`);
    }

    case 'kiro_manage_machine_id': {
      if (args.action === 'show') {
        const data = getMachineIdConfig();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }
      if (args.action === 'generate') {
        const id = generateRandomMachineId();
        return { content: [{ type: 'text', text: JSON.stringify({ generatedMachineId: id }, null, 2) }] };
      }
      if (args.action === 'set') {
        const res = setAccountMachineId(args.accountIdOrEmail, args.machineId);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      throw new Error(`Unknown action: ${args.action}`);
    }

    case 'kiro_universal_setting': {
      if (!args.path || /__proto__|constructor|prototype/i.test(args.path)) {
        throw new Error('Access denied: Invalid or unsafe setting path pattern');
      }
      if (args.action === 'get') {
        const val = getAnySetting(args.path);
        return { content: [{ type: 'text', text: JSON.stringify({ path: args.path, value: val }, null, 2) }] };
      }
      if (args.action === 'set') {
        const res = setAnySetting(args.path, args.value);
        return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
      }
      throw new Error(`Unknown action: ${args.action}`);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC stdio transport
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id, result, error = null) {
  const msg = { jsonrpc: '2.0', id };
  if (error) {
    msg.error = {
      code: error.code || -32603,
      message: String(error.message || error)
    };
  } else {
    msg.result = result;
  }
  process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try { request = JSON.parse(trimmed); } catch { return; }

  const { id, method, params } = request;

  try {
    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'kiro-agent-mcp', version: '1.2.0' }
      });
    } else if (method === 'notifications/initialized') {
      // no-op
    } else if (method === 'ping') {
      sendResponse(id, {});
    } else if (method === 'tools/list') {
      sendResponse(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      const { name, arguments: toolArgs } = params || {};
      const toolResult = await handleToolCall(name, toolArgs || {});
      sendResponse(id, toolResult);
    } else {
      sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
    }
  } catch (err) {
    sendResponse(id, null, { code: -32000, message: err.message });
  }
});

rl.on('close', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  rl.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  rl.close();
  process.exit(0);
});

