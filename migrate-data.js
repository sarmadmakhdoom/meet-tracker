// One-time migration script to import existing local storage data into enhanced IndexedDB
// This script should be run after manually switching to enhanced background script

async function migrateLocalStorageToIndexedDB() {
    console.log('🔄 Starting migration from local storage to enhanced IndexedDB...');
    
    try {
        // Step 1: Get existing data from local storage
        const existingData = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getMeetings' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response || []);
                }
            });
        });
        
        console.log(`📊 Found ${existingData.length} meetings in current storage`);
        
        if (existingData.length === 0) {
            console.log('✅ No data to migrate - storage is empty');
            alert('ℹ️ No Data Found\n\nNo meetings found in storage to migrate.\n\nThis could mean:\n• You have no meeting history yet\n• Data was already migrated\n• Extension needs to be reloaded');
            return { success: true, migrated: 0, message: 'No data to migrate' };
        }
        
        // Step 2: Try to import the data using enhanced storage
        console.log('📥 Importing data to enhanced IndexedDB...');
        
        const importResult = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'importMeetings',
                meetings: existingData
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
        
        if (importResult && importResult.error) {
            throw new Error('Import failed: ' + importResult.error);
        }
        
        if (!importResult || !importResult.success) {
            throw new Error('Enhanced storage not available. Make sure manifest uses background-enhanced.js');
        }
        
        console.log('✅ Migration completed successfully!');
        console.log(`📈 Migrated ${importResult.imported} meetings`);
        
        // Step 3: Get enhanced storage statistics
        const stats = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getStorageStats' }, (response) => {
                resolve(response || {});
            });
        });
        
        const result = {
            success: true,
            migrated: importResult.imported,
            stats: stats,
            message: `Successfully migrated ${importResult.imported} meetings to enhanced IndexedDB`
        };
        
        console.log('📊 Migration Statistics:');
        console.log(`• Meetings migrated: ${result.migrated}`);
        if (stats && stats.totalMeetings) {
            console.log(`• Total meetings in enhanced storage: ${stats.totalMeetings}`);
            console.log(`• Total duration: ${formatDuration(stats.totalDuration)}`);
            console.log(`• Date range: ${stats.oldestMeeting ? new Date(stats.oldestMeeting).toLocaleDateString() : 'N/A'} to ${stats.newestMeeting ? new Date(stats.newestMeeting).toLocaleDateString() : 'N/A'}`);
        }
        
        alert('🎉 Migration Complete!\n\n' +
            `✅ Successfully migrated ${result.migrated} meetings\n` +
            `📊 Enhanced storage is now active with all your historical data\n\n` +
            'You can now use advanced features like:\n' +
            '• Storage statistics\n' +
            '• Data cleanup\n' +
            '• Enhanced export\n' +
            '• Unlimited storage capacity\n\n' +
            'Refresh the dashboard to see your data with enhanced features!');
        
        return result;
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        
        let errorMessage = error.message;
        if (errorMessage.includes('Enhanced storage not available')) {
            errorMessage += '\n\nTo fix this:\n1. Edit manifest.json\n2. Change "service_worker": "background.js"\n3. To "service_worker": "background-enhanced.js"\n4. Reload extension\n5. Run migration again';
        }
        
        alert('❌ Migration Failed\n\n' +
            'Error: ' + errorMessage + '\n\n' +
            'Your existing data is safe and unchanged.');
        
        return { success: false, error: error.message };
    }
}

function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ${hrs % 24}h`;
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
}

// Export the function for console use
window.migrateLocalStorageToIndexedDB = migrateLocalStorageToIndexedDB;

console.log('📦 Migration script loaded!');
console.log('To start migration, run: migrateLocalStorageToIndexedDB()');
