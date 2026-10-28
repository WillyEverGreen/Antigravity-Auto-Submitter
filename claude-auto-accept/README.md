<div align="center">

  <h1>Claude Auto-Accept CLI</h1>

  <p><b>Production-grade native PreToolUse hook & auto-approval engine for Claude Code CLI.</b> Automatically approves safe tool permissions while enforcing strict keyword guardrails and file protection.</p>

  <p>
    <a href="../LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License" /></a>
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-orange?style=for-the-badge" alt="Platform" />
    <img src="https://img.shields.io/badge/Node-%3E%3D%2022.0.0-blue?style=for-the-badge" alt="Node" />
    <img src="https://img.shields.io/badge/Dependencies-Zero-brightgreen?style=for-the-badge" alt="Dependencies" />
    <img src="https://img.shields.io/badge/Tests-All%20Passing-brightgreen?style=for-the-badge" alt="Tests" />
  </p>

</div>

---

## 🌟 Overview

Claude Code CLI prompts for confirmation before running commands, editing files, or calling tools. While `--dangerously-skip-permissions` disables all safety checks indiscriminately, **Claude Auto-Accept** hooks directly into Claude Code's native `PreToolUse` lifecycle event.

It allows you to:
- **Auto-Approve Safe Commands**: `npm test`, `git status`, `ls`, `grep`, builds, and edits run hands-free.
- **Enforce Strict Guardrails**: Dangerous commands like `rm -rf`, `drop table`, and `format c:` are immediately **denied**.
- **Pause on Sensitive Actions**: Actions like `git push`, `git reset --hard`, and edits to `.env` or credentials **pause for your manual review**.
- **Zero Background Daemons**: Runs purely on-demand as a native hook child process whenever Claude Code initiates a tool call.

---

## ⚡ 1-Click Setup

### Local Project Scope (`.claude/settings.json`)
Run inside your project directory:

```bash
claude-auto-accept setup
```
*(Or `npm run claude:setup` from this repository).*

### Global Scope (`~/.claude/settings.json`)
To enable auto-approval across all your Claude Code projects:

```bash
claude-auto-accept setup --global
```

---

## 🎯 Operating Modes

### 1. Autonomous (Default)
- Auto-approves safe commands, file modifications, and read-only tools.
- Pauses for confirmation on sensitive keywords (`git push`, `deploy`) and protected files (`.env`).
- Hard-blocks dangerous commands (`rm -rf`, `drop table`).

```bash
claude-auto-accept mode autonomous
```

### 2. Autopilot (Hands-Free)
- 100% hands-free execution across all tools.
- Still enforces hard-block protection on dangerous commands (`rm -rf`, etc.).

```bash
claude-auto-accept mode autopilot
```

---

## 🛡️ Safety Guardrails & Configuration

You can drop a `.claude-auto-accept.json` file in any project root:

```bash
claude-auto-accept init
```

Example configuration:

```json
{
  "enabled": true,
  "mode": "autonomous",
  "askKeywords": [
    "git push",
    "git reset --hard",
    "sudo",
    "npm publish",
    "terraform apply",
    "deploy"
  ],
  "skipKeywords": [
    "rm -rf",
    "drop table",
    "git push --force",
    "format c:",
    "del /f /s /q c:",
    "kubectl delete"
  ],
  "protectedFiles": [
    ".env",
    ".env.*",
    "*.key",
    "*.pem",
    "id_rsa*",
    ".git/*"
  ],
  "autoApproveReadOnly": true,
  "autoApproveEdits": true
}
```

### Quick Rule Management CLI

```bash
# Add sensitive keyword requiring review:
claude-auto-accept add-ask "docker system prune"

# Add forbidden keyword to deny:
claude-auto-accept add-skip "aws s3 rb --force"

# Remove a keyword rule:
claude-auto-accept rm "docker system prune"

# Check active status and stats:
claude-auto-accept status

# Run system diagnostic checks:
claude-auto-accept doctor
```

---

## 🗑️ Uninstalling

To remove the hook from your settings:

```bash
# Local project:
claude-auto-accept uninstall

# Global settings:
claude-auto-accept uninstall --global
```
