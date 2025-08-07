// Migration script to move data from Chrome storage to IndexedDB
// This should be run in the background script context

async function migrateChromeStorageToIndexedDB() {
    console.log('🔄 Starting migration from Chrome storage to IndexedDB...');
    
    try {
        // Check if we have any data in Chrome storage
        const chromeData = await new Promise((resolve) => {
            chrome.storage.local.get(['meetings'], (result) => {
                resolve(result.meetings || []);
            });
        });
        
        console.log(`📊 Found ${chromeData.length} meetings in Chrome storage`);
        
        if (chromeData.length === 0) {
            console.log('✅ No data to migrate');
            return;
        }
        
        // Initialize IndexedDB storage
        const storageManager = new MeetingStorageManager();
        await storageManager.init();
        console.log('✅ IndexedDB storage initialized');
        
        // Check if we already have data in IndexedDB
        const indexedDBData = await storageManager.getMeetings();
        console.log(`📊 Found ${indexedDBData.length} meetings in IndexedDB`);
        
        if (indexedDBData.length > 0) {
            console.log('⚠️ IndexedDB already contains data. Skipping migration to avoid duplicates.');
            console.log('💡 To force migration, first clear IndexedDB data.');
            return;
        }
        
        // Migrate each meeting
        let successCount = 0;
        let errorCount = 0;
        
        for (const meeting of chromeData) {
            try {
                await storageManager.saveMeeting(meeting);
                successCount++;
                console.log(`✅ Migrated meeting: ${meeting.title || meeting.id}`);
            } catch (error) {
                errorCount++;
                console.error(`❌ Failed to migrate meeting ${meeting.id}:`, error);
            }
        }
        
        console.log(`🎉 Migration completed: ${successCount} successful, ${errorCount} errors`);
        
        if (successCount > 0) {
            // Verify migration
            const migratedData = await storageManager.getMeetings();
            console.log(`✅ Verification: ${migratedData.length} meetings now in IndexedDB`);
            
            // Optionally clear Chrome storage after successful migration
            const shouldClearChrome = confirm(
                `Migration successful! ${successCount} meetings moved to IndexedDB.\n\n` +
                'Do you want to clear the old Chrome storage data?\n' +
                '(Recommended to free up space)'
            );
            
            if (shouldClearChrome) {
                await new Promise((resolve) => {
                    chrome.storage.local.set({ meetings: [] }, resolve);
                });
                console.log('✅ Old Chrome storage data cleared');
            } else {
                console.log('📝 Chrome storage data preserved (you can manually clear it later)');
            }
        }
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}

// Helper function to check current storage status
async function checkStorageStatus() {
    console.log('📊 Checking storage status...');
    
    try {
        // Check Chrome storage
        const chromeData = await new Promise((resolve) => {
            chrome.storage.local.get(['meetings'], (result) => {
                resolve(result.meetings || []);
            });
        });
        
        console.log(`Chrome storage: ${chromeData.length} meetings`);
        
        // Check IndexedDB storage
        if (typeof MeetingStorageManager !== 'undefined') {
            const storageManager = new MeetingStorageManager();
            await storageManager.init();
            const indexedDBData = await storageManager.getMeetings();
            console.log(`IndexedDB storage: ${indexedDBData.length} meetings`);
        } else {
            console.log('IndexedDB storage: Not available (MeetingStorageManager not found)');
        }
        
    } catch (error) {
        console.error('❌ Error checking storage status:', error);
    }
}

// Export functions for use in console or other scripts
if (typeof window !== 'undefined') {
    window.migrateChromeStorageToIndexedDB = migrateChromeStorageToIndexedDB;
    window.checkStorageStatus = checkStorageStatus;
}

// Auto-run status check if in browser context
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    checkStorageStatus();
}
