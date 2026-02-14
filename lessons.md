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

## 2026-02-14: Agent Configuration Loss from Partial Patches
- Problem: After merging feature branch, only the `automation` agent remained registered; other agent definitions (writer, editor, factchecker, publisher, designer, qa) disappeared.
- Root cause: Previous partial config patches replaced the entire `agents.list` instead of merging; the final config only contained the last patched agent.
- Fix: Rebuilt full agent list via `config.patch` with a complete list including all agents, workspace paths, model routing, tools policies, and subagent allowlists. Restarted gateway.
- Follow-up: Always patch the full `agents.list` array; verify `agents_list` after config changes; keep a canonical agent definition source in the repo (e.g., agents/*.txt) to reconstruct if needed.

## 2026-02-14: Compute3 API Blocking Stops Pipeline
- Problem: Manual pipeline test failed at Scout step due to 403 "request was blocked" errors from Compute3 provider during web searches.
- Root cause: Compute3 appears to be rate limiting, blocking by IP/region, or quota exceeded for this server.
- Fix: Switch Scout agent model priority to use openrouter-direct provider first, with compute3 as fallback. This avoids dependency on a single blocked provider and maintains redundancy.
- Follow-up: Always configure critical agents with multiple providers in different regions when possible; monitor provider health.
