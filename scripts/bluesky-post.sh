#!/bin/bash
# Post to Bluesky (AT Protocol)
# Usage: ./bluesky-post.sh "Post text" ["https://link-url" "Link title" "Link description"]
#
# Requires BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in environment or .env file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="/home/degenai/.openclaw/.env"

# Load credentials from .env if not already set
if [ -z "${BLUESKY_HANDLE:-}" ] || [ -z "${BLUESKY_APP_PASSWORD:-}" ]; then
    if [ -f "$ENV_FILE" ]; then
        BLUESKY_HANDLE=$(grep '^BLUESKY_HANDLE=' "$ENV_FILE" | cut -d= -f2-)
        BLUESKY_APP_PASSWORD=$(grep '^BLUESKY_APP_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
    fi
fi

if [ -z "${BLUESKY_HANDLE:-}" ] || [ -z "${BLUESKY_APP_PASSWORD:-}" ]; then
    echo "ERROR: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set" >&2
    exit 1
fi

TEXT="${1:?Usage: bluesky-post.sh \"text\" [\"url\" \"title\" \"description\"]}"
LINK_URL="${2:-}"
LINK_TITLE="${3:-}"
LINK_DESC="${4:-}"

# Authenticate
SESSION=$(curl -s -X POST https://bsky.social/xrpc/com.atproto.server.createSession \
    -H "Content-Type: application/json" \
    -d "{\"identifier\": \"$BLUESKY_HANDLE\", \"password\": \"$BLUESKY_APP_PASSWORD\"}")

ACCESS_JWT=$(echo "$SESSION" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).accessJwt)}catch(e){console.error('Auth failed:',d.toString());process.exit(1)}})")
DID=$(echo "$SESSION" | node -e "process.stdin.on('data',d=>{console.log(JSON.parse(d).did)})")

if [ -z "$ACCESS_JWT" ] || [ "$ACCESS_JWT" = "undefined" ]; then
    echo "ERROR: Bluesky authentication failed" >&2
    echo "$SESSION" >&2
    exit 1
fi

CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# Detect URL facets in the text (make links clickable)
FACETS="[]"
# Find URLs in the text and create facets
URL_FACETS=$(node -e "
const text = process.argv[1];
const encoder = new TextEncoder();
const facets = [];
const urlRegex = /https?:\/\/[^\s)\"]+/g;
let match;
while ((match = urlRegex.exec(text)) !== null) {
    const beforeBytes = encoder.encode(text.substring(0, match.index)).length;
    const matchBytes = encoder.encode(match[0]).length;
    facets.push({
        index: { byteStart: beforeBytes, byteEnd: beforeBytes + matchBytes },
        features: [{ '\$type': 'app.bsky.richtext.facet#link', uri: match[0] }]
    });
}
console.log(JSON.stringify(facets));
" "$TEXT" 2>/dev/null) || URL_FACETS="[]"

# Build the record
if [ -n "$LINK_URL" ]; then
    # Post with external link card (embed)
    RECORD=$(node -e "
const record = {
    '\$type': 'app.bsky.feed.post',
    text: process.argv[1],
    createdAt: process.argv[2],
    facets: JSON.parse(process.argv[3]),
    embed: {
        '\$type': 'app.bsky.embed.external',
        external: {
            uri: process.argv[4],
            title: process.argv[5] || '',
            description: process.argv[6] || ''
        }
    }
};
console.log(JSON.stringify(record));
" "$TEXT" "$CREATED_AT" "$URL_FACETS" "$LINK_URL" "$LINK_TITLE" "$LINK_DESC")
else
    # Plain text post
    RECORD=$(node -e "
const record = {
    '\$type': 'app.bsky.feed.post',
    text: process.argv[1],
    createdAt: process.argv[2],
    facets: JSON.parse(process.argv[3])
};
console.log(JSON.stringify(record));
" "$TEXT" "$CREATED_AT" "$URL_FACETS")
fi

# Create the post
RESULT=$(curl -s -X POST https://bsky.social/xrpc/com.atproto.repo.createRecord \
    -H "Authorization: Bearer $ACCESS_JWT" \
    -H "Content-Type: application/json" \
    -d "{\"repo\": \"$DID\", \"collection\": \"app.bsky.feed.post\", \"record\": $RECORD}")

# Check for errors
if echo "$RESULT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);if(r.error){console.error('Bluesky error:',r.message);process.exit(1)}else{console.log('Posted:',r.uri)}})" 2>&1; then
    exit 0
else
    echo "ERROR: Failed to post to Bluesky" >&2
    echo "$RESULT" >&2
    exit 1
fi
