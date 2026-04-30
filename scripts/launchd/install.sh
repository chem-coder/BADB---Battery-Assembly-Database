#!/usr/bin/env bash
#
# Installs the BADB automatic-backup launchd agent on macOS.
# Runs backup.js daily at 23:00.
#
# Usage:
#   bash scripts/launchd/install.sh                # install
#   bash scripts/launchd/install.sh --uninstall    # remove
#   bash scripts/launchd/install.sh --status       # show status
#
# This is a LOCAL-ONLY helper — the installed plist lives in
# ~/Library/LaunchAgents/ (not tracked in git). The template stays in
# the repo so the setup is reproducible.
#
# NOT for Linux or Windows — use cron or Task Scheduler respectively.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE="$SCRIPT_DIR/com.badb.backup.plist.template"
TARGET="$HOME/Library/LaunchAgents/com.badb.backup.plist"
LABEL="com.badb.backup"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script is macOS-only. On Linux use cron, on Windows use Task Scheduler." >&2
  exit 1
fi

cmd="${1:-install}"

case "$cmd" in
  --uninstall|uninstall)
    if launchctl list | grep -q "$LABEL"; then
      launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$TARGET" 2>/dev/null || true
      echo "Unloaded $LABEL"
    fi
    if [[ -f "$TARGET" ]]; then
      rm "$TARGET"
      echo "Removed $TARGET"
    else
      echo "No plist found at $TARGET — nothing to remove"
    fi
    ;;

  --status|status)
    if launchctl list | grep -q "$LABEL"; then
      echo "✓ $LABEL is loaded:"
      launchctl list | grep "$LABEL"
    else
      echo "✗ $LABEL is NOT loaded"
    fi
    if [[ -f "$TARGET" ]]; then
      echo "✓ plist present at $TARGET"
    else
      echo "✗ no plist at $TARGET"
    fi
    echo "Last backup log tail:"
    LOG="$REPO_ROOT/sql_backups/auto/backup.log"
    if [[ -f "$LOG" ]]; then tail -5 "$LOG"; else echo "  (no backup.log yet)"; fi
    ;;

  install|"")
    # Render template with absolute path to this repo
    sed "s|__REPO_ABS_PATH__|$REPO_ROOT|g" "$TEMPLATE" > "$TARGET"
    echo "Wrote $TARGET"

    # Validate
    plutil -lint "$TARGET" >/dev/null

    # Unload first (idempotent re-install)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$TARGET" 2>/dev/null || true

    # Load
    launchctl bootstrap "gui/$(id -u)" "$TARGET" 2>/dev/null || launchctl load "$TARGET"
    echo "Loaded $LABEL"

    # Dry-run test: trigger once now to verify it works
    echo "Triggering first run now to smoke-test..."
    launchctl kickstart "gui/$(id -u)/$LABEL" || true
    sleep 3
    LOG="$REPO_ROOT/sql_backups/auto/backup.log"
    if [[ -f "$LOG" ]]; then
      echo "--- Last 10 lines of backup.log ---"
      tail -10 "$LOG"
    fi
    echo ""
    echo "Done. Daily backups at 23:00, logs in $REPO_ROOT/sql_backups/auto/."
    ;;

  *)
    echo "Unknown command: $cmd" >&2
    echo "Usage: $0 [install|--uninstall|--status]" >&2
    exit 1
    ;;
esac
