# Change Log

All notable changes to the "antigravity-auto-submit" project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-11-08

Major architectural evolution to **Antigravity PowerTools (AG PowerTools)**: the definitive productivity, multi-agent orchestration, and workspace hygiene suite for Antigravity IDE. Preserves internal package identifier `antigravity-auto-submit` and all 2,550+ existing installations.

### Added
- **Rebrand to Antigravity PowerTools**: Upgraded `displayName` across manifests and runtime banners while maintaining full backward compatibility.
- **Pillar 7 (One-Click Cache Optimizer & Turbo Preset)**:
  - Command `antigravityAutoSubmit.cleanCaches` (`ag-clean`) purging Tier 1 scratch and package manager caches with safe dry-run capabilities.
  - Command `antigravityAutoSubmit.applyTurboPreset` (`ag-turbo`) fine-tuning IDE settings (cursor blinking, zero smooth scroll latency, TS memory caps, watcher exclusions).
  - Command `antigravityAutoSubmit.auditDisk` for instant disk & session cache reclamation reporting.
- **Pillar 3 (Native Chat Microphone & Voice Dictation)**:
  - CDP DOM injection of native SVG microphone button into chat input toolbar.
  - Streaming audio transcription using Chromium native Web Speech API with global hotkey (`Ctrl+Alt+V`).
  - Optional Smart Prompt Polish mode structuring spoken dictation into Role, Objective, Context, and Constraints.
- **Pillar 4 (Telegram Remote Mission Control)**:
  - Native zero-dependency HTTPS long-polling bot (`node:https`) operating 100% locally with zero cloud dependencies or open ports.
  - Remote decision pings with inline `[Approve]` / `[Deny]` buttons dispatching real-time CDP approvals.
  - Bidirectional remote prompting and automated task completion alerts.
- **Pillar 2 (Next-Gen Autonomous Swarm - Beyond Ralph)**:
  - Dual-Agent Adversarial Loop with independent Red-Team Critic issuing cryptographic HMAC-SHA256 green approval tokens.
  - Parallel Git Worktree Swarm executing independent DAG tasks concurrently across isolated worktrees.
  - Shadow TDD pipeline enforcing strict Red-Green-Refactor testing invariants.
  - Mid-flight live steering via `STEERING.md` and Telegram channels.
- **Pillar 5 & 6 (Time-Travel Snapshots & Smart Model Cost Router)**:
  - Silent git micro-checkpoints (`ag-checkpoint`, `ag-rewind`) for 1-click conflict-free state rollback.
  - Smart Model Tier & Cost Router saving 70-80% in developer API tokens by triaging tasks across Flagship, Balanced, and Economy tiers.
- **10 New CLI Binaries**: `ag-powertools`, `powertools`, `ag-swarm`, `ag-loop`, `ag-tdd`, `ag-worktree`, `ag-telegram`, `ag-checkpoint`, `ag-rewind`, `ag-turbo`.

## [1.9.8] - 2026-11-04

Production-readiness audit: correctness, data-safety and packaging hardening.

### Security
- **Keyword gate could be disarmed by card text**: any approval card containing `skipKeywords:` / `askKeywords:` (for example while editing this project's own config) made the scanner skip *all* keyword checks, auto-approving dangerous commands in the same card. Only the config vocabulary itself is now stripped; any real command left in the card is still evaluated.
- **Recursive force deletes evaded the skip list**: `rm -fr`, `rm -r -f`, `rm --recursive --force` and `Remove-Item -Recurse -Force` were auto-approved because only the literal string `rm -rf` was matched. All flag arrangements are now detected, in both the daemon and the Claude hook.
- **Claude hook: a project config could remove every guardrail**: `.claude-auto-accept.json` was shallow-merged over the defaults, so a repository shipping empty `skipKeywords`/`askKeywords`/`protectedFiles` disabled the deny list and file shield. Project configs can now only *add* rules.
- **Claude hook: protected files were only shielded from Write/Edit**: `cat .env`, `echo SECRET > .env` and similar shell access bypassed the shield. Protected paths are now checked on the shell path too, and the hook's own `settings.json`/`.claude-auto-accept.json` are protected.
- **Claude hook: `setup` destroyed hand-edited settings.json**: a file with comments or a trailing comma failed to parse and was silently rewritten as `{}`, wiping `permissions`, `env` and comments. It now refuses to modify an unparseable file and reports why.

### Fixed
- **Config files with a UTF-8 BOM were silently ignored**: `JSON.parse` threw, the error was swallowed, and the daemon ran on defaults — discarding the user's `skipKeywords` and `cdpPort`. BOMs are tolerated across all config/stats reads, and unreadable configs now warn instead of failing silently.
- **`--config FILE <subcommand>` started the daemon instead of running the subcommand**: the option's value was mistaken for the subcommand (same for `--mode`, `--poll`, `-p`, `--ports`, `-d`, `--ask`, `--skip`). Option values are now skipped in both parsers.
- **Hot reload lost config updates permanently**: the mtime watermark advanced before the parse, so a file caught mid-save was never re-read. The watermark now advances only after a successful parse.
- **Daemon could run without its lock**: a failed lock-file write was swallowed and reported as success, allowing two daemons to approve the same prompt. The failure is now surfaced.
- **Reconnects could tear down the fresh connection**: a late `onclose` from the previous WebSocket called `destroy()` on the replacement socket. Handlers are now bound to their own socket.
- **Kiro: CDP sockets were never closed**: `destroy()`/`connect()` called `ws.terminate()`, which does not exist on Node's built-in WebSocket, so every teardown leaked a socket and its listeners. Now uses `close()` with identity-guarded handlers.
- **Kiro: MCP stdout corruption**: `engine-router.mjs` logged to stdout on the default `auto` route, corrupting the JSON-RPC framing. It logs to stderr now.
- **Kiro: token refresh and webhook tests hung forever**: `timeout:` was set with no `'timeout'` listener, so a stalled endpoint never settled the promise.
- **Kiro: `kiro arch`/`kiro council` lingered after printing results**: `Promise.race` timeout timers were never cleared, keeping the CLI alive up to 60s.
- **`antigravity-brain`: `--delete-older-than` could delete an actively used session**: "age" used `os.path.getctime` (on Windows, *creation* time) as last-activity. Age now derives from the newest mtime under the session.
- **Cleaner: browser-profile scan targeted user data**: every file at the profile root and in `Default/` (`Local State`, `Login Data`, `Bookmarks`, `Cookies`, `Preferences`, `History`) was treated as a cache. Only files inside actual cache directories are now candidates.
- **Cleaner: `--days` accepted 0 and negative values**, making every file "stale". Values below 1 are now rejected.
- **Daemon main loop failed silently**: recurring monitor-cycle errors were swallowed. They are now surfaced (throttled to once per 30s).
- **Stats writes could leak `.tmp` files** on a failed rename or crash; partial writes are cleaned up and stale temporaries are swept on startup.
- **`bin/*.js` reported success when Python died from a signal** (null exit status).
- **VS Code extension discarded a valid status payload**: the daemon exits `1` when no window is attached but still prints JSON, so the "no window" state was unreachable and the status bar showed green while disconnected.
- **Publishing never rebuilt the bundled daemon**: `publish:vsce`/`publish:ovsx` had no pre-hook, and `vscode-extension/daemon/` is gitignored, so a publish could ship a stale or missing daemon. Both now bundle first, and `bundle.js` verifies the copy's SHA-256.
- **Stale `package-lock.json`** (pinned at 1.8.5 with `engines: node >=18`) regenerated for 1.9.6 / Node >=22.
- **`kiro-auto-accept` declared a third-party `ws` dependency** despite the zero-dependency policy; the `require('ws')` fallback is dead code on Node ≥22. Removed, along with two leftover `ws.terminate()` calls.
- **More BOM-intolerant config reads**: `add-skip`/`remove` rule edits, Claude hook stats, `uninstall` and `isHookInstalled` all used raw `JSON.parse(fs.readFileSync(...))`, so a BOM-saved file was silently unusable. All now use `readJsonFile()`.
- **Extension status polling could stack `node` processes**: a 2.5s interval against a 4s probe timeout had no in-flight guard.
- **Extension left an orphan daemon on reload**: the 500ms restart timer was untracked and survived `deactivate()`.
- **Extension `stop()` killed one daemon but deleted every PID file**, orphaning the others so the next start spawned a duplicate — it now kills each PID it removes.
- **Cleaner's "Protected" tier was display-only**: `purge_files()` now refuses any target inside a Protected path (`is_protected_path()`), so a future scan pattern cannot delete protected state. The tier also moved to a single `PROTECTED_PATH_GROUPS` constant to prevent list drift.
- **Cleaner followed Windows junctions**: `is_dir(follow_symlinks=False)` is still true for a junction, so scans and `purge_empty_dirs()` could reach outside the cleanup root. Reparse points are now skipped.
- **`antigravity-brain` could delete the wrong session**: `--delete 0` failed the index bounds check and then silently fell back to matching any ID prefix beginning with "0". Resolution is now deterministic — exact ID, then 1-based row, then a *unique* ID prefix — and ambiguous prefixes are refused with the matching IDs listed.
- **`antigravity-brain` had no dry-run**, and the bulk-delete prompt named only a count. Added `--dry-run`, an explicit list of targeted sessions before confirmation, and real failure reporting instead of an unconditional success banner.

### Concurrency & reliability
- **Approvals from several windows now land together**: each window already polled independently, but every approval performed a *synchronous* stats write inside the WebSocket handler, blocking the event loop and serialising other windows. Writes are now coalesced and flushed on shutdown/exit.
- **Scanner script is memoized** by configuration signature instead of being rebuilt (~20 KB) on every tick for every window.
- **The daemon no longer dies from a single stray error**: `uncaughtException`/`unhandledRejection` used to `process.exit(1)` — indistinguishable from "it turned itself off". It now logs and keeps serving, with a circuit breaker (exits only after >20 faults in 60s). A closed stdout can no longer kill it either.
- **Hot reload could silently enable or disable the daemon**: applying `enabled` on *any* config edit meant editing keywords could flip the running state. An enable/disable is now applied only when the file's own `enabled` value actually changed.
- **The extension killed the daemon on every reload**: `deactivate()` called `stop()`, so a window reload or extension update switched auto-submit off. The daemon is a standalone background process and now survives; only an explicit Stop command stops it.

### Cleaner coverage (`antigravity-clean`)
- **Claude Code home (`~/.claude`) was entirely unscanned** — 934 MB on a typical install, of which **852 MB were stale transcripts**. Added: telemetry/cache/shell-snapshots/logs as Tier 1 (safe), and conversation transcripts + file-edit history as an age-gated Tier 2 (`--stale` / `--deep`).
- **The standalone Antigravity App was never cleaned**: Electron caches were scanned only for `%APPDATA%\Antigravity IDE`, not `%APPDATA%\Antigravity` (the App on port 9334). Both profiles are covered now.
- **Claude Code config is now in the Protected tier** (`settings.json`, `plugins/`, `commands/`, `agents/`, `CLAUDE.md`, `~/.claude.json`) so the new scan can never reach it.
- **Package-manager coverage was partly broken and incomplete**: the pnpm path pointed at a non-existent `pnpm-cache` (the real store is `%LOCALAPPDATA%\pnpm\store`), and bun (`~/.bun/install/cache`) and cargo (`~/.cargo/registry`) were never scanned. Verified paths added; the category is now `Package Manager Caches` covering npm, pnpm, yarn, bun, uv, pip and cargo.
- **JetBrains IDEs (IntelliJ, PyCharm, WebStorm, …) were not covered at all**: added a per-product scan of `%LOCALAPPDATA%\JetBrains\<Product>\{caches,index,log,tmp,compile-server,jcef_cache}`; settings under `%APPDATA%\JetBrains` stay protected.
- **VSCodium added** to the external-IDE scan (same Electron layout as VS Code); its user settings and `~/.vscode-oss/extensions` are protected.
- Net effect measured on one developer machine: Tier 1 reclaimable went from **914 MB → 2,742 MB** and total reclaimable from **4.5 GB → 6.3 GB**.
- **More common toolchains covered**: Gradle, Maven, NuGet, Go module cache and Composer were missing; Android Studio, Sublime Text and the Visual Studio component cache are now scanned too (Android Studio is handled by the JetBrains-family scanner).
- **New `--coverage` command** (`agy-coverage`, `npm run coverage`): a transparency report listing all 19 supported tools, every category with detected size, what is *not* present on this machine, the full Protected tier, and the searched roots. Supports `--json` for scripting. It never deletes anything.

### Tooling
- **`AGENTS.md`** added: binding maintenance rules (invariants, per-change-type rules, danger zones, definition of done, anti-patterns) shared by every agent working in this repo.
- **`npm run verify`** added: 9 static invariant checks (zero deps, version sites, bin targets, publish whitelist, extension manifest ↔ registered commands, daemon bundle parity, forbidden patterns, Python compile). Wired to `prepublishOnly` so an unverified release cannot be published.

### Tests
- 19 new regression tests covering the keyword-bypass, recursive-delete, BOM config, CLI dispatch, hot-reload retry, hook guardrail, settings-preservation, brain-resolution and cleaner-protection fixes.

## [1.9.4] - 2026-11-01

### Added
- **Marketplace & Documentation Enhancement**: Embedded full Turbo Mode architectural comparison and subagent automation value proposition directly into the VS Code Marketplace package.
- **Resilient Multi-Version Loader**: Enhanced extension startup fallback ensuring seamless transitions between extension updates.

## [1.9.3] - 2026-11-01

### Added
- **Accurate Window Telemetry (`countIdeWindows`)**: Separated physical top-level IDE windows from internal Chromium DevTools Protocol (CDP) surfaces. Reports accurate IDE windows (e.g. `2 wins (7 targets on port 9333)`).
- **Subagent Auto-Approval**: Automatic radio button selection (`Option 1: Allow this time`) and Enter dispatch for nested subagent prompt cards and `[Submit ↵]` buttons.
- **Universal Loopback Target Matching**: Discovers and attaches to loopback chat panels across arbitrary workspace directory names (e.g. `Clip`).
- **Resilient Extension Daemon Fallback**: Added multi-version fallback in `daemonPath()` so existing IDE sessions seamlessly locate the active daemon across extension upgrades.

### Fixed
- **VS Code Extension View Registration**: Removed ghost tree views from `views` in `package.json` and added `"onView:antigravityAutoSubmit.dashboardView"` to `activationEvents`, resolving "No view is registered with id" toast notifications.
- **Guardrail Self-Inspection Safety**: Fixed false-positive skip keyword matches when commands or arguments contain rule configuration inspection strings (`skipKeywords:` / `askKeywords:`).
- **Non-TTY Stdin Guard**: Hardened `isInteractive` check to verify both `process.stdout.isTTY` and `process.stdin.isTTY` for background daemon stability.

## [1.9.0] - 2026-10-29

### Added
- **Dashboard sidebar panel**: Native VS Code activity bar panel with the Antigravity icon. Four flat TreeView sections — Status, Stats, Actions, and Live Log — provide at-a-glance daemon state, CDP connection details, approval counts, and a real-time event feed without leaving the editor.
- **Refresh Dashboard** and **Clear Log** commands with title-bar icon buttons on the sidebar views.
- Context-aware Start/Stop buttons that toggle based on daemon state.
- Status polling (5 s interval) and live stdout parsing for APPROVE, SKIPPED, PAUSED, READY, DISCON, MODE, and TOGGLE events.

## [1.8.5] - 2026-10-29

### Added
- **VS Code Extension (`vscode-extension/`)**: Status bar toggle, mode switcher, connection status, setup/doctor commands, and keyword settings. Bundles the daemon so the `.vsix` is self-contained.

### Added (continued)
- **Kiro setup guidance**: `kiro-agent` now explains what is missing (Kiro Account Manager not installed, proxy offline) instead of raw `ECONNREFUSED`. `kiro swarm`, `kiro parallel` and `kiro review` require at least 3 accounts (override with `KIRO_MIN_ACCOUNTS`). `kiro status` shows Account Manager state.
- **Kiro IDE preflight**: `kiro-auto-accept` tells users when Kiro IDE is not installed and points to the right tool for Antigravity or Claude Code.
- **Extension getting-started walkthrough**, environment check, `daemonSource` (bundled or global npm install) and `extraArgs` settings so daemon updates do not require an extension update.

### Fixed
- **Node version requirement**: the CDP daemons rely on Node's built-in WebSocket (Node 22+). `engines` is now `>=22`, and the daemon exits with a clear message on older Node instead of silently never connecting.
- `kiro-agent` no longer assumes 20 accounts when the Account Manager store is missing.

### Changed
- **README**: npm-first install and update instructions, Antigravity IDE 2.6.0+ / App 2.23+ compatibility note, Claude Code auto-accept hook section, and expanded command alias list.

## [1.8.4] - 2026-10-28

### Added
- **Antigravity IDE 2.6.0+ (VS Code 1.107+) & App 2.23+ Full Support**:
  - **Multi-Document Iframe Traversal**: Upgraded `buildScannerScript` to recursively discover and scan nested documents (`#active-frame`, `<iframe class="webview">`, and embedded extension frames) to reliably detect confirmation prompts rendered inside modern webviews.
  - **Antigravity Webview Target Discovery**: Upgraded `selectAllWorkbenchTargets` to monitor both native workbench windows and Antigravity webview targets (`type: iframe` or `type: webview` with `vscode-webview://` or `antigravity` URLs) while preserving strict isolation from external web browsers and Kiro IDE.
  - **Expanded Action Button & Dialog Selectors**: Added support for new AG version button variants including `allow always`, `always allow in this workspace`, `always allow for this session`, `allow and continue`, `allow & continue`, `apply changes`, `apply all`, `accept all`, `run anyway`, and `grant access`.
  - **Context-Aware Event Dispatching**: Dispatches radio button selection (`Option 1: Allow this time` vs `Option 2: Always allow`) and keyboard events (`Enter`, `1`, `2`) directly within the target document frame where the approval card resides.
- **Kiro IDE Global CLI Aliases**: Exposed `kiro-auto-accept` and `kiro-accept` in package `bin` for instant multi-IDE automation from a single install.

### Fixed
- **Cross-Platform Production Readiness**: Normalized all shebangs and scripts to clean Unix LF line endings to eliminate Linux/macOS `env: 'node\r': No such file or directory` runtime errors.
- **Package Cleanliness**: Added strict `files` whitelist in `package.json` to exclude test fixtures, internal docs, and intermediate artifacts from distribution tarballs.
- **Shortcut Auto-Patching Performance**: Added depth limit and optimized directory scanning in `handleSetup` to prevent timeouts across cloud-synced desktop and start menu shortcuts.
- **Process Detection Resilience**: Enhanced regex patterns across `getRunningAntigravity`, `killAntigravity`, and `findAntigravityExecutables` for multi-version process and binary candidate paths.

## [1.8.2] - 2026-10-01

### Added
- **Kiro IDE Companion Suite (`kiro-auto-accept` v1.1.0)**:
  - Integrated standalone Kiro IDE auto-accept daemon in `kiro-auto-accept/` featuring persistent `WindowSession` CDP architecture.
  - Multi-target concurrent scanning: monitors workbench pages, out-of-process Kiro Agent webviews (`vscode-webview://...`), and nested `#active-frame` documents.
  - Dedicated CLI binary aliases: `kiro-auto-accept`, `kiro-accept`, `kiro-doctor`, `kiro-setup`, `kiro-launch`, `kiro-restart`, and `kiro-start`.
  - Comprehensive permission approval coverage: shell commands, file modifications, diffs, tool/MCP execution, step continuations, and workspace trust dialogs.
  - Strict two-way port isolation: Antigravity Auto-Submit operates on Port 9333 (range 9330–9340, explicitly ignoring 9220–9235), while Kiro Auto-Accept operates on Port 9222 (range 9220–9230, explicitly ignoring 9300–9400).
- **Shorthand CLI Aliases & Interactive Hotkeys**:
  - Direct shell shorthands: `auto-accept d` (doctor), `auto-accept l` (list rules), `auto-accept s` (stats), `auto-accept c` (config).
  - Live in-daemon hotkeys without exiting: `d`, `l`, `s`, `c`, `p`, `m`, `R`, `h`, `q`.

## [1.8.1] - 2026-09-28

### Added
- **Full Antigravity Standalone App Support & Dual-Product Compatibility**:
  - Differentiated between **Antigravity IDE** (`Antigravity IDE.exe`, VS Code fork on port `9333`) and **Antigravity App** (`Antigravity.exe`, standalone desktop interface on port `9334`).
  - Allocated distinct default ports (IDE: `9333`, App: `9334`) ensuring both applications can run side-by-side without port collision.
  - Multi-port concurrent discovery (`findCdpEndpoints`) now scans and attaches to all open workbench windows across both applications simultaneously.
- **Enhanced Target Selection (`selectAllWorkbenchTargets`)**:
  - Added support for internal language server endpoints (`https://127.0.0.1:<port>/` and `http://localhost:<port>/`) served by Antigravity App's embedded engine.
  - Enforced strict loopback verification to guarantee external internet browser tabs and web documentation are never attached.
- **Extended DOM Button Recognition**:
  - Added Antigravity App specific action labels: `Always Allow`, `Allow Once`, `Run command`, `Always run`, `Run (unsandboxed)`, `Proceed with Plan`, and `Accept Step`.
  - Added prefix-tolerant matching for dynamic compound button labels.
- **False-Positive Task Log & Loop Immunity**:
  - Eliminated infinite click loops on completed task accordions in conversation history.
  - Added strict action label length validation (`<= 30` chars), negative filters for completed task states, and accordion `aria-expanded` rejection.
- **Dual-Product CLI Tools (`setup`, `doctor`, `restart`, `start`)**:
  - `auto-accept setup`: automatically patches and creates desktop shortcuts for both Antigravity IDE and App.
  - `auto-accept doctor`: displays individual running status and port diagnostic checks for both IDE and App.

## [1.8.0] - 2026-09-28

### Added
- **Bulletproof 3-Step Setup Architecture (Zero-Flakiness Standard)**:
  - Prioritized the direct shortcut target configuration (`--remote-debugging-port=9333`) as the primary, 100% deterministic setup path across documentation, CLI output, and system doctor.
  - Mitigates Chromium/Electron singleton limitations where background instances drop CLI flags when opened through external auto-setup scripts.
- **Safe, Non-Destructive Ghost Process & Singleton Troubleshooting**:
  - Added targeted PID diagnostics across `printSetupInstructions()`, `auto-accept doctor`, and the live daemon connection loop.
  - Directs users to pinpoint the exact lingering process via Task Manager (Details tab), `tasklist /FI "IMAGENAME eq Antigravity.exe"`, or `netstat -ano | findstr :9333`.
  - Added explicit warnings against blind `taskkill /F /IM chrome.exe` commands to guarantee existing browser tabs, form inputs, and active sessions are never disrupted.
- **Browser Target Isolation**:
  - Hardened `selectAllWorkbenchTargets` to reject external browser pages (localhost, http/https, chrome://, edge://, about:) to prevent any connection conflicts with web development servers or personal browsers.
- **Automated Test Coverage**:
  - Added test cases #31-#34 in `test/cli.test.js` validating `printSetupInstructions` exports, binary alias subcommand resolution, atomic stats writes, and brain query safety.

### Fixed
- **Subcommand Binary Alias Dispatching**:
  - Unified `binName` inspection across `resolveConfig()` and `Main Entry` in `auto-accept.js`.
  - Fixed issue where global binary invocations of `agy-start` and `antigravity-start` fell through to the passive daemon without executing `handleEasyStart`.
- **Session Deletion Empty Query Guard in `antigravity_brain.py`**:
  - Guarded `find_target_session` to immediately reject empty, whitespace, or dot-only queries, preventing accidental prefix matching against the first session.
- **Linux Launcher Infinite Recursion Protection**:
  - Updated Linux CLI launcher generation in `handleSetup` to use absolute binary paths (`/usr/bin/antigravity`), preventing infinite recursive execution when `~/.local/bin` is in `$PATH`.
- **Atomic Stats Persistence**:
  - Replaced direct `fs.writeFileSync(STATS_FILE)` in `StatsManager.save` with atomic tmp-file rename, preventing stats truncation or corruption during concurrent window sessions.
- **Process Spawn Error Trapping**:
  - Attached error listeners to spawned Antigravity IDE child processes in `launchAntigravityProcess` to avoid uncaught exception crashes on execution failures.
- **Comprehensive Cross-Platform Uninstall**:
  - Extended `auto-accept uninstall` to remove macOS Desktop launchers, CLI wrappers, and `~/.zshrc` aliases, as well as Linux `.desktop` arguments.
- **Workstation Global NPM Synchronization**:
  - Updated `scripts/sync_wrappers.js` to synchronize `bin/` and `scripts/` directories alongside the main executable into the global npm module.

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
- **Manual Debugging Port Fallback Documentation (All OS)**:
  - Detailed step-by-step guides for manual debugging port configuration if automated setup fails across Windows (Desktop/Taskbar shortcuts, PowerShell, CMD), macOS (Terminal, App bundle, `~/.zshrc` alias, Automator), and Linux (Terminal, `.desktop` entry, `~/.bashrc` alias).
- **Sequential Workstation Audit & Cleanup Guide in Docs**:
  - Structured 5-step workflow with risk levels and proper command sequences: `agy-check` (audit) ➔ `agy-find-temp` (dry-run preview) ➔ `agy-clean` (safe purge) ➔ `agy-brain` (session footprint management) ➔ `agy-check` (post-verification).

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
