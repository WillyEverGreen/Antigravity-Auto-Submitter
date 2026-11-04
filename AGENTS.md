# AGENTS.md — Maintenance Rules

Canonical rules for any agent (Claude, Codex, Cursor, Gemini, Copilot, Kiro) or human
working in this repository. `CLAUDE.md` holds the architecture map; **this file holds the
rules**. If the two disagree, this file wins for process and `CLAUDE.md` wins for internals.

Enforced by `npm run verify` — run it before every commit. It must exit 0.

---

## 1. Non-negotiable invariants

| # | Invariant | Why |
|---|---|---|
| 1 | **Zero third-party runtime dependencies.** Only `node:`/builtins, relative imports, and `vscode` (extension only). | The tool must run from a bare `node` with no `npm install`. |
| 2 | **Safety gates fail closed, never open.** A keyword/guard check that cannot establish context must NOT default to "approve". | This software auto-approves commands that can destroy a machine. |
| 3 | **User safety config is additive-only.** A project-local config may add rules; it may never remove built-in defaults. | A checked-out repo must not be able to disarm the guardrails. |
| 4 | **Never overwrite a file you could not parse.** Abort and report instead. | `settings.json` holds the user's permissions and env. |
| 5 | **Every destructive path must be dry-runnable.** New deletion logic needs a `--check`/`--dry-run` equivalent that performs no writes. | Cleaner/brain delete real user data. |
| 6 | **`stdout` is a protocol channel** in the MCP server and the Claude hook. Diagnostics go to `stderr`. | A stray `console.log` corrupts JSON-RPC / hook JSON. |
| 7 | **Node >= 22 baseline.** No APIs newer than Node 22. | `package.json engines`. |
| 8 | **Never change run state without an explicit user action.** No code may enable, disable, start or stop auto-submit on its own. | "It turned itself off" is the single most damaging failure mode for a background approver. |
| 9 | **A background daemon must survive transient errors.** Log and keep serving; only exit on a repeated fault (circuit breaker). | One stray rejection must not silently end auto-approval. |

## 2. Hard rules per change type

### Any behavior change
- Add or update a test in the matching suite **in the same commit**. A fix without a
  regression test is not done.
- Keep the existing suite green: `npm test` (all suites, no skips).

### Safety / guardrail change
- Add a regression test that **proves the bypass is closed**, and one that proves ordinary
  work is **not** over-blocked. Both, always.
- Never widen an approval matcher (button labels, keyword lists) without a corresponding
  test showing what it must still refuse.

### Release / version change
- Bump **all four** version sites together — `npm run verify` checks them:
  1. root `package.json` `version`
  2. `vscode-extension/package.json` `version`
  3. the `PKG_VERSION = 'x.y.z'` fallback literal in `auto-accept.js`
  4. `CHANGELOG.md` entry
- Add a `CHANGELOG.md` section (Keep a Changelog format). Never rewrite released sections.
- Rebuild the bundled daemon: `node vscode-extension/scripts/bundle.js`
  (`vscode-extension/daemon/` is gitignored — **never commit it**, never assume it exists).
- Do not commit `*.vsix` artifacts. They are build output, gitignored, and stale copies
  confuse users into installing old builds.

### Config / file I/O
- Read JSON through `readJsonFile()` (BOM-tolerant), never raw `JSON.parse(fs.readFileSync(...))`.
  Windows editors save UTF-8 with BOM; a BOM silently discarded the user's whole config once already.
- Writes to shared state files are **atomic**: write `*.tmp`, then `rename`. Clean up the
  temp file on failure.
- Advance an mtime/reload watermark **only after** a successful parse.
- Hot reload may apply `enabled` **only when the file's own value changed** since the last read.
  Editing keywords must never flip the running state.
- `deactivate()` must not kill the daemon: it is a standalone background process and must
  survive window reloads and extension updates.

### Concurrency (multi-window)
- Each `WindowSession` polls independently; never introduce a global lock or shared scan queue
  that serialises windows.
- Nothing may perform synchronous disk I/O on the approval hot path — coalesce writes
  (`StatsManager.scheduleSave()`), and flush on shutdown/exit.
- `buildScannerScript()` is memoized by config signature; keep the key in sync with every input
  that changes the generated script.

### WebSocket / CDP
- Use `.close()`. Node's built-in `WebSocket` has **no** `terminate()`.
- Bind handlers to their own socket (`if (ws !== this.ws) return;`) so a late `close` from a
  replaced socket cannot tear down the live connection.

### Shell / process
- Never interpolate untrusted values into a shell string. Use `spawnSync(cmd, [args])`.
- Propagate child exit codes exactly; a signal-killed child is a **failure**, not `0`.

### Cleanup tooling (`scripts/*.py`)
- Any new scan pattern must be checked against the **Protected** tier and must not reach it.
- New deletion code must stay inside an allow-listed root and must skip Windows junctions
  (reparse points), which `follow_symlinks=False` does **not** exclude.
- "Age" always means **last activity** (`st_mtime`), never creation time (`getctime` on Windows
  is creation time — this once made `--delete-older-than` target an active conversation).

## 3. Danger zones — read before editing

These are the highest-blast-radius functions. Changing them requires a live test or a very
careful fixture.

| Area | File | Risk |
|---|---|---|
| Injected DOM scanner | `auto-accept.js` → `buildScannerScript()` | Clicks real approval buttons; a bad matcher approves destructive commands |
| Kiro scanner | `kiro-auto-accept/kiro-auto-accept.js` | Same, plus guessed CSS selectors |
| Claude decision engine | `claude-auto-accept/claude-auto-accept.js` → `evaluateDecision()` | Runs on every tool call |
| Deletion paths | `scripts/antigravity_cleaner.py`, `scripts/antigravity_brain.py` | Deletes user data |
| Extension daemon lifecycle | `vscode-extension/extension.js` | Can spawn/kill daemons |

Known open risks are tracked in README → "Known limitations" and in the `[Unreleased]`
CHANGELOG section. Do not silently change behavior in these areas.

## 4. Definition of done

```
npm run verify      # static invariants: versions, deps, bundle, manifests, patterns, python
npm test            # 6 suites
```

Both must exit 0. Then:
- [ ] CHANGELOG updated (for user-visible changes)
- [ ] version sites bumped (for releases)
- [ ] daemon re-bundled (for releases)
- [ ] no `*.vsix` staged
- [ ] no secrets in the diff

## 5. Commands

| Command | Purpose |
|---|---|
| `npm run verify` | Static invariant checks (fast, no tests) |
| `npm run verify:full` | `verify` + `npm test` |
| `npm test` | All suites |
| `npm run test:claude` / `test:kiro` / `test:extension` | Subsets |
| `npm run extension:package` | Bundle daemon + build `.vsix` |
| `npm run extension:publish:vsce` | Bundle daemon + publish (pre-hook guarantees the bundle) |
| `node vscode-extension/scripts/bundle.js` | Sync the bundled daemon only |

## 6. Anti-patterns (rejected in review)

- Adding an npm dependency.
- `catch (e) {}` around a parse, a write, or a network call that the user must know about.
- `console.log` in `kiro-agent/engine-*.mjs`, `kiro-core.mjs`, or `kiro-controller.mjs`.
- `JSON.parse(fs.readFileSync(...))` for config/state files.
- `ws.terminate()`.
- A keyword check with an early `return null` that skips the rest of the checks.
- A test that asserts only the happy path for a safety rule.
- Committing build artifacts, `node_modules`, or `.claude/settings.json`.
