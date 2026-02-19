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

## IMMUTABLE FILE PROTECTION (chattr +i)
13 critical files are filesystem-locked. Any write attempt returns "Permission denied". This is intentional — these files contain SEO-ranked content. See TOOLS.md for full list. The pipeline can add new posts and run `node build.js` but must NEVER touch protected files. To check status: `bash /home/degenai/scrollvault/protect.sh status`

Nav uses single "Tools" link pointing to /tools/ (not individual Lands/Mana Base links).

## build.js SEO refactor (2026-02-16)
- `writePage()` takes 6 params: `(filename, title, description, activePage, bodyHtml, options = {})` — options.ldJson passes extra JSON-LD to head().
- Article schema uses `"@type": "Person"` for author (from `post.author`), NOT Organization. Includes description, wordCount, mainEntityOfPage, url.
- Breadcrumb item 2 links to the correct hub: News→`/news/`, Strategy→`/guides/`, Deck Guides→`/deck-guides/`, Spoilers→`/spoilers/`, Set Reviews→`/set-reviews/`.
- 5 hub pages: `/news/`, `/guides/`, `/spoilers/`, `/deck-guides/`, `/set-reviews/` — all have CollectionPage + ItemList JSON-LD schemas.
- Guide pages (`/guides/mana-bases.html`, `/guides/dual-lands.html`) have FAQPage JSON-LD for rich snippets.
- Homepage has a stable `<h1 class="sr-only">` in the brand bar; hero post title is `<h2>`.
- All hero/thumbnail background-image divs have `role="img" aria-label="..."` for accessibility.
