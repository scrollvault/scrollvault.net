# Lessons Learned — Mistakes Documented Once

Never repeat the same mistake. Each entry includes root cause and fix.

## 2026-02-12: Mana Base Calculator Hallucinations
- Problem: Land suggestions included cards illegal in selected format.
- Root cause: Static lists didn't differentiate format-legal cycles.
- Fix: Updated `FORMAT_DUALS` logic and added validation per format.
- Follow-up: Weekly verification script via Scryfall.

## 2026-02-12: Footer Duplication on Static Pages
- Problem: Extra closing `</main>` and `<footer>` after `</html>` caused double footer.
- Root cause: Source templates had stray closing tags.
- Fix: Removed extraneous tags in both live and source files.

## 2026-02-13: Featured Cards Injection Overuse
- Problem: News posts without decklists still got random card galleries, looking AI-generated.
- Root cause: Injection ran for any post with card mentions, regardless of category.
- Fix: Disabled injection for News posts; now only for Strategy/Deck Guides/Spoilers where relevant.

## 2026-02-13: Hero Image Relevance
- Problem: News posts (e.g., Companion app update) showed unrelated card art (Lightning Bolt).
- Root cause: Auto-selection picked fallback category cards even when no decklist present.
- Fix: Skip hero card for News posts without decklist; filter basic lands from hero selection.
