#!/usr/bin/env python3
"""
Antigravity Active Brain Session Manager (v2.0 Enhanced UX)
Commands: antigravity-brain / agy-brain

Features:
  - Display clean copy-pasteable Session ID prefixes (e.g., 9178f300-5a3d) without truncating dots
  - Full 36-char ID display mode (--full-id)
  - Delete by Index Number (e.g., antigravity-brain --delete 2)
  - Automatic trailing dot stripping so pasted strings like "9178f300-5.." match instantly
  - Interactive Session Selection (-i / --interactive)
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


def get_dir_size_and_mtime(path):
    total = 0
    count = 0
    ctime = 0
    if os.path.exists(path):
        ctime = os.path.getctime(path)
        for root, _, files in os.walk(path):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    sz = os.path.getsize(fp)
                    total += sz
                    count += 1
                except Exception:
                    pass
    return count, total, ctime


def extract_session_title(conv_path):
    title = "Untitled Session"
    meta_p = os.path.join(conv_path, "metadata.json")
    plan_p = os.path.join(conv_path, "implementation_plan.md")
    walk_p = os.path.join(conv_path, "walkthrough.md")

    if os.path.exists(meta_p):
        try:
            with open(meta_p, "r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
                title = data.get("summary", data.get("title", title))
        except Exception:
            pass
    elif os.path.exists(plan_p):
        try:
            with open(plan_p, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if line.startswith("# "):
                        title = line.replace("# ", "").strip()
                        break
        except Exception:
            pass
    elif os.path.exists(walk_p):
        try:
            with open(walk_p, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if line.startswith("# "):
                        title = line.replace("# ", "").strip()
                        break
        except Exception:
            pass

    title = title.replace("\n", " ").replace("\r", "").strip()
    return title


def get_all_sessions(sort_by="size"):
    base_dir = os.path.expanduser("~/.gemini/antigravity-ide/brain")
    active_session_id = os.environ.get("ANTIGRAVITY_CONVERSATION_ID")
    now = time.time()
    sessions = []

    if os.path.exists(base_dir):
        for conv_id in os.listdir(base_dir):
            conv_path = os.path.join(base_dir, conv_id)
            if os.path.isdir(conv_path):
                cnt, sz, mtime = get_dir_size_and_mtime(conv_path)
                title = extract_session_title(conv_path)
                is_active = (active_session_id and conv_id == active_session_id)
                age_sec = now - mtime
                sessions.append({
                    "id": conv_id,
                    "path": conv_path,
                    "title": title,
                    "size": sz,
                    "files": cnt,
                    "mtime": mtime,
                    "age_sec": age_sec,
                    "is_active": is_active
                })

    if sort_by == "age":
        sessions.sort(key=lambda s: s["mtime"], reverse=True)
    else: # default size
        sessions.sort(key=lambda s: s["size"], reverse=True)

    return sessions


def display_distribution(sessions, top_n=20, full_id=False):
    total_sz = sum(s["size"] for s in sessions)
    total_files = sum(s["files"] for s in sessions)

    print()
    print(f"{BOLD}{CYAN}========================================================================================{RESET}")
    print(f"{BOLD}{CYAN}      ANTIGRAVITY BRAIN SESSIONS DISTRIBUTION & DISK ANALYSIS                           {RESET}")
    print(f"{BOLD}{CYAN}========================================================================================{RESET}")
    print()

    print(f"{BOLD}Total Brain Sessions :{RESET} {len(sessions):,} sessions")
    print(f"{BOLD}Total Disk Footprint :{RESET} {BOLD}{YELLOW}{format_size(total_sz)}{RESET} ({total_files:,} files)")
    print()

    id_width = 36 if full_id else 18
    print(f"  {'#':<3s} | {'SESSION ID':<{id_width}s} | {'FILES':<6s} | {'SIZE':<9s} | {'AGE':<9s} | {'TOPIC / TITLE'}")
    print(f"  {'-'*3:3s}-+-{'-'*id_width:{id_width}s}-+-{'-'*6:6s}-+-{'-'*9:9s}-+-{'-'*9:9s}-+-{'-'*25}")

    for idx, s in enumerate(sessions[:top_n], 1):
        display_id = s["id"] if full_id else s["id"][:18]
        sz_str = format_size(s["size"])
        age_str = format_age(s["age_sec"])
        status_color = GREEN if s["size"] < 5 * 1024 * 1024 else (YELLOW if s["size"] < 30 * 1024 * 1024 else RED)
        
        t_display = s["title"]
        if not full_id and len(t_display) > 30:
            t_display = t_display[:27] + "..."

        active_tag = f" {BOLD}{GREEN}[ACTIVE]{RESET}" if s["is_active"] else ""
        print(f"  {idx:<3d} | {BOLD}{display_id:<{id_width}s}{RESET} | {s['files']:6,d} | {status_color}{sz_str:>9s}{RESET} | {age_str:>9s} | {t_display}{active_tag}")

    if len(sessions) > top_n:
        print(f"  ... and {len(sessions) - top_n:,} more smaller/older brain sessions.")

    print()
    print(f"{BOLD}{CYAN}========================================================================================{RESET}")
    print(f"{BOLD}EASY DELETION COMMANDS:{RESET}")
    print(f"  • Delete by Table # Number: {BOLD}{GREEN}antigravity-brain --delete 2{RESET}")
    print(f"  • Delete by ID or Prefix  : {BOLD}{GREEN}antigravity-brain --delete 9178f300{RESET}")
    print(f"  • Delete sessions > N days: {BOLD}{GREEN}antigravity-brain --delete-older-than 7{RESET}")
    print(f"  • Interactive Menu        : {BOLD}{GREEN}antigravity-brain --interactive{RESET}")
    print(f"  • Show Full 36-char UUIDs : {BOLD}{GREEN}antigravity-brain --full-id{RESET}")
    print(f"{BOLD}{CYAN}========================================================================================{RESET}")
    print()


def find_target_session(query, sessions):
    query_clean = query.strip().rstrip(".").rstrip()

    # 1. Check if query is an index number (1-based)
    if query_clean.isdigit():
        idx = int(query_clean) - 1
        if 0 <= idx < len(sessions):
            return sessions[idx]

    # 2. Check by full ID or prefix matching (stripping trailing dots/dashes)
    for s in sessions:
        if s["id"] == query_clean or s["id"].startswith(query_clean):
            return s

    return None


def delete_session(query, force=False):
    sessions = get_all_sessions()
    target = find_target_session(query, sessions)

    if not target:
        print(f"\n{BOLD}{RED}No brain session matching '{query}' found.{RESET}")
        print(f"{BOLD}Tip:{RESET} Use table index number (e.g. {BOLD}antigravity-brain --delete 2{RESET}) or ID prefix.\n")
        return

    if target["is_active"]:
        print(f"\n{BOLD}{RED}Cannot delete session '{target['id']}' because it is currently active!{RESET}\n")
        return

    sz_str = format_size(target["size"])
    print(f"\n{BOLD}{YELLOW}Session Targeted for Deletion:{RESET}")
    print(f"  Full ID : {BOLD}{target['id']}{RESET}")
    print(f"  Topic   : {target['title']}")
    print(f"  Size    : {sz_str} ({target['files']:,} files)")
    print(f"  Age     : {format_age(target['age_sec'])}\n")

    if not force:
        confirm = input(f"{BOLD}{RED}Are you sure you want to permanently delete this brain session? [y/N]: {RESET}").strip().lower()
        if confirm not in ["y", "yes"]:
            print(f"{BOLD}{CYAN}Deletion cancelled.{RESET}")
            return

    try:
        shutil.rmtree(target["path"])
        print(f"\n{BOLD}{GREEN}✓ Successfully deleted session {target['id']}! ({sz_str} freed){RESET}\n")
    except Exception as e:
        print(f"\n{BOLD}{RED}Error deleting session: {e}{RESET}\n")


def run_interactive_mode():
    sessions = get_all_sessions()
    display_distribution(sessions, top_n=25)
    
    print(f"{BOLD}{YELLOW}Interactive Session Delete Menu{RESET}")
    choice = input(f"{BOLD}Enter Session # or ID prefix to delete (or Press Enter to exit): {RESET}").strip()
    if not choice:
        print("Exiting.")
        return

    delete_session(choice, force=False)


def delete_sessions_older_than(days, force=False):
    sessions = get_all_sessions()
    cutoff_sec = days * 86400
    targets = [s for s in sessions if s["age_sec"] > cutoff_sec and not s["is_active"]]

    if not targets:
        print(f"\n{BOLD}{GREEN}No sessions found older than {days} days. Everything is fresh!{RESET}\n")
        return

    total_sz = sum(s["size"] for s in targets)
    total_files = sum(s["files"] for s in targets)

    print(f"\n{BOLD}{YELLOW}Sessions Older Than {days} Days:{RESET} {len(targets):,} sessions")
    print(f"  Total Space: {BOLD}{RED}{format_size(total_sz)}{RESET} ({total_files:,} files)\n")

    if not force:
        confirm = input(f"{BOLD}{RED}Are you sure you want to permanently delete these {len(targets)} brain sessions? [y/N]: {RESET}").strip().lower()
        if confirm not in ["y", "yes"]:
            print(f"{BOLD}{CYAN}Deletion cancelled.{RESET}")
            return

    deleted_sz = 0
    deleted_count = 0
    for s in targets:
        try:
            shutil.rmtree(s["path"])
            deleted_sz += s["size"]
            deleted_count += 1
        except Exception:
            pass

    print(f"\n{BOLD}{GREEN}✓ Purged {deleted_count:,} stale brain sessions! ({format_size(deleted_sz)} freed){RESET}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Antigravity Brain Session Manager (v2.0)",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument("-l", "--list", action="store_true", help="List brain sessions distribution (default)")
    parser.add_argument("-n", "--top", type=int, default=20, help="Number of sessions to show in distribution (default: 20)")
    parser.add_argument("--sort", choices=["size", "age"], default="size", help="Sort order (size or age)")
    parser.add_argument("--full-id", action="store_true", help="Display full 36-character Session UUIDs")
    parser.add_argument("-i", "--interactive", action="store_true", help="Run interactive deletion picker")
    parser.add_argument("-d", "--delete", type=str, metavar="QUERY", help="Delete specific session by index number #, ID, or prefix")
    parser.add_argument("--delete-older-than", type=int, metavar="DAYS", help="Delete sessions older than N days")
    parser.add_argument("--clean-empty", action="store_true", help="Delete empty/zero-artifact brain folders")
    parser.add_argument("-f", "--force", action="store_true", help="Skip confirmation prompt")

    args = parser.parse_args()

    if args.interactive:
        run_interactive_mode()
    elif args.delete:
        delete_session(args.delete, force=args.force)
    elif args.delete_older_than:
        delete_sessions_older_than(args.delete_older_than, force=args.force)
    elif args.clean_empty:
        sessions = get_all_sessions()
        empties = [s for s in sessions if s["files"] == 0 and not s["is_active"]]
        if not empties:
            print(f"\n{BOLD}{GREEN}No empty brain sessions found.{RESET}\n")
        else:
            for s in empties:
                try: os.rmdir(s["path"])
                except Exception: pass
            print(f"\n{BOLD}{GREEN}✓ Removed {len(empties)} empty brain session directories!{RESET}\n")
    else:
        sessions = get_all_sessions(sort_by=args.sort)
        display_distribution(sessions, top_n=args.top, full_id=args.full_id)


if __name__ == "__main__":
    main()
