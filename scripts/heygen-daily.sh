#!/bin/bash
# Daily HeyGen video selector — picks best unprocessed article for video generation
# Priority: Spoilers > Deck Guides > major News (keywords: banned, spike, leak, combo, broken, preview, pro tour, secret lair)
# Skips routine news and strategy articles.
# Usage: ./heygen-daily.sh [--force]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$BASE_DIR/data"
POSTS_FILE="$DATA_DIR/posts.json"
TRACKING_FILE="$DATA_DIR/heygen-posted.json"
GENERATE_SCRIPT="$SCRIPT_DIR/heygen-generate.sh"
LOG_DIR="$BASE_DIR/logs"
LOG_FILE="$LOG_DIR/heygen-daily.log"
FORCE="${1:-}"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Initialize tracking if missing
if [ ! -f "$TRACKING_FILE" ]; then
    echo '{"videos": []}' > "$TRACKING_FILE"
fi

log "=== HeyGen Daily Selector ==="

# Pick the best article
PICK=$(node -e "
const fs = require('fs');
const posts = JSON.parse(fs.readFileSync('$POSTS_FILE', 'utf8')).posts.filter(p => p.published);
const tracked = JSON.parse(fs.readFileSync('$TRACKING_FILE', 'utf8')).videos.map(v => v.slug);
const force = '$FORCE' === '--force';

// Filter out already-processed articles (unless --force)
const candidates = force ? posts : posts.filter(p => !tracked.includes(p.slug));

if (candidates.length === 0) {
    console.error('No unprocessed articles available');
    process.exit(1);
}

// Major news keywords (case-insensitive match against title + excerpt)
const majorKeywords = /banned|spike|leak|combo|broken|preview|pro tour|secret lair|unban|mythic|emergency|errata|reprint/i;

// Score each candidate
const scored = candidates.map(p => {
    const text = (p.title || '') + ' ' + (p.excerpt || '');
    const cat = (p.category || '').toLowerCase();
    let score = 0;

    // Category priority
    if (cat === 'spoilers') score += 100;
    else if (cat === 'deck guides') score += 80;
    else if (cat === 'set reviews') score += 60;
    else if (cat === 'news' && majorKeywords.test(text)) score += 70;
    else if (cat === 'news') score += 20;  // routine news — low priority
    else if (cat === 'strategy') score += 10;  // skip strategy mostly

    // Keyword bonus
    if (majorKeywords.test(text)) score += 30;

    // Card count bonus (more cards = better visuals)
    const cardCount = (p._cards || []).filter(c => c && !c.not_found).length;
    score += Math.min(cardCount * 5, 25);

    // Recency bonus (newer = better)
    const daysSince = Math.max(0, (Date.now() - new Date(p.date).getTime()) / 86400000);
    if (daysSince < 1) score += 20;
    else if (daysSince < 3) score += 10;
    else if (daysSince < 7) score += 5;

    return { slug: p.slug, title: p.title, category: p.category, score };
});

// Sort by score descending
scored.sort((a, b) => b.score - a.score);

// Skip if best candidate scores too low (routine content)
if (scored[0].score < 30 && !force) {
    console.error('No high-priority articles for video today (best score: ' + scored[0].score + ')');
    process.exit(1);
}

console.log(JSON.stringify(scored[0]));
" 2>/dev/null)

if [ -z "$PICK" ]; then
    log "No suitable article found for video today"
    exit 0
fi

SLUG=$(echo "$PICK" | jq -r '.slug')
TITLE=$(echo "$PICK" | jq -r '.title')
SCORE=$(echo "$PICK" | jq -r '.score')
CATEGORY=$(echo "$PICK" | jq -r '.category')

log "Selected: $TITLE"
log "Category: $CATEGORY | Score: $SCORE"

# Generate the video
log "--- Running heygen-generate.sh ---"
bash "$GENERATE_SCRIPT" "$SLUG" 2>&1 | tee -a "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}

if [ $EXIT_CODE -eq 0 ]; then
    log "Video generation succeeded for: $SLUG"
else
    log "ERROR: Video generation failed for: $SLUG (exit $EXIT_CODE)"
    exit $EXIT_CODE
fi

log "=== HeyGen Daily Complete ==="
