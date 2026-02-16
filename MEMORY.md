# MEMORY.md - Long-Term Memory

This file is for personal/security context only. For operational memory, see:
- Daily logs: memory/YYYY-MM-DD.md (auto-deleted after 7 days)
- Active tasks: active-tasks.md
- Lessons: lessons.md
- Projects: projects.md
- Self-review: self-review.md

Key preferences:
- All site content lives in /scrollvault; /mtg is deprecated and should not be used.
- Feature flags are used for new functionality (ENABLE_FEATURED_CARDS_INJECTION).
- Weekly land verification runs Sundays 03:00 UTC (job ID b7fc33f5-c0a2-4616-a42d-460d63fc9404).
- When uncertain, ask before external actions (email, social, etc.).

Tools pages (10 hand-crafted, DO NOT overwrite):
- tools/index.html, tools/manabase, tools/lands, tools/hypergeometric
- tools/hand-simulator, tools/price-checker, tools/commander-bracket, tools/sealed
- decks/index.html, draft/index.html
Nav uses single "Tools" link pointing to /tools/ (not individual Lands/Mana Base links).

## build.js SEO refactor (2026-02-16)
- `writePage()` takes 5 params: `(filename, title, description, activePage, bodyHtml)` — description is passed to `head()`, not auto-generated.
- Article schema uses `"@type": "Person"` for author (from `post.author`), NOT Organization.
- Breadcrumb item 2 links to the correct hub: News→`/news/`, Strategy/Deck Guides→`/guides/`.
- Hub pages (`/news/`, `/guides/`) have CollectionPage JSON-LD schema.
- Homepage has a stable `<h1 class="sr-only">` in the brand bar; hero post title is `<h2>`.
