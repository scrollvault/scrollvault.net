#!/bin/bash
# ScrollVault Daily Pipeline
# Runs: Scout -> Writer -> Editor -> Fact Checker -> Publisher -> QA
# Usage: ./pipeline.sh [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
AGENTS_DIR="$SCRIPT_DIR/agents"
LOG_DIR="$SCRIPT_DIR/logs"
OPENCLAW_BIN="/usr/bin/openclaw"
DRY_RUN="${1:-}"

export GOG_KEYRING_PASSWORD=moltbot

mkdir -p "$LOG_DIR" "$DATA_DIR/drafts"

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/pipeline-${TIMESTAMP}.log"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

fail() {
    log "FAILED: $1"
    exit 1
}

# Retry configuration
MAX_RETRIES=3
RETRY_DELAY=15

run_with_retry() {
    local attempt=1
    local exit_code=0
    while [ $attempt -le $MAX_RETRIES ]; do
        log "Attempt $attempt/$MAX_RETRIES: $1"
        if "$@" ; then
            return 0
        else
            exit_code=$?
            log "Attempt $attempt failed with exit code $exit_code"
            if [ $attempt -lt $MAX_RETRIES ]; then
                log "Retrying in $RETRY_DELAY seconds..."
                sleep $RETRY_DELAY
            fi
        fi
        attempt=$((attempt+1))
    done
    return $exit_code
}

# Load recent post IDs to avoid duplicates
RECENT_TITLES=$(node -e "
const d = require('$DATA_DIR/posts.json');
d.posts.slice(0, 5).forEach(p => {
  const t = (p.title || '').trim();
  if (t.length > 60) console.log(t.substring(0, 60) + '...');
  else console.log(t);
});
" 2>/dev/null || echo "")

RECENT_IDS=$(node -e "
const d = require('$DATA_DIR/posts.json');
d.posts.slice(0, 5).forEach(p => console.log(p.id));
" 2>/dev/null || echo "")

log "=== ScrollVault Pipeline - $DATE ==="
log "Recent posts loaded (${#RECENT_TITLES} chars of titles)"

# ── STEP 1: SCOUT ──
log "--- STEP 1: Scout ---"

SCOUT_PROMPT=$(cat "$AGENTS_DIR/scout.txt")
SCOUT_CONTEXT="Today is $DATE.

Recent posts already published (DO NOT repeat these topics):
$RECENT_TITLES

Recent post IDs (for dedup):
$RECENT_IDS

$SCOUT_PROMPT"

SCOUT_RESULT=$(run_with_retry $OPENCLAW_BIN agent \
    --agent scout \
    --session-id "mtg-scout-${DATE}" \
    --thinking medium \
    --timeout 240 \
    -m "$SCOUT_CONTEXT" 2>&1) || fail "Scout agent failed after $MAX_RETRIES attempts"

log "Scout completed"
echo "$SCOUT_RESULT" > "$DATA_DIR/drafts/scout-${TIMESTAMP}.txt"

# Extract JSON from scout result (find first { to last })
SCOUT_JSON=$(echo "$SCOUT_RESULT" | sed -n '/^{/,/^}/p' | head -100)
if [ -z "$SCOUT_JSON" ]; then
    # Try to find JSON embedded in text
    SCOUT_JSON=$(echo "$SCOUT_RESULT" | grep -Pzo '\{[\s\S]*"stories"[\s\S]*\}' | head -200 || true)
fi

if [ -z "$SCOUT_JSON" ]; then
    log "Scout didn't return structured JSON. Using raw output for writer."
    SCOUT_JSON="$SCOUT_RESULT"
fi

# Pick the top story (prefer high relevance, then first)
TOP_STORY=$(node -e "
try {
    const data = JSON.parse(process.argv[1]);
    const stories = data.stories || [];
    const sorted = stories.sort((a, b) => {
        const scoreA = a.score ? (a.score.novelty + a.score.impact + a.score.audience + a.score.timeliness) : (a.relevance === 'high' ? 20 : a.relevance === 'medium' ? 12 : 5);
        const scoreB = b.score ? (b.score.novelty + b.score.impact + b.score.audience + b.score.timeliness) : (b.relevance === 'high' ? 20 : b.relevance === 'medium' ? 12 : 5);
        return scoreB - scoreA;
    });
    console.log(JSON.stringify(sorted[0] || stories[0]));
} catch(e) {
    console.log(JSON.stringify({headline: 'MTG news roundup', summary: process.argv[1].substring(0, 500), category: 'News', angle: 'General coverage'}));
}
" "$SCOUT_JSON" 2>/dev/null) || TOP_STORY="{}"

log "Top story selected: $(echo "$TOP_STORY" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.headline||'unknown')" 2>/dev/null || echo 'unknown')"

if [ "$DRY_RUN" = "--dry-run" ]; then
    log "DRY RUN - stopping after scout"
    log "Scout output saved to $DATA_DIR/drafts/scout-${TIMESTAMP}.txt"
    exit 0
fi

# ── STEP 2: WRITER ──
log "--- STEP 2: Writer ---"
sleep 5  # Rate limit buffer

WRITER_PROMPT=$(cat "$AGENTS_DIR/writer.txt")
WRITER_CONTEXT="Today is $DATE.

STORY BRIEF:
$TOP_STORY

$WRITER_PROMPT"

WRITER_RESULT=$(run_with_retry $OPENCLAW_BIN agent \
    --agent writer \
    --session-id "mtg-writer-${DATE}" \
    --thinking low \
    --timeout 240 \
    -m "$WRITER_CONTEXT" 2>&1) || fail "Writer agent failed after $MAX_RETRIES attempts"

log "Writer completed"
echo "$WRITER_RESULT" > "$DATA_DIR/drafts/writer-${TIMESTAMP}.txt"

# ── STEP 3: EDITOR ──
log "--- STEP 3: Editor ---"
sleep 5

EDITOR_PROMPT=$(cat "$AGENTS_DIR/editor.txt")
EDITOR_CONTEXT="Review this blog post draft and fix any issues.

DRAFT:
$WRITER_RESULT

$EDITOR_PROMPT"

EDITOR_RESULT=$(run_with_retry $OPENCLAW_BIN agent \
    --agent editor \
    --session-id "mtg-editor-${DATE}" \
    --thinking low \
    --timeout 240 \
    -m "$EDITOR_CONTEXT" 2>&1) || fail "Editor agent failed after $MAX_RETRIES attempts"

log "Editor completed"
echo "$EDITOR_RESULT" > "$DATA_DIR/drafts/editor-${TIMESTAMP}.txt"

# ── STEP 4: FACT CHECKER ──
log "--- STEP 4: Fact Checker ---"
sleep 5

FACTCHECKER_PROMPT=$(cat "$AGENTS_DIR/factchecker.txt")
FACTCHECKER_CONTEXT="Fact-check this edited blog post. Verify all card names, rules, claims, and sources.

EDITED POST:
$EDITOR_RESULT

$FACTCHECKER_PROMPT"

FACTCHECKER_RESULT=$(run_with_retry $OPENCLAW_BIN agent \
    --agent factchecker \
    --session-id "mtg-factchecker-${DATE}" \
    --thinking medium \
    --timeout 240 \
    -m "$FACTCHECKER_CONTEXT" 2>&1) || fail "Fact Checker agent failed after $MAX_RETRIES attempts"

log "Fact Checker completed"
echo "$FACTCHECKER_RESULT" > "$DATA_DIR/drafts/factchecker-${TIMESTAMP}.txt"

# ── PRE-PUBLISH VALIDATION ──
log "--- Pre-Publish Validation ---"

VALIDATION=$(node -e "
try {
    const raw = process.argv[1];
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) { console.log('FAIL: No JSON found in output'); process.exit(1); }
    const post = JSON.parse(match[0]);
    const required = ['id','title','slug','category','excerpt','body','author','date','published','thumbnail_gradient'];
    const missing = required.filter(f => !post[f] && post[f] !== true);
    if (missing.length) { console.log('FAIL: Missing fields: ' + missing.join(', ')); process.exit(1); }
    if (post.id !== post.slug) { console.log('FAIL: id and slug do not match'); process.exit(1); }
    const cats = ['News','Strategy','Spoilers','Deck Guides','Set Reviews'];
    if (!cats.includes(post.category)) { console.log('FAIL: Invalid category: ' + post.category); process.exit(1); }
    if (!post.body.includes('<h2>')) { console.log('FAIL: Body missing h2 sections'); process.exit(1); }
    console.log('PASS: Post validated (' + post.title + ')');
} catch(e) {
    console.log('FAIL: ' + e.message);
    process.exit(1);
}
" "$FACTCHECKER_RESULT" 2>/dev/null) || VALIDATION="FAIL: validation script error"

log "Validation: $VALIDATION"
if [[ "$VALIDATION" == FAIL* ]]; then
    log "Post failed validation. Skipping publish."
    log "Fact-checker output saved to $DATA_DIR/drafts/factchecker-${TIMESTAMP}.txt"
    fail "Pre-publish validation failed: $VALIDATION"
fi

# ── BACKUP ──
log "--- Backing up posts.json ---"
cp "$DATA_DIR/posts.json" "$DATA_DIR/posts.json.bak"
log "Backup saved to $DATA_DIR/posts.json.bak"

# ── STEP 5: PUBLISHER ──
log "--- STEP 5: Publisher ---"
sleep 5

PUBLISHER_PROMPT=$(cat "$AGENTS_DIR/publisher.txt")
PUBLISHER_CONTEXT="Publish this fact-checked blog post.

FACT-CHECKED POST:
$FACTCHECKER_RESULT

$PUBLISHER_PROMPT"

PUBLISHER_RESULT=$(run_with_retry $OPENCLAW_BIN agent \
    --agent publisher \
    --session-id "mtg-publisher-${DATE}" \
    --thinking off \
    --timeout 300 \
    -m "$PUBLISHER_CONTEXT" 2>&1) || fail "Publisher agent failed after $MAX_RETRIES attempts"

log "Publisher completed"
echo "$PUBLISHER_RESULT" > "$DATA_DIR/drafts/publisher-${TIMESTAMP}.txt"

# ── VERIFY BUILD ──
log "--- Verifying Build ---"
POST_COUNT=$(node -e "const d=require('$DATA_DIR/posts.json');console.log(d.posts.filter(p=>p.published).length)" 2>/dev/null || echo "?")
log "Total published posts: $POST_COUNT"

# Fix permissions so Apache (nobody) can serve files
chown -R degenai:nobody "$SCRIPT_DIR" 2>/dev/null || true

# Purge nginx proxy cache so changes appear immediately
rm -rf /var/nginx/cache/degenai/* 2>/dev/null && log "Nginx cache purged" || log "Note: could not purge nginx cache (may need root)"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -A "Mozilla/5.0" https://staging.scrollvault.net/ 2>/dev/null || echo "000")
log "Site HTTP status: $HTTP_CODE"

if [ "$HTTP_CODE" != "200" ]; then
    log "WARNING: Site returned $HTTP_CODE — checking if rollback needed"
    if [ "$HTTP_CODE" = "500" ] || [ "$HTTP_CODE" = "502" ] || [ "$HTTP_CODE" = "503" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "000" ]; then
        log "Rolling back posts.json from backup"
        cp "$DATA_DIR/posts.json.bak" "$DATA_DIR/posts.json"
        node "$SCRIPT_DIR/build.js" 2>/dev/null || true
        chown -R degenai:nobody "$SCRIPT_DIR" 2>/dev/null || true
        fail "Site down after publish — rolled back"
    fi
fi

# ── STEP 6: QA ──
log "--- STEP 6: QA ---"
sleep 5

QA_PROMPT=$(cat "$AGENTS_DIR/qa.txt")
QA_CONTEXT="Run the QA test suite on the STAGING site after today's publish.

$QA_PROMPT"

QA_RESULT=$(run_with_retry $OPENCLAW_BIN agent \
    --agent qa \
    --session-id "mtg-qa-${DATE}" \
    --thinking off \
    --timeout 180 \
    -m "$QA_CONTEXT" 2>&1) || log "WARNING: QA agent failed (non-blocking)"

log "QA completed"
echo "$QA_RESULT" > "$DATA_DIR/drafts/qa-${TIMESTAMP}.txt"

# Check if QA found critical issues
if echo "$QA_RESULT" | grep -q "CRITICAL"; then
    log "WARNING: QA found CRITICAL issues — review $DATA_DIR/drafts/qa-${TIMESTAMP}.txt"
fi


# ── PROMOTE TO PRODUCTION (if QA passed) ──
if ! echo "$QA_RESULT" | grep -q "CRITICAL"; then
    log "--- PROMOTE TO PRODUCTION ---"
    "$SCRIPT_DIR/deploy-prod.sh" 2>&1 | tee -a "$LOG_FILE" || log "ERROR: Promote failed!"
else
    log "SKIPPING PROMOTE due to QA CRITICAL issues"
fi
log "=== Pipeline complete! ==="

# Cleanup old logs (keep 30 days)
find "$LOG_DIR" -name "pipeline-*.log" -mtime +30 -delete 2>/dev/null || true
find "$DATA_DIR/drafts" -name "*.txt" -mtime +30 -delete 2>/dev/null || true
find "$DATA_DIR" -name "posts.json.bak" -mtime +7 -delete 2>/dev/null || true

log "Done."
