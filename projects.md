# Projects — Current State

High-level view of all active workstreams.

## Authority Hubs (In Progress)
- Goal: Create pillar guides to build topical authority.
- Status: Mana Bases and Dual Land Cycles published; need content expansion (tables, images).
- Files: guides/mana-bases.html, guides/dual-lands.html
- Next: Add format-specific examples, Scryfall links, printable charts.

## Trust & Transparency (Done)
- Authors page and Editorial Policy live.
- Footer links updated sitewide.
- Files: about/authors.html, about/editorial-policy.html

## Visual & SEO Improvements (Done)
- Favicon, Apple touch icon, robots.txt, sitemap.xml.
- Featured-cards injection (behind flag).
- Footer consistency across all pages.
- Branch: feature/post-visuals-2026-02-13 merged.

## Hero Relevance Fix (Done)
- News posts without decklist use gradient hero.
- Basic lands filtered from hero selection.
- Featured-cards injection disabled for News.
- Branch: master updated.

## Agent Automation Pipeline (Done)
- Full agent suite registered: scout, writer, editor, factchecker, publisher, designer, qa, automation, data-analyst, seo-optimizer, heartbeat.
- Model routing: all agents → stepfun/step-3.5-flash:free (primary), qwen/qwen3-coder:free (fallback). QA uses qwen3-coder as primary.
- Subagent allowlists enable pipeline collaboration.
- Automation agent permissions: exec, sessions_spawn, message.
- Cron jobs active: weekly land verification (Sun 3 AM UTC), daily pipeline (6 AM ET), morning digest (8 AM ET).
- Branch: feature/structure-hardening-2026-02-14 merged.
- Health check passes; all systems operational.

## Ongoing Maintenance
- Weekly land verification (cron).
- Daily logs in memory/ (auto-delete after 7 days).
- Session archiving (2MB threshold).

## Compute3 Blocking (Resolved)
- Scout agent's web searches were blocked (403) by Compute3 provider.
- Fix: Compute3 removed entirely. All agents now use OpenRouter models only (stepfun, qwen3-coder).
- Do NOT re-add Compute3 as a provider or fallback.

## Activity Log
- 2026-02-16: Published 2 post(s) – [Spell Snare and the End of Friend Challenges: Arena's Big Update](/posts/mtg-arena-challenge-lobbies-tmnt-bundles-spell-snare-february.html) and [All Facts Verified: No News, Just Editorial Philosophy](/posts/no-news-today-what-to-do-when-the-scout-comes-up-empty.html)
- 2026-02-15: Published 1 post(s) – [Hasbro's 30th Anniversary Set Fiasco: Black Lotus and the Price of Scarcity](/posts/hasbros-30th-anniversary-set-fiasco-black-lotus-and-the-price-of-scarcity.html)
- 2026-02-14: Published 1 post(s) – [Heroes in a Half Shell: TMNT Previews Kick Off February 17](/posts/heroes-in-a-half-shell-tmnt-previews-kick-off-february-17.html)
- 2026-02-14: Published 1 post(s) – [Divination in Action: How We Scout MTG News](/posts/divination-in-action-how-we-scout-mtg-news.html)
