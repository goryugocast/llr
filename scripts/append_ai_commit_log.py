#!/usr/bin/env python3

from __future__ import annotations

import datetime as dt
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
AI_DAILY_DIR = Path(
    "/Users/goryugo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian_local/notes/daily/daily_ai"
)


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def parse_commit_body(body: str) -> tuple[str, str]:
    intent = ""
    reflection = ""
    for raw_line in body.splitlines():
        line = raw_line.strip()
        lower = line.lower()
        if lower.startswith("intent:"):
            intent = line.split(":", 1)[1].strip()
        elif lower.startswith("reflection:"):
            reflection = line.split(":", 1)[1].strip()

    if not intent:
        intent = "Not specified in commit body."
    if not reflection:
        reflection = "Not specified in commit body."
    return intent, reflection


def ensure_daily_file(path: Path, today: str) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# AI Work Log {today}\n\n", encoding="utf-8")


def append_block(path: Path, block: str) -> None:
    current = path.read_text(encoding="utf-8") if path.exists() else ""
    if current and not current.endswith("\n"):
        current += "\n"
    if current and not current.endswith("\n\n"):
        current += "\n"
    path.write_text(current + block + "\n", encoding="utf-8")


def main() -> int:
    try:
        commit_hash = git("rev-parse", "--short", "HEAD")
        branch = git("rev-parse", "--abbrev-ref", "HEAD")
        subject = git("log", "-1", "--pretty=%s")
        body = git("log", "-1", "--pretty=%b")
    except subprocess.CalledProcessError as exc:
        print(f"[append_ai_commit_log] git command failed: {exc}", file=sys.stderr)
        return 1

    intent, reflection = parse_commit_body(body)
    now = dt.datetime.now()
    today = now.strftime("%Y-%m-%d")
    time_label = now.strftime("%H:%M")
    project = REPO_ROOT.name
    daily_path = AI_DAILY_DIR / f"{today}_ai.md"

    ensure_daily_file(daily_path, today)

    block = "\n".join(
        [
            f"## {time_label} [{project}] commit {commit_hash}",
            f"- branch: {branch}",
            f"- subject: {subject}",
            f"- intent: {intent}",
            f"- reflection: {reflection}",
        ]
    )

    append_block(daily_path, block)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
