#!/bin/bash
# Ping IndexNow with new/updated URLs
# Usage: ./indexnow-ping.sh [url1] [url2] ...
# If no URLs given, pings the sitemap

INDEXNOW_KEY="c802bb3306f08e9ca9535ba550e4ad87"
HOST="scrollvault.net"
KEY_LOCATION="https://${HOST}/${INDEXNOW_KEY}.txt"

if [ $# -eq 0 ]; then
    # Ping sitemap URL
    curl -s -o /dev/null -w "%{http_code}" \
        "https://api.indexnow.org/IndexNow?url=https://${HOST}/sitemap.xml&key=${INDEXNOW_KEY}"
    echo " - Pinged sitemap"
else
    # Build URL list JSON
    URLS=$(printf '"%s",' "$@" | sed 's/,$//')
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "https://api.indexnow.org/IndexNow" \
        -H "Content-Type: application/json" \
        -d "{
            \"host\": \"${HOST}\",
            \"key\": \"${INDEXNOW_KEY}\",
            \"keyLocation\": \"${KEY_LOCATION}\",
            \"urlList\": [${URLS}]
        }")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    echo "IndexNow response: ${HTTP_CODE} (200/202 = success)"
fi
