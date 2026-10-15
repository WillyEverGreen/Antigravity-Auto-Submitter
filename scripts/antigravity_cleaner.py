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


def get_active_session_ids():
    active_ids = set()
    env_id = os.environ.get("ANTIGRAVITY_CONVERSATION_ID")
    if env_id:
        active_ids.add(env_id.strip())

    cwd = os.getcwd()
    if "brain" in cwd:
        parts = cwd.replace("\\", "/").split("/")
        if "brain" in parts:
            idx = parts.index("brain")
            if idx + 1 < len(parts) and len(parts[idx + 1]) >= 8:
                active_ids.add(parts[idx + 1].strip())

    # Dynamically scan conversation databases modified or active in the last 2 hours (or with active .db-wal)
    now = time.time()
    for r in get_antigravity_roots():
        cp = os.path.join(r, "conversations")
        if os.path.exists(cp):
            try:
                with os.scandir(cp) as it:
                    for entry in it:
                        try:
                            if entry.is_file(follow_symlinks=False):
                                stat = entry.stat(follow_symlinks=False)
                                name = entry.name
                                # If .db-wal exists or any db modified within last 2 hours, it is an active session
                                if name.endswith(".db-wal") or (name.endswith(".db") and (now - stat.st_mtime) < 7200):
                                    conv_id = name.split(".")[0]
                                    if len(conv_id) >= 8:
                                        active_ids.add(conv_id)
                        except Exception:
                            pass
            except Exception:
                pass
    return active_ids


def get_active_session_id():
    ids = get_active_session_ids()
    return next(iter(ids)) if ids else None


def get_antigravity_roots():
    gemini_dir = os.path.expanduser("~/.gemini")
    roots = []
    for candidate in ["antigravity-ide", "antigravity", "antigravity-cli"]:
        p = os.path.join(gemini_dir, candidate)
        if os.path.exists(p):
            roots.append(p)
    return roots


def scan_electron_caches(collect_files=False):
    appdata = os.environ.get("APPDATA", "")
    if not appdata:
        return 0, 0, []

    ide_appdata = os.path.join(appdata, "Antigravity IDE")
    if not os.path.exists(ide_appdata):
        return 0, 0, []

    target_subdirs = {
        "cache", "code cache", "gpucache", "dawngraphitecache", "dawnwebgpucache",
        "crashpad", "logs", "cacheddata", "cachedextensionvsixs"
    }
    total_cnt = 0
    total_sz = 0
    file_list = []

    try:
        with os.scandir(ide_appdata) as it:
            for entry in it:
                try:
                    name_lower = entry.name.lower()
                    if entry.is_dir(follow_symlinks=False) and name_lower in target_subdirs:
                        c, s, fl = fast_scan_dir(entry.path, collect_files)
                        total_cnt += c
                        total_sz += s
                        if collect_files:
                            file_list.extend(fl)
                    elif entry.is_dir(follow_symlinks=False) and name_lower == "service worker":
                        sw_cache = os.path.join(entry.path, "CacheStorage")
                        if os.path.exists(sw_cache):
                            c, s, fl = fast_scan_dir(sw_cache, collect_files)
                            total_cnt += c
                            total_sz += s
                            if collect_files:
                                file_list.extend(fl)
                except Exception:
                    pass
    except Exception:
        pass

    return total_cnt, total_sz, file_list


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


def scan_external_ide_caches(collect_files=False):
    """
    Scans safe ephemeral caches, crash dumps, and logs across external IDEs:
    - Kiro (Crashpad, Cache, GPUCache, logs, ~/.kiro/logs)
    - Zed (~/AppData/Local/Zed/logs)
    - VS Code / CodeX (~/AppData/Roaming/Code/Cache, GPUCache, logs, Crashpad)
    - Cursor (~/AppData/Roaming/Cursor/Cache, GPUCache, logs, Crashpad)
    Strictly shields: user settings, extensions, keybindings, language servers, skills, and projects.
    """
    ide_categories = {}
    total_sz = 0
    total_cnt = 0

    targets = [
        ("Kiro IDE Crash Dumps & Caches", [
            os.path.expanduser("~/AppData/Roaming/Kiro/Crashpad"),
            os.path.expanduser("~/AppData/Roaming/Kiro/Cache"),
            os.path.expanduser("~/AppData/Roaming/Kiro/Code Cache"),
            os.path.expanduser("~/AppData/Roaming/Kiro/GPUCache"),
            os.path.expanduser("~/AppData/Roaming/Kiro/DawnGraphiteCache"),
            os.path.expanduser("~/AppData/Roaming/Kiro/DawnWebGPUCache"),
            os.path.expanduser("~/AppData/Roaming/Kiro/logs"),
            os.path.expanduser("~/.kiro/logs"),
        ]),
        ("Zed Editor Logs & Traces", [
            os.path.expanduser("~/AppData/Local/Zed/logs"),
            os.path.expanduser("~/AppData/Local/Zed/hang_traces"),
        ]),
        ("VS Code / CodeX Caches & Logs", [
            os.path.expanduser("~/AppData/Roaming/Code/Crashpad"),
            os.path.expanduser("~/AppData/Roaming/Code/Cache"),
            os.path.expanduser("~/AppData/Roaming/Code/Code Cache"),
            os.path.expanduser("~/AppData/Roaming/Code/GPUCache"),
            os.path.expanduser("~/AppData/Roaming/Code/DawnGraphiteCache"),
            os.path.expanduser("~/AppData/Roaming/Code/DawnWebGPUCache"),
            os.path.expanduser("~/AppData/Roaming/Code/CachedData"),
            os.path.expanduser("~/AppData/Roaming/Code/logs"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/Crashpad"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/Cache"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/Code Cache"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/GPUCache"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/DawnGraphiteCache"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/DawnWebGPUCache"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/CachedData"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/logs"),
        ]),
        ("Cursor Caches & Logs", [
            os.path.expanduser("~/AppData/Roaming/Cursor/Crashpad"),
            os.path.expanduser("~/AppData/Roaming/Cursor/Cache"),
            os.path.expanduser("~/AppData/Roaming/Cursor/Code Cache"),
            os.path.expanduser("~/AppData/Roaming/Cursor/GPUCache"),
            os.path.expanduser("~/AppData/Roaming/Cursor/DawnGraphiteCache"),
            os.path.expanduser("~/AppData/Roaming/Cursor/DawnWebGPUCache"),
            os.path.expanduser("~/AppData/Roaming/Cursor/CachedData"),
            os.path.expanduser("~/AppData/Roaming/Cursor/CachedExtensionVSIXs"),
            os.path.expanduser("~/AppData/Roaming/Cursor/logs"),
        ]),
        ("Windsurf Caches & Logs", [
            os.path.expanduser("~/AppData/Roaming/Windsurf/Crashpad"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/Cache"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/Code Cache"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/GPUCache"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/DawnGraphiteCache"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/DawnWebGPUCache"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/CachedData"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/logs"),
        ]),
        ("Trae Caches & Logs", [
            os.path.expanduser("~/AppData/Roaming/Trae/Crashpad"),
            os.path.expanduser("~/AppData/Roaming/Trae/Cache"),
            os.path.expanduser("~/AppData/Roaming/Trae/Code Cache"),
            os.path.expanduser("~/AppData/Roaming/Trae/GPUCache"),
            os.path.expanduser("~/AppData/Roaming/Trae/DawnGraphiteCache"),
            os.path.expanduser("~/AppData/Roaming/Trae/DawnWebGPUCache"),
            os.path.expanduser("~/AppData/Roaming/Trae/CachedData"),
            os.path.expanduser("~/AppData/Roaming/Trae/logs"),
        ]),
        ("Qoder Caches & Logs", [
            os.path.expanduser("~/AppData/Roaming/Qoder/Crashpad"),
            os.path.expanduser("~/AppData/Roaming/Qoder/Cache"),
            os.path.expanduser("~/AppData/Roaming/Qoder/GPUCache"),
            os.path.expanduser("~/AppData/Roaming/Qoder/logs"),
        ]),
        ("Claude Desktop Logs", [
            os.path.expanduser("~/AppData/Local/Claude/logs"),
            os.path.expanduser("~/AppData/Local/Claude-Data/logs"),
        ]),
    ]

    for label, paths in targets:
        c_tot, s_tot, fl_tot = 0, 0, []
        for p in paths:
            if os.path.exists(p):
                c, s, fl = fast_scan_dir(p, collect_files)
                c_tot += c; s_tot += s; fl_tot.extend(fl)
        if c_tot > 0 or not collect_files:
            ide_categories[label] = {"count": c_tot, "size": s_tot, "files": fl_tot}
            total_cnt += c_tot
            total_sz += s_tot

    return ide_categories, total_cnt, total_sz


def collect_audit_metrics(stale_days=7, collect_files=False):
    now = time.time()
    stale_sec = stale_days * 86400
    active_session_ids = get_active_session_ids()
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
                    is_active = (conv_id in active_session_ids)

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

    # 11. Antigravity Electron IDE Runtime Caches (%APPDATA%\Antigravity IDE)
    e_cnt, e_sz, e_fl = scan_electron_caches(collect_files)
    add_tier1("Electron IDE Runtime Caches", e_cnt, e_sz, e_fl)

    # 12. External AI IDEs & Editors (Kiro, Zed, Code, Cursor)
    ext_ides, ext_cnt, ext_sz = scan_external_ide_caches(collect_files)
    for cat_name, cat_data in ext_ides.items():
        if cat_data["count"] > 0:
            add_tier1(cat_name, cat_data["count"], cat_data["size"], cat_data["files"])

    # 12. System Temp Scripts & Dumps
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

    # 13. Package Caches (UV, NPM, PNPM, Pip, Yarn)
    pkg_caches = [
        os.path.expanduser("~/AppData/Local/uv/cache"),
        os.path.expanduser("~/AppData/Local/npm-cache"),
        os.path.expanduser("~/AppData/Local/pnpm-cache"),
        os.path.expanduser("~/AppData/Local/pip/Cache"),
        os.path.expanduser("~/AppData/Local/Yarn/Cache"),
    ]
    pkg_cnt, pkg_sz, pkg_fl = 0, 0, []
    for pc in pkg_caches:
        if os.path.exists(pc):
            c, s, fl = fast_scan_dir(pc, collect_files)
            pkg_cnt += c; pkg_sz += s; pkg_fl.extend(fl)
    add_tier1("Package Manager Caches (UV/NPM/Pip)", pkg_cnt, pkg_sz, pkg_fl)

    # 14. Loose Gemini Root Scratch Scripts (~/.gemini/*.js, *.py, *.tmp)
    gemini_root = os.path.expanduser("~/.gemini")
    protected_root_files = {
        "gemini.md", "agents.md", "claude.md", "google_accounts.json", "installation_id",
        "memory_graph.json", "oauth_creds.json", "projects.json", "settings.json",
        "state.json", "trustedfolders.json"
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

    # 15. Conversations SQLite Databases & State (.db, .db-shm, .db-wal, .pb)
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
                        is_active = (conv_id in active_session_ids)
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

    # 16. Cloned Temp Workspaces & Sandboxes (~/.gemini/tmp)
    gemini_tmp = os.path.expanduser("~/.gemini/tmp")
    tmp_cnt, tmp_sz, tmp_fl = 0, 0, []
    if os.path.exists(gemini_tmp):
        tmp_cnt, tmp_sz, tmp_fl = fast_scan_dir(gemini_tmp, collect_files)
    add_tier2("Temporary Cloned Workspaces (~/.gemini/tmp)", tmp_cnt, tmp_sz, tmp_fl, is_advisable=True)

    # 17. Workspace History Snapshots (~/.gemini/history)
    gemini_hist = os.path.expanduser("~/.gemini/history")
    hist_cnt, hist_sz, hist_fl = 0, 0, []
    if os.path.exists(gemini_hist):
        hist_cnt, hist_sz, hist_fl = fast_scan_dir(gemini_hist, collect_files)
    add_tier2("Workspace History Snapshots (~/.gemini/history)", hist_cnt, hist_sz, hist_fl, is_advisable=True)

    # 18. Project Dependencies (~/tools/**/node_modules, .venv) — Shielded from auto-deletion
    tools_dir = os.path.expanduser("~/tools")
    deps_cnt, deps_sz, deps_fl = 0, 0, []
    if os.path.exists(tools_dir):
        try:
            with os.scandir(tools_dir) as it:
                for entry in it:
                    if entry.is_dir(follow_symlinks=False):
                        for dep_sub in ["node_modules", ".venv", "venv"]:
                            dp = os.path.join(entry.path, dep_sub)
                            if os.path.exists(dp):
                                c, s, fl = fast_scan_dir(dp, collect_files)
                                deps_cnt += c; deps_sz += s; deps_fl.extend(fl)
        except Exception:
            pass

    # Strictly is_advisable=False so --deep will NEVER delete project dependencies
    add_tier2("Project Dependencies (~/tools/**/node_modules, .venv)", deps_cnt, deps_sz, deps_fl, is_advisable=False)

    # 19. Playwright Browser Binaries
    pw_dir = os.path.expanduser("~/AppData/Local/ms-playwright")
    pw_cnt, pw_sz, pw_fl = 0, 0, []
    if os.path.exists(pw_dir):
        pw_cnt, pw_sz, pw_fl = fast_scan_dir(pw_dir, collect_files)
    add_tier2("Playwright Browser Binaries", pw_cnt, pw_sz, pw_fl, is_advisable=False)

    # 20. IDE Code Tracker History
    t_cnt, t_sz, t_fl = 0, 0, []
    for r in roots:
        tp = os.path.join(r, "code_tracker")
        if os.path.exists(tp):
            c, s, fl = fast_scan_dir(tp, collect_files)
            t_cnt += c; t_sz += s; t_fl.extend(fl)
    add_tier2("IDE Code Tracker History", t_cnt, t_sz, t_fl, is_advisable=False)

    # 21. Protected Tier 3 Systems (Strictly shielded from deletion)
    tier_critical_definitions = [
        ("Global Config, Rules & Skills", [
            os.path.expanduser("~/.gemini/config"),
            os.path.expanduser("~/.gemini/antigravity-ide/plugins"),
            os.path.expanduser("~/.gemini/antigravity/plugins"),
        ]),
        ("Built-in Core Skills & Assets", [
            os.path.expanduser("~/.gemini/antigravity-ide/builtin"),
            os.path.expanduser("~/.gemini/antigravity/builtin"),
        ]),
        ("Knowledge Items (KI Artifacts)", [
            os.path.expanduser("~/.gemini/antigravity-ide/knowledge"),
            os.path.expanduser("~/.gemini/antigravity/knowledge"),
            os.path.expanduser("~/.gemini/knowledge"),
        ]),
        ("MCP Configuration & Schemas", [
            os.path.expanduser("~/.gemini/antigravity-ide/mcp_config.json"),
            os.path.expanduser("~/.gemini/antigravity/mcp_config.json"),
            os.path.expanduser("~/.gemini/antigravity-ide/mcp"),
            os.path.expanduser("~/.gemini/antigravity/mcp"),
            os.path.expanduser("~/.gemini/antigravity-ide/mcp_oauth_tokens.json"),
            os.path.expanduser("~/.gemini/antigravity/mcp_oauth_tokens.json"),
        ]),
        ("IDE & Root Settings State", [
            os.path.expanduser("~/.gemini/antigravity-ide/user_settings.pb"),
            os.path.expanduser("~/.gemini/antigravity/user_settings.pb"),
            os.path.expanduser("~/.gemini/antigravity/antigravity_state.pbtxt"),
            os.path.expanduser("~/.gemini/antigravity-ide/browserAllowlist.txt"),
            os.path.expanduser("~/.gemini/antigravity-ide/browserOnboardingStatus.txt"),
            os.path.expanduser("~/.gemini/settings.json"),
            os.path.expanduser("~/.gemini/state.json"),
            os.path.expanduser("~/.gemini/trustedFolders.json"),
            os.path.expanduser("~/.gemini/memory_graph.json"),
            os.path.expanduser("~/.gemini/projects.json"),
            os.path.expanduser("~/.gemini/GEMINI.md"),
            os.path.expanduser("~/.gemini/AGENTS.md"),
            os.path.expanduser("~/.gemini/CLAUDE.md"),
        ]),
        ("Installation Identifiers", [
            os.path.expanduser("~/.gemini/antigravity-ide/installation_id"),
            os.path.expanduser("~/.gemini/antigravity/installation_id"),
            os.path.expanduser("~/.gemini/installation_id"),
        ]),
        ("Gemini Account Auth Creds", [
            os.path.expanduser("~/.gemini/google_accounts.json"),
            os.path.expanduser("~/.gemini/antigravity-cli/antigravity-oauth-token"),
        ]),
        ("OAuth Tokens State", [
            os.path.expanduser("~/.gemini/oauth_creds.json"),
        ]),
        ("Kiro Protected Settings & Extensions", [
            os.path.expanduser("~/.kiro/settings"),
            os.path.expanduser("~/.kiro/skills"),
            os.path.expanduser("~/.kiro/agents"),
            os.path.expanduser("~/.kiro/powers"),
            os.path.expanduser("~/.kiro/extensions"),
            os.path.expanduser("~/.kiro/argv.json"),
        ]),
        ("Zed Language Servers & Toolchains", [
            os.path.expanduser("~/AppData/Local/Zed/languages"),
            os.path.expanduser("~/AppData/Local/Zed/node"),
            os.path.expanduser("~/AppData/Local/Zed/prettier"),
            os.path.expanduser("~/AppData/Local/Zed/threads"),
            os.path.expanduser("~/AppData/Local/Zed/prompts"),
            os.path.expanduser("~/AppData/Local/Zed/extensions"),
            os.path.expanduser("~/AppData/Local/Zed/db"),
            os.path.expanduser("~/AppData/Local/Zed/copilot"),
            os.path.expanduser("~/AppData/Roaming/Zed/settings.json"),
            os.path.expanduser("~/AppData/Roaming/Zed/AGENTS.md"),
            os.path.expanduser("~/AppData/Roaming/Zed/themes"),
        ]),
        ("VS Code & Cursor Extensions & Settings", [
            os.path.expanduser("~/.vscode/extensions"),
            os.path.expanduser("~/.vscode-insiders/extensions"),
            os.path.expanduser("~/.vscode-insiders/argv.json"),
            os.path.expanduser("~/.cursor/extensions"),
            os.path.expanduser("~/.cursor/skills-cursor"),
            os.path.expanduser("~/.cursor/mcp.json"),
            os.path.expanduser("~/.cursor/projects"),
            os.path.expanduser("~/AppData/Roaming/Code/User/settings.json"),
            os.path.expanduser("~/AppData/Roaming/Code/User/keybindings.json"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/User/settings.json"),
            os.path.expanduser("~/AppData/Roaming/Code - Insiders/User/keybindings.json"),
            os.path.expanduser("~/AppData/Roaming/Cursor/User/settings.json"),
            os.path.expanduser("~/AppData/Roaming/Cursor/User/keybindings.json"),
        ]),
        ("Windsurf & Trae Extensions & Settings", [
            os.path.expanduser("~/.windsurf/extensions"),
            os.path.expanduser("~/.windsurf/argv.json"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/User/settings.json"),
            os.path.expanduser("~/AppData/Roaming/Windsurf/User/keybindings.json"),
            os.path.expanduser("~/.trae/extensions"),
            os.path.expanduser("~/.trae/argv.json"),
            os.path.expanduser("~/AppData/Roaming/Trae/User/settings.json"),
            os.path.expanduser("~/AppData/Roaming/Trae/User/keybindings.json"),
        ]),
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


def run_ide_audit():
    print()
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}{CYAN}      MULTI-IDE & EDITOR DELETION AUDIT & SAFETY GUIDE                         {RESET}")
    print(f"{BOLD}{CYAN}      Auditing: Kiro, Zed, VS Code, Cursor, Windsurf, Trae, Qoder, Claude      {RESET}")
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print()

    metrics = collect_audit_metrics(stale_days=7, collect_files=False)

    ide_safe_names = [
        "Kiro IDE Crash Dumps & Caches",
        "Zed Editor Logs & Traces",
        "VS Code / CodeX Caches & Logs",
        "Cursor Caches & Logs",
        "Windsurf Caches & Logs",
        "Trae Caches & Logs",
        "Qoder Caches & Logs",
        "Claude Desktop Logs",
    ]

    print(f"{BOLD}{GREEN}[SAFE TO DELETE] EPHEMERAL CACHES, LOGS & CRASHPADS:{RESET}")
    tot_cnt = 0
    tot_sz = 0
    for name in ide_safe_names:
        info = metrics["tier1_safe"].get(name, {"count": 0, "size": 0})
        cnt = info["count"]
        sz = info["size"]
        tot_cnt += cnt
        tot_sz += sz
        color = YELLOW if sz > 10 * 1024 * 1024 else GREEN
        print(f"  + {BOLD}{name:<38s}{RESET} : {cnt:7,d} files | {color}{format_size(sz):>10s}{RESET}")

    print(f"  {BOLD}------------------------------------------------------------------------------{RESET}")
    print(f"  {BOLD}{GREEN}TOTAL EXTERNAL IDE RECLAIMABLE SPACE: {format_size(tot_sz)} ({tot_cnt:,} files){RESET}")
    print()

    ide_prot_names = [
        "Kiro Protected Settings & Extensions",
        "Zed Language Servers & Toolchains",
        "VS Code & Cursor Extensions & Settings",
        "Windsurf & Trae Extensions & Settings",
    ]

    print(f"{BOLD}{RED}[DO NOT DELETE] PROTECTED EXTENSIONS, SETTINGS & RUNTIMES:{RESET}")
    for name in ide_prot_names:
        info = metrics["tier3_protected"].get(name, {"count": 0, "size": 0})
        cnt = info["count"]
        sz = info["size"]
        print(f"  🛑 {BOLD}{name:<38s}{RESET} : {cnt:7,d} files | {RED}{format_size(sz):>10s}{RESET}")

    print()
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}ACTION GUIDE:{RESET}")
    print(f"  • Run {BOLD}{GREEN}clean-ides{RESET} (or {GREEN}antigravity-clean --ides{RESET}) to safely purge these caches.")
    print(f"  • Run {BOLD}{GREEN}clean-all{RESET} for a complete workstation sweep.")
    print(f"  • Individual IDE flags: {CYAN}--kiro, --zed, --code, --cursor, --windsurf, --trae, --qoder, --claude{RESET}")
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print()


def run_ag_audit(stale_days=7):
    print()
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}{CYAN}      ANTIGRAVITY DELETION AUDIT & SAFETY GUIDE                                 {RESET}")
    print(f"{BOLD}{CYAN}      Multi-Root Architecture: ~/.gemini/antigravity-ide & ~/.gemini/antigravity{RESET}")
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print()

    metrics = collect_audit_metrics(stale_days=stale_days, collect_files=False)

    ag_categories = [
        "Global Scratch Scripts",
        "Browser WebP Recordings",
        "Session Scratch Folders",
        "Session Transcripts & Logs",
        "Cached AST Annotations",
        "Crash Dump Logs",
        "Implicit Context Cache",
        "Context State Caches",
        "HTML Artifact Previews",
        "Prompting Step Caches",
        "Browser Profile Web Caches",
        "Electron IDE Runtime Caches",
        "Gemini Root Loose Scratch Files",
    ]

    print(f"{BOLD}{GREEN}[SAFE TO DELETE] ANTIGRAVITY TEMPORARY FILES:{RESET}")
    tot_cnt = 0
    tot_sz = 0
    for name in ag_categories:
        info = metrics["tier1_safe"].get(name, {"count": 0, "size": 0})
        cnt = info["count"]
        sz = info["size"]
        tot_cnt += cnt
        tot_sz += sz
        color = YELLOW if sz > 100 * 1024 * 1024 else GREEN
        print(f"  + {BOLD}{name:<38s}{RESET} : {cnt:7,d} files | {color}{format_size(sz):>10s}{RESET}")

    print(f"  {BOLD}------------------------------------------------------------------------------{RESET}")
    print(f"  {BOLD}{GREEN}TOTAL ANTIGRAVITY SAFE RECLAIMABLE SPACE: {format_size(tot_sz)} ({tot_cnt:,} files){RESET}")
    print()

    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}ACTION GUIDE:{RESET}")
    print(f"  • Run {BOLD}{GREEN}clean-ag{RESET} (or {GREEN}antigravity-clean --ag{RESET}) to safely purge these files.")
    print(f"  • Run {BOLD}{GREEN}clean-all{RESET} for a complete workstation sweep.")
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
                if os.path.isfile(fp):
                    sz = os.path.getsize(fp)
                    os.remove(fp)
                    deleted_count += 1
                    deleted_bytes += sz
                elif os.path.isdir(fp):
                    cnt, dir_sz, _ = fast_scan_dir(fp, collect_files=False)
                    shutil.rmtree(fp, ignore_errors=True)
                    deleted_count += cnt
                    deleted_bytes += dir_sz
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
  antigravity-clean --deep                   Deep clean (Tier 1 safe + stale brain + temp workspaces)
  antigravity-clean --browser-cache          Purge Antigravity browser profile web caches
  antigravity-clean --electron-cache         Purge Antigravity Electron IDE runtime caches (%APPDATA%)
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
    parser.add_argument("--temp", action="store_true", help="Clean system temp scripts (%%TEMP%%)")
    parser.add_argument("--caches", action="store_true", help="Clean NPM, Pip, and UV package caches")
    parser.add_argument("--browser-cache", action="store_true", help="Clean Antigravity browser profile web caches")
    parser.add_argument("--electron-cache", "--ide-cache", dest="electron_cache", action="store_true", help="Clean Antigravity Electron IDE runtime caches (%%APPDATA%%\\Antigravity IDE)")
    parser.add_argument("--ides", action="store_true", help="Clean ephemeral caches & logs from external IDEs (Kiro, Zed, Code, Cursor, Windsurf, Trae, Qoder, Claude)")
    parser.add_argument("--kiro", action="store_true", help="Clean Kiro IDE crash dumps, web caches, and daemon logs")
    parser.add_argument("--zed", action="store_true", help="Clean Zed editor logs and trace reports")
    parser.add_argument("--code", action="store_true", help="Clean VS Code / CodeX runtime caches, logs, and crash dumps")
    parser.add_argument("--cursor", action="store_true", help="Clean Cursor caches, logs, and crashpad dumps")
    parser.add_argument("--windsurf", action="store_true", help="Clean Windsurf caches, logs, and crash dumps")
    parser.add_argument("--trae", action="store_true", help="Clean Trae AI IDE caches, logs, and crashpad dumps")
    parser.add_argument("--qoder", action="store_true", help="Clean Qoder caches and logs")
    parser.add_argument("--claude", action="store_true", help="Clean Claude Desktop application logs")
    parser.add_argument("--conversations", action="store_true", help="Clean stale conversation SQLite database files")
    parser.add_argument("--tmp", action="store_true", help="Clean cloned temporary workspaces in ~/.gemini/tmp")
    parser.add_argument("--history", action="store_true", help="Clean workspace file history in ~/.gemini/history")

    # Bundled cleanup flags
    parser.add_argument("--all", action="store_true", help="Clean ALL Tier 1 safe temporary categories across workstation")
    parser.add_argument("--ag", "--antigravity", dest="ag", action="store_true", help="Clean all Antigravity temporary files (scratch, recordings, logs, caches)")
    parser.add_argument("--stale", action="store_true", help="Clean Tier 1 safe items + stale brain/conversations (> 7 days)")
    parser.add_argument("--deep", action="store_true", help="Deep clean (Tier 1 safe + stale brain + stale DBs + temp repos)")

    parser.add_argument("--days", type=int, default=7, help="Stale age threshold in days (default: 7)")
    parser.add_argument("-f", "--force", action="store_true", help="Skip confirmation prompt during deletion")

    args = parser.parse_args()

    # Handle scan mode
    if args.scan:
        run_temp_scanner(stale_days=args.days, limit=args.limit, output_json=args.json)
        return

    # Determine if cleaning action requested
    is_clean = (
        args.ag or args.scratch or args.logs or args.recordings or args.annotations or
        args.temp or args.caches or args.browser_cache or args.electron_cache or
        args.ides or args.kiro or args.zed or args.code or args.cursor or
        args.windsurf or args.trae or args.qoder or args.claude or
        args.conversations or args.tmp or args.history or args.stale or args.deep or args.all
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
            if args.ides:
                run_ide_audit()
            elif args.ag:
                run_ag_audit(stale_days=args.days)
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
    elif args.ag:
        ag_categories = [
            "Global Scratch Scripts",
            "Browser WebP Recordings",
            "Session Scratch Folders",
            "Session Transcripts & Logs",
            "Cached AST Annotations",
            "Crash Dump Logs",
            "Implicit Context Cache",
            "Context State Caches",
            "HTML Artifact Previews",
            "Prompting Step Caches",
            "Browser Profile Web Caches",
            "Electron IDE Runtime Caches",
            "Gemini Root Loose Scratch Files",
        ]
        for cat in ag_categories:
            if cat in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"][cat]["files"])
                target_names.append(cat)
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
        if args.electron_cache:
            raw_targets.extend(metrics["tier1_safe"]["Electron IDE Runtime Caches"]["files"])
            target_names.append("Electron IDE Runtime Caches")
        if args.ides or args.kiro:
            if "Kiro IDE Crash Dumps & Caches" in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"]["Kiro IDE Crash Dumps & Caches"]["files"])
                target_names.append("Kiro IDE Crash Dumps & Caches")
        if args.ides or args.zed:
            if "Zed Editor Logs & Traces" in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"]["Zed Editor Logs & Traces"]["files"])
                target_names.append("Zed Editor Logs & Traces")
        if args.ides or args.code:
            if "VS Code / CodeX Caches & Logs" in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"]["VS Code / CodeX Caches & Logs"]["files"])
                target_names.append("VS Code / CodeX Caches & Logs")
        if args.ides or args.cursor:
            if "Cursor Caches & Logs" in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"]["Cursor Caches & Logs"]["files"])
                target_names.append("Cursor Caches & Logs")
        if args.ides or args.windsurf:
            if "Windsurf Caches & Logs" in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"]["Windsurf Caches & Logs"]["files"])
                target_names.append("Windsurf Caches & Logs")
        if args.ides or args.trae:
            if "Trae Caches & Logs" in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"]["Trae Caches & Logs"]["files"])
                target_names.append("Trae Caches & Logs")
        if args.ides or args.qoder:
            if "Qoder Caches & Logs" in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"]["Qoder Caches & Logs"]["files"])
                target_names.append("Qoder Caches & Logs")
        if args.ides or args.claude:
            if "Claude Desktop Logs" in metrics["tier1_safe"]:
                raw_targets.extend(metrics["tier1_safe"]["Claude Desktop Logs"]["files"])
                target_names.append("Claude Desktop Logs")
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

    # Filter out active session artifacts across all discovered active session IDs
    active_ids = get_active_session_ids()
    if active_ids:
        targets = [t for t in targets if not any(aid in t for aid in active_ids)]

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
