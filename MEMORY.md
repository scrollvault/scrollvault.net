# MEMORY.md - Long-Term Memory

## 2026-02-12 Mana Base Calculator Quality Fix

- Fixed incorrect land recommendations in `/tools/manabase/index.html`.
- Updated `FORMAT_DUALS` to reflect actual legal cycles per format:
  - Standard: only Shock Lands.
  - Pioneer: Shock + Fetch (hasFetches true).
  - Modern: Shock + Fetch + Fast.
  - Legacy/Commander: all cycles.
- Corrected `DUAL_NAMES` mapping (UG fast cleared, other names validated).
- Changed suggestion logic: Standard shows shock land only; fetch formats show shock/fetch.
- Result: Calculator now suggests only cards legal in the selected format (by cycle).
- Next: Implement periodic agent verification using Scryfall API to catch regressions.
  - Script: `/home/degenai/scrollvault/verify_lands.sh`
  - Cron job: weekly run (Sundays 03:00 UTC) with output reviewed.

## 2026-02-12 Verification Automation

- Created `/home/degenai/scrollvault/verify_lands.sh` to check dual land legality via Scryfall.
- Scheduled weekly cron (Sundays 03:00 UTC) to run verification and report discrepancies.
- Cron job ID: b7fc33f5-c0a2-4616-a42d-460d63fc9404.
- When issues found, agent will summarize and alert in main session.

## 2026-02-12 /mtg Deprecation

- The `/mtg` workspace has been fully replaced by `/scrollvault`.
- All daily post pipeline cron jobs referencing `/mtg/pipeline.sh` have been removed.
- No further use of `/mtg` is permitted; all content and tools now reside in `/scrollvault`.

## 2026-02-12 Footer Duplication Fix

- Fixed duplicate footer appearance on static pages (about.html, contact.html, privacy.html, terms.html) by removing extra closing `</main>` and `<footer>` blocks that appeared after `</html>`.
- Fixed both live files in `/scrollvault` and source versions to prevent recurrence.

## 2026-02-13 Post Visual Improvements

- Implemented automatic featured-cards injection for posts that lack a decklist but contain card mentions. This adds a horizontal gallery of top card images after the first paragraph, improving visual engagement and reducing text-only appearance.
- Updated writer agent prompt to encourage inline embedded card image galleries (<div class="decklist-images">) in post body for better visual breaks.
- Changes are behind a feature flag (ENABLE_FEATURED_CARDS_INJECTION) for easy rollback.
- All modifications committed on branch `feature/post-visuals-2026-02-13` with backups of original files (.bak).
- Build verified: 47 posts generated; injection activates only for posts without a <pre> decklist and with at least one resolved card.
- Rollback: switch to previous commit or disable flag in build.js.
