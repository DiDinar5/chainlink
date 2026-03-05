#!/bin/bash
# start.sh — Launch full dev stack in iTerm2 (4 panes)
#
# Layout:
#   ┌──────────────────┬──────────────────┐
#   │  Hardhat Node    │  Deploy          │
#   ├──────────────────┼──────────────────┤
#   │  CRE Worker      │  Frontend        │
#   └──────────────────┴──────────────────┘

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SENTINEL="$REPO_DIR/.deploy-done"

rm -f "$SENTINEL"

osascript <<EOF
tell application "iTerm2"
    activate
    create window with default profile

    tell current session of current tab of current window
        write text "cd $REPO_DIR && echo '🔗 Starting Hardhat Node...' && npm run node:local -w contracts"
    end tell

    -- Split right: deploy pane
    tell current session of current tab of current window
        set deploySession to (split vertically with default profile)
    end tell
    tell deploySession
        write text "cd $REPO_DIR && sleep 5 && echo '📦 Deploying contracts...' && npm run deploy:local -w contracts && touch $SENTINEL && echo '✅ Deploy done!'"
    end tell

    -- Split bottom-left: worker pane
    tell first session of current tab of current window
        set workerSession to (split horizontally with default profile)
    end tell
    tell workerSession
        write text "cd $REPO_DIR && echo '⏳ Waiting for deploy...' && while [ ! -f $SENTINEL ]; do sleep 1; done && echo '⚙️ Starting CRE Worker...' && npm run dev:worker -w cre"
    end tell

    -- Split bottom-right: frontend pane
    tell deploySession
        set frontendSession to (split horizontally with default profile)
    end tell
    tell frontendSession
        write text "cd $REPO_DIR && echo '⏳ Waiting for deploy...' && while [ ! -f $SENTINEL ]; do sleep 1; done && echo '🌐 Starting Frontend...' && npm run dev -w frontend"
    end tell

end tell
EOF

echo "iTerm2 dev environment launched."

