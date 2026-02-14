# Heartbeat Checklist (keep small)

Run every ~30 minutes. Quick health checks only.

- Check if active-tasks.md has stale items (>2h without update). If yes, nudge or reprioritize.
- Self-review every ~4 hours: run self-review.md checklist.
- Archive sessions >2MB; alert if >5MB.
- Did any cron jobs fail? Look in logs/ for recent errors.
- Quick git status: any uncommitted changes? Commit if appropriate.
- Scan memory/ for logs older than 7 days; delete them.

No heavy work here. Heavy tasks → cron.
