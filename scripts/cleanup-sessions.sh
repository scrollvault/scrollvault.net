#!/bin/bash
# Cleanup bloated OpenClaw agent sessions
# Removes session files older than 2 days or larger than 200KB
# Safe: only touches .jsonl files in agent session directories

AGENTS_DIR="/home/degenai/.openclaw/agents"
MAX_AGE_DAYS=2
MAX_SIZE_KB=200
ARCHIVED=0

for agent_dir in "$AGENTS_DIR"/*/sessions; do
    [ -d "$agent_dir" ] || continue
    agent=$(basename "$(dirname "$agent_dir")")

    for f in "$agent_dir"/*.jsonl; do
        [ -f "$f" ] || continue
        size_kb=$(( $(stat -c%s "$f" 2>/dev/null || echo 0) / 1024 ))
        age_days=$(( ($(date +%s) - $(stat -c%Y "$f" 2>/dev/null || echo 0)) / 86400 ))

        if [ "$size_kb" -gt "$MAX_SIZE_KB" ] || [ "$age_days" -gt "$MAX_AGE_DAYS" ]; then
            rm -f "$f"
            ARCHIVED=$((ARCHIVED + 1))
            [ "${VERBOSE:-}" = "1" ] && echo "Cleaned: $agent/$(basename $f) (${size_kb}KB, ${age_days}d old)"
        fi
    done
done

[ "${VERBOSE:-}" = "1" ] && echo "Cleaned $ARCHIVED session files"
exit 0
