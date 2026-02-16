#!/usr/bin/env node
// MTG Blog Builder - generates index.html + individual post pages + static pages
// Uses Scryfall API for automatic card art resolution
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE_URL = "https://scrollvault.net";
const DATA_FILE = path.join(ROOT, 'data', 'posts.json');
const CACHE_FILE = path.join(ROOT, 'data', 'card-cache.json');

// Output directory (default: current workspace)
const OUTPUT_DIR = process.argv.includes('--staging') ? '/home/degenai/staging.scrollvault.net' :
                   process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] :
                   ROOT;
const POSTS_OUT_DIR = path.join(OUTPUT_DIR, 'posts');


// ── Shared helpers ──
const CATEGORY_SLUGS = {
  'News': 'news', 'Strategy': 'strategy', 'Spoilers': 'spoilers',
  'Deck Guides': 'deck-guides', 'Set Reviews': 'set-reviews'
};
const CATEGORY_GRADIENTS = {
  'News': 'var(--gradient-blue)', 'Strategy': 'var(--gradient-green)',
  'Spoilers': 'var(--gradient-purple)', 'Deck Guides': 'var(--gradient-orange)',
  'Set Reviews': 'var(--gradient-red)'
};
const CATEGORY_PILLS = {
  'News': '--pill-news', 'Strategy': '--pill-strategy', 'Spoilers': '--pill-spoilers',
  'Deck Guides': '--pill-deck-guides', 'Set Reviews': '--pill-set-reviews'
};
const CATEGORY_FALLBACK_CARDS = {
  'News': 'Lightning Bolt', 'Strategy': 'Counterspell',
  'Spoilers': 'Black Lotus', 'Deck Guides': 'Sol Ring',
  'Set Reviews': 'Jace, the Mind Sculptor'
};
function isBasicLand(name) {
  const basics = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes',
    'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest']);
  return basics.has(name);
}


function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function postUrl(post) { return `/posts/${post.slug}.html`; }

// ── Scryfall Card Art Module ──
let cardCache = {};
try { cardCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}

function saveCache() {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cardCache, null, 2));
}

async function lookupCard(name) {
  const key = name.toLowerCase().trim();
  if (cardCache[key]) return cardCache[key];

  try {
    await new Promise(r => setTimeout(r, 100)); // Scryfall rate limit
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!res.ok) {
      cardCache[key] = { name, not_found: true };
      return cardCache[key];
    }
    const card = await res.json();

    // Validate fuzzy match: at least one significant query word must appear in result
    const queryWords = key.split(/[\s'-]+/).filter(w => w.length > 2);
    const resultWords = card.name.toLowerCase().split(/[\s,'-]+/).filter(w => w.length > 2);
    const overlap = queryWords.some(w => resultWords.includes(w));
    if (!overlap) {
      cardCache[key] = { name, not_found: true };
      return cardCache[key];
    }

    const imgs = card.image_uris || (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) || {};
    cardCache[key] = {
      name: card.name,
      art_crop: imgs.art_crop || '',
      normal: imgs.normal || '',
      artist: card.artist || '',
      set: card.set || '',
      not_found: false
    };
    return cardCache[key];
  } catch (e) {
    cardCache[key] = { name, not_found: true };
    return cardCache[key];
  }
}

function extractDecklistCards(text) {
  const matches = [];
  const re = /^\s*(\d+)\s+([A-Z][a-zA-Z' ,\-]+)/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[2].trim();
    if (name.length > 2 && !name.match(/^(Creatures?|Spells?|Lands?|Instants?|Sorcery|Enchantments?|Artifacts?|Planeswalkers?|Sideboard)\b/i)) {
      matches.push(name);
    }
  }
  return matches;
}

const STOP_PHRASES = new Set([
  'magic the gathering', 'wizards of the coast', 'pro tour', 'top eight',
  'game plan', 'win rate', 'board state', 'card advantage', 'mana cost',
  'creature type', 'full article', 'read more', 'coming soon',
  'recent posts', 'related posts', 'privacy policy', 'terms of service',
  'standard deck', 'arena economy', 'pioneer deck', 'commander banned',
  'ban update', 'full spoiler', 'spoiler review', 'deck guide',
  'set review', 'draft guide', 'breaking news', 'mtg blog', 'mtg news',
  'key matchup', 'sideboard adjustments', 'mana base', 'standard decks',
  'budget pioneer', 'long game', 'dimir excruciator', 'pro tour lorwyn',
  'what this', 'what we', 'who we', 'more like', 'once you', 'here what',
  'modern horizons', 'foundations of magic', 'commander rules'
]);

// Feature flag for visual enhancements (rollback safe)
const ENABLE_FEATURED_CARDS_INJECTION = true;

// Affiliate link generation (TCGplayer Impact redirect)
const AFFILIATE_REDIRECT_BASE = 'https://partner.tcgplayer.com/gRPPm5';

function makeAffiliateLink(cardName) {
  const dest = `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(cardName)}`;
  return `${AFFILIATE_REDIRECT_BASE}?u=${encodeURIComponent(dest)}`;
}

function isStopPhrase(phrase) {
  const lower = phrase.toLowerCase();
  if (STOP_PHRASES.has(lower)) return true;
  for (const s of STOP_PHRASES) {
    if (lower.startsWith(s + ' ') || lower === s) return true;
  }
  return false;
}

// Words too common to start a card name candidate (reduces false positives)
const COMMON_FIRST_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'have', 'has', 'had',
  'what', 'how', 'why', 'when', 'where', 'who', 'which',
  'this', 'that', 'these', 'those', 'it', 'its', 'if',
  'your', 'our', 'their', 'my', 'his', 'her',
  'once', 'then', 'here', 'there', 'more', 'most', 'many', 'much',
  'every', 'each', 'all', 'both', 'any', 'some', 'no',
  'like', 'just', 'also', 'only', 'even', 'still',
  'not', 'but', 'yet', 'for', 'with', 'from', 'into', 'over',
  'after', 'before', 'under', 'above', 'between', 'through',
  'new', 'old', 'big', 'first', 'last', 'long', 'great',
  'see', 'get', 'make', 'take', 'come', 'give', 'find',
  'you', 'we', 'they', 'she', 'he', 'him', 'them', 'us',
  'deck', 'decks', 'card', 'cards', 'meta', 'format',
  'game', 'games', 'play', 'match', 'board', 'hand',
  'ban', 'list', 'update', 'review', 'guide', 'draft',
  'best', 'top', 'full', 'good', 'better', 'worst',
  'turn', 'mana', 'cost', 'color', 'land', 'creature',
  'against', 'winning', 'losing', 'building', 'playing',
  'budget', 'competitive', 'different', 'up', 'down',
]);

function extractCardCandidates(text) {
  // Preserve newlines for decklist parsing, strip HTML tags
  const stripped = text.replace(/<[^>]+>/g, '\n').replace(/&[a-z]+;/gi, ' ');
  const candidates = [];

  // 1. Decklist card names (most reliable, line-based)
  candidates.push(...extractDecklistCards(stripped));

  // 2. Multi-word capitalized phrases from body text
  const plain = stripped.replace(/\s+/g, ' ').trim();
  const segments = plain.split(/[.!?;:()\[\]]+/);
  const connectors = new Set(['of', 'the', 'for', 'a', 'an', 'and', 'in', 'to']);

  for (const segment of segments) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
      if (!w || !w.match(/^[A-Z]/)) continue;

      // Skip phrases starting with common English words
      const firstLower = w.toLowerCase().replace(/[^a-z]/g, '');
      if (COMMON_FIRST_WORDS.has(firstLower)) continue;

      for (let len = 2; len <= 4 && i + len <= words.length; len++) {
        const phraseWords = words.slice(i, i + len).map(pw => pw.replace(/[^a-zA-Z'-]/g, ''));
        const last = phraseWords[phraseWords.length - 1];
        if (!last || !last.match(/^[A-Z]/)) continue;

        let valid = true;
        for (let j = 1; j < phraseWords.length - 1; j++) {
          const mw = phraseWords[j];
          if (!mw.match(/^[A-Z]/) && !connectors.has(mw.toLowerCase())) {
            valid = false;
            break;
          }
        }
        if (!valid) continue;

        const phrase = phraseWords.join(' ');
        if (phrase.length > 4 && !isStopPhrase(phrase)) {
          candidates.push(phrase);
        }
      }
    }
  }

  const seen = new Set();
  return candidates.filter(c => {
    const k = c.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 30);
}

async function resolvePostImages(post) {
    const hasDecklist = post.body && post.body.includes('<pre class="decklist">');
const text = (post.title || '') + ' ' + (post.excerpt || '') + ' ' + (post.body || '');
  const candidates = extractCardCandidates(text);

  let heroCard = null;
  const allCards = [];

  for (const name of candidates) {
    const card = await lookupCard(name);
    if (!card.not_found && card.art_crop) {
      allCards.push(card);
      if (!heroCard) heroCard = card;
    }
  }

  // Fallback to category default


  // If News post without decklist, do not use any card hero (skip auto selection)
  if (post.category === 'News' && !hasDecklist) {
    heroCard = null;
  }
  // Fallback to category default for non-News posts
  if (!heroCard && post.category !== 'News') {
    const fallbackName = CATEGORY_FALLBACK_CARDS[post.category] || 'Lightning Bolt';
    heroCard = await lookupCard(fallbackName);
    if (heroCard.not_found) heroCard = null;
  }



  // Avoid using basic lands as hero images; prefer non-basic cards if available
  if (heroCard && isBasicLand(heroCard.name) && allCards.length) {
    const nonBasic = allCards.find(c => !isBasicLand(c.name));
    if (nonBasic) heroCard = nonBasic;
  }
  if (heroCard) {
    post.hero_image = heroCard.art_crop;
    post.hero_card_name = heroCard.name;
    post.hero_artist = heroCard.artist;
  } else {
    post.hero_image = null;
    post.hero_card_name = null;
    post.hero_artist = null;
  }

  // Merge with any manually provided _cards (don't lose hand-curated card data)
  const existing = (post._cards || []).filter(c => c && !c.not_found && c.normal);
  const seen = new Set(allCards.map(c => c.name.toLowerCase()));
  for (const c of existing) {
    if (!seen.has(c.name.toLowerCase())) {
      allCards.push(c);
      seen.add(c.name.toLowerCase());
    }
  }
  post._cards = allCards;
  return post;
}

function processPostBody(html, cards, category) {
  if (!html) return '';

  const cardMapLower = {};
  for (const card of cards) {
    if (card.normal) cardMapLower[card.name.toLowerCase()] = card;
  }

  // Split by <pre>...</pre> blocks
  const parts = html.split(/(<pre[\s\S]*?<\/pre>)/gi);

  let hasDecklist = false;
  const result = parts.map(part => {
    if (part.match(/^<pre/i)) {
      hasDecklist = true;
      // Check if it's a decklist, add image strip
      const content = part.replace(/<\/?pre[^>]*>/gi, '');
      const deckNames = extractDecklistCards(content);
      const deckImages = [];
      const seen = new Set();
      for (const name of deckNames) {
        const key = name.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        const cached = cardCache[key];
        if (cached && !cached.not_found && cached.normal) {
          deckImages.push(cached);
        }
      }

      if (deckImages.length) {
        const strip = `\n<div class="decklist-images">\n${deckImages.map(c =>
          `  <a href="${esc(makeAffiliateLink(c.name))}" rel="nofollow sponsored" target="_blank"><img src="${esc(c.normal)}" alt="${esc(c.name)}" title="${esc(c.name)}" loading="lazy"></a>`
        ).join('\n')}\n</div>`;
        return part + strip;
      }
      return part;
    }

    // Text section - wrap card names with affiliate tooltip spans
    if (!Object.keys(cardMapLower).length) return part;

    const names = Object.values(cardMapLower).map(c => c.name).sort((a, b) => b.length - a.length);
    const pattern = names.map(n => escapeRegex(n)).join('|');
    const re = new RegExp(`\\b(${pattern})\\b`, 'gi');

    const tokens = part.split(/(<[^>]+>)/g);
    return tokens.map(token => {
      if (token.startsWith('<')) return token;
      return token.replace(re, match => {
        const card = cardMapLower[match.toLowerCase()];
        if (card && card.normal) {
          return `<a href="${esc(makeAffiliateLink(card.name))}" rel="nofollow sponsored" class="card-ref" data-img="${esc(card.normal)}" target="_blank">${match}</a>`;
        }
        return match;
      });
    }).join('');
  }).join('');

  // If no decklist was present, inject a featured cards gallery after the first paragraph for visual engagement
  if (ENABLE_FEATURED_CARDS_INJECTION && !hasDecklist && cards && cards.length && category !== 'News') {
    const featuredCards = cards.slice(0, 6).filter(c => c && c.normal && !c.not_found);
    if (featuredCards.length) {
      const strip = `\n<div class="decklist-images featured-inject">\n${featuredCards.map(c =>
        `  <a href="${esc(makeAffiliateLink(c.name))}" rel="nofollow sponsored" target="_blank"><img src="${esc(c.normal)}" alt="${esc(c.name)}" title="${esc(c.name)}" loading="lazy"></a>`
      ).join('\n')}\n</div>`;
      // Inject after the first closing </p> that appears early in the body
      const injected = result.replace(/<\/p>/i, `</p>` + strip);
      return injected;
    }
  }

  return result;
}

// ── Shared CSS ──
const CSS = `
:root {
    --bg-dark: #0f0f0f; --card-bg: #1a1a1a; --card-border: rgba(255,255,255,0.08);
    --card-hover-glow: rgba(139,92,246,0.25); --text-primary: #ffffff;
    --text-secondary: #a1a1aa; --text-muted: #71717a;
    --nav-bg: rgba(15,15,15,0.95); --nav-border: rgba(255,255,255,0.06);
    --gradient-navy: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --gradient-purple: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
    --gradient-blue: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%);
    --gradient-green: linear-gradient(135deg, #10b981 0%, #14b8a6 100%);
    --gradient-orange: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
    --gradient-red: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    --pill-news: #3b82f6; --pill-strategy: #10b981; --pill-spoilers: #a855f7;
    --pill-deck-guides: #f59e0b; --pill-set-reviews: #ef4444;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3); --shadow-md: 0 4px 6px rgba(0,0,0,0.4);
    --shadow-lg: 0 10px 15px rgba(0,0,0,0.5);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg-dark); color: var(--text-primary); line-height: 1.6; min-height: 100vh; }
h1,h2,h3,h4,h5,h6 { font-family: 'Space Grotesk', -apple-system, sans-serif; font-weight: 600; line-height: 1.3; }
a { color: inherit; text-decoration: none; transition: color 0.2s ease; }
a:hover { color: #a78bfa; }
.container { max-width: 1280px; margin: 0 auto; padding: 0 1rem; }
.nav { position: fixed; top: 0; left: 0; right: 0; background: var(--nav-bg); backdrop-filter: blur(10px); border-bottom: 1px solid var(--nav-border); z-index: 1000; height: 64px; display: flex; align-items: center; }
.nav-content { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.nav-logo { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; background: var(--gradient-purple); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.nav-links { display: flex; gap: 2rem; list-style: none; }
.nav-links a { font-size: 0.9rem; font-weight: 500; color: var(--text-secondary); }
.nav-links a:hover, .nav-links a.active { color: var(--text-primary); }
.mobile-menu-btn { display: none; background: none; border: none; color: var(--text-primary); font-size: 1.5rem; cursor: pointer; }
main { margin-top: 64px; min-height: calc(100vh - 64px); }
footer { border-top: 1px solid var(--card-border); padding: 2rem 0; }
.footer-content { display: flex; flex-direction: column; align-items: center; gap: 1rem; text-align: center; }
.footer-logo { font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; font-weight: 700; background: var(--gradient-purple); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.footer-text { color: var(--text-muted); font-size: 0.875rem; }
.footer-links { display: flex; gap: 1.5rem; list-style: none; }
.footer-links a { color: var(--text-secondary); font-size: 0.875rem; }
.footer-links a:hover { color: var(--text-primary); }
.wubrg-dots { display: flex; gap: 0.5rem; justify-content: center; margin-top: 0.25rem; }
.mana-dot { width: 10px; height: 10px; border-radius: 50%; }
@media (max-width: 768px) {
    .nav-links { display: none; position: absolute; top: 64px; left: 0; right: 0; background: var(--nav-bg); border-bottom: 1px solid var(--nav-border); flex-direction: column; padding: 1rem; gap: 0; }
    .nav-links.active { display: flex; }
    .nav-links a { padding: 0.75rem 1rem; display: block; border-bottom: 1px solid var(--card-border); }
    .nav-links a:last-child { border-bottom: none; }
    .mobile-menu-btn { display: block; }
}
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px;
  z-index: 100;
  font-size: 0.9rem;
  transition: top 0.2s;
}
.skip-link:focus { top: 0; }
.breadcrumb {
  font-size: 0.85rem;
  color: rgba(255,255,255,0.6);
  margin-bottom: 1rem;
}
.breadcrumb ol {
  list-style: none;
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}
.breadcrumb a { color: rgba(255,255,255,0.7); }
.breadcrumb a:hover { color: #a78bfa; }
.breadcrumb li:not(:last-child)::after {
  content: '/';
  margin-left: 0.5rem;
  opacity: 0.5;
}`;

// ── Shared nav/footer ──
function nav(rootRel, activePage) {
  const navLinks = [
    { href: '/', label: 'Home', active: activePage === 'home' },
    { href: '/news/', label: 'News', active: activePage === 'news' },
    { href: '/guides/', label: 'Guides', active: activePage === 'guides' },
    { href: '/decks/', label: 'Top Decks', active: activePage === 'decks' },
    { href: '/draft/', label: 'Draft', active: activePage === 'draft' },
    { href: '/tools/lands/', label: 'Lands', active: activePage === 'lands' },
    { href: '/tools/manabase/', label: 'Mana Base', active: activePage === 'manabase' },
    { href: '/about.html', label: 'About', active: activePage === 'about' },
    { href: '/contact.html', label: 'Contact', active: activePage === 'contact' }
  ].map(link => `<li><a href="${rootRel}${link.href}"${link.active ? ' class="active"' : ''}>${link.label}</a></li>`).join('\n                ');
  return `    <nav class="nav">
        <div class="container nav-content">
            <a href="/" class="nav-logo">ScrollVault</a>
            <button class="mobile-menu-btn" onclick="document.getElementById('navLinks').classList.toggle('active')">&#9776;</button>
            <ul class="nav-links" id="navLinks">
                ${navLinks}
            </ul>
        </div>
    </nav>`;
}

function footer(rootRel) {
  return `    <footer>
        <div class="container">
            <div class="footer-content">
                <div class="footer-logo">ScrollVault</div>
                <div class="wubrg-dots">
                    <span class="mana-dot" style="background: #F9FAF4"></span>
                    <span class="mana-dot" style="background: #0E68AB"></span>
                    <span class="mana-dot" style="background: #150B00; border: 1px solid rgba(255,255,255,0.2)"></span>
                    <span class="mana-dot" style="background: #D3202A"></span>
                    <span class="mana-dot" style="background: #00733E"></span>
                </div>
                <p class="footer-text">&copy; 2026 scrollvault.net. Magic: The Gathering is a trademark of Wizards of the Coast. Card images &copy; Wizards of the Coast via Scryfall.</p>
                <ul class="footer-links">
                    <li><a href="${rootRel}/privacy.html">Privacy Policy</a></li>
                    <li><a href="${rootRel}/terms.html">Terms of Service</a></li>
                    <li><a href="${rootRel}/contact.html">Contact</a></li>
                    <li><a href="${rootRel}/about/authors.html">Authors</a></li>
                    <li><a href="${rootRel}/about/editorial-policy.html">Editorial Policy</a></li>
                </ul>
            </div>
        </div>
    </footer>`;
}

function head(title, description, rootRel, ogImage, options = {}) {
  const { pageUrl = '', ogType = 'article', ldJson = null } = options;
  const canonicalTag = pageUrl ? `<link rel="canonical" href="${esc(pageUrl)}">` : '';
  const ogUrlTag = pageUrl ? `<meta property="og:url" content="${esc(pageUrl)}">` : '';
  const ogTypeTag = `<meta property="og:type" content="${esc(ogType)}">`;
  const ogTags = ogImage ? `
    <meta property="og:image" content="${esc(ogImage)}">
    <meta property="og:image:width" content="626">
    <meta property="og:image:height" content="457">` : '';
  const ldJsonTag = ldJson ? `<script type="application/ld+json">${JSON.stringify(ldJson)}</script>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${canonicalTag}<title>${esc(title)} | scrollvault.net</title>
    <meta name="description" content="${esc(description)}">
    ${ogUrlTag}${ogTypeTag}
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:site_name" content="ScrollVault">${ogTags}
    ${ldJsonTag}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/base.css">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-1CV3DS33WK"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-1CV3DS33WK');</script>`;
}

// ── INDEX PAGE ──
const INDEX_CSS = `
.hero-featured { position: relative; min-height: 500px; background-size: cover; background-position: center; display: flex; align-items: flex-end; }
.hero-featured .hero-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.25) 100%); }
.hero-featured .hero-content { position: relative; z-index: 1; padding: 3rem 0; width: 100%; }
.hero-featured .post-category { display: inline-block; padding: 0.3rem 0.85rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem; }
.hero-featured h1 { font-size: 2.75rem; margin-bottom: 1rem; line-height: 1.2; max-width: 700px; }
.hero-featured .hero-excerpt { color: var(--text-secondary); font-size: 1.1rem; max-width: 600px; line-height: 1.7; margin-bottom: 1.5rem; }
.hero-cta { display: inline-block; padding: 0.75rem 2rem; background: var(--gradient-purple); border-radius: 8px; font-weight: 600; font-size: 0.95rem; color: white; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.hero-cta:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(139,92,246,0.4); color: white; }
.hero-attribution { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem; font-style: italic; }
.featured-section { padding: 2rem 0; }
.featured-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
.featured-card { position: relative; height: 240px; background-size: cover; background-position: center; border-radius: 12px; overflow: hidden; display: flex; align-items: flex-end; transition: transform 0.3s ease, box-shadow 0.3s ease; }
.featured-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg), 0 0 30px var(--card-hover-glow); }
.featured-card-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 60%, transparent 100%); border-radius: 12px; }
.featured-card-content { position: relative; z-index: 1; padding: 1.25rem; width: 100%; }
.featured-card .post-category { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; }
.featured-card h3 { font-size: 1.05rem; line-height: 1.3; margin-bottom: 0.4rem; }
.featured-card .post-date { font-size: 0.75rem; color: var(--text-muted); }
.filter-section { padding: 2rem 0; border-bottom: 1px solid var(--card-border); }
.filter-buttons { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.75rem; }
.filter-btn { background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text-secondary); padding: 0.5rem 1.25rem; border-radius: 2rem; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; font-family: inherit; }
.filter-btn:hover { border-color: rgba(139,92,246,0.5); color: var(--text-primary); }
.filter-btn.active { background: var(--gradient-purple); border-color: transparent; color: white; }
.content-wrapper { display: grid; grid-template-columns: 1fr; gap: 2rem; padding: 2rem 0 4rem; }
.posts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; }
.post-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; transition: transform 0.3s ease, box-shadow 0.3s ease; display: flex; flex-direction: column; cursor: pointer; }
.post-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg), 0 0 30px var(--card-hover-glow); }
.post-card a.card-link { display: flex; flex-direction: column; flex: 1; color: inherit; text-decoration: none; }
.post-thumbnail { height: 180px; width: 100%; position: relative; overflow: hidden; background-size: cover; background-position: center; }
.post-thumbnail::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.6) 100%); }
.post-content { padding: 1.25rem; display: flex; flex-direction: column; flex: 1; }
.post-category { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.75rem; width: fit-content; }
.category-news { background: var(--pill-news); color: white; }
.category-strategy { background: var(--pill-strategy); color: white; }
.category-spoilers { background: var(--pill-spoilers); color: white; }
.category-deck-guides { background: var(--pill-deck-guides); color: white; }
.category-set-reviews { background: var(--pill-set-reviews); color: white; }
.post-title { font-size: 1.125rem; margin-bottom: 0.75rem; line-height: 1.4; }
.post-excerpt { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.25rem; flex: 1; }
.post-meta { display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); font-size: 0.8rem; padding-top: 1rem; border-top: 1px solid var(--card-border); }
.read-more { color: #a78bfa; font-weight: 600; font-size: 0.875rem; margin-top: 0.75rem; display: inline-flex; align-items: center; gap: 0.25rem; }
.read-more:hover { color: #c4b5fd; }
.sidebar { display: none; }
@media (min-width: 992px) { .content-wrapper { grid-template-columns: 1fr 320px; } .sidebar { display: block; } }
.sidebar-widget { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
.widget-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--card-border); }
.search-box input { width: 100%; padding: 0.75rem 1rem; background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem; font-family: inherit; }
.search-box input:focus { outline: none; border-color: #8b5cf6; }
.search-box input::placeholder { color: var(--text-muted); }
.recent-posts { list-style: none; }
.recent-post-item { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--card-border); }
.recent-post-item:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
.recent-post-thumb { width: 56px; height: 42px; border-radius: 6px; background-size: cover; background-position: center; flex-shrink: 0; }
.recent-posts a { font-size: 0.875rem; color: var(--text-secondary); display: block; line-height: 1.4; }
.recent-posts a:hover { color: var(--text-primary); }
.recent-post-date { font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 0.25rem; }
.categories-list { list-style: none; }
.categories-list li { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--card-border); cursor: pointer; }
.categories-list li:last-child { border-bottom: none; }
.category-name { display: flex; align-items: center; gap: 0.5rem; }
.category-dot { width: 8px; height: 8px; border-radius: 50%; }
.category-count { background: rgba(255,255,255,0.08); padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.75rem; color: var(--text-muted); }
.about-widget { text-align: center; }
.about-avatar { width: 80px; height: 80px; margin: 0 auto 1rem; background: var(--gradient-purple); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; }
.about-text { color: var(--text-secondary); font-size: 0.875rem; line-height: 1.6; }
.post-card.hidden { display: none; }
@media (max-width: 768px) {
    .hero-featured { min-height: 360px; }
    .hero-featured h1 { font-size: 1.75rem; }
    .featured-grid { grid-template-columns: 1fr; }
    .featured-card { height: 180px; }
    .posts-grid { grid-template-columns: 1fr; }
    .filter-btn { padding: 0.4rem 1rem; font-size: 0.85rem; }
}
@media (min-width: 769px) and (max-width: 991px) {
    .featured-grid { grid-template-columns: repeat(2, 1fr); }
    .posts-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 992px) { .posts-grid { grid-template-columns: repeat(3, 1fr); } }`;

// ── POST PAGE CSS ──
const POST_CSS = `
.article-hero { position: relative; min-height: 400px; background-size: cover; background-position: center top; display: flex; align-items: flex-end; }
.article-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(15,15,15,1) 0%, rgba(15,15,15,0.7) 40%, rgba(0,0,0,0.3) 100%); }
.article-hero-content { position: relative; z-index: 1; max-width: 800px; margin: 0 auto; padding: 2rem 1rem; width: 100%; }
.article-hero .breadcrumb { font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-bottom: 1.5rem; }
.article-hero .breadcrumb a { color: rgba(255,255,255,0.7); }
.article-hero .breadcrumb a:hover { color: #a78bfa; }
.article-hero .article-category { display: inline-block; padding: 0.3rem 0.85rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem; }
.article-hero .article-title { font-size: 2.25rem; margin-bottom: 1rem; line-height: 1.25; }
.article-hero .article-meta { display: flex; gap: 1.5rem; color: var(--text-muted); font-size: 0.9rem; }
.hero-attribution { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.75rem; font-style: italic; }
.category-news { background: var(--pill-news); color: white; }
.category-strategy { background: var(--pill-strategy); color: white; }
.category-spoilers { background: var(--pill-spoilers); color: white; }
.category-deck-guides { background: var(--pill-deck-guides); color: white; }
.category-set-reviews { background: var(--pill-set-reviews); color: white; }
.article-body { max-width: 800px; margin: 0 auto; padding: 2rem 1rem 4rem; }
.article-body > p:first-of-type::first-letter { float: left; font-size: 3.5rem; line-height: 1; font-weight: 700; margin-right: 0.5rem; margin-top: 0.1rem; font-family: 'Space Grotesk', serif; background: var(--gradient-purple); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.article-body h2 { font-size: 1.5rem; margin: 2rem 0 1rem; color: var(--text-primary); }
.article-body h3 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; color: var(--text-primary); }
.article-body p { color: var(--text-secondary); margin-bottom: 1.25rem; font-size: 1.05rem; line-height: 1.8; }
.article-body pre { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 1.25rem; overflow-x: auto; margin: 1.5rem 0; font-size: 0.9rem; line-height: 1.5; color: var(--text-secondary); }
.article-body ul, .article-body ol { color: var(--text-secondary); margin: 1rem 0 1.25rem 1.5rem; font-size: 1.05rem; line-height: 1.8; }
.article-body li { margin-bottom: 0.5rem; }
.article-body a { color: #a78bfa; text-decoration: underline; }
.article-body blockquote { border-left: 3px solid #a855f7; padding: 1rem 1.5rem; margin: 1.5rem 0; background: rgba(168,85,247,0.05); border-radius: 0 8px 8px 0; }
.article-body blockquote p { color: var(--text-secondary); margin-bottom: 0; }
.card-ref { color: #a78bfa; cursor: pointer; border-bottom: 1px dotted rgba(167,139,250,0.4); position: relative; }
.card-tooltip { display: none; position: fixed; z-index: 9999; pointer-events: none; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
.card-tooltip img { display: block; width: 250px; height: auto; border-radius: 12px; }
.decklist-images { display: flex; gap: 0.5rem; overflow-x: auto; padding: 1rem 0; margin: 0.5rem 0 1.5rem; scrollbar-width: thin; scrollbar-color: #333 transparent; }
.decklist-images img { width: 146px; height: auto; border-radius: 8px; flex-shrink: 0; transition: transform 0.2s ease; }
.decklist-images img:hover { transform: scale(1.05); }
.decklist-images::-webkit-scrollbar { height: 6px; }
.decklist-images::-webkit-scrollbar-track { background: transparent; }
.decklist-images::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
.lead-excerpt { font-size: 1.25rem; line-height: 1.8; color: var(--text-secondary); margin-bottom: 2rem; }
.coming-soon { background: var(--card-bg); border: 1px solid var(--card-border); border-left: 3px solid #a855f7; border-radius: 0 8px 8px 0; padding: 1.5rem 2rem; margin: 2rem 0; }
.coming-soon h3 { font-size: 1.1rem; margin-bottom: 0.5rem; color: var(--text-primary); }
.coming-soon p { font-size: 0.95rem; color: var(--text-muted); margin: 0; }
.article-sources { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--card-border); }
.article-sources h3 { font-size: 1rem; margin-bottom: 0.75rem; }
.article-sources a { color: #a78bfa; font-size: 0.9rem; display: block; margin-bottom: 0.5rem; word-break: break-all; }
.related-posts { max-width: 800px; margin: 0 auto; padding: 0 1rem 4rem; }
.related-posts h2 { font-size: 1.5rem; margin-bottom: 1.5rem; }
.related-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; }
.related-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.related-card:hover { transform: translateY(-2px); box-shadow: 0 0 20px var(--card-hover-glow); }
.related-card a { display: flex; flex-direction: column; }
.related-card-thumb { height: 100px; background-size: cover; background-position: center; }
.related-card-info { padding: 1rem 1.25rem; }
.related-card .rc-category { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; }
.related-card .rc-title { font-size: 1rem; margin-bottom: 0.5rem; line-height: 1.4; }
.related-card .rc-date { font-size: 0.8rem; color: var(--text-muted); }
@media (max-width: 768px) {
    .article-hero { min-height: 300px; }
    .article-hero .article-title { font-size: 1.6rem; }
    .article-body p, .article-body li { font-size: 1rem; }
    .article-body > p:first-of-type::first-letter { font-size: 2.75rem; }
}`;

// ── STATIC PAGE CSS ──
const PAGE_CSS = `
.page-header { padding: 4rem 0 2rem; text-align: center; background: radial-gradient(circle at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 70%); }
.page-header h1 { font-size: 2.25rem; background: var(--gradient-purple); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.page-body { max-width: 800px; margin: 0 auto; padding: 2rem 1rem 4rem; }
.page-body h2 { font-size: 1.4rem; margin: 2rem 0 1rem; }
.page-body p { color: var(--text-secondary); margin-bottom: 1.25rem; font-size: 1.05rem; line-height: 1.8; }
.page-body ul { color: var(--text-secondary); margin: 1rem 0 1.25rem 1.5rem; line-height: 1.8; }
.page-body a { color: #a78bfa; }
.contact-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 2rem; text-align: center; margin: 2rem 0; }
.contact-card a.email-link { display: inline-block; font-size: 1.25rem; color: #a78bfa; font-weight: 600; padding: 0.75rem 2rem; border: 2px solid #a855f7; border-radius: 8px; transition: all 0.2s ease; }
.contact-card a.email-link:hover { background: rgba(168,85,247,0.15); }
@media (max-width: 768px) { .page-header h1 { font-size: 1.75rem; } }`;

// ── Card tooltip JS (vanilla, ~30 lines) ──
const TOOLTIP_JS = `
    <script>
    (function() {
        var tip = document.createElement('div');
        tip.className = 'card-tooltip';
        tip.innerHTML = '<img>';
        document.body.appendChild(tip);
        var img = tip.querySelector('img');
        document.querySelectorAll('.card-ref').forEach(function(el) {
            el.addEventListener('mouseenter', function(e) {
                var src = el.getAttribute('data-img');
                if (!src) return;
                img.src = src;
                tip.style.display = 'block';
                var rect = el.getBoundingClientRect();
                var left = rect.left;
                var top = rect.bottom + 8;
                if (left + 260 > window.innerWidth) left = window.innerWidth - 270;
                if (left < 10) left = 10;
                if (top + 360 > window.innerHeight) top = rect.top - 368;
                tip.style.left = left + 'px';
                tip.style.top = top + 'px';
            });
            el.addEventListener('mouseleave', function() {
                tip.style.display = 'none';
            });
        });
    })();
    </script>`;

// ══════════════════════════════════════
// ── MAIN BUILD ──
// ══════════════════════════════════════
async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const posts = data.posts.filter(p => p.published).sort((a, b) => new Date(b.date) - new Date(a.date));

  // ── Resolve card art for all posts ──
  console.log('Resolving card art from Scryfall...');
  for (const post of posts) {
    await resolvePostImages(post);
    const status = post.hero_image ? `hero: ${post.hero_card_name}` : 'no art found';
    console.log(`  ${post.slug}: ${status} (${(post._cards || []).length} cards)`);
  }
  saveCache();
  console.log(`Card cache: ${Object.keys(cardCache).length} entries`);

  // ── Update posts.json with hero_image fields (save early so data persists even if HTML generation fails) ──
  for (const post of posts) {
    const dataPost = data.posts.find(p => p.id === post.id);
    if (dataPost) {
      dataPost.hero_image = post.hero_image ?? null;
      dataPost.hero_card_name = post.hero_card_name ?? null;
      dataPost.hero_artist = post.hero_artist ?? null;
    }
  }
  data.meta.last_build = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  const categoryCounts = {};
  posts.forEach(p => { categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1; });

  // ── Write shared base CSS to external file ──
  const cssDir = path.join(OUTPUT_DIR, 'css');
  if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true });
  fs.writeFileSync(path.join(cssDir, 'base.css'), CSS.trim());
  console.log('Wrote css/base.css');

  // ── INDEX PAGE ──
  const heroPost = posts[0];
  const featuredPosts = posts.slice(1, 4);
  const gridPosts = posts.slice(4);

  function thumbStyle(post) {
    if (post.hero_image) return `background-image: url('${post.hero_image}'); background-size: cover; background-position: center;`;
    const gradient = post.thumbnail_gradient || CATEGORY_GRADIENTS[post.category] || 'var(--gradient-purple)';
    return `background: ${gradient};`;
  }

  function renderHeroSection() {
    if (!heroPost) return '';
    const catSlug = CATEGORY_SLUGS[heroPost.category] || 'news';
    const bgImage = heroPost.hero_image ? `background-image: url('${heroPost.hero_image}');` : `background: var(--gradient-purple);`;
    const attribution = heroPost.hero_artist ? `\n                <p class="hero-attribution">Art: &ldquo;${esc(heroPost.hero_card_name)}&rdquo; by ${esc(heroPost.hero_artist)}</p>` : '';
    return `        <section class="hero-featured" style="${bgImage} background-size: cover; background-position: center;">
            <div class="hero-overlay"></div>
            <div class="hero-content">
                <div class="container">
                    <span class="post-category category-${catSlug}">${esc(heroPost.category)}</span>
                    <h1><a href="${postUrl(heroPost)}">${esc(heroPost.title)}</a></h1>
                    <p class="hero-excerpt">${esc(heroPost.excerpt)}</p>
                    <a href="${postUrl(heroPost)}" class="hero-cta">Read More &rarr;</a>${attribution}
                </div>
            </div>
        </section>`;
  }

  function renderFeaturedSection() {
    if (!featuredPosts.length) return '';
    return `        <section class="featured-section">
            <div class="container">
                <div class="featured-grid">
${featuredPosts.map(post => {
  const catSlug = CATEGORY_SLUGS[post.category] || 'news';
  const bg = post.hero_image ? `background-image: url('${post.hero_image}');` : `background: ${post.thumbnail_gradient || CATEGORY_GRADIENTS[post.category] || 'var(--gradient-purple)'};`;
  return `                    <a href="${postUrl(post)}" class="featured-card" style="${bg} background-size: cover; background-position: center;">
                        <div class="featured-card-overlay"></div>
                        <div class="featured-card-content">
                            <span class="post-category category-${catSlug}">${esc(post.category)}</span>
                            <h3>${esc(post.title)}</h3>
                            <span class="post-date">${formatDate(post.date)}</span>
                        </div>
                    </a>`;
}).join('\n')}
                </div>
            </div>
        </section>`;
  }

  function renderPostCards() {
    if (!gridPosts.length) return '';
    return gridPosts.map(post => {
      const catSlug = CATEGORY_SLUGS[post.category] || 'news';
      const style = thumbStyle(post);
      const href = postUrl(post);
      return `                <article class="post-card" data-category="${catSlug}">
                    <a href="${href}" class="card-link">
                        <div class="post-thumbnail" style="${style}"></div>
                        <div class="post-content">
                            <span class="post-category category-${catSlug}">${esc(post.category)}</span>
                            <h2 class="post-title">${esc(post.title)}</h2>
                            <p class="post-excerpt">${esc(post.excerpt)}</p>
                            <div class="post-meta">
                                <span class="post-author">${esc(post.author)}</span>
                                <span class="post-date">${formatDate(post.date)}</span>
                            </div>
                            <span class="read-more">Read More &rarr;</span>
                        </div>
                    </a>
                </article>`;
    }).join('\n\n');
  }

  function renderRecentPosts() {
    return posts.slice(0, 5).map(post => {
      const ts = thumbStyle(post);
      return `                        <li class="recent-post-item">
                            <div class="recent-post-thumb" style="${ts}"></div>
                            <div>
                                <a href="${postUrl(post)}">${esc(post.title)}</a>
                                <span class="recent-post-date">${formatDate(post.date)}</span>
                            </div>
                        </li>`;
    }).join('\n');
  }

  function renderCategories() {
    const cats = ['News', 'Strategy', 'Spoilers', 'Deck Guides', 'Set Reviews'];
    return cats.map(cat => {
      const pill = CATEGORY_PILLS[cat];
      const slug = CATEGORY_SLUGS[cat];
      const count = categoryCounts[cat] || 0;
      return `                        <li onclick="document.querySelector('[data-filter=${slug}]').click()">
                            <span class="category-name">
                                <span class="category-dot" style="background: var(${pill});"></span>
                                ${cat}
                            </span>
                            <span class="category-count">${count}</span>
                        </li>`;
    }).join('\n');
  }

  const heroOgImage = heroPost && heroPost.hero_image ? heroPost.hero_image : '';

  
// WebSite structured data for homepage (SEO)


// WebSite structured data for homepage (SEO)
const siteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "ScrollVault",
  "url": SITE_URL,
  "potentialAction": {
    "@type": "SearchAction",
    "target": SITE_URL + "/?s={search_term_string}",
    "query-input": "required name=search_term_string"
  }
};

const indexHtml = `${head('MTG News and Strategy Blog', 'The latest Magic: The Gathering news, strategy guides, deck techs, set reviews, and spoilers.', '', heroOgImage, { pageUrl: '/', ogType: 'website', ldJson: siteSchema })}
    <style>${INDEX_CSS}</style>
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>
${nav('', 'home')}
    <main id="main-content">
${renderHeroSection()}
${renderFeaturedSection()}
        <section class="filter-section">
            <div class="container">
                <div class="filter-buttons">
                    <button class="filter-btn active" data-filter="all">All</button>
                    <button class="filter-btn" data-filter="news">News</button>
                    <button class="filter-btn" data-filter="strategy">Strategy</button>
                    <button class="filter-btn" data-filter="spoilers">Spoilers</button>
                    <button class="filter-btn" data-filter="deck-guides">Deck Guides</button>
                    <button class="filter-btn" data-filter="set-reviews">Set Reviews</button>
                </div>
            </div>
        </section>
        <div class="container content-wrapper">
            <section class="posts-grid" id="postsGrid">
${renderPostCards()}
            </section>
            <aside class="sidebar">
                <div class="sidebar-widget">
                    <h3 class="widget-title">Search</h3>
                    <div class="search-box">
                        <input type="text" placeholder="Search posts..." id="searchInput" oninput="searchPosts()">
                    </div>
                </div>
                <div class="sidebar-widget">
                    <h3 class="widget-title">Recent Posts</h3>
                    <ul class="recent-posts">
${renderRecentPosts()}
                    </ul>
                </div>
                <div class="sidebar-widget">
                    <h3 class="widget-title">Categories</h3>
                    <ul class="categories-list">
${renderCategories()}
                    </ul>
                </div>
                <div class="sidebar-widget about-widget">
                    <h3 class="widget-title">About</h3>
                    <div class="about-avatar">M</div>
                    <p class="about-text">Your go-to spot for Magic: The Gathering news, strategy, and deck tech. Written by players, for players.</p>
                </div>
            </aside>
        </div>
    </main>
${footer('')}
    <script>
        const filterBtns = document.querySelectorAll('.filter-btn');
        const cards = document.querySelectorAll('.post-card');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const f = btn.dataset.filter;
                cards.forEach(c => c.classList.toggle('hidden', f !== 'all' && c.dataset.category !== f));
            });
        });
        function searchPosts() {
            const t = document.getElementById('searchInput').value.toLowerCase();
            cards.forEach(c => {
                const txt = (c.querySelector('.post-title').textContent + ' ' + c.querySelector('.post-excerpt').textContent).toLowerCase();
                c.classList.toggle('hidden', t && !txt.includes(t));
            });
            if (t) { filterBtns.forEach(b => b.classList.remove('active')); document.querySelector('[data-filter="all"]').classList.add('active'); }
        }
    </script>
</body>
</html>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);
  console.log(`Built index with ${posts.length} posts (hero + ${featuredPosts.length} featured + ${gridPosts.length} grid)`);

  // Build hub pages (News and Guides)
  function buildHubPage(slug, title, description, filter) {
    const hubPosts = posts.filter(filter);
    if (hubPosts.length === 0) {
      console.log(`Skipping ${slug} hub: no posts`);
      return;
    }

    const heroPost = hubPosts[0];
    const heroHtml = heroPost ? (() => {
      const catSlug = CATEGORY_SLUGS[heroPost.category] || 'news';
      const bgImage = heroPost.hero_image ? `background-image: url('${heroPost.hero_image}');` : `background: var(--gradient-purple);`;
      const attribution = heroPost.hero_artist ? `\n                <p class="hero-attribution">Art: &ldquo;${esc(heroPost.hero_card_name)}&rdquo; by ${esc(heroPost.hero_artist)}</p>` : '';
      return `        <section class="hero-featured" style="${bgImage} background-size: cover; background-position: center;">
            <div class="hero-overlay"></div>
            <div class="hero-content">
                <div class="container">
                    <span class="post-category category-${catSlug}">${esc(heroPost.category)}</span>
                    <h1><a href="${postUrl(heroPost)}">${esc(heroPost.title)}</a></h1>
                    <p class="hero-excerpt">${esc(heroPost.excerpt)}</p>
                    <a href="${postUrl(heroPost)}" class="hero-cta">Read More &rarr;</a>${attribution}
                </div>
            </div>
        </section>`;
    })() : `        <section class="hero-featured" style="background: var(--gradient-purple);">
            <div class="hero-overlay"></div>
            <div class="hero-content">
                <div class="container">
                    <h1>${esc(title)}</h1>
                    <p class="hero-excerpt">${esc(description)}</p>
                </div>
            </div>
        </section>`;

    const gridPosts = heroPost ? hubPosts.slice(1) : hubPosts;

    const gridHtml = gridPosts.map(post => {
      const catSlug = CATEGORY_SLUGS[post.category] || 'news';
      const style = thumbStyle(post);
      const href = postUrl(post);
      return `                <article class="post-card" data-category="${catSlug}">
                    <a href="${href}" class="card-link">
                        <div class="post-thumbnail" style="${style}"></div>
                        <div class="post-content">
                            <span class="post-category category-${catSlug}">${esc(post.category)}</span>
                            <h2 class="post-title">${esc(post.title)}</h2>
                            <p class="post-excerpt">${esc(post.excerpt)}</p>
                            <div class="post-meta">
                                <span class="post-author">${esc(post.author)}</span>
                                <span class="post-date">${formatDate(post.date)}</span>
                            </div>
                            <span class="read-more">Read More &rarr;</span>
                        </div>
                    </a>
                </article>`;
    }).join('\n\n');

    const recentHtml = posts.slice(0,5).map(post => {
      const ts = thumbStyle(post);
      return `                        <li class="recent-post-item">
                            <div class="recent-post-thumb" style="${ts}"></div>
                            <div>
                                <a href="${postUrl(post)}">${esc(post.title)}</a>
                                <span class="recent-post-date">${formatDate(post.date)}</span>
                            </div>
                        </li>`;
    }).join('\n');

    const categoriesHtml = ['News', 'Strategy', 'Spoilers', 'Deck Guides', 'Set Reviews'].map(cat => {
      const pill = CATEGORY_PILLS[cat];
      const slugCat = CATEGORY_SLUGS[cat];
      const count = categoryCounts[cat] || 0;
      return `                        <li onclick="document.querySelector('[data-filter=${slugCat}]').click()">
                            <span class="category-name">
                                <span class="category-dot" style="background: var(${pill});"></span>
                                ${cat}
                            </span>
                            <span class="category-count">${count}</span>
                        </li>`;
    }).join('\n');

    const hubHtml = `${head(title, description, '', heroPost && heroPost.hero_image ? heroPost.hero_image : '', { pageUrl: '/' + slug + '/', ogType: 'website' })}
    <style>${INDEX_CSS}</style>
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>
${nav('', slug === 'news' ? 'news' : 'guides')}
    <main id="main-content">
${heroHtml}
        <div class="container content-wrapper">
            <section class="posts-grid" id="postsGrid">
${gridHtml}
            </section>
            <aside class="sidebar">
                <div class="sidebar-widget">
                    <h3 class="widget-title">Search</h3>
                    <div class="search-box">
                        <input type="text" placeholder="Search posts..." id="searchInput" oninput="searchPosts()">
                    </div>
                </div>
                <div class="sidebar-widget">
                    <h3 class="widget-title">Recent Posts</h3>
                    <ul class="recent-posts">
${recentHtml}
                    </ul>
                </div>
                <div class="sidebar-widget">
                    <h3 class="widget-title">Categories</h3>
                    <ul class="categories-list">
${categoriesHtml}
                    </ul>
                </div>
                <div class="sidebar-widget about-widget">
                    <h3 class="widget-title">About</h3>
                    <div class="about-avatar">M</div>
                    <p class="about-text">Your go-to spot for Magic: The Gathering news, strategy, and deck tech. Written by players, for players.</p>
                </div>
            </aside>
        </div>
    </main>
${footer('')}
    <script>
        const filterBtns = document.querySelectorAll('.filter-btn');
        const cards = document.querySelectorAll('.post-card');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const f = btn.dataset.filter;
                cards.forEach(c => c.classList.toggle('hidden', f !== 'all' && c.dataset.category !== f));
            });
        });
        function searchPosts() {
            const t = document.getElementById('searchInput').value.toLowerCase();
            cards.forEach(c => {
                const txt = (c.querySelector('.post-title').textContent + ' ' + c.querySelector('.post-excerpt').textContent).toLowerCase();
                c.classList.toggle('hidden', t && !txt.includes(t));
            });
            if (t) { filterBtns.forEach(b => b.classList.remove('active')); document.querySelector('[data-filter="all"]').classList.add('active'); }
        }
    </script>
</body>
</html>`;

    const outDir = path.join(OUTPUT_DIR, slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), hubHtml);
    console.log(`Built ${slug}/index.html (${hubPosts.length} posts)`);
  }

  // Build hub pages
  buildHubPage('news', 'MTG News', 'Breaking news, ban updates, tournament results, and announcements from the world of Magic: The Gathering.', p => p.category === 'News');
  buildHubPage('guides', 'MTG Guides', 'Strategy guides, deck techs, and in-depth analysis to help you master any format.', p => p.category === 'Strategy' || p.category === 'Deck Guides');

  // ── INDIVIDUAL POST PAGES ──
  posts.forEach((post) => {
    const catSlug = CATEGORY_SLUGS[post.category] || 'news';
    const hasBody = post.body && post.body.trim().length > 0;
    const hasCards = post._cards && post._cards.length > 0;

    // Process body with tooltips and decklist images
    let bodyContent;
    if (hasBody) {
      bodyContent = hasCards ? processPostBody(post.body, post._cards, post.category) : post.body;
    } else {
      // Empty-body post: styled excerpt + coming soon
      bodyContent = `<p class="lead-excerpt">${esc(post.excerpt)}</p>
        <div class="coming-soon">
            <h3>Full Article Coming Soon</h3>
            <p>This article is being written and will be published shortly. Check back for the full breakdown.</p>
        </div>`;
    }

    // Hero banner
    const heroStyle = post.hero_image
      ? `background-image: url('${post.hero_image}'); background-size: cover; background-position: center top;`
      : `background: radial-gradient(circle at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 70%);`;
    const attribution = post.hero_artist
      ? `\n                <p class="hero-attribution">Art: &ldquo;${esc(post.hero_card_name)}&rdquo; by ${esc(post.hero_artist)}</p>` : '';

    // Related posts
    const related = posts.filter(p => p.id !== post.id && p.category === post.category).slice(0, 3);
    if (related.length < 3) {
      const more = posts.filter(p => p.id !== post.id && p.category !== post.category).slice(0, 3 - related.length);
      related.push(...more);
    }

    const relatedHtml = related.length ? `
    <section class="related-posts">
        <h2>Related Posts</h2>
        <div class="related-grid">
${related.map(r => {
  const rSlug = CATEGORY_SLUGS[r.category] || 'news';
  const pillVar = CATEGORY_PILLS[r.category] || '--pill-news';
  const rThumb = r.hero_image
    ? `background-image: url('${r.hero_image}'); background-size: cover; background-position: center;`
    : `background: ${r.thumbnail_gradient || CATEGORY_GRADIENTS[r.category] || 'var(--gradient-purple)'};`;
  return `            <div class="related-card">
                <a href="/posts/${r.slug}.html">
                    <div class="related-card-thumb" style="${rThumb}"></div>
                    <div class="related-card-info">
                        <div class="rc-category" style="color: var(${pillVar})">${esc(r.category)}</div>
                        <div class="rc-title">${esc(r.title)}</div>
                        <div class="rc-date">${formatDate(r.date)}</div>
                    </div>
                </a>
            </div>`;
}).join('\n')}
        </div>
    </section>` : '';

    const sourcesHtml = (post.source_urls && post.source_urls.length) ? `
        <div class="article-sources">
            <h3>Sources</h3>
            ${post.source_urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('\n            ')}
        </div>` : '';

    // JSON-LD schemas for SEO
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": post.title,
      "datePublished": post.date + "T00:00:00Z",
      "dateModified": post.date + "T00:00:00Z",
      "author": { "@type": "Organization", "name": "ScrollVault" },
      "publisher": { "@type": "Organization", "name": "ScrollVault" },
      "image": post.hero_image || ""
    };
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
        { "@type": "ListItem", "position": 2, "name": post.category, "item": "/" },
        { "@type": "ListItem", "position": 3, "name": post.title, "item": `/posts/${post.slug}.html` }
      ]
    };

    const postHtml = `${head(post.title, post.excerpt, '..', post.hero_image || '', { pageUrl: '/posts/' + post.slug + '.html', ogType: 'article' })}
    <style>${POST_CSS}</style>
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>
${nav('..', '')}
    <main id="main-content">
        <article itemscope itemtype="https://schema.org/Article">
            <header class="article-hero" style="${heroStyle}">
                <div class="article-hero-overlay"></div>
                <div class="article-hero-content">
                    <nav class="breadcrumb" aria-label="Breadcrumb">
                        <ol>
                            <li><a href="/">Home</a></li>
                            <li><a href="/">${esc(post.category)}</a></li>
                            <li>${esc(post.title)}</li>
                        </ol>
                    </nav>
                    <span class="article-category category-${catSlug}">${esc(post.category)}</span>
                    <h1 class="article-title" itemprop="headline">${esc(post.title)}</h1>
                    <div class="article-meta">
                        <span>By ${esc(post.author)}</span>
                        <time datetime="${post.date}" itemprop="datePublished">${formatDateLong(post.date)}</time>
                    </div>${attribution}
                </div>
            </header>
            <section class="article-body" itemprop="articleBody">
${bodyContent}
${sourcesHtml}
            </section>
        </article>
${relatedHtml}
    </main>
${footer('..')}
${hasCards ? TOOLTIP_JS : ''}
<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
</body>
</html>`;

    fs.writeFileSync(path.join(POSTS_OUT_DIR, `${post.slug}.html`), postHtml);
  });
  console.log(`Built ${posts.length} post pages to ${POSTS_OUT_DIR}`);

  // ── STATIC PAGES ──
  function writePage(filename, title, activePage, bodyHtml) {
    const html = `${head(title, title + ' - scrollvault.net', '', '', { pageUrl: '/' + filename, ogType: 'website' })}
    <style>${PAGE_CSS}</style>
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>
${nav('', activePage)}
    <main id="main-content">
        <header class="page-header">
            <div class="container"><h1>${esc(title)}</h1></div>
        </header>
        <div class="page-body">
${bodyHtml}
        </div>
    </main>
${footer('')}
</body>
</html>`;
    const outPath = path.join(OUTPUT_DIR, filename);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    console.log(`Built ${filename}`);
  }

  writePage('about.html', 'About', 'about', `
            <p>Welcome to <strong>ScrollVault</strong> &mdash; your daily source for Magic: The Gathering news, competitive strategy, deck guides, spoiler breakdowns, and set reviews.</p>
            <h2>What We Cover</h2>
            <ul>
                <li><strong>Breaking News</strong> &mdash; Ban list updates, tournament results, Wizards announcements, and Arena patch notes</li>
                <li><strong>Strategy</strong> &mdash; Format guides, metagame analysis, draft walkthroughs, and matchup breakdowns</li>
                <li><strong>Deck Guides</strong> &mdash; Budget builds, competitive lists, and sideboard tech for every format</li>
                <li><strong>Spoilers</strong> &mdash; Card reveals, set speculation, and first impressions from upcoming releases</li>
                <li><strong>Set Reviews</strong> &mdash; Comprehensive breakdowns of every new set for Constructed and Limited</li>
            </ul>
            <h2>Interactive Tools</h2>
            <p>We've built a suite of MTG tools to help you optimize your decks:</p>
            <ul>
                <li><strong><a href="/decks/">Top Decks</a></strong> - Competitive decklists across all formats</li>
                <li><strong><a href="/tools/lands/">Dual Land Reference Guide</a></strong> - Compare every fetch, shock, check, and fast land</li>
                <li><strong><a href="/tools/manabase/">Mana Base Calculator</a></strong> - Calculate optimal land counts for your colors</li>
                <li><strong><a href="/draft/">Draft Tool</a></strong> - In-progress drafting assistant</li>
            </ul>
            <h2>Who We Are</h2>
            <p>We're a team of dedicated Magic players who have been slinging cardboard since the early days. This blog runs on a mix of human passion and AI-assisted research to bring you timely, accurate coverage of everything happening in the world of MTG.</p>
            <p>Have a tip, correction, or just want to talk Magic? Drop us a line at <a href="mailto:support@scrollvault.net">support@scrollvault.net</a>.</p>`);

  writePage('contact.html', 'Contact', 'contact', `
            <p>Got a story tip? Spotted an error? Just want to talk about your latest draft train wreck? We'd love to hear from you.</p>
            <div class="contact-card">
                <p style="margin-bottom: 1rem; color: var(--text-secondary);">Reach us at</p>
                <a href="mailto:support@scrollvault.net" class="email-link">support@scrollvault.net</a>
            </div>
            <h2>What We're Looking For</h2>
            <ul>
                <li>News tips and tournament reports</li>
                <li>Corrections or factual errors in our posts</li>
                <li>Guest post pitches (strategy, deck guides, set reviews)</li>
                <li>Partnership and advertising inquiries</li>
            </ul>
            <p>We try to respond within 24 hours. If it's urgent MTG news, put "BREAKING" in the subject line.</p>`);

  writePage('privacy.html', 'Privacy Policy', '', `
            <p><em>Last updated: February 6, 2026</em></p>
            <h2>Information We Collect</h2>
            <p>This site is a static blog. We do not collect personal information, use cookies for tracking, or require user accounts. Standard web server logs (IP address, browser type, pages visited) are maintained by our hosting provider for security purposes and are not shared with third parties.</p>
            <h2>Third-Party Services</h2>
            <p>We use Google Fonts to serve typefaces. Google may collect anonymous usage data per their privacy policy. No other third-party analytics, advertising, or tracking services are used on this site.</p>
            <h2>External Links</h2>
            <p>Our posts may link to external sites (Wizards of the Coast, MTGGoldfish, etc.). We are not responsible for the privacy practices of those sites.</p>
            <h2>Contact</h2>
            <p>Questions about this policy? Email <a href="mailto:support@scrollvault.net">support@scrollvault.net</a>.</p>`);

  writePage('terms.html', 'Terms of Service', '', `
            <p><em>Last updated: February 6, 2026</em></p>
            <h2>Content</h2>
            <p>All original content on scrollvault.net is provided for informational and entertainment purposes. Magic: The Gathering, all card names, and related imagery are trademarks of Wizards of the Coast LLC. This site is not affiliated with or endorsed by Wizards of the Coast.</p>
            <h2>Fair Use</h2>
            <p>Card names, game mechanics, and tournament results referenced in our articles fall under fair use for commentary, criticism, and news reporting purposes.</p>
            <h2>Accuracy</h2>
            <p>We strive for accuracy but cannot guarantee all information is error-free. If you spot a mistake, please <a href="/contact.html">contact us</a> and we'll correct it.</p>
            <h2>Use of This Site</h2>
            <p>You may read, share, and link to our content freely. Reproduction of full articles requires permission. Brief excerpts with attribution and a link back are welcome.</p>`);

  

  // New trust and hub pages (feature/hubs-trust-2026-02-13)
  writePage('guides/mana-bases.html', 'Master the fundamentals of building mana bases for Magic: The Gathering. Learn land counts, color balance, and how to use our calculator for any format.', 'guides', `
            <p>Building a solid mana base is the foundation of any successful Magic deck. Whether you're in Standard, Modern, Pioneer, or Commander, understanding how many lands you need, how to balance your colors, and when to play special lands is critical.</p>
            <h2>Key Principles</h2>
            <p><strong>Color Balance:</strong> Ensure you have enough sources for each color in your mana cost. Use our <a href="/tools/manabase/">Mana Base Calculator</a> to get precise numbers.</p>
            <p><strong>Mana Curve:</strong> Higher curves need more lands; low curves can shave a few.</p>
            <p><strong>Format Considerations:</strong> Some formats have fetch lands, shock lands, or fast lands that affect your decisions.</p>
            <h2>Land Count Guidelines</h2>
            <ul>
                <li>Standard: 24-26 lands (depending on curve)</li>
                <li>Modern: 24-26 lands with mana fixers</li>
                <li>Pioneer: 24-26 lands</li>
                <li>Commander: 36-38 lands on average, with 10+ ramp pieces</li>
            </ul>
            <h2>Dual Lands and Mana Fixing</h2>
            <p>Dual lands are the backbone of multicolored decks. Check our <a href="/guides/dual-lands.html">Dual Land Cycles</a> guide for a complete list of fetch, shock, check, and fast lands and which formats they're legal in.</p>
            <h2>Using the Calculator</h2>
            <p>Our <a href="/tools/manabase/">Mana Base Calculator</a> lets you input your deck's color distribution and get tailored land recommendations. It's a great starting point, but always playtest and adjust.</p>
        `);
  writePage('guides/dual-lands.html', 'Comprehensive reference of all dual land cycles in MTG: fetch lands, shock lands, fast lands, check lands, and more. Includes format legality and examples.', 'guides', `
            <p>Dual lands are the backbone of multicolored decks. Over the years, Wizards has printed several cycles, each with unique mechanics and format legality.</p>
            <h2>Major Cycles</h2>
            <ul>
                <li><strong>Fetch Lands</strong> (e.g., <em>Scalding Tarn</em>): Search for a land with one of two land types. Legal in Modern, Legacy, Commander; restricted in Pioneer.</li>
                <li><strong>Shock Lands</strong> (e.g., <em>Bloodstained Mire</em>): Enters tapped unless you take 2 damage. Legal in Standard (some), Pioneer, Modern, Legacy, Commander.</li>
                <li><strong>Fast Lands</strong> (e.g., <em>Spire of Industry</em>): Enters untapped if you control two or more other lands of the appropriate types. Legal in Modern, Legacy, Commander; not in Standard.</li>
                <li><strong>Check Lands</strong> (e.g., <em>Glacial Fortress</em>): Enters untapped if you control a basic land of one of its types. Legal in Standard (some), Modern, etc.</li>
            </ul>
            <h2>Complete Tables</h2>
            <p>We are building detailed tables for each cycle with images, manacost, conditions, and format legality. Stay tuned.</p>
            <h2>Related Tools</h2>
            <p>Use our <a href="/tools/manabase/">Mana Base Calculator</a> to determine how many duals to play in your deck.</p>
        `);
  writePage('about/authors.html', 'Meet the writers behind ScrollVault. Expert Magic players providing daily news, strategy, and deck guides.', 'about', `
            <p>ScrollVault is written by a team of dedicated Magic players who have been slinging cardboard since the early days. We combine human passion with AI-assisted research to bring you timely, accurate coverage.</p>
            <h2>Molts MTG</h2>
            <p>Founder and lead writer. A long-time Spike who loves breaking the meta. Favorite format: Modern. Follow on Twitter @moltsmtg.</p>
            <h2>Contributors</h2>
            <p>We occasionally feature guest writers from the community. If you're interested in contributing, <a href="/contact.html">get in touch</a>.</p>
        `);
  writePage('about/editorial-policy.html', 'Our editorial policy: sources, fact-checking, corrections, and transparency. How we maintain accuracy for MTG coverage.', 'about', `
            <p>At ScrollVault, we are committed to providing accurate, helpful, and transparent content for the Magic: The Gathering community.</p>
            <h2>Sources</h2>
            <p>We rely on official sources (Wizards of the Coast announcements, MTG Arena patch notes) and reputable community sites (MTGGoldfish, ChannelFireball, Star City Games) for news and data. Card information is fetched from Scryfall.</p>
            <h2>Fact-Checking Process</h2>
            <p>Every article goes through an automated fact-checker that verifies card names, rules text, and basic claims against Scryfall and official documents. Human editors review drafts for clarity and tone.</p>
            <h2>Corrections</h2>
            <p>If you spot an error, please <a href="/contact.html">contact us</a>. We will correct the mistake and note the update at the bottom of the article.</p>
            <h2>Update Cadence</h2>
            <p>Evergreen guides (e.g., mana bases, dual lands) are reviewed quarterly. News articles are published as events occur.</p>
            <h2>Affiliate Links</h2>
            <p>We use TCGplayer affiliate links to support the site. This does not affect your purchase price.</p>
        `);
  // ── SITEMAP ──
  const today = new Date().toISOString().split('T')[0];
  const sitemapUrls = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/news/', changefreq: 'daily', priority: '0.8' },
    { loc: '/guides/', changefreq: 'weekly', priority: '0.8' },
    { loc: '/about.html', changefreq: 'monthly', priority: '0.5' },
    { loc: '/contact.html', changefreq: 'monthly', priority: '0.5' },
    { loc: '/privacy.html', changefreq: 'yearly', priority: '0.3' },
    { loc: '/terms.html', changefreq: 'yearly', priority: '0.3' },
    { loc: '/about/authors.html', changefreq: 'monthly', priority: '0.4' },
    { loc: '/about/editorial-policy.html', changefreq: 'monthly', priority: '0.4' },
    { loc: '/guides/mana-bases.html', changefreq: 'monthly', priority: '0.6' },
    { loc: '/guides/dual-lands.html', changefreq: 'monthly', priority: '0.6' },
    // Hand-crafted pages
    { loc: '/decks/', changefreq: 'weekly', priority: '0.8' },
    { loc: '/draft/', changefreq: 'monthly', priority: '0.7' },
    { loc: '/tools/manabase/', changefreq: 'monthly', priority: '0.7' },
    { loc: '/tools/lands/', changefreq: 'monthly', priority: '0.7' },
  ];

  // Add all published posts
  const publishedPosts = data.posts.filter(p => p.published);
  for (const post of publishedPosts) {
    sitemapUrls.push({
      loc: `/posts/${post.slug}.html`,
      lastmod: post.date,
      changefreq: 'monthly',
      priority: '0.6'
    });
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${SITE_URL}${u.loc}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemapXml);
  console.log(`Sitemap generated with ${sitemapUrls.length} URLs.`);

  // ── Sync shared assets and hand-crafted pages when building to a different output dir ──
  if (OUTPUT_DIR !== ROOT) {
    const syncFiles = ['robots.txt', 'favicon.svg', 'apple-touch-icon.png', '.htaccess'];
    for (const f of syncFiles) {
      const src = path.join(ROOT, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(OUTPUT_DIR, f));
      }
    }
    const syncDirs = ['decks', 'draft', 'tools/manabase', 'tools/lands'];
    for (const d of syncDirs) {
      const src = path.join(ROOT, d);
      const dest = path.join(OUTPUT_DIR, d);
      if (fs.existsSync(src)) {
        fs.mkdirSync(dest, { recursive: true });
        for (const file of fs.readdirSync(src)) {
          const srcFile = path.join(src, file);
          if (fs.statSync(srcFile).isFile()) {
            fs.copyFileSync(srcFile, path.join(dest, file));
          }
        }
      }
    }
    console.log('Synced shared assets and hand-crafted pages to output dir.');
  }

console.log('All pages built successfully.');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});