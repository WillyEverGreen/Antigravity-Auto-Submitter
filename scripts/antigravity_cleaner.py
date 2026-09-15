#!/usr/bin/env python3
"""
Antigravity Workstation Audit & Safe Cleanup Utility (v5.1 Compact Terminal Edition)
Commands: antigravity-check, antigravity-clean, agy-check, agy-clean
"""

import os
import sys
import argparse
import time

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


def get_dir_size(path):
    total = 0
    count = 0
    file_list = []
    if os.path.exists(path):
        if os.path.isfile(path):
            try:
                sz = os.path.getsize(path)
                return 1, sz, [path]
            except Exception:
                return 0, 0, []
        for root, _, files in os.walk(path):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    sz = os.path.getsize(fp)
                    total += sz
                    count += 1
                    file_list.append(fp)
                except Exception:
                    pass
    return count, total, file_list


def get_active_session_id():
    return os.environ.get("ANTIGRAVITY_CONVERSATION_ID")


def run_comprehensive_audit(stale_days=7):
    base_dir = os.path.expanduser("~/.gemini/antigravity-ide")
    config_dir = os.path.expanduser("~/.gemini/config")
    temp_dir = os.environ.get("TEMP", "")
    now = time.time()
    stale_sec = stale_days * 86400
    active_session_id = get_active_session_id()

    print()
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}{CYAN}      ANTIGRAVITY WORKSTATION DELETION AUDIT & SAFETY GUIDE                     {RESET}")
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print()

    # --- TIER 1: SAFE TO DELETE ---
    tier_safe = [
        ("Global Scratch Scripts", os.path.join(base_dir, "scratch")),
        ("Browser WebP Recordings", os.path.join(base_dir, "browser_recordings")),
        ("Session Scratch Folders", os.path.join(base_dir, "brain")),
        ("Session Transcripts & Logs", os.path.join(base_dir, "brain")),
        ("Cached AST Annotations", os.path.join(base_dir, "annotations")),
        ("Crash Dump Logs", os.path.join(base_dir, "crashes")),
        ("Implicit Context Cache", os.path.join(base_dir, "implicit")),
        ("System Temp Scripts", temp_dir),
        ("UV Package Cache", os.path.expanduser("~/AppData/Local/uv/cache")),
        ("NPM Package Cache", os.path.expanduser("~/AppData/Local/npm-cache")),
        ("Pip Package Cache", os.path.expanduser("~/AppData/Local/pip/Cache")),
    ]

    print(f"{BOLD}{GREEN}[SAFE TO DELETE] TIER 1: SAFE TO DELETE (NO REVIEW NEEDED){RESET}")
    safe_total_bytes = 0
    safe_total_files = 0

    for name, path in tier_safe:
        if name == "Session Scratch Folders":
            cnt, sz = 0, 0
            if os.path.exists(path):
                for conv in os.listdir(path):
                    s_p = os.path.join(path, conv, "scratch")
                    c, s, _ = get_dir_size(s_p)
                    cnt += c; sz += s
        elif name == "Session Transcripts & Logs":
            cnt, sz = 0, 0
            if os.path.exists(path):
                for conv in os.listdir(path):
                    l_p = os.path.join(path, conv, ".system_generated")
                    c, s, _ = get_dir_size(l_p)
                    cnt += c; sz += s
        elif name == "System Temp Scripts":
            cnt, sz = 0, 0
            if path and os.path.exists(path):
                for f in os.listdir(path):
                    if any(f.lower().startswith(p) for p in ["tmp", "antigravity", "repomix", "agent"]) and (
                        f.endswith(".py") or f.endswith(".js") or f.endswith(".json") or f.endswith(".log") or f.endswith(".tmp") or f.endswith(".xml")
                    ):
                        fp = os.path.join(path, f)
                        if os.path.isfile(fp):
                            try:
                                s = os.path.getsize(fp)
                                cnt += 1; sz += s
                            except Exception: pass
        else:
            cnt, sz, _ = get_dir_size(path)

        safe_total_bytes += sz
        safe_total_files += cnt
        color = YELLOW if sz > 100 * 1024 * 1024 else GREEN
        print(f"  + {BOLD}{name:<28s}{RESET} : {cnt:7,d} files | {color}{format_size(sz):>10s}{RESET}")

    print(f"  {BOLD}------------------------------------------------------------------------------{RESET}")
    print(f"  {BOLD}{GREEN}TOTAL SAFE RECLAIMABLE SPACE: {format_size(safe_total_bytes)} ({safe_total_files:,} files){RESET}")
    print()

    # --- TIER 2: ADVISABLE TO DELETE ---
    print(f"{BOLD}{YELLOW}[REVIEW CANDIDATES] TIER 2: STALE & ADVISABLE TO DELETE (> {stale_days} DAYS){RESET}")

    brain_dir = os.path.join(base_dir, "brain")
    stale_brain_cnt, stale_brain_sz = 0, 0
    active_brain_cnt, active_brain_sz = 0, 0

    if os.path.exists(brain_dir):
        for conv in os.listdir(brain_dir):
            if active_session_id and conv == active_session_id:
                continue
            conv_p = os.path.join(brain_dir, conv)
            if os.path.isdir(conv_p):
                try:
                    mtime = os.path.getctime(conv_p)
                    c, s, _ = get_dir_size(conv_p)
                    if (now - mtime) > stale_sec:
                        stale_brain_cnt += c; stale_brain_sz += s
                    else:
                        active_brain_cnt += c; active_brain_sz += s
                except Exception: pass

    tools_dir = os.path.expanduser("~/tools")
    stale_deps_cnt, stale_deps_sz = 0, 0
    active_deps_cnt, active_deps_sz = 0, 0

    if os.path.exists(tools_dir):
        for item in os.listdir(tools_dir):
            fp = os.path.join(tools_dir, item)
            if os.path.isdir(fp):
                try:
                    mtime = os.path.getmtime(fp)
                    is_stale = (now - mtime) > (14 * 86400)
                    for dep_sub in ["node_modules", ".venv", "venv"]:
                        dep_p = os.path.join(fp, dep_sub)
                        if os.path.exists(dep_p):
                            c, s, _ = get_dir_size(dep_p)
                            if is_stale:
                                stale_deps_cnt += c; stale_deps_sz += s
                            else:
                                active_deps_cnt += c; active_deps_sz += s
                except Exception: pass

    pw_cnt, pw_sz, _ = get_dir_size(os.path.expanduser("~/AppData/Local/ms-playwright"))
    tracker_cnt, tracker_sz, _ = get_dir_size(os.path.join(base_dir, "code_tracker"))

    print(f"  ! {BOLD}{'Stale Brain (> ' + str(stale_days) + 'd)':<28s}{RESET} : {stale_brain_cnt:7,d} files | {GREEN}{format_size(stale_brain_sz):>10s}{RESET} {BOLD}{GREEN}[ADVISABLE]{RESET}")
    print(f"  ! {BOLD}{'Active Brain (< ' + str(stale_days) + 'd)':<28s}{RESET} : {active_brain_cnt:7,d} files | {YELLOW}{format_size(active_brain_sz):>10s}{RESET} [KEEP]")
    print(f"  ! {BOLD}{'Stale Project Dependencies':<28s}{RESET} : {stale_deps_cnt:7,d} files | {GREEN}{format_size(stale_deps_sz):>10s}{RESET} {BOLD}{GREEN}[ADVISABLE]{RESET}")
    print(f"  ! {BOLD}{'Active Project Dependencies':<28s}{RESET} : {active_deps_cnt:7,d} files | {YELLOW}{format_size(active_deps_sz):>10s}{RESET} [KEEP]")
    print(f"  ! {BOLD}{'Playwright Browser Binaries':<28s}{RESET} : {pw_cnt:7,d} files | {YELLOW}{format_size(pw_sz):>10s}{RESET} [RE-DOWNLOADABLE]")
    print(f"  ! {BOLD}{'IDE Code Tracker History':<28s}{RESET} : {tracker_cnt:7,d} files | {YELLOW}{format_size(tracker_sz):>10s}{RESET}")

    stale_reclaimable = safe_total_bytes + stale_brain_sz + stale_deps_sz
    print(f"  {BOLD}------------------------------------------------------------------------------{RESET}")
    print(f"  {BOLD}{GREEN}TOTAL RECOMMENDED RECLAIMABLE SPACE (Safe + Stale): {format_size(stale_reclaimable)}{RESET}")
    print()

    # --- TIER 3: CRITICAL PROTECTED ---
    tier_critical = [
        ("Global Config, Rules & Skills", config_dir),
        ("Built-in Core Skills & Assets", os.path.join(base_dir, "builtin")),
        ("MCP Configuration", os.path.join(base_dir, "mcp_config.json")),
        ("User Settings State", os.path.join(base_dir, "user_settings.pb")),
        ("Installation Identifier", os.path.join(base_dir, "installation_id")),
    ]

    print(f"{BOLD}{RED}[DO NOT DELETE] TIER 3: CRITICAL SYSTEM & CONFIG PATHS (PROTECTED){RESET}")

    for name, path in tier_critical:
        cnt, sz, _ = get_dir_size(path)
        print(f"  🛑 {BOLD}{name:<28s}{RESET} : {cnt:7,d} files | {RED}{format_size(sz):>10s}{RESET}")

    print()
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print(f"{BOLD}SUMMARY & ACTION GUIDE:{RESET}")
    print(f"  • Run {BOLD}{GREEN}antigravity-clean --all{RESET} to purge all Tier 1 safe items ({format_size(safe_total_bytes)}).")
    print(f"  • Run {BOLD}{GREEN}antigravity-clean --stale{RESET} to purge Tier 1 items + stale brain history > {stale_days}d.")
    print(f"  • Run {BOLD}{GREEN}antigravity-clean --deep{RESET} to perform a complete deep clean ({format_size(stale_reclaimable)}).")
    print(f"  • NEVER delete items under {BOLD}{RED}Tier 3 [DO NOT DELETE]{RESET}.")
    print(f"{BOLD}{CYAN}================================================================================{RESET}")
    print()


def purge_files(files_to_delete):
    deleted_count = 0
    deleted_bytes = 0
    errors = 0

    for fp in files_to_delete:
        try:
            sz = os.path.getsize(fp)
            os.remove(fp)
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


def scan_antigravity_temp(stale_days=7, include_stale_brain=False, include_stale_deps=False):
    base_dir = os.path.expanduser("~/.gemini/antigravity-ide")
    active_session_id = get_active_session_id()
    now = time.time()
    stale_sec = stale_days * 86400

    categories = {
        "global_scratch": {"name": "Global Scratch Scripts", "path": os.path.join(base_dir, "scratch"), "files": [], "size": 0},
        "session_scratch": {"name": "Session Scratch Folders", "path": os.path.join(base_dir, "brain"), "files": [], "size": 0},
        "session_logs": {"name": "Session Logs & Transcripts", "path": os.path.join(base_dir, "brain"), "files": [], "size": 0},
        "browser_recordings": {"name": "Browser Video Recordings", "path": os.path.join(base_dir, "browser_recordings"), "files": [], "size": 0},
        "annotations": {"name": "Cached Document Annotations", "path": os.path.join(base_dir, "annotations"), "files": [], "size": 0},
        "crashes": {"name": "Crash Dump Logs", "path": os.path.join(base_dir, "crashes"), "files": [], "size": 0},
        "implicit": {"name": "Implicit Context Cache", "path": os.path.join(base_dir, "implicit"), "files": [], "size": 0},
        "system_temp": {"name": "System Temp Scripts", "path": os.environ.get("TEMP", ""), "files": [], "size": 0},
        "package_caches": {
            "name": "NPM, Pip & UV Caches",
            "paths": [
                os.path.expanduser("~/AppData/Local/uv/cache"),
                os.path.expanduser("~/AppData/Local/npm-cache"),
                os.path.expanduser("~/AppData/Local/pip/Cache")
            ],
            "files": [], "size": 0
        },
        "stale_brain": {"name": f"Stale Brain Sessions (> {stale_days}d)", "files": [], "size": 0},
        "stale_deps": {"name": "Stale Project Dependencies (> 14d)", "files": [], "size": 0}
    }

    g_dir = categories["global_scratch"]["path"]
    if os.path.exists(g_dir):
        _, _, fl = get_dir_size(g_dir)
        for fp in fl:
            try:
                categories["global_scratch"]["files"].append(fp)
                categories["global_scratch"]["size"] += os.path.getsize(fp)
            except Exception: pass

    brain_dir = os.path.join(base_dir, "brain")
    if os.path.exists(brain_dir):
        for conv_id in os.listdir(brain_dir):
            if active_session_id and conv_id == active_session_id:
                continue
            conv_p = os.path.join(brain_dir, conv_id)
            if not os.path.isdir(conv_p): continue

            s_p = os.path.join(conv_p, "scratch")
            if os.path.exists(s_p):
                _, _, fl = get_dir_size(s_p)
                for fp in fl:
                    try:
                        categories["session_scratch"]["files"].append(fp)
                        categories["session_scratch"]["size"] += os.path.getsize(fp)
                    except Exception: pass

            l_p = os.path.join(conv_p, ".system_generated")
            if os.path.exists(l_p):
                _, _, fl = get_dir_size(l_p)
                for fp in fl:
                    try:
                        categories["session_logs"]["files"].append(fp)
                        categories["session_logs"]["size"] += os.path.getsize(fp)
                    except Exception: pass

            if include_stale_brain:
                try:
                    mtime = os.path.getctime(conv_p)
                    if (now - mtime) > stale_sec:
                        _, _, fl = get_dir_size(conv_p)
                        for fp in fl:
                            try:
                                categories["stale_brain"]["files"].append(fp)
                                categories["stale_brain"]["size"] += os.path.getsize(fp)
                            except Exception: pass
                except Exception: pass

    rec_p = categories["browser_recordings"]["path"]
    if os.path.exists(rec_p):
        _, _, fl = get_dir_size(rec_p)
        for fp in fl:
            try:
                categories["browser_recordings"]["files"].append(fp)
                categories["browser_recordings"]["size"] += os.path.getsize(fp)
            except Exception: pass

    ann_p = categories["annotations"]["path"]
    if os.path.exists(ann_p):
        _, _, fl = get_dir_size(ann_p)
        for fp in fl:
            try:
                categories["annotations"]["files"].append(fp)
                categories["annotations"]["size"] += os.path.getsize(fp)
            except Exception: pass

    for cat_k, key_name in [("crashes", "crashes"), ("implicit", "implicit")]:
        p = os.path.join(base_dir, key_name)
        if os.path.exists(p):
            _, _, fl = get_dir_size(p)
            for fp in fl:
                try:
                    categories[cat_k]["files"].append(fp)
                    categories[cat_k]["size"] += os.path.getsize(fp)
                except Exception: pass

    sys_temp = categories["system_temp"]["path"]
    if sys_temp and os.path.exists(sys_temp):
        for f in os.listdir(sys_temp):
            if any(f.lower().startswith(p) for p in ["tmp", "antigravity", "repomix", "agent"]) and (
                f.endswith(".py") or f.endswith(".js") or f.endswith(".json") or f.endswith(".log") or f.endswith(".tmp") or f.endswith(".xml")
            ):
                fp = os.path.join(sys_temp, f)
                if os.path.isfile(fp):
                    try:
                        sz = os.path.getsize(fp)
                        categories["system_temp"]["files"].append(fp)
                        categories["system_temp"]["size"] += sz
                    except Exception: pass

    for cp in categories["package_caches"]["paths"]:
        if os.path.exists(cp):
            _, _, fl = get_dir_size(cp)
            for fp in fl:
                try:
                    categories["package_caches"]["files"].append(fp)
                    categories["package_caches"]["size"] += os.path.getsize(fp)
                except Exception: pass

    if include_stale_deps:
        tools_dir = os.path.expanduser("~/tools")
        if os.path.exists(tools_dir):
            for item in os.listdir(tools_dir):
                fp = os.path.join(tools_dir, item)
                if os.path.isdir(fp):
                    try:
                        mtime = os.path.getmtime(fp)
                        if (now - mtime) > (14 * 86400):
                            for dep_sub in ["node_modules", ".venv", "venv"]:
                                dep_p = os.path.join(fp, dep_sub)
                                if os.path.exists(dep_p):
                                    _, _, fl = get_dir_size(dep_p)
                                    for df in fl:
                                        try:
                                            categories["stale_deps"]["files"].append(df)
                                            categories["stale_deps"]["size"] += os.path.getsize(df)
                                        except Exception: pass
                    except Exception: pass

    return categories


def main():
    parser = argparse.ArgumentParser(
        description="Antigravity Compact Workstation Audit & Cleanup Engine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  antigravity-check                          Run compact 3-tier audit scan
  antigravity-clean --all                    Purge all Tier 1 safe temporary categories
  antigravity-clean --stale                  Purge Tier 1 safe + stale brain sessions (> 7 days)
  antigravity-clean --deep                   Deep clean (Tier 1 safe + stale brain + stale project deps)
  antigravity-clean --days 3                 Custom age threshold (e.g., stale items > 3 days)
"""
    )

    parser.add_argument("--check", action="store_true", help="Run 3-tier audit scan (default)")
    parser.add_argument("--scan", action="store_true", help="Scan and list temp files")
    parser.add_argument("--scratch", action="store_true", help="Clean global & session scratch files")
    parser.add_argument("--logs", action="store_true", help="Clean session transcripts & task logs")
    parser.add_argument("--recordings", action="store_true", help="Clean browser WebP video recordings")
    parser.add_argument("--annotations", action="store_true", help="Clean cached AST annotations")
    parser.add_argument("--temp", action="store_true", help="Clean system temp scripts (%TEMP%)")
    parser.add_argument("--caches", action="store_true", help="Clean NPM, Pip, and UV package caches")
    parser.add_argument("--stale", action="store_true", help="Clean Tier 1 safe items + stale brain sessions (> 7 days)")
    parser.add_argument("--deep", action="store_true", help="Deep clean (Tier 1 safe + stale brain + stale project deps)")
    parser.add_argument("--all", action="store_true", help="Clean ALL Tier 1 safe temporary categories")
    parser.add_argument("--days", type=int, default=7, help="Stale age threshold in days (default: 7)")
    parser.add_argument("-f", "--force", action="store_true", help="Skip confirmation prompt during deletion")

    args = parser.parse_args()

    is_clean = args.scratch or args.logs or args.recordings or args.annotations or args.temp or args.caches or args.stale or args.deep or args.all
    if args.check or not is_clean:
        run_comprehensive_audit(stale_days=args.days)
        return

    include_stale_brain = args.stale or args.deep
    include_stale_deps = args.deep
    categories = scan_antigravity_temp(stale_days=args.days, include_stale_brain=include_stale_brain, include_stale_deps=include_stale_deps)

    targets = []
    target_names = []

    if args.deep:
        for k, cat in categories.items():
            targets.extend(cat["files"])
            target_names.append(cat["name"])
    elif args.stale:
        for k, cat in categories.items():
            if k != "stale_deps":
                targets.extend(cat["files"])
                target_names.append(cat["name"])
    elif args.all:
        for k, cat in categories.items():
            if k not in ["stale_brain", "stale_deps"]:
                targets.extend(cat["files"])
                target_names.append(cat["name"])
    else:
        if args.scratch:
            targets.extend(categories["global_scratch"]["files"])
            targets.extend(categories["session_scratch"]["files"])
            target_names.append("Scratch Scripts")
        if args.logs:
            targets.extend(categories["session_logs"]["files"])
            target_names.append("Session Logs")
        if args.recordings:
            targets.extend(categories["browser_recordings"]["files"])
            target_names.append("Browser Recordings")
        if args.annotations:
            targets.extend(categories["annotations"]["files"])
            target_names.append("Cached Annotations")
        if args.temp:
            targets.extend(categories["system_temp"]["files"])
            target_names.append("System Temp Scripts")
        if args.caches:
            targets.extend(categories["package_caches"]["files"])
            target_names.append("NPM/Pip/UV Caches")

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

    base_dir = os.path.expanduser("~/.gemini/antigravity-ide")
    purge_empty_dirs(os.path.join(base_dir, "scratch"))
    purge_empty_dirs(os.path.join(base_dir, "brain"))
    purge_empty_dirs(os.path.join(base_dir, "browser_recordings"))

    print(f"\n{BOLD}{GREEN}✓ Cleanup Complete!{RESET}")
    print(f"  Files Removed : {del_count:,}")
    print(f"  Space Freed   : {BOLD}{GREEN}{format_size(del_bytes)}{RESET}")
    if err_count > 0:
        print(f"  Locked/Skipped: {err_count} files (in use by active processes)")
    print()


if __name__ == "__main__":
    main()
