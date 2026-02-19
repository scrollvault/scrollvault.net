#!/bin/bash
# protect.sh - Lock/unlock immutable protection on critical ScrollVault files
# Usage: bash protect.sh lock|unlock
# Must run as root (chattr +i requires root)

PROTECTED_FILES=(
    "/home/degenai/scrollvault/build.js"
    "/home/degenai/scrollvault/.htaccess"
    "/home/degenai/scrollvault/pipeline.sh"
    "/home/degenai/scrollvault/tools/index.html"
    "/home/degenai/scrollvault/tools/manabase/index.html"
    "/home/degenai/scrollvault/tools/lands/index.html"
    "/home/degenai/scrollvault/tools/hypergeometric/index.html"
    "/home/degenai/scrollvault/tools/hand-simulator/index.html"
    "/home/degenai/scrollvault/tools/price-checker/index.html"
    "/home/degenai/scrollvault/tools/commander-bracket/index.html"
    "/home/degenai/scrollvault/tools/sealed/index.html"
    "/home/degenai/scrollvault/decks/index.html"
    "/home/degenai/scrollvault/draft/index.html"
)

case "$1" in
    lock)
        for f in "${PROTECTED_FILES[@]}"; do
            [ -f "$f" ] && chattr +i "$f"
        done
        echo "All critical files LOCKED (immutable)"
        lsattr "${PROTECTED_FILES[@]}" 2>/dev/null | grep -c "\-i\-" | xargs -I{} echo "{} files protected"
        ;;
    unlock)
        for f in "${PROTECTED_FILES[@]}"; do
            [ -f "$f" ] && chattr -i "$f"
        done
        echo "All critical files UNLOCKED (editable)"
        echo "Remember to run 'bash protect.sh lock' when done editing!"
        ;;
    status)
        echo "Protection status:"
        for f in "${PROTECTED_FILES[@]}"; do
            if [ -f "$f" ]; then
                attr=$(lsattr "$f" 2>/dev/null | cut -d' ' -f1)
                if echo "$attr" | grep -q 'i'; then
                    echo "  LOCKED   $f"
                else
                    echo "  UNLOCKED $f"
                fi
            else
                echo "  MISSING  $f"
            fi
        done
        ;;
    *)
        echo "Usage: bash protect.sh [lock|unlock|status]"
        exit 1
        ;;
esac
