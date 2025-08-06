// Complete storage cleanup script - run this in browser console
async function clearAllStorage() {
    console.log('🧹 Starting complete storage cleanup...');
    
    try {
        // 1. Clear via extension API
        console.log('📝 Clearing extension data...');
        const result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'clearAllData' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
        console.log('✅ Extension data cleared:', result);
        
        // 2. Clear IndexedDB manually
        console.log('🗃️ Clearing IndexedDB...');
        try {
            const databases = await indexedDB.databases();
            console.log('Found databases:', databases);
            
            for (const db of databases) {
                if (db.name.includes('MeetingTracker') || db.name.includes('meetingtracker')) {
                    console.log(`Deleting database: ${db.name}`);
                    const deleteReq = indexedDB.deleteDatabase(db.name);
                    await new Promise((resolve, reject) => {
                        deleteReq.onsuccess = () => resolve();
                        deleteReq.onerror = () => reject(deleteReq.error);
                    });
                    console.log(`✅ Deleted database: ${db.name}`);
                }
            }
        } catch (error) {
            console.log('⚠️ IndexedDB manual cleanup failed:', error);
        }
        
        // 3. Clear any Chrome local storage remnants
        console.log('🧽 Clearing Chrome local storage remnants...');
        try {
            chrome.storage.local.clear(() => {
                console.log('✅ Chrome local storage cleared');
            });
        } catch (error) {
            console.log('⚠️ Local storage cleanup failed:', error);
        }
        
        console.log('🎉 Complete cleanup finished!');
        console.log('🔄 Reloading page in 2 seconds...');
        
        setTimeout(() => {
            location.reload();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Cleanup error:', error);
    }
}

// Export for console use
window.clearAllStorage = clearAllStorage;

console.log('🧹 Storage cleanup script loaded!');
console.log('Run: clearAllStorage() to clear everything and start fresh');
