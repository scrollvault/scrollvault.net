#!/usr/bin/env node
// MTG Blog Builder - generates index.html + individual post pages + static pages
// Uses Scryfall API for automatic card art resolution
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE_URL = "https://scrollvault.net";
const DEFAULT_OG_IMAGE = SITE_URL + '/og-default.png';
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
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('/css/fonts/inter-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Space Grotesk';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('/css/fonts/space-grotesk-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
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
.nav { position: fixed; top: 0; left: 0; right: 0; background: rgba(15,15,15,0.98); border-bottom: 1px solid var(--nav-border); z-index: 1000; height: 64px; display: flex; align-items: center; }
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
    { href: '/tools/', label: 'Tools', active: activePage === 'tools' },
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
  const absoluteUrl = pageUrl ? `https://scrollvault.net${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}` : '';
  const canonicalTag = absoluteUrl ? `<link rel="canonical" href="${esc(absoluteUrl)}">` : '';
  const ogUrlTag = absoluteUrl ? `<meta property="og:url" content="${esc(absoluteUrl)}">` : '';
  const ogTypeTag = `<meta property="og:type" content="${esc(ogType)}">`;
  const effectiveOgImage = ogImage || DEFAULT_OG_IMAGE;
  const ogTags = `
    <meta property="og:image" content="${esc(effectiveOgImage)}">
    <meta property="og:image:alt" content="${esc(title)}">`;
  const twitterTags = `
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@scrollvault">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${esc(effectiveOgImage)}">
    <meta name="twitter:image:alt" content="${esc(title)}">`;
  const ldJsonTag = ldJson ? `<script type="application/ld+json">${JSON.stringify(ldJson)}</script>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="index, follow">
    ${canonicalTag}<title>${esc(title)} | ScrollVault</title>
    <meta name="description" content="${esc(description)}">
    ${ogUrlTag}${ogTypeTag}
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:site_name" content="ScrollVault">
    <meta property="og:locale" content="en_US">${ogTags}${twitterTags}
    ${ldJsonTag}
    <link rel="preload" href="/css/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/css/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/css/base.css">
    <link rel="stylesheet" href="/css/pages.css">
    <link rel="alternate" type="application/rss+xml" title="ScrollVault RSS Feed" href="/feed.xml">
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-1CV3DS33WK"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-1CV3DS33WK');</script>`;
}

// ── HUB PAGE CSS (News/Guides pages — cloned from original index) ──
const HUB_CSS = `
.hero-featured { position: relative; min-height: 500px; background-size: cover; background-position: center; display: flex; align-items: flex-end; }
.hero-featured .hero-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.25) 100%); }
.hero-featured .hero-content { position: relative; z-index: 1; padding: 3rem 0; width: 100%; }
.hero-featured .post-category { display: inline-block; padding: 0.3rem 0.85rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem; }
.hero-featured h1 { font-size: 2.75rem; margin-bottom: 1rem; line-height: 1.2; max-width: 700px; }
.hero-featured .hero-excerpt { color: var(--text-secondary); font-size: 1.1rem; max-width: 600px; line-height: 1.7; margin-bottom: 1.5rem; }
.hero-cta { display: inline-block; padding: 0.75rem 2rem; background: var(--gradient-purple); border-radius: 8px; font-weight: 600; font-size: 0.95rem; color: white; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.hero-cta:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(139,92,246,0.4); color: white; }
.hero-attribution { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem; font-style: italic; }
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
.pillar-guides { padding: 2.5rem 0 0; }
.pillar-guides h2 { font-size: 1.5rem; margin-bottom: 1.25rem; }
.pillar-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
.pillar-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 1.5rem; transition: transform 0.3s ease, box-shadow 0.3s ease; }
.pillar-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg), 0 0 30px var(--card-hover-glow); }
.pillar-card a { color: inherit; text-decoration: none; display: block; }
.pillar-card h3 { font-size: 1.05rem; margin-bottom: 0.5rem; color: var(--text-primary); }
.pillar-card p { color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5; margin: 0; }
.pillar-card .pillar-arrow { color: #a78bfa; font-weight: 600; font-size: 0.875rem; margin-top: 0.75rem; display: inline-block; }
@media (max-width: 768px) {
    .hero-featured { min-height: 360px; }
    .hero-featured h1 { font-size: 1.75rem; }
    .posts-grid { grid-template-columns: 1fr; }
}
@media (min-width: 769px) and (max-width: 991px) {
    .posts-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 992px) { .posts-grid { grid-template-columns: repeat(3, 1fr); } }`;

// ── INDEX PAGE (Authority Hub) ──
const INDEX_CSS = `
/* Screen-reader only */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
/* Hero */
.hero-featured { position: relative; min-height: 420px; background-size: cover; background-position: center; display: flex; align-items: flex-end; }
.hero-featured .hero-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.25) 100%); }
.hero-featured .hero-content { position: relative; z-index: 1; padding: 2.5rem 0; width: 100%; }
.hero-featured .post-category { display: inline-block; padding: 0.3rem 0.85rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1rem; }
.hero-featured h1, .hero-featured h2 { font-size: 2.75rem; margin-bottom: 1rem; line-height: 1.2; max-width: 700px; }
.hero-featured .hero-excerpt { color: var(--text-secondary); font-size: 1.1rem; max-width: 600px; line-height: 1.7; margin-bottom: 1.5rem; }
.hero-cta { display: inline-block; padding: 0.75rem 2rem; background: var(--gradient-purple); border-radius: 8px; font-weight: 600; font-size: 0.95rem; color: white; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.hero-cta:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(139,92,246,0.4); color: white; }
.hero-attribution { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.5rem; font-style: italic; }

/* Brand bar */
.brand-bar { padding: 1rem 0; border-bottom: 1px solid var(--card-border); text-align: center; }
.brand-bar .wubrg-dots { margin-bottom: 0.35rem; }
.brand-bar .tagline { color: var(--text-muted); font-size: 0.85rem; letter-spacing: 0.3px; }

/* Home sections */
.home-section { padding: 2.5rem 0; border-bottom: 1px solid var(--card-border); }
.home-section:last-of-type { border-bottom: none; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.section-header h2 { font-size: 1.5rem; }
.section-link { color: #a78bfa; font-weight: 600; font-size: 0.9rem; white-space: nowrap; }
.section-link:hover { color: #c4b5fd; }

/* Horizontal card row (News / Strategy) */
.card-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.25rem; }
.post-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; transition: transform 0.3s ease, box-shadow 0.3s ease; display: flex; flex-direction: column; cursor: pointer; }
.post-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lg), 0 0 30px var(--card-hover-glow); }
.post-card a.card-link { display: flex; flex-direction: column; flex: 1; color: inherit; text-decoration: none; }
.post-thumbnail { height: 160px; width: 100%; position: relative; overflow: hidden; background-size: cover; background-position: center; }
.post-thumbnail::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.6) 100%); }
.post-content { padding: 1rem; display: flex; flex-direction: column; flex: 1; }
.post-category { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; width: fit-content; }
.category-news { background: var(--pill-news); color: white; }
.category-strategy { background: var(--pill-strategy); color: white; }
.category-spoilers { background: var(--pill-spoilers); color: white; }
.category-deck-guides { background: var(--pill-deck-guides); color: white; }
.category-set-reviews { background: var(--pill-set-reviews); color: white; }
.post-title { font-size: 1rem; margin-bottom: 0.5rem; line-height: 1.4; }
.post-excerpt { color: var(--text-secondary); font-size: 0.85rem; line-height: 1.5; margin-bottom: 0.75rem; flex: 1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.post-meta { display: flex; justify-content: space-between; align-items: center; color: var(--text-muted); font-size: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--card-border); }
.read-more { color: #a78bfa; font-weight: 600; font-size: 0.8rem; margin-top: 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem; }
.read-more:hover { color: #c4b5fd; }

/* Tools compact grid */
.tools-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.tool-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 1.25rem; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.tool-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: rgba(139,92,246,0.4); }
.tool-icon { font-size: 1.75rem; margin-bottom: 0.5rem; }
.tool-card h3 { font-size: 0.95rem; margin-bottom: 0.35rem; }
.tool-card p { color: var(--text-muted); font-size: 0.8rem; line-height: 1.4; }

/* Format tabs (Decks) */
.format-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.format-tab { background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text-secondary); padding: 0.4rem 1.1rem; border-radius: 2rem; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; font-family: inherit; }
.format-tab:hover { border-color: rgba(139,92,246,0.5); color: var(--text-primary); }
.format-tab.active { background: var(--gradient-purple); border-color: transparent; color: white; }
.format-panel { display: none; }
.format-panel.active { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.deck-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 1.25rem; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.deck-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
.deck-card h3 { font-size: 1rem; margin-bottom: 0.5rem; }
.deck-card .tier-badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.tier-1 { background: rgba(16,185,129,0.2); color: #34d399; }
.tier-2 { background: rgba(59,130,246,0.2); color: #60a5fa; }
.tier-3 { background: rgba(245,158,11,0.2); color: #fbbf24; }
.deck-card .deck-meta { color: var(--text-muted); font-size: 0.8rem; margin-top: 0.5rem; }

/* Articles section (search + filter + grid) */
.articles-controls { display: flex; gap: 1rem; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; }
.articles-search { flex: 0 0 280px; padding: 0.6rem 1rem; background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); border-radius: 8px; color: var(--text-primary); font-size: 0.9rem; font-family: inherit; }
.articles-search:focus { outline: none; border-color: #8b5cf6; }
.articles-search::placeholder { color: var(--text-muted); }
.filter-buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.filter-btn { background: var(--card-bg); border: 1px solid var(--card-border); color: var(--text-secondary); padding: 0.4rem 1rem; border-radius: 2rem; font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.2s ease; font-family: inherit; }
.filter-btn:hover { border-color: rgba(139,92,246,0.5); color: var(--text-primary); }
.filter-btn.active { background: var(--gradient-purple); border-color: transparent; color: white; }
.posts-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
.post-card.hidden { display: none; }

/* Mobile responsive */
@media (max-width: 768px) {
    .hero-featured { min-height: 320px; }
    .hero-featured h1, .hero-featured h2 { font-size: 1.75rem; }
    .card-row { grid-template-columns: 1fr; }
    .tools-grid { grid-template-columns: repeat(2, 1fr); }
    .format-panel.active { grid-template-columns: 1fr; }
    .posts-grid { grid-template-columns: 1fr; }
    .articles-controls { flex-direction: column; }
    .articles-search { flex: 1 1 100%; width: 100%; }
    .filter-btn { padding: 0.35rem 0.85rem; font-size: 0.75rem; }
    .format-tabs { overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; }
}
@media (min-width: 769px) and (max-width: 991px) {
    .card-row { grid-template-columns: repeat(2, 1fr); }
    .tools-grid { grid-template-columns: repeat(2, 1fr); }
    .posts-grid { grid-template-columns: repeat(2, 1fr); }
    .format-panel.active { grid-template-columns: repeat(2, 1fr); }
}`;

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
}
.ctx-links { margin: 2.5rem 0 1.5rem; padding: 1.5rem 2rem; background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.15); border-radius: 12px; }
.ctx-links h3 { margin: 0 0 1rem; font-size: 1.1rem; color: var(--text-primary); font-family: 'Space Grotesk', sans-serif; }
.ctx-links ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.75rem; }
.ctx-links li { flex: 1 1 calc(50% - 0.75rem); min-width: 200px; }
.ctx-links a { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: var(--text-primary); text-decoration: none; font-size: 0.9rem; transition: border-color 0.2s, background 0.2s; }
.ctx-links a:hover { border-color: rgba(139,92,246,0.4); background: rgba(139,92,246,0.1); }
.ctx-links .ctx-icon { font-size: 1.1rem; flex-shrink: 0; }
@media (max-width: 600px) { .ctx-links li { flex: 1 1 100%; } }`;

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
  const pagesCss = `/* ScrollVault Pages CSS — auto-generated from build.js */\n\n/* Hub pages */\n${HUB_CSS}\n\n/* Index page */\n${INDEX_CSS}\n\n/* Post pages */\n${POST_CSS}\n\n/* Static pages */\n${PAGE_CSS}`;
  fs.writeFileSync(path.join(cssDir, 'pages.css'), pagesCss.trim());
  console.log('Wrote css/base.css + css/pages.css');

  // ── INDEX PAGE (Authority Hub) ──
  const heroPost = posts[0];
  const newsPosts = posts.slice(1).filter(p => p.category === 'News').slice(0, 4);
  const strategyPosts = posts.slice(1).filter(p => p.category === 'Strategy' || p.category === 'Deck Guides').slice(0, 4);
  const gridPosts = posts.slice(1, 10);

  function thumbStyle(post) {
    if (post.hero_image) return `background-image: url('${post.hero_image}'); background-size: cover; background-position: center;`;
    const gradient = post.thumbnail_gradient || CATEGORY_GRADIENTS[post.category] || 'var(--gradient-purple)';
    return `background: ${gradient};`;
  }

  // Hardcoded tools data (matches /tools/ hub)
  const TOOLS_DATA = [
    { name: 'Mana Base Calculator', href: '/tools/manabase/', icon: '\u{1F3AF}', desc: 'Optimal land counts using Frank Karsten math' },
    { name: 'Hypergeometric Calc', href: '/tools/hypergeometric/', icon: '\u{1F4CA}', desc: 'Probability of drawing specific cards' },
    { name: 'Opening Hand Sim', href: '/tools/hand-simulator/', icon: '\u{1F0CF}', desc: 'Sample hands with London mulligan support' },
    { name: 'Deck Price Checker', href: '/tools/price-checker/', icon: '\u{1F4B0}', desc: 'Instant price totals for any decklist' },
    { name: 'Commander Bracket', href: '/tools/commander-bracket/', icon: '\u{1F3C6}', desc: 'Estimate your deck power level and bracket' },
    { name: 'Sealed Simulator', href: '/tools/sealed/', icon: '\u{1F4E6}', desc: 'Open 6 boosters and build a sealed deck' },
    { name: 'Dual Lands Guide', href: '/tools/lands/', icon: '\u{1F30D}', desc: 'Compare fetches, shocks, checks, and fast lands' }
  ];

  // Hardcoded decks data (matches /decks/ hub — 4 formats, 3 decks each)
  const DECKS_DATA = {
    Standard: [
      { name: 'Bant Rhythm', tier: 1, href: '/decks/standard/' },
      { name: 'Dimir Excruciator', tier: 1, href: '/decks/standard/' },
      { name: 'Golgari Midrange', tier: 1, href: '/decks/standard/' }
    ],
    Modern: [
      { name: 'Boros Energy', tier: 1, href: '/decks/modern/' },
      { name: 'Amulet Titan', tier: 2, href: '/decks/modern/' },
      { name: 'Domain Zoo', tier: 2, href: '/decks/modern/' }
    ],
    Pioneer: [
      { name: 'Arclight Phoenix', tier: 1, href: '/decks/pioneer/' },
      { name: 'Azorius Control', tier: 1, href: '/decks/pioneer/' },
      { name: 'Greasefang Parhelion', tier: 2, href: '/decks/pioneer/' }
    ],
    Commander: [
      { name: 'Blue Farm', tier: 1, href: '/decks/commander/' },
      { name: 'Atraxa Praetors Voice', tier: 1, href: '/decks/commander/' },
      { name: 'Child of Alara', tier: 1, href: '/decks/commander/' }
    ]
  };

  function renderHeroSection() {
    if (!heroPost) return '';
    const catSlug = CATEGORY_SLUGS[heroPost.category] || 'news';
    const bgImage = heroPost.hero_image ? `background-image: url('${heroPost.hero_image}');` : `background: var(--gradient-purple);`;
    const attribution = heroPost.hero_artist ? `\n                <p class="hero-attribution">Art: &ldquo;${esc(heroPost.hero_card_name)}&rdquo; by ${esc(heroPost.hero_artist)}</p>` : '';
    return `        <section class="hero-featured" style="${bgImage} background-size: cover; background-position: center;" role="img" aria-label="Featured: ${esc(heroPost.title)} - card art">
            <div class="hero-overlay"></div>
            <div class="hero-content">
                <div class="container">
                    <span class="post-category category-${catSlug}">${esc(heroPost.category)}</span>
                    <h2><a href="${postUrl(heroPost)}">${esc(heroPost.title)}</a></h2>
                    <p class="hero-excerpt">${esc(heroPost.excerpt)}</p>
                    <a href="${postUrl(heroPost)}" class="hero-cta">Read More &rarr;</a>${attribution}
                </div>
            </div>
        </section>`;
  }

  function renderBrandBar() {
    return `        <div class="brand-bar">
            <div class="container">
                <h1 class="sr-only">ScrollVault — MTG News, Strategy & Tools</h1>
                <div class="wubrg-dots">
                    <span class="mana-dot" style="background: #F9FAF4"></span>
                    <span class="mana-dot" style="background: #0E68AB"></span>
                    <span class="mana-dot" style="background: #150B00; border: 1px solid rgba(255,255,255,0.2)"></span>
                    <span class="mana-dot" style="background: #D3202A"></span>
                    <span class="mana-dot" style="background: #00733E"></span>
                </div>
                <p class="tagline">Your daily source for MTG strategy, tools, and competitive analysis</p>
            </div>
        </div>`;
  }

  function renderPostCard(post) {
    const catSlug = CATEGORY_SLUGS[post.category] || 'news';
    const style = thumbStyle(post);
    return `                <article class="post-card" data-category="${catSlug}">
                    <a href="${postUrl(post)}" class="card-link">
                        <div class="post-thumbnail" style="${style}" role="img" aria-label="${esc(post.title)}"></div>
                        <div class="post-content">
                            <span class="post-category category-${catSlug}">${esc(post.category)}</span>
                            <h2 class="post-title">${esc(post.title)}</h2>
                            <p class="post-excerpt">${esc(post.excerpt)}</p>
                            <div class="post-meta">
                                <span class="post-author">${esc(post.author)}</span>
                                <span class="post-date">${formatDate(post.date)}</span>
                            </div>
                        </div>
                    </a>
                </article>`;
  }

  function renderCategorySection(title, href, linkText, sectionPosts) {
    if (!sectionPosts.length) return '';
    return `        <section class="home-section">
            <div class="container">
                <div class="section-header">
                    <h2>${title}</h2>
                    <a href="${href}" class="section-link">${linkText}</a>
                </div>
                <div class="card-row">
${sectionPosts.map(p => renderPostCard(p)).join('\n')}
                </div>
            </div>
        </section>`;
  }

  function renderToolsSection() {
    return `        <section class="home-section">
            <div class="container">
                <div class="section-header">
                    <h2>Free MTG Tools</h2>
                    <a href="/tools/" class="section-link">View All Tools &rarr;</a>
                </div>
                <div class="tools-grid">
${TOOLS_DATA.map(t => `                    <a href="${t.href}" class="tool-card">
                        <div class="tool-icon">${t.icon}</div>
                        <h3>${esc(t.name)}</h3>
                        <p>${esc(t.desc)}</p>
                    </a>`).join('\n')}
                </div>
            </div>
        </section>`;
  }

  function renderDecksSection() {
    const formats = Object.keys(DECKS_DATA);
    const tabs = formats.map((f, i) =>
      `                    <button class="format-tab${i === 0 ? ' active' : ''}" data-format="${f.toLowerCase()}">${f}</button>`
    ).join('\n');
    const panels = formats.map((f, i) => {
      const decks = DECKS_DATA[f].map(d =>
        `                        <a href="${d.href}" class="deck-card">
                            <h3>${esc(d.name)}</h3>
                            <span class="tier-badge tier-${d.tier}">Tier ${d.tier}</span>
                            <div class="deck-meta">${f}</div>
                        </a>`
      ).join('\n');
      return `                    <div class="format-panel${i === 0 ? ' active' : ''}" data-format="${f.toLowerCase()}">
${decks}
                    </div>`;
    }).join('\n');

    return `        <section class="home-section">
            <div class="container">
                <div class="section-header">
                    <h2>Top Competitive Decks</h2>
                    <a href="/decks/" class="section-link">View All Decks &rarr;</a>
                </div>
                <div class="format-tabs">
${tabs}
                </div>
${panels}
            </div>
        </section>`;
  }

  function renderArticlesSection() {
    return `        <section class="home-section" style="border-bottom: none;">
            <div class="container">
                <div class="section-header">
                    <h2>Latest Articles</h2>
                </div>
                <div class="articles-controls">
                    <input type="text" class="articles-search" placeholder="Search articles..." id="searchInput">
                    <div class="filter-buttons">
                        <button class="filter-btn active" data-filter="all">All</button>
                        <button class="filter-btn" data-filter="news">News</button>
                        <button class="filter-btn" data-filter="strategy">Strategy</button>
                        <button class="filter-btn" data-filter="spoilers">Spoilers</button>
                        <button class="filter-btn" data-filter="deck-guides">Deck Guides</button>
                        <button class="filter-btn" data-filter="set-reviews">Set Reviews</button>
                    </div>
                </div>
                <div class="posts-grid" id="postsGrid">
${gridPosts.map(p => renderPostCard(p)).join('\n')}
                </div>
            </div>
        </section>`;
  }

  const heroOgImage = heroPost && heroPost.hero_image ? heroPost.hero_image : '';

  // WebSite structured data for homepage (SEO)
  const siteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "ScrollVault",
    "url": SITE_URL,
    "image": DEFAULT_OG_IMAGE,
    "publisher": {
      "@type": "Organization",
      "name": "ScrollVault",
      "logo": { "@type": "ImageObject", "url": SITE_URL + "/apple-touch-icon.png" }
    }
  };

  const indexHtml = `${head('MTG News and Strategy Blog', 'The latest Magic: The Gathering news, strategy guides, deck techs, set reviews, and spoilers.', '', heroOgImage, { pageUrl: '/', ogType: 'website', ldJson: siteSchema })}
    <!-- pages.css loaded in head -->
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>
${nav('', 'home')}
    <main id="main-content">
${renderBrandBar()}
${renderHeroSection()}
${renderCategorySection('Latest News', '/news/', 'View All News &rarr;', newsPosts)}
${renderCategorySection('Strategy &amp; Guides', '/guides/', 'View All Guides &rarr;', strategyPosts)}
${renderToolsSection()}
${renderDecksSection()}
${renderArticlesSection()}
    </main>
${footer('')}
    <script>
        // Format tabs
        document.querySelectorAll('.format-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.format-tab').forEach(function(t) { t.classList.remove('active'); });
                document.querySelectorAll('.format-panel').forEach(function(p) { p.classList.remove('active'); });
                tab.classList.add('active');
                var panel = document.querySelector('.format-panel[data-format="' + tab.dataset.format + '"]');
                if (panel) panel.classList.add('active');
            });
        });
        // Filter + search
        var filterBtns = document.querySelectorAll('.filter-btn');
        var cards = document.querySelectorAll('#postsGrid .post-card');
        filterBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                filterBtns.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                var f = btn.dataset.filter;
                cards.forEach(function(c) { c.classList.toggle('hidden', f !== 'all' && c.dataset.category !== f); });
            });
        });
        document.getElementById('searchInput').addEventListener('input', function() {
            var t = this.value.toLowerCase();
            cards.forEach(function(c) {
                var txt = (c.querySelector('.post-title').textContent + ' ' + c.querySelector('.post-excerpt').textContent).toLowerCase();
                c.classList.toggle('hidden', t && !txt.includes(t));
            });
            if (t) { filterBtns.forEach(function(b) { b.classList.remove('active'); }); document.querySelector('[data-filter="all"]').classList.add('active'); }
        });
    </script>
</body>
</html>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), indexHtml);
  console.log(`Built index with ${posts.length} posts (hero + ${newsPosts.length} news + ${strategyPosts.length} strategy + ${gridPosts.length} grid)`);

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
      return `        <section class="hero-featured" style="${bgImage} background-size: cover; background-position: center;" role="img" aria-label="Featured: ${esc(heroPost.title)} - card art">
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
                        <div class="post-thumbnail" style="${style}" role="img" aria-label="${esc(post.title)}"></div>
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
                            <div class="recent-post-thumb" style="${ts}" role="img" aria-label="${esc(post.title)}"></div>
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

    const hubSchema = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": title,
      "description": description,
      "url": SITE_URL + "/" + slug + "/"
    };
    const itemListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "itemListElement": hubPosts.slice(0, 10).map((p, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "url": SITE_URL + "/posts/" + p.slug + ".html"
      }))
    };
    const hubHtml = `${head(title, description, '', heroPost && heroPost.hero_image ? heroPost.hero_image : '', { pageUrl: '/' + slug + '/', ogType: 'website', ldJson: hubSchema })}
    <!-- pages.css loaded in head -->
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>
${nav('', slug === 'news' ? 'news' : slug === 'guides' ? 'guides' : '')}
    <main id="main-content">
${heroHtml}
${slug === 'guides' ? `        <section class="pillar-guides">
            <div class="container">
                <h2>Evergreen Guides</h2>
                <div class="pillar-grid">
                    <div class="pillar-card"><a href="/guides/mana-bases.html"><h3>MTG Manabase Guide</h3><p>Frank Karsten's mana math explained. Land counts, color balance, and optimal dual land ratios for every format.</p><span class="pillar-arrow">Read Guide &rarr;</span></a></div>
                    <div class="pillar-card"><a href="/guides/dual-lands.html"><h3>Dual Land Cycles Guide</h3><p>Complete reference of fetch, shock, fast, and check lands with format legality.</p><span class="pillar-arrow">Read Guide &rarr;</span></a></div>
                    <div class="pillar-card"><a href="/guides/formats.html"><h3>MTG Formats Explained</h3><p>Standard, Modern, Pioneer, Legacy, Vintage, Commander, Pauper, and Limited.</p><span class="pillar-arrow">Read Guide &rarr;</span></a></div>
                    <div class="pillar-card"><a href="/guides/sideboard-guide.html"><h3>Sideboard Strategy Guide</h3><p>The 15-card rule, hate cards, silver bullets, and format-specific tips.</p><span class="pillar-arrow">Read Guide &rarr;</span></a></div>
                    <div class="pillar-card"><a href="/guides/commander-deck-building.html"><h3>Commander Deck Building</h3><p>Choosing a commander, the 100-card singleton rule, ramp/draw/removal ratios.</p><span class="pillar-arrow">Read Guide &rarr;</span></a></div>
                    <div class="pillar-card"><a href="/guides/arena-beginners-guide.html"><h3>MTG Arena Beginner&#39;s Guide</h3><p>Getting started, wildcards, earning gold, events, and free-to-play tips.</p><span class="pillar-arrow">Read Guide &rarr;</span></a></div>
                </div>
            </div>
        </section>` : ''}
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
<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>
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
  buildHubPage('spoilers', 'MTG Spoilers & Previews', 'The latest Magic: The Gathering card spoilers, set previews, and first impressions from upcoming releases.', p => p.category === 'Spoilers');
  buildHubPage('deck-guides', 'MTG Deck Guides & Tech', 'Budget builds, competitive decklists, sideboard guides, and deck techs for Standard, Modern, Pioneer, and Commander.', p => p.category === 'Deck Guides');
  buildHubPage('set-reviews', 'MTG Set Reviews', 'Comprehensive set reviews for Constructed and Limited, covering every new Magic: The Gathering release.', p => p.category === 'Set Reviews');

  // ── CONTEXTUAL INTERNAL LINKS ──
  function generateContextualLinks(post) {
    const body = (post.body || '').toLowerCase();
    const title = (post.title || '').toLowerCase();
    const text = body + ' ' + title;
    const cat = post.category;
    const links = [];
    const used = new Set();

    function add(url, label, icon) {
      if (!used.has(url)) { used.add(url); links.push({ url, label, icon }); }
    }

    // Content-aware links based on what the post discusses
    if (/commander|edh|command zone|command tower/i.test(text))
      add('/guides/commander-deck-building.html', 'Commander Deck Building Guide', '\u2694\uFE0F');
    if (/mana\s*base|land\s*count|color(ed)?\s*source|karsten|hypergeometric/i.test(text))
      add('/tools/manabase/', 'Mana Base Calculator', '\u{1F9EE}');
    if (/sideboard|post.board|side\s*in|side\s*out|best.of.three/i.test(text))
      add('/guides/sideboard-guide.html', 'Sideboard Strategy Guide', '\u{1F6E1}\uFE0F');
    if (/arena|mtga|wildcard|mastery\s*pass|quick\s*draft/i.test(text))
      add('/guides/arena-beginners-guide.html', 'MTG Arena Beginner\'s Guide', '\u{1F3AE}');
    if (/dual\s*land|shock\s*land|fetch\s*land|check\s*land|fast\s*land/i.test(text))
      add('/guides/dual-lands.html', 'Dual Land Cycles Guide', '\u{1F30D}');
    if (/format|standard|modern|pioneer|legacy|vintage|pauper/i.test(text))
      add('/guides/formats.html', 'MTG Formats Explained', '\u{1F4CB}');
    if (/deck\s*list|meta|metagame|top\s*deck|tier/i.test(text))
      add('/decks/', 'Top Decks by Format', '\u{1F3C6}');
    if (/sealed|draft|limited|pack|bomb|pick/i.test(text))
      add('/tools/sealed/', 'Sealed Pool Simulator', '\u{1F4E6}');
    if (/bracket|power\s*level|cedh|casual/i.test(text))
      add('/tools/commander-bracket/', 'Commander Bracket Calculator', '\u{1F4CA}');
    if (/price|budget|expensive|cheap|cost|spike/i.test(text))
      add('/tools/price-checker/', 'Deck Price Checker', '\u{1F4B0}');
    if (/ban|banned|restricted|unban|suspend/i.test(text))
      add('/guides/banned-list.html', 'MTG Banned & Restricted List', '\u{1F6AB}');
    if (/rotation|rotate|legal\s*set|standard.*set/i.test(text))
      add('/guides/standard-rotation.html', 'Standard Rotation Guide', '\u{1F504}');

    // Category-based defaults if we have fewer than 2 links
    if (links.length < 2) {
      if (cat === 'Deck Guides') {
        add('/tools/manabase/', 'Mana Base Calculator', '\u{1F9EE}');
        add('/guides/sideboard-guide.html', 'Sideboard Strategy Guide', '\u{1F6E1}\uFE0F');
      } else if (cat === 'Strategy') {
        add('/guides/formats.html', 'MTG Formats Explained', '\u{1F4CB}');
        add('/decks/', 'Top Decks by Format', '\u{1F3C6}');
      } else if (cat === 'News') {
        add('/decks/', 'Top Decks by Format', '\u{1F3C6}');
        add('/guides/formats.html', 'MTG Formats Explained', '\u{1F4CB}');
      } else if (cat === 'Spoilers' || cat === 'Set Reviews') {
        add('/tools/manabase/', 'Mana Base Calculator', '\u{1F9EE}');
        add('/guides/formats.html', 'MTG Formats Explained', '\u{1F4CB}');
      }
    }

    // Always ensure at least the mana base calculator
    add('/tools/manabase/', 'Mana Base Calculator', '\u{1F9EE}');

    // Cap at 4 links
    const final = links.slice(0, 4);
    if (!final.length) return '';

    return `
        <div class="ctx-links">
            <h3>Tools &amp; Guides You Might Like</h3>
            <ul>
${final.map(l => `                <li><a href="${l.url}"><span class="ctx-icon">${l.icon}</span> ${esc(l.label)}</a></li>`).join('\n')}
            </ul>
        </div>`;
  }

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
                    <div class="related-card-thumb" style="${rThumb}" role="img" aria-label="${esc(r.title)}"></div>
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
    const wordCount = post.body ? post.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).length : 0;
    const postOgImage = post.hero_image ||
      ((post._cards || []).find(c => c && c.art_crop) || {}).art_crop ||
      '';
    const articleSchema = {
      "@context": "https://schema.org",
      "@type": (post.category === 'News' || post.category === 'Spoilers') ? "NewsArticle" : "Article",
      "headline": post.title,
      "description": post.excerpt,
      "datePublished": post.date + "T00:00:00Z",
      "dateModified": post.date + "T00:00:00Z",
      "author": { "@type": "Person", "name": post.author },
      "publisher": { "@type": "Organization", "name": "ScrollVault", "logo": { "@type": "ImageObject", "url": "https://scrollvault.net/apple-touch-icon.png" } },
      "image": postOgImage || DEFAULT_OG_IMAGE,
      "wordCount": wordCount,
      "mainEntityOfPage": { "@type": "WebPage", "@id": SITE_URL + "/posts/" + post.slug + ".html" },
      "url": SITE_URL + "/posts/" + post.slug + ".html"
    };
    const categoryHubUrl = post.category === 'News' ? '/news/' :
      post.category === 'Spoilers' ? '/spoilers/' :
      post.category === 'Deck Guides' ? '/deck-guides/' :
      post.category === 'Set Reviews' ? '/set-reviews/' :
      (post.category === 'Strategy') ? '/guides/' : '/';
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL + "/" },
        { "@type": "ListItem", "position": 2, "name": post.category, "item": SITE_URL + categoryHubUrl },
        { "@type": "ListItem", "position": 3, "name": post.title, "item": SITE_URL + `/posts/${post.slug}.html` }
      ]
    };

    const postHtml = `${head(post.title, post.excerpt, '..', postOgImage, { pageUrl: '/posts/' + post.slug + '.html', ogType: 'article' })}
    <!-- pages.css loaded in head -->
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>
${nav('..', '')}
    <main id="main-content">
        <article itemscope itemtype="https://schema.org/Article">
            <header class="article-hero" style="${heroStyle}" role="img" aria-label="Card art for ${esc(post.title)}">
                <div class="article-hero-overlay"></div>
                <div class="article-hero-content">
                    <nav class="breadcrumb" aria-label="Breadcrumb">
                        <ol>
                            <li><a href="/">Home</a></li>
                            <li><a href="${categoryHubUrl}">${esc(post.category)}</a></li>
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
${generateContextualLinks(post)}
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
  function writePage(filename, title, description, activePage, bodyHtml, options = {}) {
    const html = `${head(title, description, '', '', { pageUrl: '/' + filename, ogType: 'website', ldJson: options.ldJson || null })}
    <!-- pages.css loaded in head -->
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

  writePage('about.html', 'About ScrollVault', 'Meet the team behind ScrollVault — daily Magic: The Gathering news, strategy guides, deck techs, and free MTG tools for competitive players.', 'about', `
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

  writePage('contact.html', 'Contact Us', 'Get in touch with the ScrollVault team. Send news tips, report errors, pitch guest posts, or ask about advertising on our MTG content site.', 'contact', `
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

  writePage('privacy.html', 'Privacy Policy', 'ScrollVault privacy policy. We collect no personal data and use no tracking cookies. Learn about our minimal data practices.', '', `
            <p><em>Last updated: February 6, 2026</em></p>
            <h2>Information We Collect</h2>
            <p>This site is a static blog. We do not collect personal information, use cookies for tracking, or require user accounts. Standard web server logs (IP address, browser type, pages visited) are maintained by our hosting provider for security purposes and are not shared with third parties.</p>
            <h2>Third-Party Services</h2>
            <p>We use Google Fonts to serve typefaces. Google may collect anonymous usage data per their privacy policy. No other third-party analytics, advertising, or tracking services are used on this site.</p>
            <h2>External Links</h2>
            <p>Our posts may link to external sites (Wizards of the Coast, MTGGoldfish, etc.). We are not responsible for the privacy practices of those sites.</p>
            <h2>Contact</h2>
            <p>Questions about this policy? Email <a href="mailto:support@scrollvault.net">support@scrollvault.net</a>.</p>`);

  writePage('terms.html', 'Terms of Service', 'Terms of service for scrollvault.net. Content usage, fair use of MTG card names, and accuracy commitments.', '', `
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
  const manaBaseFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How many lands should I put in my MTG deck?",
        "acceptedAnswer": { "@type": "Answer", "text": "For a 60-card deck, 23-26 lands is standard. Aggro decks run 22-23, midrange 24-25, and control 25-26. Commander decks (99 cards) need 35-38 lands plus mana rocks. Use Frank Karsten's mana math or a manabase calculator for precise counts based on your specific mana curve and color requirements." }
      },
      {
        "@type": "Question",
        "name": "What is Frank Karsten's mana math for MTG?",
        "acceptedAnswer": { "@type": "Answer", "text": "Frank Karsten's mana math uses hypergeometric probability to calculate the exact number of colored mana sources needed to cast spells on curve with ~90% consistency. Key numbers for 60-card decks: 14 sources for a single-pip spell, 18 for double-pip, 21+ for triple-pip. This research is the gold standard used by competitive Magic players to build optimal mana bases." }
      },
      {
        "@type": "Question",
        "name": "How do I build a manabase for Commander?",
        "acceptedAnswer": { "@type": "Answer", "text": "Start with 36-38 lands in your 99-card deck. Include fetch lands and shock lands for reliable fixing, add check lands and fast lands for budget options, and finish with utility lands like Command Tower and Exotic Orchard. Add 10+ mana rocks (Sol Ring, Arcane Signet, Signets) for ramp. Use a manabase calculator to determine exact colored source counts based on your casting costs." }
      }
    ]
  };
  writePage('guides/mana-bases.html', 'MTG Manabase Guide — Frank Karsten Mana Math Explained', 'Complete guide to building an MTG manabase using Frank Karsten\'s mana math. Land counts for Standard, Modern, Pioneer, and Commander with hypergeometric probability tables.', 'guides', `
            <p>Your manabase is the foundation of every Magic: The Gathering deck. A well-built manabase ensures you can cast your spells on curve, while a bad one loses games before they start. This guide covers everything you need to know about building the optimal manabase for any format.</p>

            <h2>Frank Karsten's Mana Math</h2>
            <p>The gold standard for manabase construction comes from <strong>Frank Karsten</strong>, a Hall of Fame player and mathematician who published groundbreaking research on MTG mana math. Using <strong>hypergeometric probability</strong>, Karsten calculated exactly how many colored mana sources you need to consistently cast your spells on curve. His key finding: you need roughly <strong>14 sources</strong> to reliably cast a single-pip spell on turn one, and <strong>18+ sources</strong> for double-pip costs.</p>
            <p>Try our <a href="/tools/manabase/">Manabase Calculator</a> to apply Karsten's math to your own deck automatically.</p>

            <h2>Land Count Guidelines by Format</h2>
            <ul>
                <li><strong>Standard (60 cards):</strong> 24&ndash;26 lands. Aggro decks can go as low as 22 with a very low curve.</li>
                <li><strong>Modern (60 cards):</strong> 20&ndash;24 lands. Fetch lands effectively thin your deck; many Modern decks run fewer lands than Standard.</li>
                <li><strong>Pioneer (60 cards):</strong> 23&ndash;26 lands. Similar to Standard but without fetch land thinning.</li>
                <li><strong>Commander (99+1 cards):</strong> 35&ndash;38 lands plus 10+ mana rocks and ramp spells. More colors means more dual lands for fixing.</li>
                <li><strong>Limited (40 cards):</strong> 17 lands is the default. Aggressive decks can go to 16; slow decks may want 18.</li>
            </ul>

            <h2>Colored Source Requirements</h2>
            <p>Based on Karsten's mana math, here are the colored sources you need in a 60-card deck to cast spells on curve with ~90% reliability:</p>
            <ul>
                <li><strong>Single pip (1W):</strong> 14 sources of that color</li>
                <li><strong>Double pip (WW):</strong> 18 sources</li>
                <li><strong>Triple pip (WWW):</strong> 21+ sources</li>
                <li><strong>Early single pip (W on turn 1):</strong> 14 untapped sources</li>
            </ul>
            <p>For Commander, multiply these numbers by roughly 1.6x due to the larger deck size (99 cards). Our <a href="/tools/manabase/">manabase calculator</a> handles this math automatically.</p>

            <h2>Types of Mana Fixing</h2>
            <p><strong>Dual lands</strong> are the backbone of multicolor mana bases. The best dual land cycles (fetch lands, shock lands, original duals) enter untapped and fix multiple colors. See our <a href="/guides/dual-lands.html">complete dual land guide</a> for every cycle and their format legality.</p>
            <p><strong>Mana rocks</strong> like Sol Ring, Arcane Signet, and Signets provide additional fixing, especially in Commander. Count 2-mana rocks as roughly half a land when building your manabase.</p>

            <h2>Common Manabase Mistakes</h2>
            <ul>
                <li>Running too few colored sources for double-pip costs (e.g., only 12 white sources for a WW card)</li>
                <li>Playing too many tap lands, which slows your curve by a full turn</li>
                <li>Ignoring mana curve when choosing land count &mdash; a 2.5 average CMC deck needs fewer lands than a 3.5 CMC deck</li>
                <li>Not accounting for utility lands that don't produce colored mana</li>
            </ul>

            <h2>Use the Calculator</h2>
            <p>Our <a href="/tools/manabase/">MTG Manabase Calculator</a> implements Frank Karsten's mana math for every format. Input your deck's color distribution and mana curve, and it will recommend the exact number of lands and colored sources you need. It covers Standard, Modern, Pioneer, Legacy, and Commander.</p>

            <h2>Related Guides &amp; Tools</h2>
            <p>Explore every dual land cycle in our <a href="/guides/dual-lands.html">Dual Land Cycles Guide</a> or use the interactive <a href="/tools/lands/">Dual Lands Reference Tool</a> to compare options by format. Building a Commander deck? Our <a href="/guides/commander-deck-building.html">Commander Deck Building Guide</a> covers the 10-10-10 framework, power brackets, and budget tips. Check draw probabilities with our <a href="/tools/hypergeometric/">Hypergeometric Calculator</a>.</p>
        `, { ldJson: manaBaseFaq });
  const dualLandsFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What are the best dual lands in MTG?",
        "acceptedAnswer": { "@type": "Answer", "text": "The original Alpha dual lands (e.g., Underground Sea, Volcanic Island) are the most powerful because they enter untapped with no drawback. For formats where they're not legal, fetch lands plus shock lands provide the best mana fixing. Budget alternatives include check lands, fast lands, and pain lands." }
      },
      {
        "@type": "Question",
        "name": "What dual lands are legal in Pioneer?",
        "acceptedAnswer": { "@type": "Answer", "text": "Pioneer allows shock lands (e.g., Steam Vents, Godless Shrine), check lands (e.g., Glacial Fortress), fast lands (e.g., Blooming Marsh), pain lands (e.g., Shivan Reef), pathway lands, and slow lands (e.g., Deserted Beach). Fetch lands are banned in Pioneer." }
      },
      {
        "@type": "Question",
        "name": "What is the difference between fetch lands and shock lands?",
        "acceptedAnswer": { "@type": "Answer", "text": "Fetch lands (e.g., Scalding Tarn) sacrifice themselves and pay 1 life to search your library for a land with a specific type. Shock lands (e.g., Steam Vents) enter the battlefield tapped unless you pay 2 life. Fetch lands are more versatile because they can find shock lands, effectively fixing any color combination, and they thin your deck." }
      }
    ]
  };
  writePage('guides/dual-lands.html', 'MTG Dual Land Cycles Guide', 'Complete reference of all MTG dual land cycles: fetch lands, shock lands, fast lands, check lands. Format legality and color pair coverage.', 'guides', `
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
            <h2>Related Tools &amp; Guides</h2>
            <p>Use our <a href="/tools/manabase/">Mana Base Calculator</a> to determine how many duals to play in your deck. Explore every dual land cycle with our interactive <a href="/tools/lands/">Dual Lands Reference Tool</a>.</p>
            <p>For land count recommendations by format, read our <a href="/guides/mana-bases.html">Frank Karsten Mana Math Guide</a>. Building a Commander deck? See our <a href="/guides/commander-deck-building.html">Commander Deck Building Guide</a> for EDH-specific mana base advice.</p>
        `, { ldJson: dualLandsFaq });

  // ── MTG Formats Explained ──
  const formatsFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What are the different formats in Magic: The Gathering?",
        "acceptedAnswer": { "@type": "Answer", "text": "The main constructed formats are Standard (rotating, recent sets), Pioneer (2012+), Modern (2003+), Legacy (all sets, banned list), Vintage (all sets, restricted list), and Commander/EDH (100-card singleton, multiplayer). Limited formats include Draft and Sealed, where you build decks from opened packs. Pauper uses only commons." }
      },
      {
        "@type": "Question",
        "name": "Which MTG format is best for beginners?",
        "acceptedAnswer": { "@type": "Answer", "text": "Standard and Commander are the most beginner-friendly formats. Standard has a smaller card pool, making it easier to learn. Commander is casual and multiplayer, so the social aspect helps new players learn. Draft is also great for beginners because everyone builds from the same card pool, leveling the playing field." }
      },
      {
        "@type": "Question",
        "name": "What is the difference between Standard and Modern in MTG?",
        "acceptedAnswer": { "@type": "Answer", "text": "Standard uses only cards from the last 2-3 years of sets and rotates annually, keeping the format fresh and affordable. Modern includes every set from 8th Edition (2003) onward and does not rotate, creating a deeper card pool with more powerful combos and strategies but a higher entry cost." }
      }
    ]
  };
  writePage('guides/formats.html', 'MTG Formats Explained — Complete Guide to Every Format', 'Complete guide to every Magic: The Gathering format. Standard, Pioneer, Modern, Legacy, Vintage, Commander, Pauper, and Limited explained with rotation schedules and beginner recommendations.', 'guides', `
            <p>Magic: The Gathering offers a wide variety of formats, each with different card pools, rules, and play styles. Whether you're a new player looking for an entry point or a veteran exploring something different, understanding the formats helps you find the right home for your playstyle.</p>
            <h2>Constructed Formats</h2>
            <h3>Standard</h3>
            <p>Standard uses the most recent sets (typically the last 2-3 years) and rotates annually. It's the most accessible constructed format with a smaller card pool and lower entry cost. Standard is supported on <a href="/guides/arena-beginners-guide.html">MTG Arena</a> and in tabletop play.</p>
            <h3>Pioneer</h3>
            <p>Pioneer includes all sets from Return to Ravnica (2012) onward. It doesn't rotate, offering a middle ground between Standard's freshness and Modern's depth. Pioneer is a popular competitive format with a diverse metagame.</p>
            <h3>Modern</h3>
            <p>Modern includes every set from 8th Edition (2003) forward, plus Modern Horizons sets. The format features powerful strategies like Murktide Regent tempo, Amulet Titan combo, and various midrange builds. Check our <a href="/decks/">top decks</a> page for current metagame data.</p>
            <h3>Legacy</h3>
            <p>Legacy allows cards from Magic's entire history with a banned list. It features iconic cards like Brainstorm, Force of Will, and dual lands. The format is extremely skill-intensive but has a high entry cost due to Reserved List cards.</p>
            <h3>Vintage</h3>
            <p>Vintage is Magic's oldest format, allowing nearly every card ever printed. Instead of banning powerful cards, it restricts them to one copy. Black Lotus, the Moxen, and Time Walk are all legal (but restricted).</p>
            <h3>Commander (EDH)</h3>
            <p>Commander is a 100-card singleton format built around a legendary creature. It's the most popular casual format, typically played in multiplayer pods of 4. Learn more in our <a href="/guides/commander-deck-building.html">Commander Deck Building Guide</a>.</p>
            <h3>Pauper</h3>
            <p>Pauper only allows cards that have been printed at common rarity. It's extremely budget-friendly and features surprisingly deep gameplay with cards like Lightning Bolt, Counterspell, and Snuff Out.</p>
            <h2>Limited Formats</h2>
            <h3>Draft</h3>
            <p>In Draft, players open packs and pick one card at a time, passing the rest. You build a 40-card deck from what you draft. Drafting is a skill-intensive format that tests card evaluation and adaptability.</p>
            <h3>Sealed</h3>
            <p>In Sealed, each player opens 6 packs and builds a 40-card deck from the contents. It's more luck-dependent than Draft but a great way to experience new sets.</p>
            <h2>Which Format Should You Play?</h2>
            <ul>
                <li><strong>New to Magic:</strong> Start with Standard or Draft on <a href="/guides/arena-beginners-guide.html">MTG Arena</a></li>
                <li><strong>Casual multiplayer:</strong> Commander is king — see our <a href="/guides/commander-deck-building.html">deck building guide</a></li>
                <li><strong>Competitive on a budget:</strong> Pauper or Standard</li>
                <li><strong>Deep, non-rotating gameplay:</strong> Pioneer or Modern</li>
                <li><strong>Ultimate power level:</strong> Legacy or Vintage</li>
            </ul>
            <p>Stay up to date on format changes, bans, and metagame shifts with our <a href="/news/">daily MTG news</a>. Check our <a href="/guides/banned-list.html">Banned &amp; Restricted List</a> for current bans across all formats, and see our <a href="/guides/standard-rotation.html">Standard Rotation Guide</a> to know what sets are legal right now.</p>
        `, { ldJson: formatsFaq });

  // ── How to Build a Sideboard ──
  const sideboardFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How many cards should be in an MTG sideboard?",
        "acceptedAnswer": { "@type": "Answer", "text": "In all sanctioned constructed formats (Standard, Pioneer, Modern, Legacy, Vintage), your sideboard must be exactly 15 cards or 0 cards. You cannot register a sideboard with any other number. In Commander, sideboards are not used in standard play, though some groups allow a 10-card wishboard." }
      },
      {
        "@type": "Question",
        "name": "What are the best sideboard cards in Modern?",
        "acceptedAnswer": { "@type": "Answer", "text": "Top Modern sideboard staples include Leyline of the Void and Rest in Peace (graveyard hate), Engineered Explosives and Brotherhood's End (sweepers), Blood Moon and Magus of the Moon (land disruption), Flusterstorm and Mystical Dispute (counter magic), and Surgical Extraction (combo disruption). The best choices depend on your deck and the current metagame." }
      },
      {
        "@type": "Question",
        "name": "How do I decide what to sideboard in and out?",
        "acceptedAnswer": { "@type": "Answer", "text": "Write a sideboard guide for each common matchup: identify which of your main deck cards are weakest in the matchup and which sideboard cards address the opponent's strategy. Generally, cut situational cards that don't impact the matchup and bring in targeted answers. Avoid over-sideboarding — swapping too many cards can dilute your deck's core gameplan." }
      }
    ]
  };
  writePage('guides/sideboard-guide.html', 'How to Build a Sideboard — MTG Sideboard Strategy Guide', 'Learn how to build a winning sideboard for Magic: The Gathering. The 15-card rule, sideboard strategies, hate cards, and format-specific tips for Standard, Modern, and Pioneer.', 'guides', `
            <p>Your sideboard is one of the most important parts of your competitive MTG deck. In best-of-three matches, games two and three are often decided by who sideboarded better. A well-built sideboard can turn bad matchups into favorable ones.</p>
            <h2>What Is a Sideboard?</h2>
            <p>A sideboard is a set of exactly 15 cards that you can swap into your deck between games in a match. After game one, both players can exchange any number of cards between their main deck and sideboard, as long as the sideboard stays at 15 and the main deck stays at its original count (usually 60).</p>
            <h2>Sideboard Strategies</h2>
            <h3>Hate Cards</h3>
            <p>Hate cards directly counter specific strategies. Examples: <em>Rest in Peace</em> against graveyard decks, <em>Stony Silence</em> against artifact decks, <em>Blood Moon</em> against greedy mana bases. These are your most impactful sideboard slots.</p>
            <h3>Silver Bullets</h3>
            <p>Silver bullets are narrow but devastating answers to specific threats. <em>Pithing Needle</em> naming a problematic planeswalker, <em>Relic of Progenitus</em> against a single graveyard deck, or <em>Celestial Purge</em> against black/red aggro. Use 1-2 copies for matchups you expect occasionally.</p>
            <h3>Transformational Sideboarding</h3>
            <p>Some decks can transform their entire game plan post-board. A combo deck might sideboard into a control plan when opponents bring in combo hate, or an aggro deck might bring in a planeswalker package to go over the top. This advanced strategy punishes opponents for sideboarding too narrowly.</p>
            <h2>Building Your Sideboard: Step by Step</h2>
            <ol>
                <li><strong>Identify your worst matchups</strong> — What decks consistently beat you in game one?</li>
                <li><strong>Find targeted answers</strong> — What cards directly address those strategies?</li>
                <li><strong>Plan your swaps</strong> — For each matchup, know what comes in and what comes out</li>
                <li><strong>Don't over-sideboard</strong> — Bringing in 8+ cards risks diluting your main gameplan</li>
                <li><strong>Test and adjust</strong> — Sideboard plans need refinement through practice</li>
            </ol>
            <h2>Format-Specific Tips</h2>
            <ul>
                <li><strong>Standard:</strong> Sideboards tend to be broader since the metagame shifts frequently. Flexible answers like counterspells and removal are key.</li>
                <li><strong>Pioneer:</strong> Graveyard hate and artifact/enchantment removal are almost always needed. Plan for combo matchups.</li>
                <li><strong>Modern:</strong> The format is diverse, so dedicate slots to the top 5-6 decks. Cards that hit multiple matchups (e.g., <em>Engineered Explosives</em>) are premium.</li>
            </ul>
            <h2>Common Mistakes</h2>
            <ul>
                <li>Sideboarding reactively instead of having a plan before the match</li>
                <li>Bringing in cards without knowing what to cut</li>
                <li>Ignoring your own deck's mana curve after sideboarding</li>
                <li>Not testing your sideboard — theory and practice often diverge</li>
            </ul>
            <p>Ready to build your deck? Use our <a href="/tools/hypergeometric/">Hypergeometric Calculator</a> to compute the odds of drawing your sideboard cards, optimize your land base with the <a href="/tools/manabase/">Mana Base Calculator</a>, and check out our <a href="/decks/">top competitive decks</a> for proven sideboard plans. Browse all our <a href="/guides/">strategy guides</a> for more tips.</p>
        `, { ldJson: sideboardFaq });

  // ── Commander Deck Building Guide ──
  const commanderFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How many lands should a Commander deck have?",
        "acceptedAnswer": { "@type": "Answer", "text": "Most Commander decks run 36-38 lands, plus 10-12 ramp sources (mana rocks and ramp spells). Lower-curve decks (average mana value under 3) can go as low as 33-35 lands with more cheap ramp. Higher-curve or landfall decks may want 38-40 lands. Use our Mana Base Calculator for precise recommendations." }
      },
      {
        "@type": "Question",
        "name": "What is the best ratio of ramp, draw, and removal in Commander?",
        "acceptedAnswer": { "@type": "Answer", "text": "A solid starting point is the 10-10-10 rule: 10 ramp sources, 10 card draw sources, and 10 removal/interaction pieces. This leaves about 33 slots for lands and 37 for your commander's strategy. Adjust based on your commander — spellslinger decks want more draw, while green decks lean into ramp." }
      },
      {
        "@type": "Question",
        "name": "How do I choose a commander for my first EDH deck?",
        "acceptedAnswer": { "@type": "Answer", "text": "Pick a commander that excites you and has a clear build-around strategy. Good first commanders have straightforward abilities, are in 2-3 colors (for deck-building flexibility without mana base complexity), and have plenty of budget-friendly support cards. Popular starter commanders include Aesi, Tyrant of Gyre Strait (Simic value), Prossh, Skyraider of Kher (Jund tokens), and Syr Ginger, the Meal Ender (colorless artifacts)." }
      }
    ]
  };
  writePage('guides/commander-deck-building.html', 'How to Build a Commander Deck — EDH Deck Building Guide', 'Complete guide to building a Commander/EDH deck. Choosing a commander, 100-card singleton rules, mana base, ramp/draw/removal ratios, power level brackets, and budget tips.', 'guides', `
            <p>Commander (also known as EDH) is Magic's most popular format, and building your first deck is one of the most rewarding experiences in the game. This guide walks you through every step, from choosing your commander to finalizing your mana base.</p>
            <h2>The Basics</h2>
            <ul>
                <li><strong>100 cards</strong> including your commander</li>
                <li><strong>Singleton</strong> — only one copy of each card (except basic lands)</li>
                <li><strong>Color identity</strong> — every card must match your commander's color identity</li>
                <li><strong>Starting life:</strong> 40 (21 commander damage from a single commander is lethal)</li>
            </ul>
            <h2>Step 1: Choose Your Commander</h2>
            <p>Your commander defines your deck. Look for a legendary creature with an ability that inspires you. Consider:</p>
            <ul>
                <li><strong>Strategy:</strong> Does the commander suggest a clear game plan (tokens, spellslinger, voltron, combo)?</li>
                <li><strong>Colors:</strong> 2-3 color commanders offer the best balance of card access and mana base simplicity</li>
                <li><strong>Budget:</strong> Some commanders thrive with budget cards, while others need expensive staples</li>
                <li><strong>Popularity:</strong> Sites like EDHREC show the most-built commanders and common includes</li>
            </ul>
            <h2>Step 2: Build Your Mana Base</h2>
            <p>A reliable mana base is critical in a format with 2+ colors and 100 cards. Start with 36-38 lands:</p>
            <ul>
                <li><strong>Basics:</strong> Always include enough basics for fetch effects and <em>Path to Exile</em></li>
                <li><strong>Dual lands:</strong> Use shock lands, check lands, and battle lands for fixing (see our <a href="/guides/mana-bases.html">Mana Base Guide</a> and <a href="/guides/dual-lands.html">Dual Land Cycles</a>)</li>
                <li><strong>Utility lands:</strong> <em>Command Tower</em>, <em>Exotic Orchard</em>, <em>Reliquary Tower</em></li>
                <li><strong>Mana rocks:</strong> <em>Sol Ring</em>, <em>Arcane Signet</em>, and signets for your colors</li>
            </ul>
            <p>Use our <a href="/tools/manabase/">Mana Base Calculator</a> to get precise land counts for your color distribution.</p>
            <h2>Step 3: The 10-10-10 Framework</h2>
            <p>A balanced Commander deck needs three categories of support cards:</p>
            <ul>
                <li><strong>10 Ramp sources:</strong> <em>Sol Ring</em>, <em>Arcane Signet</em>, <em>Cultivate</em>, <em>Kodama's Reach</em>, signets, talismans</li>
                <li><strong>10 Card draw sources:</strong> <em>Rhystic Study</em>, <em>Beast Whisperer</em>, <em>Phyrexian Arena</em>, <em>Harmonize</em></li>
                <li><strong>10 Removal/interaction:</strong> <em>Swords to Plowshares</em>, <em>Chaos Warp</em>, <em>Beast Within</em>, <em>Counterspell</em>, board wipes</li>
            </ul>
            <h2>Step 4: Fill Your Strategy Slots</h2>
            <p>With ~37 lands, ~10 ramp, ~10 draw, ~10 removal, and your commander, you have about 32 slots for cards that advance your deck's strategy. Focus on cards that synergize with your commander's ability.</p>
            <h2>Power Level and Brackets</h2>
            <p>Commander uses a bracket system to help players find games at similar power levels:</p>
            <ul>
                <li><strong>Bracket 1 (Casual):</strong> Precons and lightly upgraded decks. No infinite combos, no fast mana beyond Sol Ring.</li>
                <li><strong>Bracket 2 (Focused):</strong> Clear strategy, some synergy, budget-conscious. Infinite combos allowed if they need 3+ pieces.</li>
                <li><strong>Bracket 3 (Optimized):</strong> Tuned lists with efficient combos and strong interaction. Most organized play falls here.</li>
                <li><strong>Bracket 4 (cEDH):</strong> Fully competitive with fast mana, free counterspells, and efficient win conditions.</li>
            </ul>
            <p>Check out our <a href="/tools/commander-bracket/">Commander Bracket Calculator</a> to estimate your deck's power level.</p>
            <h2>Budget Tips</h2>
            <ul>
                <li>Start with a preconstructed deck and upgrade gradually</li>
                <li>Many staples have budget alternatives (e.g., <em>Night's Whisper</em> instead of <em>Rhystic Study</em>)</li>
                <li>Invest in mana base first — good lands improve every game</li>
                <li>Check multiple vendors for the best prices on singles</li>
            </ul>
        `, { ldJson: commanderFaq });

  // ── MTG Arena Beginner's Guide ──
  const arenaFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Is MTG Arena free to play?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes, MTG Arena is completely free to download and play. You earn gold through daily wins and quests, which can be spent on packs and events. While you can spend real money on gems for faster collection building, it is entirely possible to build competitive decks as a free-to-play player through smart resource management." }
      },
      {
        "@type": "Question",
        "name": "What is the best starter deck in MTG Arena?",
        "acceptedAnswer": { "@type": "Answer", "text": "The mono-colored starter decks are regularly updated, but historically the mono-red (aggressive) and mono-green (ramp) decks perform best for grinding daily wins. After completing the color challenges, pick a two-color starter deck that matches your play style. Upgrade whichever deck you enjoy most rather than spreading wildcards thin across multiple decks." }
      },
      {
        "@type": "Question",
        "name": "How do wildcards work in MTG Arena?",
        "acceptedAnswer": { "@type": "Answer", "text": "Wildcards are special items that can be redeemed for any card of the same rarity. You get wildcards from opening packs (guaranteed at set intervals) and from the wildcard track. There are four tiers: common, uncommon, rare, and mythic rare. Rare and mythic wildcards are the most valuable — spend them carefully on cards you know you need for a specific deck rather than speculative crafting." }
      }
    ]
  };
  writePage('guides/arena-beginners-guide.html', "MTG Arena Beginner's Guide — How to Start and Succeed", "Complete beginner's guide to MTG Arena. How to get started, earn gold and gems, build decks with wildcards, navigate events, and climb the ranked ladder as a free-to-play player.", 'guides', `
            <p>MTG Arena is the best way to play Magic: The Gathering digitally. Whether you're brand new to Magic or a tabletop veteran going digital, this guide covers everything you need to know to get started and build a competitive collection without breaking the bank.</p>
            <h2>Getting Started</h2>
            <p>Download MTG Arena for free on PC, Mac, iOS, or Android. The game starts with a tutorial that teaches basic mechanics through guided matches. After the tutorial, you'll unlock color challenges that reward you with a starter deck for each color.</p>
            <h2>The Economy: Gold, Gems, and Wildcards</h2>
            <h3>Gold</h3>
            <p>Gold is the free currency earned through daily wins (up to 750/day) and daily quests (500 or 750 each). Spend gold on packs (1,000 gold each) or event entries.</p>
            <h3>Gems</h3>
            <p>Gems are the premium currency, purchasable with real money or earnable through events. The best gem-to-value ratio comes from the highest gem bundle. Gems are needed for the Mastery Pass and some premium events.</p>
            <h3>Wildcards</h3>
            <p>Wildcards let you craft any card of matching rarity. You get them from opening packs at guaranteed intervals. Rare and mythic wildcards are precious — spend them on proven decks, not experiments.</p>
            <h2>Building Your First Competitive Deck</h2>
            <ol>
                <li><strong>Pick one deck</strong> — Focus on a single competitive deck rather than building several mediocre ones</li>
                <li><strong>Start with a budget version</strong> — Many top decks have budget cores that work well at lower ranks</li>
                <li><strong>Upgrade gradually</strong> — Use wildcards to add the most impactful rares/mythics first</li>
                <li><strong>Check the meta</strong> — Visit our <a href="/decks/">top decks page</a> to see what's performing well</li>
            </ol>
            <p>Need help with your mana base? Our <a href="/tools/manabase/">Mana Base Calculator</a> works for Arena decks too.</p>
            <h2>Game Modes</h2>
            <ul>
                <li><strong>Play (unranked):</strong> Casual matches with no stakes — great for testing new decks</li>
                <li><strong>Ranked:</strong> Climb from Bronze to Mythic in both Constructed and Limited. Rank resets each season.</li>
                <li><strong>Quick Draft:</strong> Draft against bots for 5,000 gold. Best value for building your collection and improving.</li>
                <li><strong>Premier Draft:</strong> Draft against humans for 10,000 gold or 1,500 gems. More competitive, better rewards.</li>
                <li><strong>Events:</strong> Rotating events with unique rules and rewards. Check the schedule for special events.</li>
            </ul>
            <h2>Free-to-Play Tips</h2>
            <ul>
                <li>Complete every daily quest — they're your primary gold income</li>
                <li>Get at least 4 daily wins each day (after 4, rewards drop off sharply)</li>
                <li>Rare-draft in Quick Draft to build your collection efficiently</li>
                <li>Save gold for the next set release — early drafting is the best value</li>
                <li>Never buy packs with gems — use gems for drafts and the Mastery Pass</li>
                <li>Don't craft cards until you have a complete decklist planned</li>
            </ul>
            <h2>Understanding Formats on Arena</h2>
            <p>MTG Arena supports Standard, Alchemy, Explorer (similar to Pioneer), Historic, and Timeless. For a full breakdown, see our <a href="/guides/formats.html">MTG Formats Explained</a> guide. If you're interested in Commander, Arena offers Brawl (a 60-card variant) — check our <a href="/guides/commander-deck-building.html">Commander Deck Building Guide</a> for the full format.</p>
            <h2>Climbing the Ranked Ladder</h2>
            <ul>
                <li>Play a deck you know well — consistency beats novelty in ranked</li>
                <li>Learn the meta and adjust your deck's answers accordingly</li>
                <li>Track your win rate — if it drops below 50%, take a break or switch decks</li>
                <li>Mythic rank requires sustained play, not just a high win rate</li>
            </ul>
        `, { ldJson: arenaFaq });

  // ── MTG Banned & Restricted List ──
  const bannedListFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What cards are banned in Standard MTG?",
        "acceptedAnswer": { "@type": "Answer", "text": "Standard bans change with each Banned & Restricted announcement. Recent bans have targeted cards that warp the metagame — check Wizards of the Coast's official announcements for the most current list. Standard bans typically focus on cards with win rates or metagame shares significantly above healthy thresholds." }
      },
      {
        "@type": "Question",
        "name": "How often does Wizards update the MTG banned list?",
        "acceptedAnswer": { "@type": "Answer", "text": "Wizards of the Coast issues Banned & Restricted announcements roughly every 4-8 weeks, though emergency bans can happen at any time. Major ban windows typically align with set releases and competitive season milestones. Commander bans are managed separately by the Commander Rules Committee (now under Wizards oversight since late 2024)." }
      },
      {
        "@type": "Question",
        "name": "What is the difference between banned and restricted in MTG?",
        "acceptedAnswer": { "@type": "Answer", "text": "Banned cards cannot be included in your deck at all. Restricted cards (used only in Vintage) are limited to one copy in your deck instead of the usual four. Vintage uses restrictions instead of bans for most powerful cards like Black Lotus and the Moxen, keeping them legal but limited." }
      }
    ]
  };
  writePage('guides/banned-list.html', 'MTG Banned & Restricted List — Every Format Updated', 'Complete MTG banned and restricted list for Standard, Pioneer, Modern, Legacy, Vintage, Commander, and Pauper. Updated with every B&R announcement.', 'guides', `
            <p>The Banned &amp; Restricted list is one of the most impactful forces in competitive Magic. When a card gets banned, entire metagames shift overnight. This page covers the current banned and restricted cards across every major format, how bans work, and what to watch for.</p>

            <h2>How Bans Work</h2>
            <p>Wizards of the Coast monitors competitive data (win rates, metagame share, player sentiment) and issues Banned &amp; Restricted announcements roughly every 4-8 weeks. Cards are banned when they create unhealthy play patterns, suppress diversity, or push win rates beyond acceptable thresholds.</p>
            <ul>
                <li><strong>Banned</strong> — The card cannot be included in your deck (main or sideboard)</li>
                <li><strong>Restricted</strong> — Only used in Vintage; the card is limited to 1 copy instead of 4</li>
                <li><strong>Suspended</strong> — Used on MTG Arena; temporarily removed while being evaluated</li>
            </ul>

            <h2>Standard Banned Cards</h2>
            <p>Standard typically has a short ban list since the format self-corrects through rotation. When bans do happen, they target format-warping threats. Check Wizards' official announcements for the latest updates as Standard evolves with each new set release.</p>

            <h2>Pioneer Banned Cards</h2>
            <p>Pioneer's ban list was shaped heavily during the format's early years (2019-2021). Key permanent bans include the fetch lands (all 10), plus powerful combo and value engines that proved too dominant. The format is now relatively stable with infrequent changes.</p>

            <h2>Modern Banned Cards</h2>
            <p>Modern has the most active ban list history among 60-card formats. Iconic bans include Splinter Twin, Birthing Pod, Hogaak, and more recently various Modern Horizons cards. The Modern ban list shapes the format's identity as much as any legal card.</p>

            <h2>Legacy Banned Cards</h2>
            <p>Legacy bans target cards too powerful even with Force of Will as a safety valve. Recent years have seen bans targeting free spells and efficient threats that bypass Legacy's traditional answers.</p>

            <h2>Vintage Restricted List</h2>
            <p>Vintage restricts rather than bans most cards (only ante cards, dexterity cards, and Conspiracies are fully banned). The restricted list includes the most iconic cards in Magic's history: Black Lotus, Ancestral Recall, Time Walk, and the Moxen.</p>

            <h2>Commander Banned Cards</h2>
            <p>Commander bans are managed by the Commander Rules Committee (under Wizards oversight since late 2024). The Commander ban list focuses on cards that create unfun play patterns in multiplayer — fast mana, mass land destruction, and cards that end games immediately without interaction.</p>

            <h2>Pauper Banned Cards</h2>
            <p>Pauper bans target commons that create degenerate strategies. Despite being commons-only, several cards have proven too powerful including Storm combo pieces, efficient cantrips, and artifact lands.</p>

            <h2>When Is the Next B&amp;R Announcement?</h2>
            <p>Wizards typically announces B&amp;R updates on their official site and social media. Follow our <a href="/news/">MTG News</a> page for coverage of every announcement, including metagame analysis and what the bans mean for your decks.</p>

            <h2>Related Resources</h2>
            <p>Understand every format's rules with our <a href="/guides/formats.html">MTG Formats Explained</a> guide. Check the latest <a href="/decks/">top competitive decks</a> to see how the metagame looks post-ban. Use our <a href="/tools/price-checker/">Deck Price Checker</a> to track how bans affect card prices.</p>
        `, { ldJson: bannedListFaq });

  // ── MTG Standard Rotation Guide ──
  const rotationFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "When is the next MTG Standard rotation?",
        "acceptedAnswer": { "@type": "Answer", "text": "Standard rotation happens once per year, typically with the fall set release (around September-October). When rotation occurs, the oldest sets in Standard leave the format. As of 2026, Standard includes a larger window of sets than the previous 2-year model — Wizards expanded Standard to roughly 3 years of sets starting in 2024." }
      },
      {
        "@type": "Question",
        "name": "What sets are currently legal in Standard MTG?",
        "acceptedAnswer": { "@type": "Answer", "text": "Standard legality changes with each new set release and annual rotation. As of early 2026, Standard includes sets from Wilds of Eldraine (2023) through the most recent release. Check Wizards of the Coast's official page or our set list below for the most current information." }
      },
      {
        "@type": "Question",
        "name": "How does Standard rotation work in MTG?",
        "acceptedAnswer": { "@type": "Answer", "text": "Once per year, the oldest block of sets rotates out of Standard, and they are no longer legal in the format. This keeps Standard fresh and accessible. Cards that rotate out can still be played in Pioneer, Modern, Legacy, Commander, and other non-rotating formats. Wizards announces rotation dates well in advance so players can plan ahead." }
      }
    ]
  };
  writePage('guides/standard-rotation.html', 'MTG Standard Rotation Guide — What Sets Are Legal', 'Complete guide to MTG Standard rotation. Current legal sets, upcoming rotation dates, and how rotation works. Updated for 2026.', 'guides', `
            <p>Standard rotation is one of the most important events on Magic's calendar. When sets rotate out, entire decks can become illegal overnight, while new archetypes emerge. This guide covers everything you need to know about how Standard rotation works, what's currently legal, and how to plan ahead.</p>

            <h2>How Standard Rotation Works</h2>
            <p>Standard uses a rolling window of recent sets. Once per year (typically with the fall set), the oldest sets leave the format. Wizards expanded Standard's window in 2024, meaning more sets are legal at any given time than under the previous 2-year model.</p>
            <ul>
                <li><strong>Rotation frequency:</strong> Once per year (fall set release)</li>
                <li><strong>Window size:</strong> Approximately 3 years of sets (expanded from 2 years in 2024)</li>
                <li><strong>What rotates:</strong> The oldest block of sets leaves when the new fall set enters</li>
            </ul>

            <h2>Currently Legal Sets</h2>
            <p>Standard currently includes all Standard-legal sets released from Wilds of Eldraine (September 2023) through the most recent release. This includes:</p>
            <ul>
                <li><strong>Wilds of Eldraine</strong> (September 2023)</li>
                <li><strong>The Lost Caverns of Ixalan</strong> (November 2023)</li>
                <li><strong>Murders at Karlov Manor</strong> (February 2024)</li>
                <li><strong>Outlaws of Thunder Junction</strong> (April 2024)</li>
                <li><strong>Bloomburrow</strong> (August 2024)</li>
                <li><strong>Duskmourn: House of Horror</strong> (September 2024)</li>
                <li><strong>Foundations</strong> (November 2024)</li>
                <li><strong>Aetherdrift</strong> (February 2025)</li>
                <li><strong>Tarkir: Dragonstorm</strong> (April 2025)</li>
                <li><strong>Final Fantasy</strong> (June 2025)</li>
            </ul>
            <p><em>Note: This list is updated periodically. Check Wizards of the Coast for the most current legal sets.</em></p>

            <h2>Upcoming 2026 Releases</h2>
            <p>Several new sets will enter Standard throughout 2026:</p>
            <ul>
                <li><strong>TMNT (Teenage Mutant Ninja Turtles)</strong> — Q1 2026</li>
                <li><strong>Marvel Super Heroes</strong> — Q2 2026</li>
                <li><strong>The Hobbit</strong> — Q3 2026</li>
                <li><strong>Reality Fracture</strong> — Q4 2026 (likely rotation set)</li>
            </ul>

            <h2>Planning for Rotation</h2>
            <ul>
                <li><strong>3-4 months before rotation:</strong> Avoid investing heavily in cards from the oldest legal sets</li>
                <li><strong>1 month before:</strong> Start testing decks that use only cards from the sets that will survive rotation</li>
                <li><strong>Rotation day:</strong> The new Standard metagame is wide open — early brewers often find the best decks first</li>
                <li><strong>After rotation:</strong> Rotating cards often drop in price but may see play in Pioneer or Modern</li>
            </ul>

            <h2>Standard on MTG Arena</h2>
            <p>MTG Arena implements Standard rotation automatically — cards from rotated sets become illegal in Standard queues but remain playable in Historic, Explorer, and other Arena formats. Your collection is never truly lost. For Arena-specific tips, see our <a href="/guides/arena-beginners-guide.html">MTG Arena Beginner's Guide</a>.</p>

            <h2>Related Resources</h2>
            <p>Browse the <a href="/decks/">top Standard decks</a> to see what's performing in the current metagame. Learn about all formats in our <a href="/guides/formats.html">MTG Formats Explained</a> guide. Use our <a href="/tools/manabase/">Mana Base Calculator</a> to optimize your Standard deck's land base.</p>
        `, { ldJson: rotationFaq });

  writePage('about/authors.html', 'Our Authors', 'Meet the writers behind ScrollVault. Expert Magic: The Gathering players providing daily news, strategy, and deck guides.', 'about', `
            <p>ScrollVault is written by a team of dedicated Magic players who have been slinging cardboard since the early days. We combine human passion with AI-assisted research to bring you timely, accurate coverage.</p>
            <h2>Molts MTG</h2>
            <p>Founder and lead writer. A long-time Spike who loves breaking the meta. Favorite format: Modern. Follow on Twitter @moltsmtg.</p>
            <h2>Contributors</h2>
            <p>We occasionally feature guest writers from the community. If you're interested in contributing, <a href="/contact.html">get in touch</a>.</p>
        `);
  writePage('about/editorial-policy.html', 'Editorial Policy', 'How ScrollVault maintains accuracy: sources, automated fact-checking, correction process, and transparency commitments.', 'about', `
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
  const publishedPosts = data.posts.filter(p => p.published);
  // Hub pages get lastmod from the most recent post in that category (or site-wide)
  const latestPostDate = publishedPosts.length ? publishedPosts[0].date : today;
  const latestByCategory = {};
  for (const p of publishedPosts) {
    const cat = p.category || 'News';
    if (!latestByCategory[cat] || p.date > latestByCategory[cat]) latestByCategory[cat] = p.date;
  }

  const sitemapUrls = [
    { loc: '/', changefreq: 'daily', priority: '1.0', lastmod: latestPostDate },
    { loc: '/news/', changefreq: 'daily', priority: '0.8', lastmod: latestByCategory['News'] || latestPostDate },
    { loc: '/guides/', changefreq: 'weekly', priority: '0.8', lastmod: latestByCategory['Strategy'] || latestPostDate },
    { loc: '/spoilers/', changefreq: 'weekly', priority: '0.7', lastmod: latestByCategory['Spoilers'] || latestPostDate },
    { loc: '/deck-guides/', changefreq: 'weekly', priority: '0.7', lastmod: latestByCategory['Deck Guides'] || latestPostDate },
    { loc: '/set-reviews/', changefreq: 'weekly', priority: '0.7', lastmod: latestByCategory['Set Reviews'] || latestPostDate },
    { loc: '/about.html', changefreq: 'monthly', priority: '0.5', lastmod: '2026-02-06' },
    { loc: '/contact.html', changefreq: 'monthly', priority: '0.5', lastmod: '2026-02-06' },
    { loc: '/privacy.html', changefreq: 'yearly', priority: '0.3', lastmod: '2026-02-06' },
    { loc: '/terms.html', changefreq: 'yearly', priority: '0.3', lastmod: '2026-02-06' },
    { loc: '/about/authors.html', changefreq: 'monthly', priority: '0.4', lastmod: '2026-02-06' },
    { loc: '/about/editorial-policy.html', changefreq: 'monthly', priority: '0.4', lastmod: '2026-02-06' },
    { loc: '/guides/mana-bases.html', changefreq: 'monthly', priority: '0.6', lastmod: '2026-02-13' },
    { loc: '/guides/dual-lands.html', changefreq: 'monthly', priority: '0.6', lastmod: '2026-02-13' },
    { loc: '/guides/formats.html', changefreq: 'monthly', priority: '0.6', lastmod: '2026-02-13' },
    { loc: '/guides/sideboard-guide.html', changefreq: 'monthly', priority: '0.6', lastmod: '2026-02-13' },
    { loc: '/guides/commander-deck-building.html', changefreq: 'monthly', priority: '0.6', lastmod: '2026-02-13' },
    { loc: '/guides/arena-beginners-guide.html', changefreq: 'monthly', priority: '0.6', lastmod: '2026-02-13' },
    { loc: '/guides/banned-list.html', changefreq: 'weekly', priority: '0.7', lastmod: '2026-02-13' },
    { loc: '/guides/standard-rotation.html', changefreq: 'monthly', priority: '0.6', lastmod: '2026-02-13' },
    // Hand-crafted pages
    { loc: '/decks/', changefreq: 'weekly', priority: '0.8', lastmod: '2026-02-14' },
    { loc: '/draft/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-02-14' },
    { loc: '/tools/', changefreq: 'monthly', priority: '0.8', lastmod: '2026-02-13' },
    { loc: '/tools/manabase/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-02-13' },
    { loc: '/tools/lands/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-02-13' },
    { loc: '/tools/hypergeometric/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-02-13' },
    { loc: '/tools/hand-simulator/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-02-13' },
    { loc: '/tools/price-checker/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-02-13' },
    { loc: '/tools/commander-bracket/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-02-13' },
    { loc: '/tools/sealed/', changefreq: 'monthly', priority: '0.7', lastmod: '2026-02-13' },
  ];

  // Add all published posts
  for (const post of publishedPosts) {
    sitemapUrls.push({
      loc: `/posts/${post.slug}.html`,
      lastmod: post.date,
      changefreq: 'monthly',
      priority: '0.6'
    });
  }

  // Build image lookup for post URLs
  const postImageMap = {};
  for (const p of publishedPosts) {
    const img = p.hero_image || ((p._cards || []).find(c => c && c.art_crop) || {}).art_crop || '';
    if (img) postImageMap[`/posts/${p.slug}.html`] = { loc: img, title: p.title };
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${sitemapUrls.map(u => {
    const imgData = postImageMap[u.loc];
    return `  <url>
    <loc>${SITE_URL}${u.loc}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${imgData ? `
    <image:image>
      <image:loc>${rssEsc(imgData.loc)}</image:loc>
      <image:title>${rssEsc(imgData.title)}</image:title>
    </image:image>` : ''}
  </url>`;
  }).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), sitemapXml);
  console.log(`Sitemap generated with ${sitemapUrls.length} URLs.`);

  // ── RSS FEED ──
  const rssItems = publishedPosts.slice(0, 20);
  function rssEsc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>ScrollVault - MTG News &amp; Strategy</title>
  <link>${SITE_URL}</link>
  <description>The latest Magic: The Gathering news, strategy guides, deck techs, set reviews, and spoilers.</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${rssItems.map(p => `  <item>
    <title>${rssEsc(p.title)}</title>
    <link>${SITE_URL}/posts/${p.slug}.html</link>
    <guid isPermaLink="true">${SITE_URL}/posts/${p.slug}.html</guid>
    <pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate>
    <category>${rssEsc(p.category)}</category>
    <description>${rssEsc(p.excerpt)}</description>
  </item>`).join('\n')}
</channel>
</rss>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'feed.xml'), rssXml);
  console.log(`RSS feed generated with ${rssItems.length} items.`);

  // ── Google News Sitemap (last 2 days only) ──
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const newsItems = publishedPosts.filter(p => p.date >= twoDaysAgo);
  const newsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${newsItems.map(p => {
    const newsImg = p.hero_image || ((p._cards || []).find(c => c && c.art_crop) || {}).art_crop || '';
    return `  <url>
    <loc>${SITE_URL}/posts/${p.slug}.html</loc>
    <news:news>
      <news:publication>
        <news:name>ScrollVault</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${p.date}T12:00:00Z</news:publication_date>
      <news:title>${rssEsc(p.title)}</news:title>
    </news:news>${newsImg ? `
    <image:image>
      <image:loc>${rssEsc(newsImg)}</image:loc>
      <image:title>${rssEsc(p.title)}</image:title>
    </image:image>` : ''}
  </url>`;
  }).join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'news-sitemap.xml'), newsSitemap);
  console.log(`News sitemap generated with ${newsItems.length} items.`);

  // ── Sync shared assets and hand-crafted pages when building to a different output dir ──
  if (OUTPUT_DIR !== ROOT) {
    const syncFiles = ['robots.txt', 'favicon.svg', 'apple-touch-icon.png', 'og-default.png', '.htaccess'];
    for (const f of syncFiles) {
      const src = path.join(ROOT, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(OUTPUT_DIR, f));
      }
    }
    const syncDirs = ['decks', 'draft', 'tools/manabase', 'tools/lands', 'tools/hypergeometric', 'tools/hand-simulator', 'tools/price-checker', 'tools/commander-bracket', 'tools/sealed'];
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