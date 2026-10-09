# ⚡ Kiro Agent & Autonomous Control Suite (Kiro Swarm)

> **High-Performance Multi-Model AI Swarm, Parallel Task Delegation Engine, and Autonomous Account Security Subsystem for Antigravity IDE and Kiro Proxy.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/Protocol-Model%20Context%20Protocol%20(MCP)-blue.svg)](https://modelcontextprotocol.io/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-orange.svg)](#cross-platform-support)
[![Tests](https://img.shields.io/badge/Tests-Passing%20(45%2F45)-brightgreen.svg)](#testing--verification)

---

## 🌟 Overview

The **Kiro Agent Subsystem** turns your local Kiro IDE Proxy into a distributed, multi-model execution pool capable of:
- **Massive Parallelism**: Dispatches subtasks across a managed pool of accounts with worker threads, decreasing execution time for batch operations.
- **Model Consensus Swarms**: Dispatches hard architectural challenges to multiple frontier models simultaneously (Claude Sonnet 4.5, DeepSeek 3.2, Qwen3 Coder, MiniMax M2.5) and synthesizes consensus.
- **Multi-Dimensional Code Review**: Concurrently audits codebases across Security, Correctness/Logic, Algorithmic Performance, and Software Architecture.
- **5-Layer Anti-Ban Armor**: Protects your Builder ID, Google, and Social accounts against bans using hardware fingerprint isolation, OIDC rate-limiting, circuit-breaker backoffs, and quota cliff failover.
- **Full Model Context Protocol (MCP) Server**: Exposes 13 native MCP tools directly into Google Antigravity IDE or any MCP-compatible client.
- **Zero-Credential Leak Policy**: Reads and writes encrypted stores in memory using AES-256-CBC, never leaking secrets or tokens to disk or git.

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Antigravity IDE / Agent Host
        AG[Antigravity IDE] -->|JSON-RPC over stdio| MCP[kiro-mcp.mjs\n(13 MCP Tools)]
        CLI[kiro / kiro-agent CLI] --> CORE[kiro-core.mjs\n(Execution Engine)]
        MCP --> CORE
    end

    subgraph Security & Store Layer
        CORE --> CTRL[kiro-controller.mjs\n(Controller & Anti-Ban Armor)]
        CTRL -->|AES-256-CBC PBKDF2| STORE[(kiro-accounts.json\nEncrypted AppData Store)]
        CTRL -->|Per-Account Machine IDs| HW[Hardware Fingerprint\nIsolation (64-hex)]
    end

    subgraph Kiro Proxy & Model Execution
        CORE -->|Local HTTP Pool / 127.0.0.1:5580| PROXY[Kiro IDE Local Proxy]
        PROXY --> ACC1[Account 1\nClaude Sonnet 4.5]
        PROXY --> ACC2[Account 2\nDeepSeek 3.2]
        PROXY --> ACC3[Account 3\nQwen3 Coder]
        PROXY --> ACC4[Account N\nMiniMax / Haiku]
    end
```

---

## 🛡️ Anti-Ban Armor & Security System

When running multi-account proxies or frequent token refreshes, accounts risk detection or rate-limit suspensions. `kiro-agent` implements a 5-layer security shield:

| Security Shield | Mechanism | Threat Prevented |
|---|---|---|
| **1. Hardware Fingerprint Isolation** | Generates a unique 64-hex machine ID for every single managed account (`bindMachineIdToAccount: true`). | Cross-account device correlation & bans. |
| **2. OIDC Token Refresh Rate Limiter** | Caps token refresh concurrency to 3 simultaneous calls and staggers requests across 15-minute intervals. | Token flood bans on AWS / Social IdP endpoints. |
| **3. Circuit Breaker Backoff** | Intercepts HTTP 429 and 403 errors, enters exponential cooldown (60s base), and fails over to healthy accounts. | Account suspensions caused by rapid retry storms. |
| **4. Quota Cliff Failover** | Continuously evaluates remaining token quotas and auto-switches accounts when quota drops below 5%. | Sudden request disruption from hitting hard quota limits. |
| **5. Token Reserve Margin** | Enforces a 25,000 token buffer before request submission. | Context-window overflow and mid-task generation drops. |

Apply shield protections anytime with:
```bash
kiro armor
# or
kiro protect
```

---

## 🚀 Quick Start

### 1. Verification & Status Check
Check local proxy connectivity, active accounts, and token health:
```bash
kiro status
```

### 2. Run a Task with a Specific Model & Persona
```bash
kiro run "Refactor this auth handler to use OAuth2 PKCE flow" -m claude-sonnet-4.5 -r architect
```

### 3. Run a Multi-Model Consensus Swarm
Dispatches the prompt to Sonnet 4.5, DeepSeek 3.2, Qwen3 Coder, and MiniMax M2.5, then synthesizes a unified master recommendation:
```bash
kiro swarm "Design a high-throughput, low-latency rate limiter in Node.js"
```

### 4. 4-Dimension Parallel Code Review
```bash
kiro review ./src/auth.ts
```

### 5. Concurrent Parallel Subtasks
Execute a batch of tasks concurrently across account workers:
```bash
kiro parallel -f tasks.json -c 8
```

Where `tasks.json` has the format:
```json
[
  { "id": "t1", "title": "Generate Unit Tests", "prompt": "Write Jest tests for user service" },
  { "id": "t2", "title": "Security Audit", "prompt": "Audit SQL queries in db.ts", "role": "reviewer" },
  { "id": "t3", "title": "Performance Tuning", "prompt": "Optimize JSON serialization in parser.js", "model": "qwen3-coder-next" }
]
```

---

## 📖 CLI Reference

### Execution Commands
- `kiro run <prompt> [options]`: Execute prompt on a Kiro model.
  - `-m, --model <id>`: Target model ID (default: `claude-sonnet-4.5`).
  - `-r, --role <persona>`: `coder`, `reviewer`, `architect`, `tester`, `optimizer`, `researcher`, `general`.
  - `-t, --temperature <float>`: Temperature from `0.0` to `1.0` (default: `0.2`).
  - `-o, --out <path>`: Write output response to file.
  - `--json`: Format output as JSON.
- `kiro swarm <prompt> [options]`: Parallel consensus across 4 models.
- `kiro review <filePath> [options]`: 4-way parallel code review (Security, Logic, Performance, Architecture).
- `kiro parallel -f <tasks.json> [-c <concurrency>]`: Run tasks concurrently across worker pool.
- `kiro models`: List all available models, context sizes, and credit multipliers.
- `kiro status`: Inspect connection health, active accounts, and request stats.

### Account & Token Management
- `kiro accounts`: List all managed accounts with IdP type, status, and expiry timer.
- `kiro accounts switch <email|id>`: Switch the local active account in Kiro IDE.
- `kiro token refresh <email|id>`: Trigger an immediate OIDC / Social token renewal.
- `kiro groups [list | add <name>]`: Organize accounts into operational groups.
- `kiro tags [list | add <name>]`: Tag accounts with metadata.

### Proxy Pool & Upstream Routing
- `kiro pool`: Inspect upstream proxy pool status and rotation strategy.
- `kiro pool add <proxyUrl> [label]`: Add an upstream HTTP/SOCKS5 proxy.
- `kiro pool rm <id|url>`: Remove an upstream proxy.
- `kiro pool set autoRotate true`: Enable auto-rotation across outbound proxies.
- `kiro pool bind <email> <proxyUrl>`: Bind a specific account to an outbound proxy IP.

### Webhook Notifications
- `kiro webhook`: View registered webhook targets (Discord, Telegram, DingTalk, Feishu, etc.).
- `kiro webhook add <kind> <url> [label]`: Add a notification endpoint.
- `kiro webhook test <id|url>`: Send a test ping to a webhook.
- `kiro webhook toggle <id|url>`: Enable or disable a webhook.
- `kiro webhook rm <id|url>`: Remove a webhook.

### Hardware Fingerprinting (Machine ID)
- `kiro machine-id show`: Display per-account assigned machine IDs.
- `kiro machine-id gen`: Generate a cryptographically random 64-hex machine ID.
- `kiro machine-id set <email> [id]`: Bind a unique machine ID to an account.

### Backup, Restore & Universal Dot-Notation Access
- `kiro backup [path]`: Export entire encrypted store safely to JSON backup.
- `kiro restore <path>`: Restore store from a backup file.
- `kiro get <dot.path>`: Read any nested setting (e.g., `accountData.autoRefreshInterval`).
- `kiro set <dot.path> <value>`: Update any nested setting anywhere in the store.

---

## 🔌 Model Context Protocol (MCP) Server

The subsystem includes a production-grade MCP server (`kiro-agent/kiro-mcp.mjs`) communicating over stdio using JSON-RPC 2.0.

### Tool Catalog (13 Registered Tools)

| Tool Name | Purpose | Key Parameters |
|---|---|---|
| `kiro_run` | Execute single prompt on any Kiro model | `prompt`, `model`, `role`, `temperature`, `maxTokens` |
| `kiro_parallel_tasks` | Run multiple tasks concurrently in worker pool | `tasks` (array), `concurrency`, `defaultModel`, `defaultRole` |
| `kiro_swarm` | Multi-model consensus synthesis | `prompt`, `models` (array), `synthesizeModel` |
| `kiro_code_review` | 4-dimension parallel code review | `code`, `context`, `focus` (security, correctness, performance, architecture) |
| `kiro_list_models` | List models with context limits & rates | None |
| `kiro_status` | Check proxy health & pool stats | None |
| `kiro_get_config` | Retrieve proxy & account manager config | `target` (`all`, `proxy`, `settings`, `accounts`, `keys`, `pool`, `webhooks`, `machine_id`) |
| `kiro_set_config` | Update proxy & pool configuration | `target`, `settings` |
| `kiro_manage_accounts`| List accounts or switch active account | `action` (`list`, `switch`), `accountIdOrEmail` |
| `kiro_manage_proxy_pool` | Manage outbound proxy pool & bindings | `action` (`list`, `add`, `remove`, `bind`, `configure`), `url`, `label`, etc. |
| `kiro_manage_webhooks`| Manage notification endpoints | `action` (`list`, `add`, `remove`, `toggle`, `test`), `kind`, `url`, `label` |
| `kiro_manage_machine_id`| Assign hardware IDs to accounts | `action` (`show`, `generate`, `set`), `accountIdOrEmail`, `machineId` |
| `kiro_universal_setting`| Get or set arbitrary store properties | `action` (`get`, `set`), `path`, `value` |

### Antigravity IDE Configuration
Add the server to your `mcp_config.json`:
```json
{
  "mcpServers": {
    "kiro-agent": {
      "command": "node",
      "args": ["./kiro-agent/kiro-mcp.mjs"],
      "disabled": false
    }
  }
}
```

---

## ⚙️ Environment Variables & Configuration

All paths and network addresses support zero-configuration discovery, but can be customized via environment variables:

| Variable | Default Value | Description |
|---|---|---|
| `KIRO_PROXY_HOST` | `127.0.0.1` | Local Kiro proxy listening host. |
| `KIRO_PROXY_PORT` | `5580` | Local Kiro proxy listening port. |
| `KIRO_API_KEY` | *(Auto-discovered from store)* | Proxy API key override. |
| `KIRO_STORE_PATH` | *(Auto-detected OS path)* | Direct absolute path to `kiro-accounts.json`. |
| `KIRO_CONFIG_DIR` | `~/.kiro` | Path to Kiro IDE config directory (steering rules & MCP). |
| `KIRO_STORE_SECRET_KEY`| `kiro-account-manager-secret-key` | PBKDF2 encryption secret for Conf store. |
| `KIRO_AUTH_ENDPOINT` | `https://prod.us-east-1.auth.desktop.kiro.dev` | Upstream OIDC token renewal endpoint. |

---

## 🌐 Supported Models & Credit Rates

| Model Identifier | Context Window | Max Generation | Credit Multiplier | Specialization |
|---|---|---|---|---|
| `claude-sonnet-4.5` | 200,000 | 64,000 | 1.3x | Deep reasoning, complex coding, architecture |
| `claude-3.7-sonnet` | 200,000 | 64,000 | 1.0x | High-accuracy coding & refactoring |
| `claude-haiku-4.5` | 200,000 | 64,000 | 0.4x | Fast subtask execution & bulk transforms |
| `deepseek-3.2` | 164,000 | 64,000 | 0.25x | Mathematical proof, algorithmic logic, edge-cases |
| `minimax-m2.5` | 196,000 | 64,000 | 0.25x | Architectural synthesis, long-context documents |
| `qwen3-coder-next` | 256,000 | 64,000 | **0.05x** | Massive context files, bulk test generation (lowest cost) |
| `glm-5` | 200,000 | 64,000 | 0.5x | Multilingual code analysis |
| `simple-task` | 200,000 | 4,000 | 1.0x | Rapid classification & routing |

---

## 💻 Cross-Platform Support

`kiro-agent` is 100% written in pure Node.js with zero native dependencies:
- **Windows**: Automatically detects `%APPDATA%\kiro-account-manager\kiro-accounts.json` and `%USERPROFILE%\.kiro`.
- **macOS**: Automatically detects `~/Library/Application Support/kiro-account-manager/kiro-accounts.json` and `~/.kiro`.
- **Linux**: Automatically detects `~/.config/kiro-account-manager/kiro-accounts.json` and `~/.kiro`.

---

## 🧪 Testing & Verification

Run the full automated test suite (including both the daemon tests and the Kiro Agent subsystem tests):
```bash
npm test
```

Run only the Kiro Agent & MCP tests:
```bash
npm run test:kiro
```

Both test suites validate:
- Role personas and prompt integrity.
- Proxy credentials and dynamic auth discovery.
- 64-hex machine ID generation and uniqueness.
- Anti-ban shield activation and rate-limiting.
- Credential leak prevention (verifies zero plain refresh tokens exposed in memory).
- Controller configuration accessors.
- MCP Server JSON-RPC 2.0 handshake (`initialize`) and tools catalog (`tools/list`).

---

## 🔒 Security & Privacy Notice

- **No Plaintext Credential Storage**: All sensitive fields (tokens, refresh tokens, auth codes) are managed strictly through PBKDF2/AES-256-CBC encryption in the user's local operating system directory.
- **Git Safety**: The repository `.gitignore` strictly prohibits committing any `.json` account stores, `.bak`, `.enc`, or temporary audit dumps.
- **Outbound Network Boundaries**: The subsystem only connects locally to `127.0.0.1` unless an explicit token refresh request is dispatched to the official auth endpoint (`prod.us-east-1.auth.desktop.kiro.dev`).

---

## 📄 License

MIT © [WillyEverGreen](https://github.com/WillyEverGreen/Antigravity-Auto-Submitter)

