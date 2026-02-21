#!/bin/bash
# Daily Bluesky post — picks an article and posts it
# Skips if already posted today. Prioritizes new articles, then rotates older ones.
# Usage: ./bluesky-daily.sh [--force]
#
# Tracked in data/bluesky-posted.json to avoid double-posting.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$BASE_DIR/data"
POSTED_FILE="$DATA_DIR/bluesky-posted.json"
POSTS_FILE="$DATA_DIR/posts.json"
POST_SCRIPT="$SCRIPT_DIR/bluesky-post.sh"
LOG_FILE="$BASE_DIR/logs/bluesky-daily.log"
FORCE="${1:-}"
TODAY=$(date +%Y-%m-%d)

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Initialize posted tracker if missing
if [ ! -f "$POSTED_FILE" ]; then
    echo '{"posts":[]}' > "$POSTED_FILE"
fi

# Check if we already posted today (unless --force)
if [ "$FORCE" != "--force" ]; then
    ALREADY=$(node -e "
        const d = JSON.parse(require('fs').readFileSync('$POSTED_FILE','utf8'));
        const today = d.posts.find(p => p.date === '$TODAY');
        console.log(today ? 'yes' : 'no');
    " 2>/dev/null || echo "no")

    if [ "$ALREADY" = "yes" ]; then
        log "Already posted to Bluesky today — skipping"
        exit 0
    fi
fi

# Pick what to post
# Priority 1: Today's newest published article (from pipeline)
# Priority 2: Oldest article that hasn't been posted to Bluesky yet
# Priority 3: Oldest previously-posted article (re-share rotation)
PICK=$(node -e "
const fs = require('fs');
const posts = JSON.parse(fs.readFileSync('$POSTS_FILE','utf8')).posts.filter(p => p.published);
const posted = JSON.parse(fs.readFileSync('$POSTED_FILE','utf8')).posts.map(p => p.slug);

// Category-specific copy templates
const hooks = {
    'News': [
        'Breaking from the multiverse:',
        'Latest MTG news:',
        'Fresh off the press:',
        'In case you missed it:'
    ],
    'Strategy': [
        'Level up your game:',
        'Strategy deep dive:',
        'Want to win more?',
        'Pro tip time:'
    ],
    'Deck Guides': [
        'Deck tech alert:',
        'New deck guide:',
        'Build this:',
        'Ready to brew?'
    ],
    'Spoilers': [
        'New cards revealed:',
        'Spoiler season:',
        'Check out these previews:',
        'Just previewed:'
    ],
    'Set Reviews': [
        'Set review:',
        'Full breakdown:',
        'Our take on the set:',
        'Worth your wildcards?'
    ]
};

function pickHook(category) {
    const list = hooks[category] || hooks['News'];
    return list[Math.floor(Math.random() * list.length)];
}

// Hashtag generation — category + format detection from title
function buildHashtags(title, category) {
    const tags = ['#MTG', '#MagicTheGathering'];

    // Category tags
    const catTags = {
        'News': '#MTGNews',
        'Strategy': '#MTGStrategy',
        'Deck Guides': '#MTGDecks',
        'Spoilers': '#MTGSpoilers',
        'Set Reviews': '#MTGSpoilers'
    };
    if (catTags[category]) tags.push(catTags[category]);

    // Format detection from title
    const t = title.toLowerCase();
    if (t.includes('arena')) tags.push('#MTGArena');
    if (t.includes('modern')) tags.push('#MTGModern');
    if (t.includes('pioneer')) tags.push('#MTGPioneer');
    if (t.includes('standard')) tags.push('#MTGStandard');
    if (t.includes('commander') || t.includes('edh')) tags.push('#MTGCommander');
    if (t.includes('legacy')) tags.push('#MTGLegacy');
    if (t.includes('draft')) tags.push('#MTGDraft');
    if (t.includes('sealed') || t.includes('prerelease')) tags.push('#MTGSealed');
    if (t.includes('pauper')) tags.push('#MTGPauper');
    if (t.includes('historic')) tags.push('#MTGArena');
    if (t.includes('vintage')) tags.push('#MTGVintage');
    if (t.includes('secret lair')) tags.push('#SecretLair');

    // Set-specific tags
    if (t.includes('tmnt') || t.includes('ninja turtle') || t.includes('teenage mutant')) tags.push('#MTGTMNT');
    if (t.includes('aetherdrift')) tags.push('#MTGAetherdrift');
    if (t.includes('foundations')) tags.push('#MTGFoundations');
    if (t.includes('lorwyn')) tags.push('#MTGLorwyn');

    // Deduplicate and limit to 4 tags max (Bluesky is feed-driven, fewer is better)
    return [...new Set(tags)].slice(0, 4).join(' ');
}

// Priority 1: Today's article
const todayPost = posts.find(p => p.date === '$TODAY');
if (todayPost) {
    const hook = pickHook(todayPost.category);
    console.log(JSON.stringify({
        slug: todayPost.slug,
        title: todayPost.title,
        excerpt: todayPost.excerpt,
        category: todayPost.category,
        hook: hook,
        hashtags: buildHashtags(todayPost.title, todayPost.category),
        reason: 'today'
    }));
    process.exit(0);
}

// Priority 2: Never-posted article (oldest first for variety)
const neverPosted = posts.filter(p => !posted.includes(p.slug));
if (neverPosted.length > 0) {
    // Pick from the older half for variety (not always the newest)
    const pick = neverPosted[neverPosted.length - 1];
    const hook = pickHook(pick.category);
    console.log(JSON.stringify({
        slug: pick.slug,
        title: pick.title,
        excerpt: pick.excerpt,
        category: pick.category,
        hook: hook,
        hashtags: buildHashtags(pick.title, pick.category),
        reason: 'never-posted'
    }));
    process.exit(0);
}

// Priority 3: Re-share the oldest previously posted (round-robin)
const byLastPosted = posts
    .map(p => {
        const entry = JSON.parse(fs.readFileSync('$POSTED_FILE','utf8')).posts
            .filter(e => e.slug === p.slug)
            .sort((a,b) => a.date.localeCompare(b.date));
        return { ...p, lastPosted: entry.length ? entry[entry.length-1].date : '2000-01-01' };
    })
    .sort((a, b) => a.lastPosted.localeCompare(b.lastPosted));

const pick = byLastPosted[0];
const reshareHooks = [
    'From the vault:',
    'Throwback read:',
    'Still relevant:',
    'In case you missed it:'
];
const hook = reshareHooks[Math.floor(Math.random() * reshareHooks.length)];
console.log(JSON.stringify({
    slug: pick.slug,
    title: pick.title,
    excerpt: pick.excerpt,
    category: pick.category,
    hook: hook,
    hashtags: buildHashtags(pick.title, pick.category),
    reason: 'reshare'
}));
" 2>/dev/null)

if [ -z "$PICK" ]; then
    log "ERROR: Could not pick a post"
    exit 1
fi

SLUG=$(echo "$PICK" | jq -r '.slug')
TITLE=$(echo "$PICK" | jq -r '.title')
EXCERPT=$(echo "$PICK" | jq -r '.excerpt')
HOOK=$(echo "$PICK" | jq -r '.hook')
HASHTAGS=$(echo "$PICK" | jq -r '.hashtags')
REASON=$(echo "$PICK" | jq -r '.reason')
URL="https://scrollvault.net/posts/${SLUG}.html"

log "Picked: $TITLE (reason: $REASON)"
log "Hashtags: $HASHTAGS"

# Build post text — keep under 300 chars
# Format: Hook + title + excerpt + hashtags
# Reserve space for hashtags at the end (they go on their own line)
HASHTAG_LEN=${#HASHTAGS}
BUDGET=$((275 - HASHTAG_LEN))

TEXT="${HOOK} ${TITLE}"

# Add excerpt if we have room
REMAINING=$((BUDGET - ${#TEXT}))
if [ $REMAINING -gt 30 ] && [ -n "$EXCERPT" ]; then
    SNIP=$(echo "$EXCERPT" | cut -c1-${REMAINING})
    # Don't cut mid-word
    SNIP=$(echo "$SNIP" | sed 's/ [^ ]*$//')
    TEXT="${TEXT}

${SNIP}..."
fi

# Append hashtags
TEXT="${TEXT}

${HASHTAGS}"

log "Posting: $TEXT"

# Post to Bluesky
RESULT=$(bash "$POST_SCRIPT" "$TEXT" "$URL" "$TITLE" "$EXCERPT" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    log "Posted successfully: $RESULT"

    # Track the post
    node -e "
        const fs = require('fs');
        const d = JSON.parse(fs.readFileSync('$POSTED_FILE','utf8'));
        d.posts.push({ slug: '$SLUG', date: '$TODAY', uri: '$RESULT'.replace('Posted: ','') });
        fs.writeFileSync('$POSTED_FILE', JSON.stringify(d, null, 2));
    " 2>/dev/null || true

    log "Tracked in bluesky-posted.json"
else
    log "ERROR: Bluesky post failed: $RESULT"
    exit 1
fi
