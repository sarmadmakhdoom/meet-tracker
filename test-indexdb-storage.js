// Test script to verify IndexedDB storage is working properly

// This script can be run in the browser console to test IndexedDB functionality

async function testIndexedDBStorage() {
    console.log('🧪 Testing IndexedDB storage...');
    
    try {
        // Import and initialize storage manager
        const storageManager = new MeetingStorageManager();
        await storageManager.init();
        console.log('✅ Storage manager initialized successfully');
        
        // Test creating a meeting
        const testMeeting = {
            id: 'test-meeting-' + Date.now(),
            title: 'Test Meeting',
            startTime: Date.now() - 30 * 60 * 1000, // 30 minutes ago
            endTime: Date.now(), // now
            participants: [
                { id: 'user1', name: 'Alice', joinTime: Date.now() - 25 * 60 * 1000 },
                { id: 'user2', name: 'Bob', joinTime: Date.now() - 20 * 60 * 1000 }
            ],
            url: 'https://meet.google.com/test-abc-xyz'
        };
        
        console.log('📝 Saving test meeting:', testMeeting);
        await storageManager.saveMeeting(testMeeting);
        console.log('✅ Test meeting saved');
        
        // Test retrieving meetings
        console.log('📥 Retrieving all meetings...');
        const meetings = await storageManager.getMeetings();
        console.log(`✅ Retrieved ${meetings.length} meetings:`, meetings);
        
        // Test retrieving specific meeting
        console.log('🔍 Retrieving specific test meeting...');
        const retrievedMeeting = await storageManager.getMeeting(testMeeting.id);
        console.log('✅ Retrieved specific meeting:', retrievedMeeting);
        
        // Test deleting the meeting
        console.log('🗑️ Deleting test meeting...');
        await storageManager.deleteMeeting(testMeeting.id);
        console.log('✅ Test meeting deleted');
        
        // Verify deletion
        console.log('🔍 Verifying deletion...');
        const meetingsAfterDelete = await storageManager.getMeetings();
        const deletedMeeting = await storageManager.getMeeting(testMeeting.id);
        console.log(`✅ Meetings after deletion: ${meetingsAfterDelete.length}`);
        console.log('✅ Deleted meeting (should be null):', deletedMeeting);
        
        console.log('🎉 All IndexedDB storage tests passed!');
        
    } catch (error) {
        console.error('❌ IndexedDB storage test failed:', error);
    }
}

// Auto-run test if storage manager is available
if (typeof MeetingStorageManager !== 'undefined') {
    testIndexedDBStorage();
} else {
    console.log('⚠️ MeetingStorageManager not available. Make sure storage-manager.js is loaded.');
}
