#!/usr/bin/env python3
"""Import routine history JSONL into a reusable SQLite database."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import _history.jsonl into a normalized SQLite DB"
    )
    parser.add_argument("--input", required=True, help="Path to input JSONL")
    parser.add_argument("--output", required=True, help="Path to output SQLite DB")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete output DB first if it exists",
    )
    return parser.parse_args()


SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS raw_events (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_date TEXT,
  raw_json TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS task_logs (
  id INTEGER PRIMARY KEY,
  raw_event_id INTEGER UNIQUE REFERENCES raw_events(id) ON DELETE SET NULL,
  event_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  start_at_local TEXT,
  end_at_local TEXT,
  duration_min INTEGER CHECK (duration_min IS NULL OR duration_min >= 0),
  estimate_min INTEGER CHECK (estimate_min IS NULL OR estimate_min >= 0),
  title TEXT NOT NULL,
  memo_text TEXT,
  status TEXT NOT NULL CHECK (status IN ('done', 'skipped', 'planned', 'template')),
  skip_for_date TEXT,
  project_id INTEGER REFERENCES projects(id),
  standard_project_id INTEGER REFERENCES projects(id),
  standard_task TEXT,
  emoji TEXT
);

CREATE TABLE IF NOT EXISTS task_log_tags (
  task_log_id INTEGER NOT NULL REFERENCES task_logs(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_log_id, tag_id)
);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id INTEGER PRIMARY KEY,
  raw_event_id INTEGER UNIQUE REFERENCES raw_events(id) ON DELETE SET NULL,
  summary_date TEXT NOT NULL,
  title TEXT,
  narrative TEXT,
  raw_text TEXT
);

CREATE TABLE IF NOT EXISTS daily_summary_tags (
  daily_summary_id INTEGER NOT NULL REFERENCES daily_summaries(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (daily_summary_id, tag_id)
);

CREATE TABLE IF NOT EXISTS ai_annotations (
  id INTEGER PRIMARY KEY,
  task_log_id INTEGER NOT NULL REFERENCES task_logs(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  features_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (task_log_id, model, schema_version)
);

CREATE INDEX IF NOT EXISTS idx_task_logs_event_date ON task_logs(event_date);
CREATE INDEX IF NOT EXISTS idx_task_logs_status_event_date ON task_logs(status, event_date);
CREATE INDEX IF NOT EXISTS idx_task_logs_start_at ON task_logs(start_at_local);
CREATE INDEX IF NOT EXISTS idx_task_logs_project_event_date ON task_logs(project_id, event_date);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(summary_date);
CREATE INDEX IF NOT EXISTS idx_raw_events_hash ON raw_events(event_hash);
"""


def normalize_json(obj: dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def to_int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    text = str(value).strip()
    if not text.isdigit():
        return None
    return int(text)


def parse_local_datetime(date_str: str | None, hhmm: str | None) -> str | None:
    if not date_str or not hhmm:
        return None
    if len(hhmm) != 5 or hhmm[2] != ":":
        return None
    try:
        dt_obj = dt.datetime.strptime(f"{date_str} {hhmm}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    return dt_obj.strftime("%Y-%m-%d %H:%M:%S")


def upsert_project(conn: sqlite3.Connection, name: str | None) -> int | None:
    if not name:
        return None
    conn.execute("INSERT OR IGNORE INTO projects(name) VALUES (?)", (name,))
    row = conn.execute("SELECT id FROM projects WHERE name = ?", (name,)).fetchone()
    return int(row[0]) if row else None


def upsert_tag(conn: sqlite3.Connection, name: str) -> int:
    conn.execute("INSERT OR IGNORE INTO tags(name) VALUES (?)", (name,))
    row = conn.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()
    if not row:
        raise RuntimeError(f"Failed to upsert tag: {name}")
    return int(row[0])


def link_tags(
    conn: sqlite3.Connection,
    table: str,
    owner_id_col: str,
    owner_id: int,
    tags: list[Any] | None,
) -> None:
    if not tags:
        return
    for tag in tags:
        if tag is None:
            continue
        tag_name = str(tag).strip()
        if not tag_name:
            continue
        tag_id = upsert_tag(conn, tag_name)
        conn.execute(
            f"INSERT OR IGNORE INTO {table}({owner_id_col}, tag_id) VALUES (?, ?)",
            (owner_id, tag_id),
        )


def insert_raw_event(
    conn: sqlite3.Connection,
    source: str,
    source_ref: str,
    event_type: str,
    event_date: str | None,
    raw_json: str,
) -> int:
    event_hash = hashlib.sha256(raw_json.encode("utf-8")).hexdigest()
    conn.execute(
        """
        INSERT OR IGNORE INTO raw_events(
          source, source_ref, event_type, event_date, raw_json, event_hash, imported_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source,
            source_ref,
            event_type,
            event_date,
            raw_json,
            event_hash,
            dt.datetime.now().isoformat(timespec="seconds"),
        ),
    )
    row = conn.execute("SELECT id FROM raw_events WHERE source_ref = ?", (source_ref,)).fetchone()
    if not row:
        raise RuntimeError(f"Failed to insert raw event: {source_ref}")
    return int(row[0])


def import_history(jsonl_path: Path, db_path: Path, replace: bool) -> dict[str, int]:
    if replace and db_path.exists():
        db_path.unlink()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.executescript(SCHEMA_SQL)

    counters = {
        "lines_total": 0,
        "raw_events": 0,
        "task_logs": 0,
        "task_templates": 0,
        "daily_summaries": 0,
        "skipped_invalid_json": 0,
    }

    with conn:
        with jsonl_path.open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                counters["lines_total"] += 1
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    counters["skipped_invalid_json"] += 1
                    continue

                event_type = str(obj.get("type", "")).strip() or "unknown"
                event_date = obj.get("date")
                event_date = event_date if isinstance(event_date, str) and event_date else None
                raw_json = normalize_json(obj)
                source_ref = f"{jsonl_path}:{line_no}"
                raw_event_id = insert_raw_event(
                    conn=conn,
                    source="history_jsonl",
                    source_ref=source_ref,
                    event_type=event_type,
                    event_date=event_date,
                    raw_json=raw_json,
                )
                counters["raw_events"] += 1

                if event_type == "task":
                    title = str(obj.get("task", "")).strip() or str(obj.get("project", "")).strip()
                    if not title:
                        title = "(untitled)"
                    start_time = str(obj.get("start", "")).strip() or None
                    end_time = str(obj.get("end", "")).strip() or None
                    start_at = parse_local_datetime(event_date, start_time)
                    end_at = parse_local_datetime(event_date, end_time)
                    if start_at and end_at and end_at < start_at:
                        end_dt = dt.datetime.strptime(end_at, "%Y-%m-%d %H:%M:%S") + dt.timedelta(days=1)
                        end_at = end_dt.strftime("%Y-%m-%d %H:%M:%S")

                    duration_min = to_int_or_none(obj.get("duration"))
                    estimate_min = to_int_or_none(obj.get("estimate"))
                    project_id = upsert_project(conn, str(obj.get("project", "")).strip() or None)
                    standard_project_id = upsert_project(
                        conn, str(obj.get("standard_project", "")).strip() or None
                    )

                    status = "done" if event_date else "template"
                    effective_date = event_date if event_date else "1970-01-01"
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO task_logs(
                          raw_event_id, event_date, start_time, end_time, start_at_local, end_at_local,
                          duration_min, estimate_min, title, memo_text, status, skip_for_date,
                          project_id, standard_project_id, standard_task, emoji
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            raw_event_id,
                            effective_date,
                            start_time,
                            end_time,
                            start_at,
                            end_at,
                            duration_min,
                            estimate_min,
                            title,
                            str(obj.get("memo", "")),
                            status,
                            None,
                            project_id,
                            standard_project_id,
                            str(obj.get("standard_task", "")).strip() or None,
                            str(obj.get("emoji", "")).strip() or None,
                        ),
                    )
                    row = conn.execute(
                        "SELECT id FROM task_logs WHERE raw_event_id = ?",
                        (raw_event_id,),
                    ).fetchone()
                    if not row:
                        raise RuntimeError(f"Failed to upsert task_log: raw_event_id={raw_event_id}")
                    task_log_id = int(row[0])
                    link_tags(conn, "task_log_tags", "task_log_id", task_log_id, obj.get("tags"))
                    counters["task_logs"] += 1
                    if status == "template":
                        counters["task_templates"] += 1
                    continue

                if event_type == "daily_summary":
                    if not event_date:
                        continue
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO daily_summaries(raw_event_id, summary_date, title, narrative, raw_text)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            raw_event_id,
                            event_date,
                            str(obj.get("title", "")),
                            str(obj.get("narrative", "")),
                            str(obj.get("raw_text", "")),
                        ),
                    )
                    row = conn.execute(
                        "SELECT id FROM daily_summaries WHERE raw_event_id = ?",
                        (raw_event_id,),
                    ).fetchone()
                    if not row:
                        raise RuntimeError(f"Failed to upsert daily_summary: raw_event_id={raw_event_id}")
                    summary_id = int(row[0])
                    link_tags(conn, "daily_summary_tags", "daily_summary_id", summary_id, obj.get("tags"))
                    counters["daily_summaries"] += 1

    conn.close()
    return counters


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not input_path.exists():
        raise SystemExit(f"Input JSONL does not exist: {input_path}")

    counters = import_history(input_path, output_path, replace=args.replace)
    print("Import finished")
    print(f"input:  {input_path}")
    print(f"output: {output_path}")
    for key, value in counters.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
