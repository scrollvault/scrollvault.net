#!/bin/bash
# Bluesky bulk follow script
# Usage: ./bluesky-follow.sh handle1 handle2 handle3 ...
# Or pipe handles: echo "handle1\nhandle2" | ./bluesky-follow.sh -

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="/home/degenai/.openclaw/.env"

BLUESKY_HANDLE=$(grep '^BLUESKY_HANDLE=' "$ENV_FILE" | cut -d= -f2-)
BLUESKY_APP_PASSWORD=$(grep '^BLUESKY_APP_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)

# Authenticate
SESSION=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"identifier\":\"$BLUESKY_HANDLE\",\"password\":\"$BLUESKY_APP_PASSWORD\"}" \
    "https://bsky.social/xrpc/com.atproto.server.createSession")

TOKEN=$(echo "$SESSION" | jq -r '.accessJwt')
DID=$(echo "$SESSION" | jq -r '.did')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "ERROR: Authentication failed"
    exit 1
fi

echo "Authenticated as $BLUESKY_HANDLE ($DID)"

# Collect handles
HANDLES=()
if [ "${1:-}" = "-" ]; then
    while IFS= read -r line; do
        h=$(echo "$line" | xargs)
        [ -n "$h" ] && HANDLES+=("$h")
    done
else
    HANDLES=("$@")
fi

FOLLOWED=0
SKIPPED=0
FAILED=0

for handle in "${HANDLES[@]}"; do
    # Strip leading @ if present
    handle="${handle#@}"
    [ -z "$handle" ] && continue

    # Resolve handle to DID
    TARGET_DID=$(curl -s -G \
        --data-urlencode "handle=$handle" \
        "https://bsky.social/xrpc/com.atproto.identity.resolveHandle" 2>/dev/null | jq -r '.did // empty')

    if [ -z "$TARGET_DID" ]; then
        echo "  SKIP: $handle (not found)"
        SKIPPED=$((SKIPPED+1))
        continue
    fi

    # Follow
    RESULT=$(curl -s -X POST \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"repo\": \"$DID\",
            \"collection\": \"app.bsky.graph.follow\",
            \"record\": {
                \"\$type\": \"app.bsky.graph.follow\",
                \"subject\": \"$TARGET_DID\",
                \"createdAt\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
            }
        }" \
        "https://bsky.social/xrpc/com.atproto.repo.createRecord" 2>/dev/null)

    if echo "$RESULT" | jq -e '.uri' > /dev/null 2>&1; then
        echo "  OK: $handle"
        FOLLOWED=$((FOLLOWED+1))
    elif echo "$RESULT" | grep -q "already exists"; then
        echo "  ALREADY: $handle"
        SKIPPED=$((SKIPPED+1))
    else
        ERR=$(echo "$RESULT" | jq -r '.message // .error // "unknown error"' 2>/dev/null || echo "unknown")
        echo "  FAIL: $handle ($ERR)"
        FAILED=$((FAILED+1))
    fi

    sleep 0.3
done

echo ""
echo "Done: $FOLLOWED followed, $SKIPPED skipped, $FAILED failed"
