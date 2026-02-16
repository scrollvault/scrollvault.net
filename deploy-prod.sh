#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Deploying to PRODUCTION ==="
node build.js
echo "Production build complete."

# Fix permissions so Apache (nobody) can serve files
chown -R degenai:nobody "$SCRIPT_DIR" 2>/dev/null || true

# Purge nginx proxy cache so changes appear immediately
rm -rf /var/nginx/cache/degenai/* 2>/dev/null && echo "Nginx cache purged" || echo "Note: could not purge nginx cache (may need root)"

echo "=== Deploy complete ==="
