#!/data/data/com.termux/files/usr/bin/bash
# Talon OAuth Sync Widget
# Syncs Claude Code tokens to Talon on l36 server
# Place in ~/.shortcuts/ on phone for Termux:Widget

termux-toast "Syncing Talon auth..."

# Run sync on l36 server
SERVER="${TALON_SERVER:-${TALON_SERVER:-l36}}"
RESULT=$(ssh "$SERVER" '/home/admin/talon/scripts/sync-claude-code-auth.sh' 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    # Extract expiry time from output
    EXPIRY=$(echo "$RESULT" | grep "Token expires:" | cut -d: -f2-)

    termux-vibrate -d 100
    termux-toast "Talon synced! Expires:${EXPIRY}"

    # Optional: restart talon service
    ssh "$SERVER" 'systemctl --user restart talon' 2>/dev/null
else
    termux-vibrate -d 300
    termux-toast "Sync failed: ${RESULT}"
fi
