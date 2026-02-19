# Self-Review Checklist

Run every ~4 hours (heartbeat) or when switching tasks.

- [ ] Did I just commit/push? If yes, verify remote status.
- [ ] Are any active tasks stale (>2h without update)? Refresh active-tasks.md.
- [ ] Did I introduce duplicate code? Search for similar patterns.
- [ ] Are new pages consistent with existing templates (header/footer/meta)?
- [ ] Did I test that links resolve (no 404s)? Spot-check.
- [ ] Did I update memory structure appropriately? Move lasting items to lessons.md or projects.md.
- [ ] Did I run the build and verify output?
- [ ] Any sessions >2MB? Archive them.
- [ ] Did I respect "Use when / Don't use when" for skills?
- [ ] Any external content parsed using strongest model?

Notes:

## Automated heartbeat notes
- 2026-02-17 03:15 AM: Self-review performed.
  - Active tasks stale: cron-gateway, missing-update-decks. Monitoring.
  - Memory logs for 2026-02-15 and 2026-02-16 created.
  - Uncommitted drafts/logs: 91 files (expected).
  - No sessions >2MB.
  - No skill misuse.
  - Build verified via pipeline (2026-02-16 15:00) - success.
