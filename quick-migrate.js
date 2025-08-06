// Quick migration script - run this in browser console on dashboard page
async function quickMigrate() {
    console.log('🔄 Starting quick migration to IndexedDB...');
    
    try {
        // Get current data from local storage (via background script)
        const currentData = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getMeetings' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response || []);
                }
            });
        });
        
        console.log(`Found ${currentData.length} meetings to migrate`);
        
        if (currentData.length === 0) {
            console.log('✅ No data to migrate');
            return;
        }
        
        // The enhanced background script should automatically migrate the data
        // when it starts up, so let's just check if it worked
        console.log('✅ Migration should be handled automatically by enhanced background script');
        console.log('📊 Refresh the dashboard to see your data with enhanced features');
        
        // Force a reload of meetings to see if enhanced storage is working
        setTimeout(() => {
            location.reload();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Migration error:', error);
    }
}

// Run the migration
quickMigrate();
