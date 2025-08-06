# Google Meet Tracker - Network Enhanced

**Enhanced Chrome extension for automatic Google Meet participant tracking using network interception**

## 🚀 Quick Start

### Installation
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select this directory
4. The extension should appear as "Google Meet Tracker - Network Enhanced"

### Testing
1. Go to [Google Meet](https://meet.google.com/new)
2. Join or create a meeting
3. The extension icon should show participant count
4. Check console (F12) for debug logs

## 🔧 Features

### ✅ **Fixed Issues**
- **CSP Violations**: Resolved Content Security Policy errors by using external script files
- **MutationObserver Errors**: Fixed DOM observation setup with proper readiness checks
- **Auto-detection**: Extension now automatically detects existing meetings on reload
- **Network Interception**: Properly intercepts Google Meet API calls for real-time data

### 🌟 **Enhanced Capabilities**
- **Real-time participant tracking** via network API interception
- **Auto-detection** of existing meetings when extension reloads
- **Multiple data sources**: Network + DOM fallback for reliability
- **Smart background processing** with persistent meeting state
- **Visual feedback** via extension icon with participant counts

## 🛠 Architecture

### Network-Based Approach
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   network-shim.js  │ →  │  content-network.js  │ →  │ background-network.js │
│                 │    │                  │    │                 │
│ • Intercepts    │    │ • Processes      │    │ • Manages       │
│   fetch/XHR     │    │   network data   │    │   meeting state │
│ • Dispatches    │    │ • DOM fallback   │    │ • Updates icon  │
│   events        │    │ • State tracking │    │ • Stores data   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Key Components
- **`network-shim.js`**: Intercepts Google Meet API calls (CSP-compliant)
- **`content-network.js`**: Processes network data and manages meeting state
- **`background-network.js`**: Handles persistent state and extension UI updates
- **Auto-detection system**: Finds existing meetings on extension startup

## 🔍 Debugging

### Console Commands
```javascript
// Check extension state
debugNetworkMeetTracker()

// Check network shims
debugMeetTrackerShims()

// Full diagnostic (load debug-extension.js first)
debugMeetExtension()
```

### Common Issues

**❌ CSP Errors**
- **Fixed**: Now uses external `network-shim.js` file instead of inline scripts

**❌ MutationObserver Errors**  
- **Fixed**: Proper DOM readiness checking and error handling

**❌ Extension not detecting existing meetings**
- **Fixed**: Auto-detection system queries all Meet tabs on startup

## 📊 Network Interception

### Monitored API Endpoints
- `SyncMeetingSpaceCollections` - Participant sync data
- `BatchExecute` - Google's internal API system  
- `/_/MeetCastleService/` - Meet service calls
- `/calendar/` - Meeting metadata
- `/call/participants` - Direct participant data

### Data Processing
1. **Network events** dispatched from injected shims
2. **Multiple parsers** handle different response formats
3. **Real-time updates** sent to background script
4. **DOM fallback** ensures reliability when network fails

## 🎯 Version Management

```bash
# Switch to network-enhanced version (recommended)
./switch-version.sh network

# Switch to basic DOM version (fallback)
./switch-version.sh basic

# Test current installation
./test-extension.sh
```

## 🔧 File Structure

```
MeetingExtension/
├── manifest-network.json     # Network version manifest
├── background-network.js     # Enhanced background service worker
├── content-network.js        # Network-based content script
├── network-shim.js          # External network interception (CSP-safe)
├── popup.html               # Extension popup UI
├── popup.js                 # Popup functionality
├── debug-extension.js       # Debug utilities
├── switch-version.sh        # Version switching script
├── test-extension.sh        # Installation test script
└── README.md               # This file
```

## ⚙️ Technical Details

### Permissions Required
- `storage` - Save meeting data
- `activeTab` - Access current tab
- `scripting` - Inject content scripts

### Host Permissions
- `*://meet.google.com/*` - Google Meet pages
- `*://clients6.google.com/*` - Google API calls
- `*://calendar.google.com/*` - Calendar integration
- `*://apis.google.com/*` - Additional Google APIs

### Security & Privacy
- **No data sent externally** - All processing happens locally
- **CSP compliant** - Uses external scripts, no inline code
- **Minimal permissions** - Only requires access to Google Meet domains

## 🐛 Troubleshooting

### Step 1: Basic Checks
1. Extension appears in `chrome://extensions/`
2. Extension is enabled and has permissions
3. You're on a `meet.google.com` page (not `/landing/`)

### Step 2: Console Debugging
1. Open developer tools (F12)
2. Go to Console tab
3. Look for `[MeetTracker]` messages
4. Run `debugNetworkMeetTracker()` for current state

### Step 3: Network Verification
1. Run `debugMeetTrackerShims()` to check network interception
2. Look for "📡 Intercepted" messages in console
3. Verify participant elements exist: `document.querySelectorAll('[data-participant-id]').length`

### Step 4: Extension Reset
1. Disable and re-enable the extension
2. Or reload the extension in `chrome://extensions/`
3. Refresh the Google Meet page

## 📝 Changelog

### v1.1.0 - Network Enhanced
- ✅ Fixed CSP violations by using external script files
- ✅ Fixed MutationObserver errors with proper DOM handling  
- ✅ Added auto-detection of existing meetings on extension reload
- ✅ Enhanced network interception with multiple API endpoints
- ✅ Improved error handling and fallback mechanisms
- ✅ Added comprehensive debugging tools

### v1.0.0 - Basic Version
- Basic DOM-based participant detection
- Manual refresh required
- Limited to visible participants

---

## 🎉 Success Indicators

When working properly, you should see:
- ✅ Extension icon shows participant count badge
- ✅ Console shows `[MeetTracker]` initialization messages
- ✅ `debugNetworkMeetTracker()` returns meeting data
- ✅ Network shims active: `debugMeetTrackerShims()` shows interception
- ✅ Auto-detection works: Reload extension while in meeting, count persists

**The extension now provides seamless, automatic meeting attendance tracking without any manual intervention required!** 🚀
