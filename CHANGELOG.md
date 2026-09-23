# Change Log

All notable changes to the "antigravity-auto-submit" project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-09-23

### Added
- **Easy Start — Zero-Friction One-Command Launch (`auto-accept start` / `agy-start` / `antigravity-start`)**:
  - Automatically checks Antigravity IDE connection on CDP port.
  - If open without debugging port: restarts Antigravity IDE with `--remote-debugging-port=9333` and seamlessly connects the daemon.
  - If not running: auto-spawns Antigravity IDE with remote debugging port enabled and connects the daemon directly without needing separate terminal commands.
  - Dedicated bin aliases: `antigravity-start`, `agy-start`, and `npm start`.
- **Live TUI IDE Restart Hotkey (`Shift+R` / `R`)**:
  - Allows restarting Antigravity IDE with remote debugging port enabled directly from within an active daemon session without interrupting the daemon.
  - Added warning banner hint prompting users to press `Shift+R` or run `auto-accept start` when IDE is open without port 9333.
- **Cross-Platform Setup & Launcher Support (Windows, macOS, Linux)**:
  - macOS: automatically creates Desktop launcher (`Antigravity IDE (Debug).command`), `~/.local/bin/antigravity` wrapper, and `~/.zshrc` alias.
  - Linux: automatically patches `.desktop` entries in `~/.local/share/applications/` and Desktop, and creates `~/.local/bin/antigravity` wrapper.
  - Windows: patches Desktop, Start Menu, and Taskbar shortcuts with `--remote-debugging-port=9333`.

### Fixed
- **Resolved Fatal `TypeError: Cannot destructure property 'config' of 'resolveConfig(...)' as it is undefined`**:
  - Removed premature asynchronous `handleRestart` invocation inside `resolveConfig()` that returned `undefined`.
  - Added defensive fallback guard in `require.main` so `resolveConfig()` can never trigger destructuring errors.
  - Refactored `handleRestart` and `handleLaunch` with explicit force flags (`forceRestart = true` / `restart` CLI argument).
  - Added unit test #24 and #25 verifying `resolveConfig` returns valid objects for all subcommands.

## [1.6.0] - 2026-09-20

### Added
- **Multi-Window Concurrent Monitoring Engine**:
  - `selectAllWorkbenchTargets` detects all active Antigravity IDE workbench windows concurrently on the same or multiple DevTools ports.
  - Dedicated `WindowSession` architecture isolates WebSocket connections, request IDs (`reqId`), and keyword block states per window target.
  - Dynamic window lifecycle management: automatically attaches to newly opened windows within 2s, and cleanly detaches closed windows without interrupting active sessions.
  - Per-window logging prefixes (`[Window Title] APPROVE ...`) for clear visibility into which workspace received an approval or block.
- **Flexible Port Architecture & Lock Isolation**:
  - Supports explicit single ports (`-p 9333`), multi-port candidate lists (`--ports 9333,9334` or `-p 9333,9334`), and automatic multi-port discovery.
  - Replaced global lockfile with per-port lockfiles (`daemon_<port>.pid`), allowing separate daemons to manage distinct ports simultaneously without false collision.
  - Automatic stale lockfile cleanup across all ports.
- **Upgraded Status & Diagnostic Tooling**:
  - `auto-accept status` returns detailed multi-window array (`windows`), active port list (`ports`), and total `windowCount` while maintaining 100% backward compatibility with single-window consumers (`port`, `targetTitle`).
  - `auto-accept doctor` scans and outputs connection status for all active ports and attached windows.
- **Global Wrapper Priority & Conflict Resolution**:
  - Synchronized `C:\tools\auto-accept.cmd` and `C:\tools\antigravity-auto-accept.cmd` to prioritize the active workspace first, eliminating outdated daemon execution conflicts.
- **Comprehensive Automated Test Coverage**:
  - Added unit test coverage for multi-target selection, per-port lockfile isolation, WindowSession lifecycle, and daemon session aggregation (18/18 tests passing).

## [1.5.0] - 2026-09-20

### Added
- **Comprehensive Multi-Root Storage Auditing & Cleanup**:
  - Unified coverage across both primary Antigravity environments: `~/.gemini/antigravity-ide/` and `~/.gemini/antigravity/` (AGY CLI).
  - Added monitoring and cleanup for SQLite conversation databases (`conversations/*.db`, `*.db-shm`, `*.db-wal`, `*.pb`).
  - Added scanning for cloned temporary workspaces in `~/.gemini/tmp/` and file history in `~/.gemini/history/`.
  - Added targeted Chromium browser profile cache discovery (`~/.gemini/antigravity-browser-profile/`).
  - Added coverage for `implicit/` context caches, `context_state/`, and `html_artifacts/`.
- **Dry-Run Temporary File Discovery Scanner (`antigravity-find-temp` / `agy-find-temp`)**:
  - New dedicated CLI binary and command (`antigravity-find-temp` / `agy-find-temp` / `auto-accept find-temp`) displaying individual candidate files with age, size, and category.
  - Added `--limit <N>` and `--json` machine-readable output flags.
- **Enhanced `antigravity-clean` Granular Controls**:
  - Added `--browser-cache`, `--conversations`, `--tmp`, and `--history` flags.
- **Companion Conversation Database Purging in `antigravity-brain`**:
  - Automatically purges corresponding SQLite databases and context state when deleting brain sessions to eliminate orphaned database records.
- **Integrated Subcommands in Daemon CLI**:
  - `auto-accept check`, `auto-accept find-temp`, `auto-accept clean`, and `auto-accept brain` callable directly from `auto-accept`.
- **Automated Test Coverage**:
  - Added unit test suite assertions for all bin script syntax, python script compilation, and runner integrity.

## [1.4.0] - 2026-09-16

### Added
- **Antigravity 3-Tier Workstation Deletion Audit (`antigravity-check` / `agy-check`)**:
  - Full workstation scanner categorizing storage into 3 safety tiers: **🟢 Tier 1: SAFE TO DELETE** (scratch scripts, browser WebP recordings, session transcript logs, cached AST annotations, %TEMP% dumps, NPM/UV/Pip package caches), **🟡 Tier 2: STALE & ADVISABLE TO DELETE** (session brain history, Playwright browser binaries, project dependencies), and **🔴 Tier 3: DO NOT DELETE** (critical agent rules, skills, MCP configuration, user settings).
  - Compact 80-column terminal output preventing line-wrap glitches across Windows CMD and PowerShell.
- **Selective & Deep Cleanup Engine (`antigravity-clean` / `agy-clean`)**:
  - Flags: `--all`, `--stale`, `--deep`, `--scratch`, `--recordings`, `--caches`, `--days <N>`, and `-f` / `--force`.
- **Brain Session Manager (`antigravity-brain` / `agy-brain`)**:
  - Displays session distribution tables ranked by disk size with extracted project topics.
  - Delete by Table Index Number (`antigravity-brain --delete 2`).
  - Automatic trailing dot stripping (`antigravity-brain --delete 9178f300-5..`).
  - Age-based batch purge (`antigravity-brain --delete-older-than 7`) evaluating session folder creation time (`ctime`).
  - Full 36-char UUID display (`--full-id`) and interactive selector mode (`-i` / `--interactive`).
- **Cross-Platform Node.js Bin Executables**: Exposes `antigravity-check`, `antigravity-clean`, `antigravity-brain`, and short `agy-*` aliases system-wide via package binaries.

## [1.3.0] - 2026-09-10

### Added
- **Standalone Production CLI Daemon**: Complete pivot to a lightweight, zero-dependency Node.js CLI daemon runnable system-wide via `auto-accept` or `antigravity-auto-accept`.
- **Vite/Gum-Inspired Terminal UI**:
  - Crisp, fixed-width box banner engineered to never line-wrap on standard 80-column terminals.
  - Single-keypress hotkeys via raw mode: `p` (pause/resume), `m` (toggle mode), `s` (stats), `c` (config), `h` (help), `q` (quit).
  - Cleaned status badges (`OK`, `PAUSED`, `SKIPPED`, `CONNECT`) with sanitized action/context previews.
- **Per-Project Configuration (`auto-accept init`)**:
  - Generates `.auto-accept.json` in any repository to tailor Ask/Skip keyword rules for that specific project.
- **Subcommands**:
  - `auto-accept init` (initialize local project config).
  - `auto-accept list` (list active Ask and Skip guardrail rules).
  - `auto-accept add-ask <kw>` & `auto-accept add-skip <kw>` (instantly append rules and persist to config).
  - `auto-accept rm <kw>`, `auto-accept rm-ask <kw>`, `auto-accept rm-skip <kw>` (instantly remove rules by name or numbered index).
  - `auto-accept status` (query live Antigravity CDP connection state in JSON).
  - `auto-accept doctor` (diagnoses connection health, checks Node.js version, and prints step-by-step setup guide for Windows/macOS/Linux).
- **Self-Healing Port Guide**: When waiting for an Antigravity IDE connection, the daemon automatically displays clear, OS-specific launch instructions after 4 seconds instead of keeping users wondering.
- **On-the-Fly Rule Hotkeys (`a` / `r`)**:
  - Press `a` during daemon execution to add new Ask/Skip rules interactively.
  - Press `r` during daemon execution to view a numbered rule list and remove rules without stopping the daemon.
- **Deep Card Context Extraction (`extractContextText`)**:
  - Solved button styling trap where Tailwind's `outline-none` class on buttons caused `closest()` to match the button itself instead of the interaction card.
  - Recursively traverses enclosing parents to capture the full command line (e.g. `git push origin main`), options, and prompt details.
- **Strict Option 1 Enforcement**:
  - By default, selects Option 1 (*"Allow this time"*), completely preventing Antigravity from caching blanket session-wide whitelists on commands.
- **Audio Chime & Manual Hold on Ask Keywords**:
  - Triggers system bell (`\x07`) and halts submission when any command matching the Ask list (`git push`, `git reset --hard`) is detected, keeping the card interactive in chat for manual confirmation.
- **Automated Test Suite**:
  - 8 automated unit & DOM simulation tests in `test/cli.test.js` covering configuration safety, JavaScript syntax compilation, target selection, stats persistence, and end-to-end card extraction.

### Removed
- Removed legacy VS Code extension code, TypeScript compilation steps, and heavy build dependencies.
