#!/bin/bash
# Post a video to Bluesky via AT Protocol
# Usage: ./bluesky-video-post.sh <video-file.mp4> "Post text"
#
# Uploads video blob then creates a post with app.bsky.embed.video embed.
# Requires BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in .env

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="/home/degenai/.openclaw/.env"

# Load credentials
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

VIDEO_FILE="${1:?Usage: bluesky-video-post.sh <video-file.mp4> \"Post text\"}"
TEXT="${2:?Usage: bluesky-video-post.sh <video-file.mp4> \"Post text\"}"

if [ ! -f "$VIDEO_FILE" ]; then
    echo "ERROR: Video file not found: $VIDEO_FILE" >&2
    exit 1
fi

FILE_SIZE=$(stat -c%s "$VIDEO_FILE" 2>/dev/null || stat -f%z "$VIDEO_FILE" 2>/dev/null)
if [ "$FILE_SIZE" -gt 50000000 ]; then
    echo "ERROR: Video file too large (${FILE_SIZE} bytes, max 50MB)" >&2
    exit 1
fi

echo "Authenticating with Bluesky..."

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

echo "Authenticated as $DID"

# Upload video blob
echo "Uploading video (${FILE_SIZE} bytes)..."

UPLOAD_RESPONSE=$(curl -s -X POST "https://bsky.social/xrpc/com.atproto.repo.uploadBlob" \
    -H "Authorization: Bearer $ACCESS_JWT" \
    -H "Content-Type: video/mp4" \
    --data-binary "@$VIDEO_FILE")

BLOB_REF=$(echo "$UPLOAD_RESPONSE" | node -e "
process.stdin.on('data', d => {
    try {
        const r = JSON.parse(d);
        if (r.blob) {
            console.log(JSON.stringify(r.blob));
        } else if (r.error) {
            console.error('Upload error:', r.message || r.error);
            process.exit(1);
        } else {
            console.error('Unexpected response:', d.toString());
            process.exit(1);
        }
    } catch(e) {
        console.error('Parse error:', d.toString());
        process.exit(1);
    }
});
")

if [ -z "$BLOB_REF" ]; then
    echo "ERROR: Failed to upload video blob" >&2
    echo "$UPLOAD_RESPONSE" >&2
    exit 1
fi

echo "Video uploaded, creating post..."

CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# Build URL facets
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

# Create post with video embed
RECORD=$(node -e "
const blob = JSON.parse(process.argv[1]);
const record = {
    '\$type': 'app.bsky.feed.post',
    text: process.argv[2],
    createdAt: process.argv[3],
    facets: JSON.parse(process.argv[4]),
    embed: {
        '\$type': 'app.bsky.embed.video',
        video: blob,
        aspectRatio: { width: 9, height: 16 }
    }
};
console.log(JSON.stringify(record));
" "$BLOB_REF" "$TEXT" "$CREATED_AT" "$URL_FACETS")

RESULT=$(curl -s -X POST https://bsky.social/xrpc/com.atproto.repo.createRecord \
    -H "Authorization: Bearer $ACCESS_JWT" \
    -H "Content-Type: application/json" \
    -d "{\"repo\": \"$DID\", \"collection\": \"app.bsky.feed.post\", \"record\": $RECORD}")

# Check result
if echo "$RESULT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);if(r.error){console.error('Bluesky error:',r.message);process.exit(1)}else{console.log('Posted:',r.uri)}})" 2>&1; then
    echo "Video posted to Bluesky successfully"
    exit 0
else
    echo "ERROR: Failed to post video to Bluesky" >&2
    echo "$RESULT" >&2
    exit 1
fi
