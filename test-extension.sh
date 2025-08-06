#!/bin/bash

echo "🧪 Testing Google Meet Tracker Network Enhanced Extension"
echo "=================================================="

# Check if required files exist
echo "📁 Checking required files..."

required_files=(
    "manifest-network.json"
    "background-network.js" 
    "content-network.js"
    "popup.html"
    "popup.js"
    "switch-version.sh"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
    fi
done

# Check manifest syntax
echo ""
echo "🔍 Checking manifest syntax..."
if command -v python3 &> /dev/null; then
    python3 -c "import json; json.load(open('manifest-network.json'))" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✅ manifest-network.json is valid JSON"
    else
        echo "❌ manifest-network.json has syntax errors"
    fi
else
    echo "⚠️  Python3 not found, skipping JSON validation"
fi

# Show key extension details
echo ""
echo "📋 Extension Details:"
echo "===================="
if command -v python3 &> /dev/null; then
    python3 -c "
import json
with open('manifest-network.json') as f:
    manifest = json.load(f)
    print('Name:', manifest['name'])
    print('Version:', manifest['version'])
    print('Description:', manifest['description'])
    print('Permissions:', ', '.join(manifest['permissions']))
    print('Host Permissions:', ', '.join(manifest['host_permissions']))
"
fi

echo ""
echo "🚀 Installation Instructions:"
echo "=============================="
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode' in the top right"
echo "3. Click 'Load unpacked' and select this directory"
echo "4. The extension should appear with the name 'Google Meet Tracker - Network Enhanced'"
echo ""
echo "🧪 Testing Instructions:"
echo "========================"
echo "1. Go to https://meet.google.com/new"
echo "2. Join a meeting or create a test meeting"
echo "3. Check the extension icon - it should show participant count"
echo "4. Open browser console (F12) to see debug logs from the extension"
echo "5. Type 'debugNetworkMeetTracker()' in console to see current state"
echo ""
echo "🔧 Switching Between Versions:"
echo "=============================="
echo "./switch-version.sh network   # Use network-based version"
echo "./switch-version.sh basic     # Use basic DOM version"
echo ""
echo "Happy testing! 🎉"
