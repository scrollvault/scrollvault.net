#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Deploying to STAGING ==="
node build.js --staging
echo "Staging build complete: /home/degenai/staging.scrollvault.net"
echo "Run QA against https://staging.scrollvault.net to verify before production deploy."
