#!/bin/bash

# Version switching script for Google Meet Tracker

if [ $# -eq 0 ]; then
    echo "Usage: ./switch-version.sh [network|basic]"
    echo ""
    echo "Available versions:"
    echo "  network - Enhanced network-based participant tracking"
    echo "  basic   - Basic DOM-based participant tracking"
    echo ""
    echo "Current version: $([ -f manifest.json ] && echo "$([ -f background-network.js ] && echo 'network' || echo 'basic')" || echo 'none')"
    exit 1
fi

VERSION=$1

case $VERSION in
    "network")
        echo "🌐 Switching to Network Enhanced version..."
        
        # Copy network files to main files
        cp manifest-network.json manifest.json
        cp background-network.js background.js
        cp content-network.js content.js
        
        echo "✅ Switched to Network Enhanced version"
        echo "📋 Features:"
        echo "   - Real-time network interception"
        echo "   - Auto-detection of existing meetings"
        echo "   - Multiple API endpoint monitoring"
        echo "   - Enhanced participant tracking"
        echo ""
        echo "🚀 To use: Reload the extension in Chrome"
        ;;
        
    "basic")
        echo "🔧 Switching to Basic DOM version..."
        
        # Copy basic files to main files (if they exist)
        if [ -f manifest-basic.json ]; then
            cp manifest-basic.json manifest.json
        else
            echo "⚠️  Basic manifest not found, creating minimal version..."
            cat > manifest.json << EOF
{
  "manifest_version": 3,
  "name": "Google Meet Tracker - Basic",
  "version": "1.0.0",
  "description": "Basic DOM-based Google Meet participant tracker",
  "permissions": [
    "storage",
    "activeTab"
  ],
  "host_permissions": [
    "*://meet.google.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["*://meet.google.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Google Meet Tracker"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
EOF
        fi
        
        if [ -f background-basic.js ]; then
            cp background-basic.js background.js
        else
            echo "⚠️  Basic background script not found, using network version as base..."
            cp background-network.js background.js
        fi
        
        if [ -f content-basic.js ]; then
            cp content-basic.js content.js
        else
            echo "⚠️  Basic content script not found, creating minimal version..."
            cat > content.js << EOF
// Basic DOM-based Google Meet tracker
console.log('Basic Google Meet Tracker loaded');

// Simple participant counting
function countParticipants() {
  const participants = document.querySelectorAll('[data-participant-id]');
  return participants.length;
}

// Send participant count to background
function updateParticipantCount() {
  const count = countParticipants();
  chrome.runtime.sendMessage({
    action: 'updateIcon',
    state: count > 0 ? 'active' : 'none',
    participants: Array.from({length: count}, (_, i) => ({id: i, name: \`Participant \${i+1}\`}))
  });
}

// Check for participants periodically
setInterval(updateParticipantCount, 5000);

// Initial check
setTimeout(updateParticipantCount, 2000);
EOF
        fi
        
        echo "✅ Switched to Basic DOM version"
        echo "📋 Features:"
        echo "   - DOM-based participant counting"
        echo "   - Periodic updates"
        echo "   - Basic meeting detection"
        echo ""
        echo "🚀 To use: Reload the extension in Chrome"
        ;;
        
    *)
        echo "❌ Unknown version: $VERSION"
        echo "Available versions: network, basic"
        exit 1
        ;;
esac

echo ""
echo "📁 Active files:"
echo "   manifest.json    -> $([ -f manifest.json ] && echo "✅" || echo "❌")"
echo "   background.js    -> $([ -f background.js ] && echo "✅" || echo "❌")"
echo "   content.js       -> $([ -f content.js ] && echo "✅" || echo "❌")"
