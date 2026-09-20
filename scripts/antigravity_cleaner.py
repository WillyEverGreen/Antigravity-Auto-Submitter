#!/usr/bin/env python3
"""
Antigravity Workstation Audit & Safe Cleanup Utility (v5.5 Multi-Root Enterprise Edition)
Commands: antigravity-check, antigravity-find-temp, antigravity-clean, agy-check, agy-find-temp, agy-clean

Scans and cleans all temporary files, caches, recordings, scratch scripts, conversation databases,
and package caches across both ~/.gemini/antigravity-ide and ~/.gemini/antigravity (AGY CLI).
"""

import os
import sys
import argparse
import time
import json
import shutil

if sys.platform == "win32":
    os.system("")
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def format_size(bytes_val):
    if bytes_val >= 1024 ** 3:
        return f"{bytes_val / (1024 ** 3):.2f} GB"
    elif bytes_val >= 1024 ** 2:
        return f"{bytes_val / (1024 ** 2):.2f} MB"
    elif bytes_val >= 1024:
        return f"{bytes_val / 1024:.2f} KB"
    else:
        return f"{bytes_val} B"


def format_age(age_seconds):
    if age_seconds < 60:
        return f"{int(age_seconds)}s ago"
    elif age_seconds < 3600:
        return f"{int(age_seconds / 60)}m ago"
    elif age_seconds < 86400:
        return f"{age_seconds / 3600:.1f}h ago"
    else:
        return f"{age_seconds / 86400:.1f}d ago"


def fast_scan_dir(path, collect_files=False):
    """
    Ultra-fast directory scanner using os.scandir with inline WIN32_FIND_DATA stats.
    Returns (file_count, total_bytes, file_list).
    """
    total_sz = 0
    total_cnt = 0
    file_list = []

    if not os.path.exists(path):
        return 0, 0, []

    if os.path.isfile(path):
        try:
            sz = os.path.getsize(path)
            return 1, sz, [path] if collect_files else []
        except Exception:
            return 0, 0, []

    stack = [path]
    while stack:
        curr = stack.pop()
        try:
            with os.scandir(curr) as it:
                for entry in it:
                    try:
                        if entry.is_file(follow_symlinks=False):
                            stat = entry.stat(follow_symlinks=False)
                            total_sz += stat.st_size
                            total_cnt += 1
                            if collect_files:
                                file_list.append((entry.path, stat.st_size, stat.st_mtime))
                        elif entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                    except Exception:
                        pass
        except Exception:
            pass

    return total_cnt, total_sz, file_list


def get_active_session_id():
    active_id = os.environ.get("ANTIGRAVITY_CONVERSATION_ID")
    if not active_id:
        cwd = os.getcwd()
        if "brain" in cwd:
            parts = cwd.replace("\\", "/").split("/")
            if "brain" in parts:
                idx = parts.index("brain")
                if idx + 1 < len(parts) and len(parts[idx + 1]) >= 8:
                    active_id = parts[idx + 1]
    return active_id


def get_antigravity_roots():
    gemini_dir = os.path.expanduser("~/.gemini")
    roots = []
    for candidate in ["antigravity-ide", "antigravity"]:
        p = os.path.join(gemini_dir, candidate)
        if os.path.exists(p):
            roots.append(p)
    return roots


def scan_browser_caches(collect_files=False):
    profile_dir = os.path.expanduser("~/.gemini/antigravity-browser-profile")
    total_cnt = 0
    total_sz = 0
    file_list = []

    if not os.path.exists(profile_dir):
        return 0, 0, []

    target_subdirs = {"cache", "code cache", "gpucache", "shadercache", "grshadercache", "cachestorage", "reports"}
    stack = [profile_dir]

    while stack:
        curr = stack.pop()
        try:
            with os.scandir(curr) as it:
                for entry in it:
                    try:
                        name_lower = entry.name.lower()
                        if entry.is_file(follow_symlinks=False):
                            stat = entry.stat(follow_symlinks=False)
                            total_sz += stat.st_size
                            total_cnt += 1
                            if collect_files:
                                file_list.append((entry.path, stat.st_size, stat.st_mtime))
                        elif entry.is_dir(follow_symlinks=False):
                            if curr == profile_dir or name_lower == "default" or name_lower in target_subdirs or "cache" in name_lower:
                                stack.append(entry.path)
                    except Exception:
                        pass
        except Exception:
            pass

    return total_cnt, total_sz, file_list


def collect_audit_metrics(stale_days=7, collect_files=False):
    now = time.time()
    stale_sec = stale_days * 86400
    active_session_id = get_active_session_id()
    roots = get_antigravity_roots()

    metrics = {
        "tier1_safe": {},
        "tier2_review": {},
        "tier3_protected": {},
        "safe_total_bytes": 0,
        "safe_total_files": 0,
        "reclaimable_total_bytes": 0,
        "reclaimable_total_files": 0,
    }

    # Helper to register category
    def add_tier1(name, cnt, sz, files):
        metrics["tier1_safe"][name] = {"count": cnt, "size": sz, "files": files}
        metrics["safe_total_bytes"] += sz
        metrics["safe_total_files"] += cnt

    def add_tier2(name, cnt, sz, files, is_advisable=True):
        metrics["tier2_review"][name] = {"count": cnt, "size": sz, "files": files, "advisable": is_advisable}
        if is_advisable:
            metrics["reclaimable_total_bytes"] += sz
            metrics["reclaimable_total_files"] += cnt

    def add_tier3(name, cnt, sz, files):
        metrics["tier3_protected"][name] = {"count": cnt, "size": sz, "files": files}

    # 1. Global Scratch across roots
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        sp = os.path.join(r, "scratch")
        if os.path.exists(sp):
            c, s, fl = fast_scan_dir(sp, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier1("Global Scratch Scripts", t_cnt, t_sz, t_fl)

    # 2. Browser WebP Recordings across roots
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        rp = os.path.join(r, "browser_recordings")
        if os.path.exists(rp):
            c, s, fl = fast_scan_dir(rp, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier1("Browser WebP Recordings", t_cnt, t_sz, t_fl)

    # 3. Session Scratch & Logs in brain across roots
    scratch_cnt, scratch_sz, scratch_fl = 0, 0, []
    logs_cnt, logs_sz, logs_fl = 0, 0, []
    stale_brain_cnt, stale_brain_sz, stale_brain_fl = 0, 0, []
    active_brain_cnt, active_brain_sz, active_brain_fl = 0, 0, []

    for r in roots:
        bp = os.path.join(r, "brain")
        if not os.path.exists(bp):
            continue
        try:
            with os.scandir(bp) as it:
                for conv in it:
                    if not conv.is_dir(follow_symlinks=False):
                        continue
                    conv_id = conv.name
                    is_active = (active_session_id and conv_id == active_session_id)

                    # Session scratch
                    s_scratch = os.path.join(conv.path, "scratch")
                    if os.path.exists(s_scratch):
                        c, s, fl = fast_scan_dir(s_scratch, collect_files)
                        scratch_cnt += c; scratch_sz += s; scratch_fl.extend(fl)

                    # Session logs
                    s_sys = os.path.join(conv.path, ".system_generated")
                    if os.path.exists(s_sys):
                        c, s, fl = fast_scan_dir(s_sys, collect_files)
                        logs_cnt += c; logs_sz += s; logs_fl.extend(fl)

                    # Stale vs active full brain sessions
                    c, s, fl = fast_scan_dir(conv.path, collect_files)
                    if not is_active:
                        try:
                            mtime = conv.stat(follow_symlinks=False).st_mtime
                            if (now - mtime) > stale_sec:
                                stale_brain_cnt += c; stale_brain_sz += s; stale_brain_fl.extend(fl)
                            else:
                                active_brain_cnt += c; active_brain_sz += s; active_brain_fl.extend(fl)
                        except Exception:
                            active_brain_cnt += c; active_brain_sz += s; active_brain_fl.extend(fl)
                    else:
                        active_brain_cnt += c; active_brain_sz += s; active_brain_fl.extend(fl)
        except Exception:
            pass

    add_tier1("Session Scratch Folders", scratch_cnt, scratch_sz, scratch_fl)
    add_tier1("Session Transcripts & Logs", logs_cnt, logs_sz, logs_fl)
    add_tier2(f"Stale Brain Sessions (> {stale_days}d)", stale_brain_cnt, stale_brain_sz, stale_brain_fl, is_advisable=True)
    add_tier2(f"Active Brain Sessions (< {stale_days}d)", active_brain_cnt, active_brain_sz, active_brain_fl, is_advisable=False)

    # 4. Cached Document & AST Annotations
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        ap = os.path.join(r, "annotations")
        if os.path.exists(ap):
            c, s, fl = fast_scan_dir(ap, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier1("Cached AST Annotations", t_cnt, t_sz, t_fl)

    # 5. Crash Dump Logs
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        cp = os.path.join(r, "crashes")
        if os.path.exists(cp):
            c, s, fl = fast_scan_dir(cp, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier1("Crash Dump Logs", t_cnt, t_sz, t_fl)

    # 6. Implicit Context Cache (.pb)
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        ip = os.path.join(r, "implicit")
        if os.path.exists(ip):
            c, s, fl = fast_scan_dir(ip, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier1("Implicit Context Cache", t_cnt, t_sz, t_fl)

    # 7. Context State Caches
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        csp = os.path.join(r, "context_state")
        if os.path.exists(csp):
            c, s, fl = fast_scan_dir(csp, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier1("Context State Caches", t_cnt, t_sz, t_fl)

    # 8. HTML Artifact Previews
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        hp = os.path.join(r, "html_artifacts")
        if os.path.exists(hp):
            c, s, fl = fast_scan_dir(hp, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier1("HTML Artifact Previews", t_cnt, t_sz, t_fl)

    # 9. Prompting Step Caches
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        pp = os.path.join(r, "prompting")
        if os.path.exists(pp):
            c, s, fl = fast_scan_dir(pp, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier1("Prompting Step Caches", t_cnt, t_sz, t_fl)

    # 10. Antigravity Browser Profile Web Caches
    b_cnt, b_sz, b_fl = scan_browser_caches(collect_files)
    add_tier1("Browser Profile Web Caches", b_cnt, b_sz, b_fl)

    # 11. System Temp Scripts & Dumps
    sys_temp_dir = os.environ.get("TEMP", "")
    temp_cnt, temp_sz, temp_fl = 0, 0, []
    if sys_temp_dir and os.path.exists(sys_temp_dir):
        try:
            with os.scandir(sys_temp_dir) as it:
                for entry in it:
                    if entry.is_file(follow_symlinks=False):
                        name_l = entry.name.lower()
                        if any(name_l.startswith(p) for p in ["tmp", "antigravity", "repomix", "agent", ".gemini", "playwright"]) and (
                            name_l.endswith((".py", ".js", ".json", ".log", ".tmp", ".xml"))
                        ):
                            stat = entry.stat(follow_symlinks=False)
                            temp_cnt += 1; temp_sz += stat.st_size
                            if collect_files:
                                temp_fl.append((entry.path, stat.st_size, stat.st_mtime))
        except Exception:
            pass
    add_tier1("System Temp Scripts", temp_cnt, temp_sz, temp_fl)

    # 12. Package Caches (UV, NPM, Pip)
    pkg_caches = [
        os.path.expanduser("~/AppData/Local/uv/cache"),
        os.path.expanduser("~/AppData/Local/npm-cache"),
        os.path.expanduser("~/AppData/Local/pip/Cache"),
    ]
    pkg_cnt, pkg_sz, pkg_fl = 0, 0, []
    for pc in pkg_caches:
        if os.path.exists(pc):
            c, s, fl = fast_scan_dir(pc, collect_files)
            pkg_cnt += c; pkg_sz += s; pkg_fl.extend(fl)
    add_tier1("Package Manager Caches (UV/NPM/Pip)", pkg_cnt, pkg_sz, pkg_fl)

    # 13. Loose Gemini Root Scratch Scripts (~/.gemini/*.js, *.py, *.tmp)
    gemini_root = os.path.expanduser("~/.gemini")
    protected_root_files = {
        "gemini.md", "google_accounts.json", "installation_id", "memory_graph.json",
        "oauth_creds.json", "projects.json", "settings.json", "state.json", "trustedfolders.json"
    }
    loose_cnt, loose_sz, loose_fl = 0, 0, []
    if os.path.exists(gemini_root):
        try:
            with os.scandir(gemini_root) as it:
                for entry in it:
                    if entry.is_file(follow_symlinks=False):
                        if entry.name.lower() not in protected_root_files and entry.name.lower().endswith((".js", ".py", ".tmp", ".log")):
                            stat = entry.stat(follow_symlinks=False)
                            loose_cnt += 1; loose_sz += stat.st_size
                            if collect_files:
                                loose_fl.append((entry.path, stat.st_size, stat.st_mtime))
        except Exception:
            pass
    add_tier1("Gemini Root Loose Scratch Files", loose_cnt, loose_sz, loose_fl)

    # 13. Conversations SQLite Databases & State (.db, .db-shm, .db-wal, .pb)
    stale_conv_cnt, stale_conv_sz, stale_conv_fl = 0, 0, []
    active_conv_cnt, active_conv_sz, active_conv_fl = 0, 0, []

    for r in roots:
        cp = os.path.join(r, "conversations")
        if not os.path.exists(cp):
            continue
        try:
            with os.scandir(cp) as it:
                for entry in it:
                    if entry.is_file(follow_symlinks=False):
                        stat = entry.stat(follow_symlinks=False)
                        conv_id = entry.name.split(".")[0]
                        is_active = (active_session_id and conv_id == active_session_id)
                        if not is_active and (now - stat.st_mtime) > stale_sec:
                            stale_conv_cnt += 1; stale_conv_sz += stat.st_size
                            if collect_files:
                                stale_conv_fl.append((entry.path, stat.st_size, stat.st_mtime))
                        else:
                            active_conv_cnt += 1; active_conv_sz += stat.st_size
                            if collect_files:
                                active_conv_fl.append((entry.path, stat.st_size, stat.st_mtime))
        except Exception:
            pass

    add_tier2(f"Stale Conversation DBs (> {stale_days}d)", stale_conv_cnt, stale_conv_sz, stale_conv_fl, is_advisable=True)
    add_tier2(f"Active Conversation DBs (< {stale_days}d)", active_conv_cnt, active_conv_sz, active_conv_fl, is_advisable=False)

    # 14. Cloned Temp Workspaces & Sandboxes (~/.gemini/tmp)
    gemini_tmp = os.path.expanduser("~/.gemini/tmp")
    tmp_cnt, tmp_sz, tmp_fl = 0, 0, []
    if os.path.exists(gemini_tmp):
        tmp_cnt, tmp_sz, tmp_fl = fast_scan_dir(gemini_tmp, collect_files)
    add_tier2("Temporary Cloned Workspaces (~/.gemini/tmp)", tmp_cnt, tmp_sz, tmp_fl, is_advisable=True)

    # 15. Workspace History Snapshots (~/.gemini/history)
    gemini_hist = os.path.expanduser("~/.gemini/history")
    hist_cnt, hist_sz, hist_fl = 0, 0, []
    if os.path.exists(gemini_hist):
        hist_cnt, hist_sz, hist_fl = fast_scan_dir(gemini_hist, collect_files)
    add_tier2("Workspace History Snapshots (~/.gemini/history)", hist_cnt, hist_sz, hist_fl, is_advisable=True)

    # 16. Stale Project Dependencies (~/tools/**/node_modules, .venv)
    tools_dir = os.path.expanduser("~/tools")
    stale_deps_cnt, stale_deps_sz, stale_deps_fl = 0, 0, []
    active_deps_cnt, active_deps_sz, active_deps_fl = 0, 0, []
    if os.path.exists(tools_dir):
        try:
            with os.scandir(tools_dir) as it:
                for entry in it:
                    if entry.is_dir(follow_symlinks=False):
                        mtime = entry.stat(follow_symlinks=False).st_mtime
                        is_stale = (now - mtime) > (14 * 86400)
                        for dep_sub in ["node_modules", ".venv", "venv"]:
                            dp = os.path.join(entry.path, dep_sub)
                            if os.path.exists(dp):
                                c, s, fl = fast_scan_dir(dp, collect_files)
                                if is_stale:
                                    stale_deps_cnt += c; stale_deps_sz += s; stale_deps_fl.extend(fl)
                                else:
                                    active_deps_cnt += c; active_deps_sz += s; active_deps_fl.extend(fl)
        except Exception:
            pass

    add_tier2("Stale Project Dependencies (> 14d)", stale_deps_cnt, stale_deps_sz, stale_deps_fl, is_advisable=True)
    add_tier2("Active Project Dependencies (< 14d)", active_deps_cnt, active_deps_sz, active_deps_fl, is_advisable=False)

    # 17. Playwright Browser Binaries
    pw_dir = os.path.expanduser("~/AppData/Local/ms-playwright")
    pw_cnt, pw_sz, pw_fl = 0, 0, []
    if os.path.exists(pw_dir):
        pw_cnt, pw_sz, pw_fl = fast_scan_dir(pw_dir, collect_files)
    add_tier2("Playwright Browser Binaries", pw_cnt, pw_sz, pw_fl, is_advisable=False)

    # 18. IDE Code Tracker History
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        tp = os.path.join(r, "code_tracker")
        if os.path.exists(tp):
            c, s, fl = fast_scan_dir(tp, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier2("IDE Code Tracker History", t_cnt, t_sz, t_fl, is_advisable=False)

    # 19. Protected Tier 3 Systems (Strictly shielded from deletion)
    tier_critical_definitions = [
        ("Global Config, Rules & Skills", [os.path.expanduser("~/.gemini/config")]),
        ("Built-in Core Skills & Assets", [os.path.expanduser("~/.gemini/antigravity-ide/builtin")]),
        ("MCP Configuration & Schemas", [
            os.path.expanduser("~/.gemini/antigravity-ide/mcp_config.json"),
            os.path.expanduser("~/.gemini/antigravity/mcp_config.json"),
            os.path.expanduser("~/.gemini/antigravity-ide/mcp"),
            os.path.expanduser("~/.gemini/antigravity/mcp"),
        ]),
        ("IDE & Root Settings State", [
            os.path.expanduser("~/.gemini/antigravity-ide/user_settings.pb"),
            os.path.expanduser("~/.gemini/antigravity/user_settings.pb"),
            os.path.expanduser("~/.gemini/antigravity/antigravity_state.pbtxt"),
            os.path.expanduser("~/.gemini/settings.json"),
            os.path.expanduser("~/.gemini/state.json"),
            os.path.expanduser("~/.gemini/trustedFolders.json"),
            os.path.expanduser("~/.gemini/memory_graph.json"),
        ]),
        ("Installation Identifiers", [
            os.path.expanduser("~/.gemini/antigravity-ide/installation_id"),
            os.path.expanduser("~/.gemini/antigravity/installation_id"),
            os.path.expanduser("~/.gemini/installation_id"),
        ]),
        ("Gemini Account Auth Creds", [os.path.expanduser("~/.gemini/google_accounts.json")]),
        ("OAuth Tokens State", [os.path.expanduser("~/.gemini/oauth_creds.json")]),
    ]
    for name, p_list in tier_critical_definitions:
        t3_cnt, t3_sz, t3_fl = 0, 0, []
        for p in p_list:
            if os.path.exists(p):
                c, s, fl = fast_scan_dir(p, collect_files)
                t3_cnt += c; t3_sz += s; t3_fl.extend(fl)
        add_tier3(name, t3_cnt, t3_sz, t3_fl)

    metrics["reclaimable_total_bytes"] += metrics["safe_total_bytes"]
    metrics["reclaimable_total_files"] += metrics["safe_total_files"]

    return metrics


def run_comprehensive_audit(stale_days=7):
    print()
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}{CYAN}      ANTIGRAVITY WORKSTATION DELETION AUDIT & SAFETY GUIDE                     {RESET}")
    print(f"{BOLD}{CYAN}      Multi-Root Architecture: ~/.gemini/antigravity-ide & ~/.gemini/antigravity{RESET}")
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print()

    metrics = collect_audit_metrics(stale_days=stale_days, collect_files=False)

    # --- TIER 1: SAFE TO DELETE ---
    print(f"{BOLD}{GREEN}[SAFE TO DELETE] TIER 1: SAFE TO DELETE (NO REVIEW NEEDED){RESET}")
    for name, info in metrics["tier1_safe"].items():
        cnt = info["count"]
        sz = info["size"]
        color = YELLOW if sz > 100 * 1024 * 1024 else GREEN
        print(f"  + {BOLD}{name:<38s}{RESET} : {cnt:7,d} files | {color}{format_size(sz):>10s}{RESET}")

    print(f"  {BOLD}------------------------------------------------------------------------------{RESET}")
    print(f"  {BOLD}{GREEN}TOTAL SAFE RECLAIMABLE SPACE: {format_size(metrics['safe_total_bytes'])} ({metrics['safe_total_files']:,} files){RESET}")
    print()

    # --- TIER 2: REVIEW CANDIDATES ---
    print(f"{BOLD}{YELLOW}[REVIEW CANDIDATES] TIER 2: STALE & ADVISABLE TO DELETE (> {stale_days} DAYS){RESET}")
    for name, info in metrics["tier2_review"].items():
        cnt = info["count"]
        sz = info["size"]
        is_advisable = info["advisable"]
        status_tag = f"{BOLD}{GREEN}[ADVISABLE]{RESET}" if is_advisable else "[KEEP]"
        if "Playwright" in name:
            status_tag = "[RE-DOWNLOADABLE]"
        color = GREEN if is_advisable else YELLOW
        print(f"  ! {BOLD}{name:<38s}{RESET} : {cnt:7,d} files | {color}{format_size(sz):>10s}{RESET} {status_tag}")

    print(f"  {BOLD}------------------------------------------------------------------------------{RESET}")
    print(f"  {BOLD}{GREEN}TOTAL RECOMMENDED RECLAIMABLE SPACE (Safe + Stale): {format_size(metrics['reclaimable_total_bytes'])} ({metrics['reclaimable_total_files']:,} files){RESET}")
    print()

    # --- TIER 3: CRITICAL PROTECTED ---
    print(f"{BOLD}{RED}[DO NOT DELETE] TIER 3: CRITICAL SYSTEM & CONFIG PATHS (PROTECTED){RESET}")
    for name, info in metrics["tier3_protected"].items():
        cnt = info["count"]
        sz = info["size"]
        print(f"  🛑 {BOLD}{name:<38s}{RESET} : {cnt:7,d} files | {RED}{format_size(sz):>10s}{RESET}")

    print()
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}SUMMARY & ACTION GUIDE:{RESET}")
    print(f"  • Run {BOLD}{GREEN}antigravity-clean --all{RESET} to purge all Tier 1 safe items ({format_size(metrics['safe_total_bytes'])}).")
    print(f"  • Run {BOLD}{GREEN}antigravity-clean --stale{RESET} to purge Tier 1 items + stale brain & conversation DBs > {stale_days}d.")
    print(f"  • Run {BOLD}{GREEN}antigravity-clean --deep{RESET} for a complete deep clean ({format_size(metrics['reclaimable_total_bytes'])}).")
    print(f"  • Run {BOLD}{GREEN}antigravity-find-temp{RESET} to preview candidate files before deletion.")
    print(f"  • NEVER delete items under {BOLD}{RED}Tier 3 [DO NOT DELETE]{RESET}.")
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print()


def run_temp_scanner(stale_days=7, limit=35, output_json=False):
    metrics = collect_audit_metrics(stale_days=stale_days, collect_files=True)

    if output_json:
        data = {
            "tier1_safe": {k: {"files": v["count"], "size_bytes": v["size"]} for k, v in metrics["tier1_safe"].items()},
            "tier2_review": {k: {"files": v["count"], "size_bytes": v["size"], "advisable": v["advisable"]} for k, v in metrics["tier2_review"].items()},
            "summary": {
                "safe_bytes": metrics["safe_total_bytes"],
                "safe_files": metrics["safe_total_files"],
                "reclaimable_bytes": metrics["reclaimable_total_bytes"],
                "reclaimable_files": metrics["reclaimable_total_files"],
            }
        }
        print(json.dumps(data, indent=2))
        return

    print()
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}{CYAN}      ANTIGRAVITY TEMPORARY FILE DISCOVERY SCANNER                              {RESET}")
    print(f"{BOLD}{CYAN}      Previewing files eligible for cleanup (Safe Tier 1 & Stale Tier 2)        {RESET}")
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print()

    now = time.time()
    all_candidates = []

    for category, info in metrics["tier1_safe"].items():
        for fp, sz, mtime in info["files"]:
            all_candidates.append({
                "tier": "Tier 1 (Safe)",
                "category": category,
                "path": fp,
                "size": sz,
                "age_sec": now - mtime
            })

    for category, info in metrics["tier2_review"].items():
        if info["advisable"]:
            for fp, sz, mtime in info["files"]:
                all_candidates.append({
                    "tier": "Tier 2 (Review)",
                    "category": category,
                    "path": fp,
                    "size": sz,
                    "age_sec": now - mtime
                })

    # Sort candidates by size descending
    all_candidates.sort(key=lambda x: x["size"], reverse=True)

    print(f"{BOLD}{'Category':<32s} {'Age':<10s} {'Size':>10s}  {'Path':<50s}{RESET}")
    print(f"{DIM}{'-' * 110}{RESET}")

    shown = all_candidates[:limit]
    for c in shown:
        p_short = c["path"]
        home = os.path.expanduser("~")
        if p_short.startswith(home):
            p_short = "~" + p_short[len(home):]
        if len(p_short) > 58:
            p_short = p_short[:25] + "..." + p_short[-30:]

        sz_str = format_size(c["size"])
        age_str = format_age(c["age_sec"])
        color = GREEN if c["tier"].startswith("Tier 1") else YELLOW
        print(f"{color}{c['category'][:31]:<32s}{RESET} {age_str:<10s} {BOLD}{sz_str:>10s}{RESET}  {DIM}{p_short}{RESET}")

    if len(all_candidates) > limit:
        remaining = len(all_candidates) - limit
        rem_sz = sum(c["size"] for c in all_candidates[limit:])
        print(f"{DIM}... and {remaining:,} more candidate files ({format_size(rem_sz)}){RESET}")

    print(f"{DIM}{'-' * 110}{RESET}")
    print(f"Total Discovered Candidates: {BOLD}{len(all_candidates):,}{RESET} files | Reclaimable Space: {BOLD}{GREEN}{format_size(metrics['reclaimable_total_bytes'])}{RESET}")
    print()
    print(f"{BOLD}To purge these files:{RESET}")
    print(f"  • {GREEN}antigravity-clean --all{RESET}   (Safely delete Tier 1 items: {format_size(metrics['safe_total_bytes'])})")
    print(f"  • {GREEN}antigravity-clean --stale{RESET} (Delete Tier 1 items + stale brain/conversations)")
    print(f"  • {GREEN}antigravity-clean --deep{RESET}  (Complete purge including temp workspaces & stale project deps)")
    print()


def purge_files(files_to_delete):
    deleted_count = 0
    deleted_bytes = 0
    errors = 0

    for fp in files_to_delete:
        try:
            if os.path.exists(fp):
                sz = os.path.getsize(fp)
                if os.path.isfile(fp):
                    os.remove(fp)
                elif os.path.isdir(fp):
                    shutil.rmtree(fp, ignore_errors=True)
                deleted_count += 1
                deleted_bytes += sz
        except Exception:
            errors += 1

    return deleted_count, deleted_bytes, errors


def purge_empty_dirs(path):
    if not os.path.exists(path):
        return
    for root, dirs, _ in os.walk(path, topdown=False):
        for d in dirs:
            dp = os.path.join(root, d)
            try:
                if not os.listdir(dp):
                    os.rmdir(dp)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(
        description="Antigravity Workstation Audit & Safe Cleanup Utility (v5.5)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  antigravity-check                          Run comprehensive 3-tier deletion audit
  antigravity-find-temp                      Scan and preview candidate temp files
  antigravity-clean --all                    Purge all Tier 1 safe temporary categories
  antigravity-clean --stale                  Purge Tier 1 safe + stale brain/conversations (> 7 days)
  antigravity-clean --deep                   Deep clean (Tier 1 safe + stale brain + temp workspaces + deps)
  antigravity-clean --browser-cache          Purge Antigravity browser profile web caches
  antigravity-clean --tmp                    Purge ~/.gemini/tmp cloned workspaces
  antigravity-clean --history                Purge ~/.gemini/history snapshots
  antigravity-clean --days 3                 Custom age threshold (e.g. stale items > 3 days)
"""
    )

    parser.add_argument("--check", action="store_true", help="Run 3-tier audit scan (default)")
    parser.add_argument("--scan", action="store_true", help="Scan and preview individual candidate files")
    parser.add_argument("--json", action="store_true", help="Output audit or scan metrics as JSON")
    parser.add_argument("--limit", type=int, default=35, help="Number of files to display in --scan preview (default: 35)")

    # Selective cleanup flags
    parser.add_argument("--scratch", action="store_true", help="Clean global & session scratch files")
    parser.add_argument("--logs", action="store_true", help="Clean session transcripts & task logs")
    parser.add_argument("--recordings", action="store_true", help="Clean browser WebP video recordings")
    parser.add_argument("--annotations", action="store_true", help="Clean cached AST annotations")
    parser.add_argument("--temp", action="store_true", help="Clean system temp scripts (%TEMP%)")
    parser.add_argument("--caches", action="store_true", help="Clean NPM, Pip, and UV package caches")
    parser.add_argument("--browser-cache", action="store_true", help="Clean Antigravity browser profile web caches")
    parser.add_argument("--conversations", action="store_true", help="Clean stale conversation SQLite database files")
    parser.add_argument("--tmp", action="store_true", help="Clean cloned temporary workspaces in ~/.gemini/tmp")
    parser.add_argument("--history", action="store_true", help="Clean workspace file history in ~/.gemini/history")

    # Bundled cleanup flags
    parser.add_argument("--all", action="store_true", help="Clean ALL Tier 1 safe temporary categories")
    parser.add_argument("--stale", action="store_true", help="Clean Tier 1 safe items + stale brain/conversations (> 7 days)")
    parser.add_argument("--deep", action="store_true", help="Deep clean (Tier 1 safe + stale brain + stale DBs + temp repos + deps)")

    parser.add_argument("--days", type=int, default=7, help="Stale age threshold in days (default: 7)")
    parser.add_argument("-f", "--force", action="store_true", help="Skip confirmation prompt during deletion")

    args = parser.parse_args()

    # Handle scan mode
    if args.scan:
        run_temp_scanner(stale_days=args.days, limit=args.limit, output_json=args.json)
        return

    # Determine if cleaning action requested
    is_clean = (
        args.scratch or args.logs or args.recordings or args.annotations or
        args.temp or args.caches or args.browser_cache or args.conversations or
        args.tmp or args.history or args.stale or args.deep or args.all
    )

    if args.check or not is_clean:
        if args.json:
            metrics = collect_audit_metrics(stale_days=args.days, collect_files=False)
            data = {
                "safe_bytes": metrics["safe_total_bytes"],
                "safe_files": metrics["safe_total_files"],
                "reclaimable_bytes": metrics["reclaimable_total_bytes"],
                "reclaimable_files": metrics["reclaimable_total_files"],
                "tier1_safe": {k: {"files": v["count"], "size_bytes": v["size"]} for k, v in metrics["tier1_safe"].items()},
                "tier2_review": {k: {"files": v["count"], "size_bytes": v["size"], "advisable": v["advisable"]} for k, v in metrics["tier2_review"].items()},
            }
            print(json.dumps(data, indent=2))
        else:
            run_comprehensive_audit(stale_days=args.days)
        return

    # Collect cleanup targets
    metrics = collect_audit_metrics(stale_days=args.days, collect_files=True)
    raw_targets = []
    target_names = []

    if args.deep:
        for k, v in metrics["tier1_safe"].items():
            raw_targets.extend(v["files"])
            target_names.append(k)
        for k, v in metrics["tier2_review"].items():
            if v["advisable"]:
                raw_targets.extend(v["files"])
                target_names.append(k)
    elif args.stale:
        for k, v in metrics["tier1_safe"].items():
            raw_targets.extend(v["files"])
            target_names.append(k)
        for k, v in metrics["tier2_review"].items():
            if "Stale Brain" in k or "Stale Conversation" in k:
                raw_targets.extend(v["files"])
                target_names.append(k)
    elif args.all:
        for k, v in metrics["tier1_safe"].items():
            raw_targets.extend(v["files"])
            target_names.append(k)
    else:
        if args.scratch:
            raw_targets.extend(metrics["tier1_safe"]["Global Scratch Scripts"]["files"])
            raw_targets.extend(metrics["tier1_safe"]["Session Scratch Folders"]["files"])
            target_names.append("Scratch Scripts")
        if args.logs:
            raw_targets.extend(metrics["tier1_safe"]["Session Transcripts & Logs"]["files"])
            target_names.append("Session Logs & Transcripts")
        if args.recordings:
            raw_targets.extend(metrics["tier1_safe"]["Browser WebP Recordings"]["files"])
            target_names.append("Browser Video Recordings")
        if args.annotations:
            raw_targets.extend(metrics["tier1_safe"]["Cached AST Annotations"]["files"])
            target_names.append("Cached Annotations")
        if args.temp:
            raw_targets.extend(metrics["tier1_safe"]["System Temp Scripts"]["files"])
            target_names.append("System Temp Scripts")
        if args.caches:
            raw_targets.extend(metrics["tier1_safe"]["Package Manager Caches (UV/NPM/Pip)"]["files"])
            target_names.append("Package Manager Caches")
        if args.browser_cache:
            raw_targets.extend(metrics["tier1_safe"]["Browser Profile Web Caches"]["files"])
            target_names.append("Browser Profile Web Caches")
        if args.conversations:
            raw_targets.extend(metrics["tier2_review"][f"Stale Conversation DBs (> {args.days}d)"]["files"])
            target_names.append("Stale Conversation DBs")
        if args.tmp:
            raw_targets.extend(metrics["tier2_review"]["Temporary Cloned Workspaces (~/.gemini/tmp)"]["files"])
            target_names.append("Temporary Cloned Workspaces")
        if args.history:
            raw_targets.extend(metrics["tier2_review"]["Workspace History Snapshots (~/.gemini/history)"]["files"])
            target_names.append("Workspace History Snapshots")

    # Extract file paths from (path, sz, mtime)
    targets = [item[0] for item in raw_targets]

    # Filter out active session artifacts
    active_id = get_active_session_id()
    if active_id:
        targets = [t for t in targets if active_id not in t]

    targets = list(dict.fromkeys(targets))

    if not targets:
        print(f"\n{BOLD}{GREEN}No files found for selected cleanup targets. Everything is clean!{RESET}\n")
        return

    total_bytes = sum(os.path.getsize(f) for f in targets if os.path.exists(f))
    t_names_str = ", ".join(dict.fromkeys(target_names))
    print(f"\n{BOLD}{YELLOW}Cleanup Targets:{RESET} {t_names_str}")
    print(f"{BOLD}Files to delete:{RESET} {len(targets):,} files ({format_size(total_bytes)})")

    if not args.force:
        confirm = input(f"\n{BOLD}{RED}Are you sure you want to permanently delete these files? [y/N]: {RESET}").strip().lower()
        if confirm not in ["y", "yes"]:
            print(f"{BOLD}{CYAN}Cleanup cancelled. No files were deleted.{RESET}")
            return

    print(f"\n{BOLD}{CYAN}Deleting temporary & stale files...{RESET}")
    del_count, del_bytes, err_count = purge_files(targets)

    # Clean up empty directories across all roots
    for r in get_antigravity_roots():
        purge_empty_dirs(os.path.join(r, "scratch"))
        purge_empty_dirs(os.path.join(r, "brain"))
        purge_empty_dirs(os.path.join(r, "browser_recordings"))
        purge_empty_dirs(os.path.join(r, "annotations"))
        purge_empty_dirs(os.path.join(r, "implicit"))
        purge_empty_dirs(os.path.join(r, "context_state"))
        purge_empty_dirs(os.path.join(r, "html_artifacts"))

    purge_empty_dirs(os.path.expanduser("~/.gemini/tmp"))
    purge_empty_dirs(os.path.expanduser("~/.gemini/history"))

    print(f"\n{BOLD}{GREEN}✓ Cleanup Complete!{RESET}")
    print(f"  Files Removed : {del_count:,}")
    print(f"  Space Freed   : {BOLD}{GREEN}{format_size(del_bytes)}{RESET}")
    if err_count > 0:
        print(f"  Locked/Skipped: {err_count} files (in use by active processes)")
    print()


if __name__ == "__main__":
    main()
