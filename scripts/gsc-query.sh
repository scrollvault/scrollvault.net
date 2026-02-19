#!/bin/bash
# Google Search Console API Query Tool
# Usage:
#   ./gsc-query.sh                    # Last 7 days summary
#   ./gsc-query.sh pages              # Top pages by clicks
#   ./gsc-query.sh queries             # Top search queries
#   ./gsc-query.sh indexed             # Index coverage status
#   ./gsc-query.sh inspect <url>       # Inspect a specific URL
#   ./gsc-query.sh 28                  # Last 28 days summary
#
# Requires: gsc-auth.sh to have been run first

CLIENT_ID="204500648365-rm94qs6nsbu664tvekr4jpdacbt439i6.apps.googleusercontent.com"
CLIENT_SECRET="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"
TOKEN_FILE="/home/degenai/.config/gogcli/gsc-token.json"
SITE_URL="sc-domain:scrollvault.net"
COMMAND="${1:-summary}"
DAYS="${2:-7}"

# Get access token from refresh token
get_access_token() {
    if [ ! -f "$TOKEN_FILE" ]; then
        echo "ERROR: No token file. Run gsc-auth.sh first." >&2
        exit 1
    fi

    REFRESH_TOKEN=$(python3 -c "import json; print(json.load(open('$TOKEN_FILE'))['refresh_token'])" 2>/dev/null)
    if [ -z "$REFRESH_TOKEN" ]; then
        echo "ERROR: No refresh token found. Run gsc-auth.sh again." >&2
        exit 1
    fi

    RESULT=$(curl -s "https://oauth2.googleapis.com/token" \
        -d "client_id=$CLIENT_ID" \
        -d "client_secret=$CLIENT_SECRET" \
        -d "refresh_token=$REFRESH_TOKEN" \
        -d "grant_type=refresh_token")

    ACCESS_TOKEN=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
    if [ -z "$ACCESS_TOKEN" ]; then
        echo "ERROR: Failed to get access token. Re-run gsc-auth.sh" >&2
        echo "$RESULT" >&2
        exit 1
    fi
    echo "$ACCESS_TOKEN"
}

TOKEN=$(get_access_token)
ENCODED_SITE=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$SITE_URL', safe=''))")

# Date range
END_DATE=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)

case "$COMMAND" in
    summary|[0-9]*)
        # If first arg is a number, use it as days
        if [[ "$COMMAND" =~ ^[0-9]+$ ]]; then
            DAYS="$COMMAND"
        fi
        START_DATE=$(date -d "$DAYS days ago" +%Y-%m-%d 2>/dev/null || date -v-${DAYS}d +%Y-%m-%d)

        echo "=== ScrollVault Search Console: Last $DAYS days ==="
        echo "($START_DATE to $END_DATE)"
        echo ""

        curl -s "https://searchconsole.googleapis.com/webmasters/v3/sites/${ENCODED_SITE}/searchAnalytics/query" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"startDate\": \"$START_DATE\",
                \"endDate\": \"$END_DATE\",
                \"dimensions\": [\"date\"],
                \"rowLimit\": 100
            }" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR:', d['error'].get('message', d['error']))
    sys.exit(1)
rows = d.get('rows', [])
if not rows:
    print('No data for this period.')
    sys.exit(0)
total_clicks = sum(r['clicks'] for r in rows)
total_impressions = sum(r['impressions'] for r in rows)
avg_ctr = total_clicks / total_impressions * 100 if total_impressions else 0
avg_pos = sum(r['position'] * r['impressions'] for r in rows) / total_impressions if total_impressions else 0
print(f'Total Clicks:       {total_clicks:,}')
print(f'Total Impressions:  {total_impressions:,}')
print(f'Average CTR:        {avg_ctr:.1f}%')
print(f'Average Position:   {avg_pos:.1f}')
print()
print('Daily breakdown:')
print(f'{\"Date\":<12} {\"Clicks\":>8} {\"Impr\":>8} {\"CTR\":>7} {\"Pos\":>6}')
print('-' * 45)
for r in sorted(rows, key=lambda x: x['keys'][0]):
    date = r['keys'][0]
    clicks = r['clicks']
    impr = r['impressions']
    ctr = r['ctr'] * 100
    pos = r['position']
    print(f'{date:<12} {clicks:>8,} {impr:>8,} {ctr:>6.1f}% {pos:>5.1f}')
"
        ;;

    pages)
        DAYS="${2:-7}"
        START_DATE=$(date -d "$DAYS days ago" +%Y-%m-%d 2>/dev/null || date -v-${DAYS}d +%Y-%m-%d)

        echo "=== Top Pages: Last $DAYS days ==="
        echo ""

        curl -s "https://searchconsole.googleapis.com/webmasters/v3/sites/${ENCODED_SITE}/searchAnalytics/query" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"startDate\": \"$START_DATE\",
                \"endDate\": \"$END_DATE\",
                \"dimensions\": [\"page\"],
                \"rowLimit\": 25,
                \"orderBy\": [{\"fieldName\": \"impressions\", \"sortOrder\": \"DESCENDING\"}]
            }" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR:', d['error'].get('message', d['error']))
    sys.exit(1)
rows = d.get('rows', [])
if not rows:
    print('No data.')
    sys.exit(0)
print(f'{\"Clicks\":>6} {\"Impr\":>6} {\"CTR\":>6} {\"Pos\":>5}  URL')
print('-' * 70)
for r in rows:
    url = r['keys'][0].replace('https://scrollvault.net', '').replace('http://www.scrollvault.net', '')
    clicks = r['clicks']
    impr = r['impressions']
    ctr = r['ctr'] * 100
    pos = r['position']
    print(f'{clicks:>6} {impr:>6} {ctr:>5.1f}% {pos:>5.1f}  {url}')
"
        ;;

    queries)
        DAYS="${2:-7}"
        START_DATE=$(date -d "$DAYS days ago" +%Y-%m-%d 2>/dev/null || date -v-${DAYS}d +%Y-%m-%d)

        echo "=== Top Queries: Last $DAYS days ==="
        echo ""

        curl -s "https://searchconsole.googleapis.com/webmasters/v3/sites/${ENCODED_SITE}/searchAnalytics/query" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"startDate\": \"$START_DATE\",
                \"endDate\": \"$END_DATE\",
                \"dimensions\": [\"query\"],
                \"rowLimit\": 25,
                \"orderBy\": [{\"fieldName\": \"impressions\", \"sortOrder\": \"DESCENDING\"}]
            }" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR:', d['error'].get('message', d['error']))
    sys.exit(1)
rows = d.get('rows', [])
if not rows:
    print('No data.')
    sys.exit(0)
print(f'{\"Clicks\":>6} {\"Impr\":>6} {\"CTR\":>6} {\"Pos\":>5}  Query')
print('-' * 70)
for r in rows:
    query = r['keys'][0]
    clicks = r['clicks']
    impr = r['impressions']
    ctr = r['ctr'] * 100
    pos = r['position']
    print(f'{clicks:>6} {impr:>6} {ctr:>5.1f}% {pos:>5.1f}  {query}')
"
        ;;

    inspect)
        URL="${2:?Usage: gsc-query.sh inspect <url>}"
        echo "=== URL Inspection: $URL ==="
        echo ""

        curl -s "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"inspectionUrl\": \"$URL\",
                \"siteUrl\": \"$SITE_URL\"
            }" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR:', d['error'].get('message', d['error']))
    sys.exit(1)
r = d.get('inspectionResult', {})
idx = r.get('indexStatusResult', {})
print(f'Coverage State:    {idx.get(\"coverageState\", \"unknown\")}')
print(f'Indexing State:    {idx.get(\"indexingState\", \"unknown\")}')
print(f'Robots.txt State:  {idx.get(\"robotsTxtState\", \"unknown\")}')
print(f'Last Crawl Time:   {idx.get(\"lastCrawlTime\", \"never\")}')
print(f'Page Fetch State:  {idx.get(\"pageFetchState\", \"unknown\")}')
print(f'Crawled As:        {idx.get(\"crawledAs\", \"unknown\")}')
ref = idx.get('referringUrls', [])
if ref:
    print(f'Referring URLs:    {len(ref)}')
    for u in ref[:5]:
        print(f'  - {u}')
mob = r.get('mobileUsabilityResult', {})
if mob:
    print(f'Mobile Usability:  {mob.get(\"verdict\", \"unknown\")}')
rich = r.get('richResultsResult', {})
if rich:
    print(f'Rich Results:      {rich.get(\"verdict\", \"unknown\")}')
    for det in rich.get('detectedItems', []):
        print(f'  - {det.get(\"richResultType\", \"\")}')
"
        ;;

    indexed)
        echo "=== Index Status ==="
        echo ""
        echo "Checking sitemaps..."
        echo ""

        curl -s "https://searchconsole.googleapis.com/webmasters/v3/sites/${ENCODED_SITE}/sitemaps" \
            -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR:', d['error'].get('message', d['error']))
    sys.exit(1)
sitemaps = d.get('sitemap', [])
if not sitemaps:
    print('No sitemaps found.')
    sys.exit(0)
for s in sitemaps:
    path = s.get('path', '')
    status = s.get('lastDownloaded', 'never')
    warnings = s.get('warnings', 0)
    errors = s.get('errors', 0)
    contents = s.get('contents', [])
    total = sum(int(c.get('submitted', 0)) for c in contents)
    indexed = sum(int(c.get('indexed', 0)) for c in contents)
    print(f'Sitemap: {path}')
    print(f'  Last Downloaded: {status}')
    print(f'  Submitted: {total} | Indexed: {indexed}')
    print(f'  Warnings: {warnings} | Errors: {errors}')
    print()
"
        ;;

    *)
        echo "Usage: gsc-query.sh [command] [days]"
        echo ""
        echo "Commands:"
        echo "  summary [days]     Overall performance (default: 7 days)"
        echo "  pages [days]       Top pages by clicks"
        echo "  queries [days]     Top search queries"
        echo "  indexed            Sitemap/index status"
        echo "  inspect <url>      Inspect a specific URL"
        echo "  <number>           Shorthand for summary with N days"
        echo ""
        echo "Examples:"
        echo "  ./gsc-query.sh              # Last 7 days"
        echo "  ./gsc-query.sh 28           # Last 28 days"
        echo "  ./gsc-query.sh pages 14     # Top pages, 14 days"
        echo "  ./gsc-query.sh queries 30   # Top queries, 30 days"
        echo "  ./gsc-query.sh inspect https://scrollvault.net/posts/my-article.html"
        ;;
esac
