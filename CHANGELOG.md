# Change Log

All notable changes to the "antigravity-auto-submit" project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
