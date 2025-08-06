# 📦 Migration Guide: Basic to Enhanced Storage

This guide will help you migrate your existing meeting data from basic Chrome storage to enhanced IndexedDB storage, unlocking unlimited storage capacity and advanced analytics features.

## 🚀 Quick Start

### Option 1: Using the Node.js Script (Recommended)

1. **Switch to enhanced storage mode:**
   ```bash
   node switch-storage-mode.js enhanced
   ```

2. **Reload the extension** in Chrome Developer Mode

3. **Open the dashboard** and run migration in the console:
   ```javascript
   migrateLocalStorageToIndexedDB()
   ```

### Option 2: Manual Method

1. **Edit manifest.json:**
   - Change line 18 from: `"service_worker": "background.js"`  
   - To: `"service_worker": "background-enhanced.js"`

2. **Reload the extension** in Chrome Developer Mode

3. **Open the dashboard** and press `F12` to open Developer Tools

4. **In the Console tab, run:**
   ```javascript
   migrateLocalStorageToIndexedDB()
   ```

## 📋 Detailed Steps

### Step 1: Switch Storage Mode

**Using the Node.js script:**
```bash
cd /Users/sarmadmakhdoom/studio98/MeetingExtension
node switch-storage-mode.js enhanced
```

**Or manually edit manifest.json:**
```json
{
  "background": {
    "service_worker": "background-enhanced.js"
  }
}
```

### Step 2: Reload Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Find "Google Meet Tracker" extension
4. Click the reload button (🔄) for the extension

### Step 3: Run Migration

1. **Open the dashboard** by clicking the extension icon and selecting "View Dashboard"

2. **Open Developer Console:**
   - Press `F12` or `Ctrl+Shift+I` (Windows/Linux)
   - Press `Cmd+Option+I` (Mac)
   - Click on the "Console" tab

3. **Run the migration command:**
   ```javascript
   migrateLocalStorageToIndexedDB()
   ```

4. **Follow the prompts** and wait for completion

### Step 4: Verify Migration

After migration completes:

1. **Check the console output** for success confirmation
2. **Refresh the dashboard page** to see enhanced features
3. **Test enhanced storage features:**
   - Click "📊 Storage Stats" button
   - Try "🧹 Cleanup Old Data" 
   - Use "📦 Enhanced Export"

## ✨ New Features After Migration

- **📊 Storage Statistics:** Detailed analytics about your data usage
- **🧹 Intelligent Cleanup:** Remove old meetings while preserving important data  
- **📦 Enhanced Export:** Export with participant tracking and metadata
- **♾️ Unlimited Storage:** No more ~10MB Chrome storage limits
- **⚡ Better Performance:** Faster queries and data operations

## 🔧 Troubleshooting

### Migration Fails with "Enhanced storage not available"

**Solution:** Make sure you switched to `background-enhanced.js` in manifest.json and reloaded the extension.

### No Data Found During Migration

**Possible causes:**
- You have no meeting history yet
- Data was already migrated previously
- Extension needs to be reloaded

### Console Shows Errors

1. **Refresh the dashboard page**
2. **Check that all files are present:**
   ```bash
   ls -la *.js | grep -E "(background-enhanced|storage-manager|migrate-data)"
   ```
3. **Try reloading the extension** and running migration again

### Storage Stats Not Working

This indicates the enhanced storage system isn't active. Verify:
1. `manifest.json` points to `background-enhanced.js`  
2. Extension was reloaded after the change
3. No console errors when opening the dashboard

## 🔄 Switching Back to Basic Storage

If you need to revert to basic storage:

```bash
node switch-storage-mode.js basic
```

Then reload the extension. Your data will still be accessible (enhanced storage preserves the original format).

## 📞 Need Help?

If you encounter issues:

1. **Check the browser console** for detailed error messages
2. **Verify all files are present** in the extension directory
3. **Try reloading the extension** and running migration again
4. **Check that Chrome Developer Mode is enabled**

## 🎉 Success!

After successful migration, you'll have:
- All your historical meeting data preserved
- Access to enhanced storage features  
- Virtually unlimited storage capacity
- Better performance and analytics

Enjoy your upgraded Google Meet Tracker! 📊✨
