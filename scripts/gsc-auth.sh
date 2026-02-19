#!/bin/bash
# Google Search Console OAuth Setup
# Usage: ./gsc-auth.sh
#
# This gets a refresh token for Google Search Console API access.
# You need to do this ONCE — the refresh token is saved for future use.
#
# Steps:
# 1. Run this script
# 2. Open the URL it prints in your browser
# 3. Sign in with hexmolt@gmail.com
# 4. Authorize access
# 5. Copy the authorization code from the redirect URL
# 6. Paste it back here

CLIENT_ID="204500648365-rm94qs6nsbu664tvekr4jpdacbt439i6.apps.googleusercontent.com"
CLIENT_SECRET="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"
REDIRECT_URI="urn:ietf:wg:oauth:2.0:oob"
TOKEN_FILE="/home/degenai/.config/gogcli/gsc-token.json"
SCOPE="https://www.googleapis.com/auth/webmasters.readonly"

# Check if we already have a valid token
if [ -f "$TOKEN_FILE" ]; then
    REFRESH_TOKEN=$(python3 -c "import json; print(json.load(open('$TOKEN_FILE'))['refresh_token'])" 2>/dev/null)
    if [ -n "$REFRESH_TOKEN" ]; then
        echo "Existing token found. Testing..."
        RESULT=$(curl -s "https://oauth2.googleapis.com/token" \
            -d "client_id=$CLIENT_ID" \
            -d "client_secret=$CLIENT_SECRET" \
            -d "refresh_token=$REFRESH_TOKEN" \
            -d "grant_type=refresh_token")
        ACCESS_TOKEN=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
        if [ -n "$ACCESS_TOKEN" ]; then
            echo "Token is still valid! No re-auth needed."
            echo "Access token: ${ACCESS_TOKEN:0:20}..."
            exit 0
        fi
        echo "Token expired. Re-authenticating..."
    fi
fi

# Build auth URL
AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}&access_type=offline&prompt=consent"

echo ""
echo "========================================="
echo "Google Search Console Authorization"
echo "========================================="
echo ""
echo "Open this URL in your browser:"
echo ""
echo "$AUTH_URL"
echo ""
echo "Sign in with hexmolt@gmail.com, authorize access,"
echo "then paste the authorization code below."
echo ""
read -p "Authorization code: " AUTH_CODE

if [ -z "$AUTH_CODE" ]; then
    echo "ERROR: No authorization code provided"
    exit 1
fi

# Exchange auth code for tokens
RESULT=$(curl -s "https://oauth2.googleapis.com/token" \
    -d "code=$AUTH_CODE" \
    -d "client_id=$CLIENT_ID" \
    -d "client_secret=$CLIENT_SECRET" \
    -d "redirect_uri=$REDIRECT_URI" \
    -d "grant_type=authorization_code")

# Check for error
ERROR=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
if [ -n "$ERROR" ]; then
    echo "ERROR: $ERROR"
    echo "$RESULT" | python3 -m json.tool 2>/dev/null
    exit 1
fi

# Save token
echo "$RESULT" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

echo ""
echo "Authorization successful! Token saved to $TOKEN_FILE"
echo ""
echo "You can now use gsc-query.sh to query Search Console data."
