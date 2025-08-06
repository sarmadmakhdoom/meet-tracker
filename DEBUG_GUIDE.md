# Debugging Participant Detection Issues

## Current Issue
The extension is showing "Extension context invalidated" errors, which means the content script cannot communicate with the background script.

## Quick Debugging Steps

### 1. Test Extension Reload
1. Go to Chrome Extensions (`chrome://extensions/`)
2. Find "Google Meet Tracker - Network Enhanced" 
3. Click the reload button (🔄)
4. Go to a Google Meet page and check console

### 2. Test Standalone Detection
1. In a Google Meet tab, open DevTools (F12)
2. Copy and paste this code in the console:

```javascript
// Quick participant detection test
const participants = document.querySelectorAll('*[data-participant-id]');
console.log(`Found ${participants.length} participants`);

if (participants.length > 0) {
  Array.from(participants).forEach((el, i) => {
    const id = el.dataset.participantId;
    const name = el.dataset.sortKey ? 
      el.dataset.sortKey.replace(id, '').trim() : 
      el.innerText.split('\n')[0].trim();
    console.log(`${i+1}. ${name} (${id})`);
  });
} else {
  console.log('❌ No participants found. Make sure:');
  console.log('1. You are in an active meeting');
  console.log('2. Participants panel is open (people icon)');
  console.log('3. There are other people in the meeting');
}
```

### 3. Load Standalone Test Script
1. In Google Meet console, run:
```javascript
// Load the standalone test script
fetch('file:///Users/sarmadmakhdoom/studio98/MeetingExtension/test-participants-standalone.js')
  .then(r => r.text())
  .then(code => eval(code))
  .catch(() => console.log('Copy and paste the test-participants-standalone.js file contents here'));
```

### 4. Manual Extension Test
1. Reload the extension in Chrome Extensions page
2. Open a Google Meet with participants
3. Open the extension popup
4. Check console logs in both:
   - The Meet tab (F12)
   - Extension popup (right-click popup → Inspect)

## Expected Behavior

### Working Extension Should Show:
- `[SimpleMeetTracker] Starting simple participant tracker...`
- `[SimpleMeetTracker] Found X participant elements`
- `[SimpleMeetTracker] New participant: [Name]`
- Extension icon shows participant count

### Common Issues:

#### No Participants Found
- **Cause**: Participants panel not open
- **Fix**: Click the people icon in Google Meet bottom toolbar

#### Extension Context Invalidated
- **Cause**: Extension was reloaded while content script was running
- **Fix**: Refresh the Google Meet tab after reloading extension

#### Content Script Not Loading
- **Cause**: Manifest issues or extension not active
- **Fix**: Check chrome://extensions/ and ensure extension is enabled

## Files to Check

1. **manifest.json** - Should reference `content-simple.js`
2. **content-simple.js** - Simple DOM-based participant detection
3. **background.js** - Handles participant updates from content script

## Debug Commands

In Google Meet tab console:
```javascript
// Check if content script loaded
typeof debugSimpleMeetTracker === 'function'

// Test participant extraction
testSimpleExtraction()

// Monitor in real-time
startParticipantMonitor()
```

## Next Steps If Still Not Working

1. **Test with working extension**: Install the original "Google Meet Attendance List" extension to compare behavior
2. **Check browser console**: Look for any JavaScript errors
3. **Try different meeting**: Test with a meeting that has multiple participants
4. **Inspect DOM**: Manually look for `data-participant-id` elements in DevTools

## Contact Information
If debugging continues to fail, provide:
- Browser version
- Extension console logs
- Google Meet tab console logs
- Screenshot of participants panel
