#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_FILE="$ROOT_DIR/docs/CHANGELOG.md"
MAX_COMMITS="${1:-80}"
TODAY="$(date '+%Y-%m-%d')"

if ! [[ "$MAX_COMMITS" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 [max_commits]" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

{
  echo "# CHANGELOG"
  echo
  echo "プレリリース期間の変更履歴。"
  echo
  echo '- Source: `git log --date=short --no-merges`'
  echo "- Generated: ${TODAY}"
  echo "- Scope: 最新 ${MAX_COMMITS} コミット"
  echo
  echo "## 更新ルール"
  echo
  echo '- 仕様変更を含むコミット後は `npm run changelog:update` を実行する。'
  echo "- 仕様書の更新日は、この changelog と合わせる。"
  echo
  echo "## Git History Snapshot"
  echo

  current_date=""
  while IFS=$'\t' read -r hash cdate subject; do
    if [ "$cdate" != "$current_date" ]; then
      current_date="$cdate"
      echo "### ${cdate}"
    fi
    printf -- '- %s (`%s`)\n' "$subject" "$hash"
  done < <(git -C "$ROOT_DIR" log --date=short --no-merges --pretty=format:'%h%x09%ad%x09%s' -n "$MAX_COMMITS")

  echo
} > "$OUT_FILE"

echo "Wrote $OUT_FILE"
