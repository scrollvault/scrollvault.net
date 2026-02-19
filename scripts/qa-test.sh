#!/bin/bash
# ScrollVault QA Test Suite
# Runs all QA checks and outputs structured report
# Usage: ./scripts/qa-test.sh [staging|production]

SITE="${1:-staging}"
if [ "$SITE" = "staging" ]; then
    BASE_URL="https://staging.scrollvault.net"
elif [ "$SITE" = "production" ]; then
    BASE_URL="https://scrollvault.net"
else
    BASE_URL="$SITE"
fi

DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
UA="Mozilla/5.0"
ISSUES=0
CRITICAL=0

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; ISSUES=$((ISSUES+1)); }
critical() { echo "  FAIL [CRITICAL]: $1"; ISSUES=$((ISSUES+1)); CRITICAL=$((CRITICAL+1)); }

echo "SCROLLVAULT QA REPORT"
echo "Date: $(date +%Y-%m-%d)"
POST_COUNT=$(node -e "const d=require('$DATA_DIR/posts.json');console.log(d.posts.filter(p=>p.published).length)" 2>/dev/null || echo "?")
echo "Build: $POST_COUNT published posts"
echo "Target: $BASE_URL"
echo ""

# ── 1. CRITICAL PAGES ──
echo "1. Critical Pages:"
PAGES=(
    "/"
    "/about.html"
    "/contact.html"
    "/privacy.html"
    "/terms.html"
    "/news/"
    "/guides/"
    "/spoilers/"
    "/deck-guides/"
    "/set-reviews/"
    "/robots.txt"
    "/sitemap.xml"
)
PAGE_FAILS=0
for page in "${PAGES[@]}"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -A "$UA" "${BASE_URL}${page}" 2>/dev/null)
    if [ "$code" != "200" ]; then
        critical "$page returned $code"
        PAGE_FAILS=$((PAGE_FAILS+1))
    fi
done
if [ $PAGE_FAILS -eq 0 ]; then
    pass "All ${#PAGES[@]} critical pages return 200"
fi
echo ""

# ── 2. POST PAGES ──
echo "2. Post Pages (5 newest):"
SLUGS=$(node -e "const d=require('$DATA_DIR/posts.json');d.posts.filter(p=>p.published).slice(0,5).forEach(p=>console.log(p.slug))" 2>/dev/null)
POST_FAILS=0
POST_TOTAL=0
while IFS= read -r slug; do
    [ -z "$slug" ] && continue
    POST_TOTAL=$((POST_TOTAL+1))
    code=$(curl -s -o /dev/null -w "%{http_code}" -A "$UA" "${BASE_URL}/posts/${slug}.html" 2>/dev/null)
    if [ "$code" != "200" ]; then
        critical "/posts/${slug}.html returned $code"
        POST_FAILS=$((POST_FAILS+1))
    fi
done <<< "$SLUGS"
if [ $POST_FAILS -eq 0 ]; then
    pass "All $POST_TOTAL sampled posts return 200"
fi
echo ""

# ── 3. SEO VALIDATION ──
echo "3. SEO Validation:"
HOMEPAGE_HTML=$(curl -s -A "$UA" "${BASE_URL}/" 2>/dev/null)
SEO_FAILS=0

for tag in 'rel="canonical"' 'og:title' 'og:description' 'og:url' 'og:type' 'application/ld+json'; do
    if ! echo "$HOMEPAGE_HTML" | grep -q "$tag"; then
        fail "Homepage missing: $tag"
        SEO_FAILS=$((SEO_FAILS+1))
    fi
done

# Check a post page too
FIRST_SLUG=$(echo "$SLUGS" | head -1)
if [ -n "$FIRST_SLUG" ]; then
    POST_HTML=$(curl -s -A "$UA" "${BASE_URL}/posts/${FIRST_SLUG}.html" 2>/dev/null)
    for tag in 'rel="canonical"' 'og:title' 'og:description' 'og:url' 'application/ld+json'; do
        if ! echo "$POST_HTML" | grep -q "$tag"; then
            fail "Post page missing: $tag"
            SEO_FAILS=$((SEO_FAILS+1))
        fi
    done
fi

if [ $SEO_FAILS -eq 0 ]; then
    pass "All SEO tags present on homepage and post page"
fi
echo ""

# ── 4. SITEMAP ──
echo "4. Sitemap Validation:"
SITEMAP=$(curl -s -A "$UA" "${BASE_URL}/sitemap.xml" 2>/dev/null)
SITEMAP_FAILS=0

if echo "$SITEMAP" | head -1 | grep -q '<?xml'; then
    URL_COUNT=$(echo "$SITEMAP" | grep -c '<url>')
    if [ "$URL_COUNT" -ge 3 ]; then
        pass "Valid XML with $URL_COUNT URLs"
    else
        fail "Only $URL_COUNT URLs in sitemap (need 3+)"
        SITEMAP_FAILS=$((SITEMAP_FAILS+1))
    fi
    # Spot-check 2 URLs
    SPOT_URLS=$(echo "$SITEMAP" | grep -o '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g' | head -3 | tail -2)
    while IFS= read -r url; do
        [ -z "$url" ] && continue
        code=$(curl -s -o /dev/null -w "%{http_code}" -A "$UA" "$url" 2>/dev/null)
        if [ "$code" != "200" ]; then
            fail "Sitemap URL $url returned $code"
            SITEMAP_FAILS=$((SITEMAP_FAILS+1))
        fi
    done <<< "$SPOT_URLS"
    if [ $SITEMAP_FAILS -eq 0 ]; then
        pass "Spot-checked URLs return 200"
    fi
else
    critical "Sitemap is not valid XML"
fi
echo ""

# ── 5. CONTENT STRUCTURE ──
echo "5. Content Structure:"
STRUCT_FAILS=0
for pattern in 'post-card\|article' 'post-category\|category-pill\|filter-pill' 'nav' 'footer'; do
    if ! echo "$HOMEPAGE_HTML" | grep -qi "$pattern"; then
        fail "Homepage missing element: $pattern"
        STRUCT_FAILS=$((STRUCT_FAILS+1))
    fi
done
if [ $STRUCT_FAILS -eq 0 ]; then
    pass "All structural elements present"
fi
echo ""

# ── 6. LINK INTEGRITY ──
echo "6. Link Integrity:"
INTERNAL_LINKS=$(echo "$HOMEPAGE_HTML" | grep -oP 'href="(/[^"]*)"' | sed 's/href="//;s/"//' | sort -u | head -30)
LINK_OK=0
LINK_FAIL=0
while IFS= read -r link; do
    [ -z "$link" ] && continue
    code=$(curl -s -o /dev/null -w "%{http_code}" -A "$UA" "${BASE_URL}${link}" 2>/dev/null)
    if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
        LINK_OK=$((LINK_OK+1))
    else
        LINK_FAIL=$((LINK_FAIL+1))
    fi
done <<< "$INTERNAL_LINKS"
LINK_TOTAL=$((LINK_OK+LINK_FAIL))
if [ $LINK_TOTAL -gt 0 ]; then
    PCT=$((LINK_OK * 100 / LINK_TOTAL))
    if [ $PCT -ge 95 ]; then
        pass "$LINK_OK/$LINK_TOTAL internal links OK ($PCT%)"
    else
        fail "$LINK_FAIL/$LINK_TOTAL internal links broken ($PCT% OK)"
    fi
else
    pass "No internal links to check"
fi
echo ""

# ── 7. SECURITY HEADERS ──
echo "7. Security Headers:"
HEADERS=$(curl -sI -A "$UA" "${BASE_URL}/" 2>/dev/null)
if echo "$HEADERS" | grep -qi "strict-transport-security"; then
    pass "Strict-Transport-Security present"
else
    fail "Strict-Transport-Security header missing"
fi
echo ""

# ── 8. PERFORMANCE ──
echo "8. Performance:"
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" -A "$UA" "${BASE_URL}/" 2>/dev/null)
if [ -n "$RESPONSE_TIME" ]; then
    # Compare as integer (multiply by 1000 for ms)
    TIME_MS=$(echo "$RESPONSE_TIME" | awk '{printf "%d", $1 * 1000}')
    if [ "$TIME_MS" -le 3000 ]; then
        pass "Response time: ${RESPONSE_TIME}s"
    else
        fail "Response time: ${RESPONSE_TIME}s (over 3s threshold)"
    fi
else
    fail "Could not measure response time"
fi
echo ""

# ── 9. DOUBLE FOOTER CHECK ──
echo "9. Double Footer Check:"
if [ -n "$FIRST_SLUG" ]; then
    NEWEST_HTML=$(curl -s -A "$UA" "${BASE_URL}/posts/${FIRST_SLUG}.html" 2>/dev/null)
    FOOTER_COUNT=$(echo "$NEWEST_HTML" | grep -c '</footer>')
    MAIN_COUNT=$(echo "$NEWEST_HTML" | grep -c '</main>')
    BODY_COUNT=$(echo "$NEWEST_HTML" | grep -c '</body>')

    FOOTER_OK=true
    if [ "$FOOTER_COUNT" -gt 1 ]; then
        critical "Double footer detected: </footer> appears $FOOTER_COUNT times"
        FOOTER_OK=false
    fi
    if [ "$MAIN_COUNT" -gt 1 ]; then
        critical "Double main detected: </main> appears $MAIN_COUNT times"
        FOOTER_OK=false
    fi
    if [ "$BODY_COUNT" -gt 1 ]; then
        critical "Double body detected: </body> appears $BODY_COUNT times"
        FOOTER_OK=false
    fi
    if [ "$FOOTER_OK" = true ]; then
        pass "No duplicate tags (footer=$FOOTER_COUNT, main=$MAIN_COUNT, body=$BODY_COUNT)"
    fi
else
    fail "No post slug available to check"
fi
echo ""

# ── 10. JSON-LD SCHEMA ──
echo "10. JSON-LD Schema Validation:"
if [ -n "$FIRST_SLUG" ]; then
    # Use the already-fetched post HTML
    [ -z "$NEWEST_HTML" ] && NEWEST_HTML=$(curl -s -A "$UA" "${BASE_URL}/posts/${FIRST_SLUG}.html" 2>/dev/null)

    LDJSON_COUNT=$(echo "$NEWEST_HTML" | grep -c 'application/ld+json')
    SCHEMA_FAILS=0

    if [ "$LDJSON_COUNT" -ge 1 ]; then
        # Check for Article type
        if echo "$NEWEST_HTML" | grep -q '"@type".*"Article"'; then
            pass "Article schema present"
        else
            fail "Missing @type Article in ld+json"
            SCHEMA_FAILS=$((SCHEMA_FAILS+1))
        fi

        # Check for author
        if echo "$NEWEST_HTML" | grep -q '"author"'; then
            pass "Author field present"
        else
            fail "Missing author in ld+json"
            SCHEMA_FAILS=$((SCHEMA_FAILS+1))
        fi

        # Check for BreadcrumbList
        if echo "$NEWEST_HTML" | grep -q '"BreadcrumbList"'; then
            pass "BreadcrumbList schema present"
        else
            fail "Missing BreadcrumbList in ld+json"
            SCHEMA_FAILS=$((SCHEMA_FAILS+1))
        fi
    else
        fail "No ld+json blocks found"
        SCHEMA_FAILS=$((SCHEMA_FAILS+1))
    fi
else
    fail "No post slug available to check"
fi
echo ""

# ── SUMMARY ──
echo "================================"
if [ $CRITICAL -gt 0 ]; then
    echo "Overall: FAIL ($ISSUES issues, $CRITICAL critical)"
    echo ""
    echo "QA_VERDICT:FAIL"
elif [ $ISSUES -gt 0 ]; then
    echo "Overall: PASS WITH WARNINGS ($ISSUES non-critical issues)"
    echo ""
    echo "QA_VERDICT:PASS"
else
    echo "Overall: PASS (all checks passed)"
    echo ""
    echo "QA_VERDICT:PASS"
fi
