# Google Meet Tracker Chrome Extension

A Chrome extension that automatically tracks your Google Meet sessions, detects participants, and provides detailed analytics about your meeting activity.

## Features

- **Automatic Meeting Detection**: Detects when you join/leave Google Meet calls
- **Participant Tracking**: Extracts participant names from meetings with minute-level precision
- **Visual Indicator**: Extension icon highlights when you're in a meeting
- **Meeting Analytics**: Comprehensive dashboard with charts and filters
- **Data Export**: Export meeting data to CSV format
- **Local Storage**: All data is stored locally on your machine

## Installation

1. **Download Extension Files**: 
   - Ensure all extension files are in a single directory

2. **Create Icons** (required):
   You need to create icon files in the `icons/` directory:
   - `icon16.png` (16x16 pixels)
   - `icon32.png` (32x32 pixels) 
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)
   - `icon16-active.png` (16x16 pixels, for active state)
   - `icon32-active.png` (32x32 pixels, for active state)
   - `icon48-active.png` (48x48 pixels, for active state)
   - `icon128-active.png` (128x128 pixels, for active state)

3. **Load Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" 
   - Select the extension directory
   - The extension should now appear in your Chrome toolbar

## Usage

### During Meetings

1. **Join a Google Meet**: Navigate to any Google Meet call
2. **Automatic Detection**: The extension automatically detects when you're in a meeting
3. **Visual Feedback**: Extension icon changes and shows participant count
4. **Click Icon**: Click the extension icon to see current participants and meeting info

### Dashboard

1. **Access Dashboard**: Click the extension icon and select "📊 Dashboard"
2. **View Analytics**: 
   - See total meetings, time spent, and unique participants
   - View meeting activity charts and duration distribution
   - Browse recent meetings and frequent participants
3. **Filter Data**: 
   - Filter by date ranges (Last 7/30/90 days or custom range)
   - Filter by specific participants
4. **Export Data**: Click "📄 Export CSV" to download your meeting data

### Key Features

- **Minute-Level Tracking**: Records who was in meetings each minute
- **Participant Detection**: Automatically identifies meeting participants
- **Meeting History**: Complete log of all your Google Meet sessions
- **Privacy-First**: All data stored locally, nothing sent to external servers

## Data Structure

The extension tracks:
- Meeting start/end times
- Participant lists (updated every minute)
- Meeting URLs
- Duration and attendance patterns

## Browser Permissions

- **Storage**: To save meeting data locally
- **ActiveTab**: To interact with Google Meet pages
- **Google Meet Access**: To detect meetings and extract participant data

## Privacy

- All data is stored locally in your browser
- No data is sent to external servers
- You can clear all data anytime from the dashboard
- Extension only activates on Google Meet pages

## Troubleshooting

### Extension Not Detecting Meetings
1. Refresh the Google Meet tab
2. Ensure you've granted all required permissions
3. Check the browser console for any error messages

### Missing Participants
1. Google Meet's DOM structure may change - participant detection may need updates
2. Some participants may not be visible if they haven't turned on video/audio
3. Extension works best when the participants panel is visible

### Dashboard Not Loading
1. Ensure you've clicked "Dashboard" from the extension popup
2. Check if Chart.js is loading (requires internet connection)
3. Clear extension data and restart if needed

## Development

The extension consists of:
- `manifest.json` - Extension configuration
- `content.js` - Injected into Google Meet pages
- `background.js` - Service worker for data management  
- `popup.html/js` - Extension popup interface
- `dashboard.html/js/css` - Analytics dashboard

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension format)
- **Framework**: Vanilla JavaScript
- **Charts**: Chart.js for visualizations
- **Storage**: Chrome Storage API
- **Architecture**: Content Script + Background Service Worker

## Future Enhancements

- Meeting duration alerts
- Calendar integration
- Meeting notes/summaries
- Team collaboration features
- Advanced analytics and reporting

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review browser console for error messages
3. Ensure all extension files are present and icons are created
4. Try reloading the extension from chrome://extensions/

---

**Note**: This extension is designed specifically for Google Meet and requires manual icon creation before installation.
