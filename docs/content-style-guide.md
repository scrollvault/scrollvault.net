# ScrollVault Content Style Guide

*Version:* 1.0 (2026-02-14)  
*Purpose:* Ensure all published content meets competitive quality standards for visuals, depth, and SEO.

---

## 1. Visual Standards

### 1.1 Card Images
- **Requirement:** Every card mentioned in a deck tech or analysis post must include its card art image inline.
- **Source:** Scryfall API (automated fetch during build).
- **Size:** 300×420px inline; 600×840px for featured images.
- **Format:** PNG with transparency, optimized to <50KB.
- **Linking:** Card names must also be hyperlinked to Scryfall search: `[Monastery Swiftspear](https://scryfall.com/search?q=Monastery+Swiftspear)`.
- **Placeholders:** For unreleased cards, use a "Concept Art" placeholder with clear watermark; do not publish without artwork.

### 1.2 Charts & Graphics
- **Mana curve:** Horizontal bar chart (5 colors) showing distribution by mana value.
- **Color breakdown:** Pie chart or stacked bar showing % of each mana source.
- **Sideboard matrix:** Table showing matchup, cards to bring in/out, win rate change.
- **Metagame share:** Area chart over time if historical data available.
- **Tools:** Matplotlib/Seaborn with ScrollVault color palette (define: primary #a855f7, secondary #3b82f6, accent #10b981).

### 1.3 Video Integration
- **Deck techs:** Must include an embedded YouTube/Twitch video (16:9, 1080p minimum).
- **Thumbnail template:** 1280×720px, includes logo watermark, archetype name, card art collage.
- **Description:** Provide transcript excerpt or summary for accessibility.

### 1.4 Featured Images
- Every post needs a featured image (1200×630px) for Open Graph/Twitter Cards.
- For news: relevant card art or event photography.
- For deck techs: collage of 3–4 key cards with archetype title overlay.

---

## 2. Content Depth Requirements

### 2.1 Word Count Targets
- **Deck Techs:** 1,200–1,800 words (minimum 1,200)
- **News briefs:** 600–1,000 words
- **Metagame analysis:** 1,500–2,500 words
- **Deep dives/lore:** 1,800–3,000 words

### 2.2 Deck Tech Structure
1. **Hook** (150–200 words): tournament result, metagame impact, or unique angle
2. **Archetype overview** (200 words): history, playstyle, key synergies
3. **Video embed** (if available)
4. **Full decklist** with interactive export (link to Moxfield/Archidekt)
5. **Key card analysis** (4–6 cards, 150 words each) — include inline images
6. **Mana base & sequencing** tips (150 words)
7. **Sideboarding guide** — table format:
   | Matchup | +Cards | -Cards | Notes |
   |---------|--------|--------|-------|
8. **Proprietary metric** (e.g., "Meta Relevance Score", "Power Rating")
9. **Conclusion** with tier placement and next steps

### 2.3 News Structure
1. **Summary** (2 paragraphs): who, what, when, why it matters
2. **Context/history** (2–3 paragraphs)
3. **Embedded official content** (video, tweet, press release)
4. **Expert quote** — reach out to pro players, designers, or use official statements
5. **Implications for players** (1–2 paragraphs)
6. **Links to related coverage** (internal + external)

### 2.4 Proprietary Metrics (Optional but encouraged)
- **Meta Relevance Score:** Based on MTGGoldfish data + our own analysis (0–100)
- **Power Rating:** Subjective scale (1–10) for deck consistency
- **Fire/Ice style:** Trending up/down with percentage change

---

## 3. SEO & Publishing Standards

### 3.1 Headlines
- **Formula:** `[Keyword-Rich Title] | ScrollVault`
- **Examples:** 
  - `Izzet Prowess Deck Tech: Win More Games in Standard 2026 | ScrollVault`
  - `TMNT Bundle Delay: What North American Players Need to Know | ScrollVault`
- **Length:** 60–70 characters (before |)

### 3.2 Meta Descriptions
- **Length:** 150–160 characters
- **Include:** primary keyword + benefit + call-to-action
- **Example:** `Izzet Prowess is dominating Standard. Get the full decklist, sideboarding guide, and matchup analysis to win more games.` (147 chars)

### 3.3 URL Slugs
- Lowercase, hyphens only
- Include primary keyword
- No dates in final published URLs (use `/posts/slug/`)

### 3.4 Tags & Categories
- **Categories:** `Deck Tech`, `News`, `Metagame Analysis`, `Commander`, `Standard`, `Pioneer`, `Modern`, `Limited`, `Lore`
- **Tags:** 5–8 specific tags (e.g., `Izzet Prowess`, `Standard 2026`, `Monastery Swiftspear`, `prowess`, `deck tech`)
- **Consistency:** Use the same tag spelling across posts.

### 3.5 Schema Markup
- All posts must include JSON-LD `Article` schema (automated during build).
- Include `headline`, `image`, `datePublished`, `author`, `publisher`, `description`.

### 3.6 Author Bylines
- Assign a specific writer with title (e.g., `Molts, Content Lead` or `Jane Doe, MTG Analyst`).
- Build author pages with bio and social links.
- Rotate authors to develop team expertise.

---

## 4. Formatting Rules

### 4.1 Markdown Standards
- Headings: `# H1`, `## H2`, `### H3` (max 3 levels)
- Decklists: Use code blocks with ```` ```mtg ```` syntax
- Bold for key terms: **Monastery Swiftspear**
- Italics for emphasis: *this card is meta-defining*
- Tables: pipe format, header separator, align right for numbers
- Blockquotes for expert commentary:
  `> "This card is format-breaking." – Gavin Verhey`

### 4.2 Decklist Presentation
````markdown
```mtg
Creatures (12)
4 Monastery Swiftspear
4 Soul-Scar Mage
...

Spells (18)
4 Lightning Bolt
4 Expressive Iteration
...

Lands (20)
4 Steam Vents
4 Breeding Pool
...
```
````
- Include full 60-card main + 15-card sideboard.
- Provide export links: [Export to Moxfield](#) | [Export to Archidekt](#)

### 4.3 Images
- Inline images every 300–400 words.
- Alt text: descriptive, includes card/archetype name.
- Captions optional; credit designer if not card art.

### 4.4 Reading Time
- Calculate: `word_count / 200` → X min read.
- Display at top of article under title.

### 4.5 Table of Contents
- Auto-generate for articles >1,500 words from H2/H3s.
- Sticky on desktop, collapsible on mobile.

---

## 5. Tone & Voice

- **Authoritative but approachable:** We know our stuff but don't condescend.
- **Narrative strength:** Use storytelling (like Garruk post) to connect cards to larger themes.
- **Data-driven:** Back claims with tournament results, MTGGoldfish stats, or our own tracking.
- **Transparent:** Cite sources, explain methodology (e.g., "Meta Relevance Score combines...").
- **Community-focused:** Address the FNM-to-Regional player; assume they're competent but not pros.
- **Avoid:** Filler phrases ("Let's dive into", "It's worth noting"), hyperbole ("game-changer"), overused jargon.

---

## 6. Checklist Before Publishing

- [ ] All card names linked to Scryfall
- [ ] All mentioned cards have inline images
- [ ] Featured image present and optimized
- [ ] Word count within target range
- [ ] JSON-LD schema present
- [ ] Meta description optimized
- [ ] 5–8 tags assigned
- [ ] Author byline with title
- [ ] Reading time calculated
- [ ] Internal links (≥3) to related posts
- [ ] External links to authoritative sources (≥5)
- [ ] Deck export button functional
- [ ] Video embedded (if applicable)
- [ ] At least one custom graphic (chart/table)
- [ ] No placeholder images
- [ ] Accessibility: alt text, heading hierarchy, contrast ratio 4.5:1+
- [ ] Mobile-responsive tables and images
- [ ] Spell-check and grammar check

---

## 7. Designer Agent Specifications

### Image Creation Pipeline
- **Card art fetch:** Run Scryfall API script for every card in decklist during build.
- **Chart generation:** Use Matplotlib templates; brand colors; save as SVG for sharpness.
- **Thumbnail design:** Canva template with logo watermark.
- **Optimization:** `cwebp` for conversion, `optipng` for compression.

### Assets Needed
- ScrollVault logo (SVG and PNG variations)
- Color palette definitions
- Font families (headings vs body)
- Layout templates for:
  - Deck tech featured image
  - News header
  - Social media cards (Twitter, FB, Instagram)

---

*This guide is living. Update as standards evolve.*
