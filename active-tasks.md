# Active Tasks — Crash Recovery

Read this FIRST on agent restart. Resume autonomously.

Format:
- task_id: short unique id
- description: what to do
- status: pending|in-progress|blocked|done
- context: brief notes, related files
- next_step: what to do next

Current tasks (latest at top):
- task_id: cron-gateway
  description: Fix daily pipeline cron failures. Gateway not running at scheduled times (9 AM, 3 PM). Either ensure gateway starts automatically on boot or modify cron to start gateway before pipeline.
  status: pending
  context: logs/cron.log shows "Scout agent failed after 3 attempts" on 2026-02-15 at 09:00 and 15:00. openclaw gateway started manually at 16:28.
  next_step: Investigate systemd service or init script for gateway; adjust cron to include `openclaw gateway start` with check.

- task_id: missing-update-decks
  description: Remove or fix stale reference to update-decks.sh that appears in cron runs.
  status: pending
  context: logs/cron.log contains "/bin/sh: /home/degenai/scrollvault/update-decks.sh: No such file or directory". No crontab for degenai; may be system cron or old hook.
  next_step: Search system crontabs and any deployment hooks; delete entry or recreate script if needed.

- task_id: commit-site-refactor
  description: Commit the pending site rebuild (external CSS, new sitemap, template cleanup).
  status: done
  context: build.js modified to write external css/base.css; all HTML regenerated. Staging site returns 200. Many modified files pending.
  next_step: Stage all tracked modifications and commit with clear message; push if remote configured.
