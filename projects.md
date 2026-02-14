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
- Full agent suite registered: scout, writer, editor, factchecker, publisher, designer, qa, automation.
- Model routing: scout/factchecker → hermes4:405b; automation → step; publisher → coder.
- Subagent allowlists enable pipeline collaboration.
- Automation agent permissions: exec, sessions_spawn, message.
- Cron jobs active: weekly land verification (Sun 3 AM UTC), daily pipeline (6 AM ET), morning digest (8 AM ET).
- Branch: feature/structure-hardening-2026-02-14 merged.
- Health check passes; all systems operational.

## Ongoing Maintenance
- Weekly land verification (cron).
- Daily logs in memory/ (auto-delete after 7 days).
- Session archiving (2MB threshold).

## Current Issue: Compute3 Blocking
- Scout agent's web searches blocked (403) by Compute3 provider during pipeline test.
- Action needed: Change Scout model priority to use openrouter-direct first, with compute3 as fallback.
- This will restore pipeline functionality and prevent single-provider dependency.
