#!/bin/bash
# Expand thin posts to 1000+ words using OpenClaw writer agent
# Strategy: Generate additional sections to APPEND to existing content
# Usage: ./expand-posts.sh [max_posts]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$BASE_DIR/data"
POSTS_FILE="$DATA_DIR/posts.json"
OPENCLAW_BIN="/usr/bin/openclaw"
LOG_DIR="$BASE_DIR/logs"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/expand-${TIMESTAMP}.log"
TMP_DIR="/tmp/expand-$$"

MAX_POSTS="${1:-999}"

export GOG_KEYRING_PASSWORD=moltbot

mkdir -p "$LOG_DIR" "$TMP_DIR"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

# Node helper: get thin posts
cat > "$TMP_DIR/get-thin.cjs" << 'NODESCRIPT'
const fs = require('fs');
const postsFile = process.argv[2];
const posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')).posts;
const thin = posts
    .filter(p => p.published)
    .map(p => {
        const words = p.body ? p.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).length : 0;
        return { slug: p.slug, title: p.title, words };
    })
    .filter(p => p.words < 900)
    .sort((a, b) => a.words - b.words);
thin.forEach(p => console.log(p.slug + '|' + p.words + '|' + p.title));
NODESCRIPT

# Node helper: extract body summary + last paragraph for context
cat > "$TMP_DIR/get-context.cjs" << 'NODESCRIPT'
const fs = require('fs');
const postsFile = process.argv[2];
const slug = process.argv[3];
const outFile = process.argv[4];
const posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')).posts;
const p = posts.find(x => x.slug === slug);
if (p && p.body) {
    // Get title, category, and a brief summary of what the article covers
    const text = p.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const summary = text.substring(0, 1500);
    fs.writeFileSync(outFile, JSON.stringify({
        title: p.title,
        category: p.category,
        summary: summary
    }));
}
NODESCRIPT

# Node helper: append new content to post body
cat > "$TMP_DIR/append-body.cjs" << 'NODESCRIPT'
const fs = require('fs');
const postsFile = process.argv[2];
const slug = process.argv[3];
const appendFile = process.argv[4];
const data = JSON.parse(fs.readFileSync(postsFile, 'utf8'));
const post = data.posts.find(p => p.slug === slug);
const newContent = fs.readFileSync(appendFile, 'utf8').trim();
if (post) {
    post.body = (post.body || '') + '\n' + newContent;
    fs.writeFileSync(postsFile, JSON.stringify(data, null, 2));
    const words = post.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).length;
    console.log('Updated: ' + slug + ' (' + words + ' words total)');
}
NODESCRIPT

THIN_SLUGS=$(node "$TMP_DIR/get-thin.cjs" "$POSTS_FILE")

if [ -z "$THIN_SLUGS" ]; then
    log "No thin posts found. Done."
    rm -rf "$TMP_DIR"
    exit 0
fi

TOTAL=$(echo "$THIN_SLUGS" | wc -l)
log "=== Expanding thin posts: $TOTAL found, processing up to $MAX_POSTS ==="

COUNT=0
SUCCESS=0
FAILED=0

echo "$THIN_SLUGS" | head -n "$MAX_POSTS" | while IFS='|' read -r SLUG WORDS TITLE; do
    COUNT=$((COUNT + 1))
    log ""
    log "--- [$COUNT] $SLUG ($WORDS words) ---"
    log "Title: $TITLE"

    # Calculate how many additional words we need
    NEED=$((1050 - WORDS))
    if [ "$NEED" -lt 200 ]; then
        NEED=200
    fi

    # Get article context
    CTX_FILE="$TMP_DIR/ctx-${SLUG}.json"
    node "$TMP_DIR/get-context.cjs" "$POSTS_FILE" "$SLUG" "$CTX_FILE" 2>/dev/null

    if [ ! -f "$CTX_FILE" ]; then
        log "ERROR: Could not extract context for $SLUG"
        FAILED=$((FAILED + 1))
        continue
    fi

    SUMMARY=$(node -e "const d=JSON.parse(require('fs').readFileSync('$CTX_FILE','utf8')); console.log(d.summary)" 2>/dev/null)
    CATEGORY=$(node -e "const d=JSON.parse(require('fs').readFileSync('$CTX_FILE','utf8')); console.log(d.category)" 2>/dev/null)

    # Build prompt asking for ADDITIONAL content only
    PROMPT_FILE="$TMP_DIR/prompt-${SLUG}.txt"
    cat > "$PROMPT_FILE" << PROMPT_EOF
Write $NEED additional words to append to an existing Magic: The Gathering article. This content will be added at the END of the existing article.

RULES:
1. Return ONLY HTML content (h2, h3, p, ul/ol tags). No markdown, no code fences, no preamble.
2. Write exactly the sections listed below — nothing else.
3. Engaging MTG community voice — knowledgeable but accessible.
4. Reference specific card names where relevant.

WRITE THESE SECTIONS:
- A "Strategic Implications" or "What This Means for Players" section (h2 + 2-3 paragraphs)
- A "Looking Ahead" or "The Bottom Line" conclusion section (h2 + 1-2 paragraphs)

ARTICLE CONTEXT:
Category: $CATEGORY
Title: $TITLE
Summary of existing content: $SUMMARY
PROMPT_EOF

    PROMPT_TEXT=$(cat "$PROMPT_FILE")
    RESULT_FILE="$TMP_DIR/result-${SLUG}.txt"

    $OPENCLAW_BIN agent \
        --agent writer \
        --session-id "expand-${SLUG}-${TIMESTAMP}" \
        --timeout 180 \
        -m "$PROMPT_TEXT" > "$RESULT_FILE" 2>&1 || {
        log "ERROR: Writer agent failed for $SLUG"
        FAILED=$((FAILED + 1))
        continue
    }

    # Strip openclaw noise and code fences
    sed -i '/^\[.*\] Attempt [0-9]/d' "$RESULT_FILE"
    sed -i '/^[0-9]\{3\} Provider returned/d' "$RESULT_FILE"
    sed -i '/^{"error":/d' "$RESULT_FILE"
    sed -i '/^```html$/d' "$RESULT_FILE"
    sed -i '/^```$/d' "$RESULT_FILE"
    # Remove any leading/trailing blank lines
    sed -i '/^$/d' "$RESULT_FILE"

    # Validate: must have some HTML and at least 150 words
    HAS_HTML=$(grep -c '<[ph]' "$RESULT_FILE" || true)
    APPEND_WORDS=$(sed 's/<[^>]*>//g' "$RESULT_FILE" | wc -w | tr -d ' ')

    if [ "$HAS_HTML" -lt 1 ] || [ "$APPEND_WORDS" -lt 50 ]; then
        log "SKIP: Output too short or missing HTML ($APPEND_WORDS words, $HAS_HTML tags)"
        FAILED=$((FAILED + 1))
        continue
    fi

    # Append new content to existing post body
    node "$TMP_DIR/append-body.cjs" "$POSTS_FILE" "$SLUG" "$RESULT_FILE" 2>&1 | tee -a "$LOG_FILE"

    SUCCESS=$((SUCCESS + 1))
    log "Appended $APPEND_WORDS words (was $WORDS)"

    # Delay between API calls to avoid rate limits
    sleep 10
done

log ""
log "=== Done: $SUCCESS expanded, $FAILED failed ==="

rm -rf "$TMP_DIR"
