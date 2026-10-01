# Changelog - Kiro Auto-Accept

All notable changes to the Kiro Auto-Accept project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-01

### Added
- **Persistent `WindowSession` Architecture**:
  - Replaced ephemeral per-poll WebSocket connections with long-lived persistent sessions per target.
  - Eliminates TCP socket churn and prevents Electron DevTools timeouts.
- **Deep Webview & Nested Iframe Traversal**:
  - Traverses out-of-process Kiro Agent webviews (`vscode-webview://...`) and nested `#active-frame` documents.
  - Simultaneously scans top-level workbench pages and agent chat webviews concurrently.
- **Broadened Permission Button Recognition**:
  - Expanded approval detection across all Kiro IDE dialogs: `Allow`, `Always allow`, `Allow always`, `Allow once`, `Approve`, `Always approve`, `Accept`, `Accept all`, `Accept changes`, `Apply`, `Apply all`, `Apply changes`, `Run`, `Execute`, `Run in terminal`, `Proceed`, `Continue`, `Trust`, `Grant`, `Keep`, `Keep changes`.
- **Negative Button Guard**:
  - Strict exclusion preventing accidental clicks on cancellation buttons: `Deny`, `Always deny`, `Cancel`, `Reject`, `Discard`, `Dismiss`, `Close`.
- **Global Binary CLI Wrappers**:
  - Added dedicated CLI wrappers in `bin/`: `kiro-doctor`, `kiro-setup`, `kiro-launch`, `kiro-restart`, and `kiro-start`.
- **Strict Two-Way Port Isolation**:
  - Explicit port boundary: Kiro scans exclusively on Port 9222 (range 9220–9230) and rejects Antigravity ports (9300–9400).

### Fixed
- **CDP Request Timeouts**:
  - Resolved 4,000ms socket timeouts by maintaining active WebSocket connections instead of creating new ones every 250ms.
- **Process Attachment on Windows**:
  - Fixed Kiro launch decoupling using PowerShell `Start-Process` with installation directory context.
- **Encoding & Clean Markdown**:
  - Corrected emoji encoding across documentation and CLI diagnostic outputs.

---

## [1.0.0] - 2024-10-01

### Initial Release
- **Core Daemon Functionality**:
  - Autonomous confirmation acceptance for Kiro IDE via Chrome DevTools Protocol.
  - Multi-window support for multiple Kiro instances.
  - Autonomous and Autopilot operating modes.
  - Keyword safety guards (`askKeywords` and `skipKeywords`).
  - Hierarchical configuration loading (defaults, global, local, CLI).
