# ⚡ Kiro Agent V2 - Autonomous Multi-Model Swarm Engine

> **High-Performance Multi-Model AI Swarm, Architect-Editor Dual Engine, and 20-Account Autonomous Compute Subsystem for Google Antigravity IDE and Kiro Proxy.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/Protocol-Model%20Context%20Protocol%20(MCP)-blue.svg)](https://modelcontextprotocol.io/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-orange.svg)](#cross-platform-support)

---

## 🌟 Overview & What's New in V2

The **Kiro Agent Subsystem** turns your local Kiro IDE Proxy into a distributed, multi-model execution pool:
- **Architect-Editor Dual Engine**: Dispatches high-level architectural planning to **Claude Sonnet 4.5** and rapid code generation to **Claude Haiku 4.5**, dropping complex execution times from **106s $\to$ ~13s (7.7x faster)**.
- **LLM Council (Karpathy / Swarms Pattern)**: Concurrently queries 4 frontier models (Sonnet 4.5, DeepSeek 3.2, Qwen3 Coder, MiniMax), anonymizes candidate solutions, runs **blind peer reviews**, and synthesizes gold-standard consensus.
- **Self-Healing Verification Gate**: Validates AST/syntax integrity before delivering code to Antigravity, running automated 1-turn repair loops if bracket or syntax errors are detected.
- **5-Layer Anti-Ban Armor**: Protects your 20 accounts using hardware fingerprint isolation (64-hex Machine IDs), OIDC token refresh rate limiting, circuit breaker backoffs, and quota cliff failover.
- **Full Model Context Protocol (MCP) Server**: Exposes 15 native MCP tools directly into Google Antigravity IDE.

---

## 🏗️ Architecture

```mermaid
flowchart TD
    AG[Antigravity IDE - The Boss] -->|MCP JSON-RPC| MCP[kiro-mcp.mjs]
    CLI[kiro / kiro-cli.mjs] --> ROUTER[engine-router.mjs]
    MCP --> ROUTER

    subgraph "Execution Engines"
        ROUTER -->|Fast Code & Diffs| ARCH[engine-architect-editor.mjs\nSonnet 4.5 Architect + Haiku 4.5 Editor]
        ROUTER -->|High Stakes / Consensus| COUNCIL[engine-council.mjs\n4-Model Blind Peer Review Council]
        ROUTER -->|Math & Invariants| LOGIC[DeepSeek 3.2 Engine]
    end

    subgraph "Safety & Verification"
        ARCH --> VERIFY[engine-verifier.mjs\nAST Syntax Validation & Self-Healing]
        COUNCIL --> VERIFY
    end

    subgraph "Security & Store Layer"
        CORE[kiro-core.mjs] --> CTRL[kiro-controller.mjs]
        CTRL -->|AES-256-CBC PBKDF2| STORE[(Encrypted 20-Account Store)]
        CTRL -->|Per-Account Machine IDs| HW[Hardware Fingerprint Isolation (64-hex)]
    end

    subgraph "Compute Layer"
        VERIFY --> CORE
        CORE -->|Local HTTP Pool / 127.0.0.1:5580| PROXY[Kiro IDE Local Proxy (20 Accounts)]
    end
```

---

## 🚀 CLI Commands & MCP Tools

### 1. Task Execution & Swarms

| Action | CLI Command | MCP Tool | Description |
| :--- | :--- | :--- | :--- |
| **Architect-Editor** | `kiro arch "<prompt>"` | `kiro_architect_editor` | ⚡ High-speed dual engine (~13-18s) |
| **LLM Council** | `kiro council "<prompt>"` | `kiro_council` | 🏛️ 4-Model blind peer review consensus |
| **Model Swarm** | `kiro swarm "<prompt>"` | `kiro_swarm` | Consensus swarm synthesis |
| **Single Task** | `kiro run "<prompt>" [-m <model>]` | `kiro_run` | Run single model with role persona |
| **Parallel Batch** | `kiro parallel -f tasks.json` | `kiro_parallel_tasks` | Concurrently dispatches across 20-account pool |
| **Code Review** | `kiro review <file>` | `kiro_code_review` | Multi-dimensional adversarial review |
| **Proxy Health** | `kiro status` | `kiro_status` | View 20-account pool health & token metrics |
| **List Models** | `kiro models` | `kiro_list_models` | List all available models & context limits |
| **Live Benchmark** | `kiro benchmark` | — | Run head-to-head latency benchmark |

### 2. Semantic Cache & Long-Term Memory (Mem0 Pattern)

| Action | CLI Command | Description |
| :--- | :--- | :--- |
| **Cache Stats** | `kiro cache stats` | View semantic cache hits, tokens saved, and backend status |
| **Clear Cache** | `kiro cache clear` | Flush all cached responses |
| **List Memories** | `kiro memory list [category]` | View persistent user preferences, invariants & decisions |
| **Add Memory** | `kiro memory add <category> "<text>"` | Save a permanent preference or architectural invariant |
| **Search Memories** | `kiro memory search "<query>"` | Semantic vector search across all memories in <1ms |
| **Delete Memory** | `kiro memory delete <id>` | Remove a memory entry |

### 3. Account & Security Management

| Action | CLI Command | Description |
| :--- | :--- | :--- |
| **List Accounts** | `kiro accounts` | View all 20 accounts, status, IdP & active status |
| **Anti-Ban Shield** | `kiro armor` | Verify 5-layer anti-ban protection status |
| **Switch Account** | `kiro accounts switch <email>` | Set local active account |
| **Refresh Token** | `kiro token refresh <email>` | Directly renew OIDC / Social token |
| **Machine IDs** | `kiro machine-id [show\|gen\|set]` | Inspect or assign 64-hex hardware fingerprints |
| **Proxy Pool** | `kiro pool [list\|add\|rm]` | Configure proxy endpoints and rotation |
| **Webhooks** | `kiro webhook [list\|add\|test]` | Telegram, Discord, DingTalk, Feishu alerts |

---

## 🛡️ 5-Layer Anti-Ban Armor

| Security Layer | Threat Prevented | How It Protects |
| :--- | :--- | :--- |
| **Hardware Fingerprint Isolation** | Multi-account correlation on 1 PC | Generates a unique 64-hex Machine ID for each of the 20 accounts. |
| **Token Refresh Rate Limiter** | AWS OIDC token flood bans | Caps token refresh concurrency to 3, staggered across 15m intervals. |
| **Circuit Breaker Exponential Backoff** | Rapid 429/403 loop suspensions | Automatically suspends faulty accounts (60s base backoff) and fails over. |
| **Quota Cliff Protection** | Account lock on 100% exhaustion | Switches accounts automatically when remaining quota drops below 5%. |
| **Token Reserve Margin** | Context overflow cliff | Enforces a 25,000 token safety buffer on all requests. |
