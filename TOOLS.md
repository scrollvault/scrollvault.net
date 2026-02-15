# TOOLS.md - Local Notes

## CRITICAL: File Hygiene

**NEVER write large files to the workspace root** (`/home/degenai/.openclaw/workspace/`). Every file there gets loaded into agent context. Large files cause "prompt too large" errors.

- Temporary artifacts (JSON, HTML, raw data): save to `drafts/` subdirectory or `/home/degenai/scrollvault/data/drafts/`
- Workspace root = small docs only (under 10KB)

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
