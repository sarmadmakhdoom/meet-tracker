// Test script to validate meeting end detection and duration calculation
// Run this in the dashboard console to test the meeting end flow

console.log('🧪 Testing meeting end detection...');

// Function to simulate a meeting end event
function simulateMeetingEnd() {
    const testMeeting = {
        id: 'test-meeting-' + Date.now(),
        title: 'Test Meeting for Duration',
        startTime: Date.now() - (15 * 60 * 1000), // Started 15 minutes ago
        endTime: Date.now(), // Just ended
        participants: [
            { id: '1', name: 'Test User 1', source: 'dom' },
            { id: '2', name: 'Test User 2', source: 'dom' }
        ],
        url: 'https://meet.google.com/test-meeting',
        lastUpdated: Date.now()
    };
    
    console.log('📤 Simulating meeting end with data:', testMeeting);
    
    // Send meeting end message to background
    chrome.runtime.sendMessage({
        type: 'meetingEnded',
        meeting: testMeeting
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('❌ Error sending meeting end:', chrome.runtime.lastError.message);
        } else {
            console.log('✅ Meeting end sent successfully:', response);
            
            // Wait a moment then check if the meeting was saved
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    type: 'getMeetings'
                }, (meetings) => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ Error getting meetings:', chrome.runtime.lastError.message);
                        return;
                    }
                    
                    const savedMeeting = meetings.find(m => m.id === testMeeting.id);
                    if (savedMeeting) {
                        const duration = savedMeeting.endTime - savedMeeting.startTime;
                        console.log('✅ Meeting was saved with proper endTime!');
                        console.log(`📊 Duration: ${Math.round(duration / 60000)} minutes`);
                        console.log('💾 Saved meeting data:', savedMeeting);
                    } else {
                        console.error('❌ Meeting was not found in storage');
                    }
                });
            }, 1000);
        }
    });
}

// Function to test duration display in dashboard
function testDurationDisplay() {
    console.log('🧪 Testing duration display...');
    
    // Get all meetings and check duration display
    chrome.runtime.sendMessage({
        type: 'getMeetings'
    }, (meetings) => {
        if (chrome.runtime.lastError) {
            console.error('❌ Error getting meetings:', chrome.runtime.lastError.message);
            return;
        }
        
        console.log(`📊 Found ${meetings.length} meetings in storage`);
        
        meetings.forEach((meeting, index) => {
            const hasEndTime = !!meeting.endTime;
            const duration = hasEndTime ? meeting.endTime - meeting.startTime : null;
            const durationMinutes = duration ? Math.round(duration / 60000) : null;
            
            console.log(`Meeting ${index + 1}: ${meeting.title || meeting.id}`);
            console.log(`  Start: ${new Date(meeting.startTime).toLocaleString()}`);
            console.log(`  End: ${hasEndTime ? new Date(meeting.endTime).toLocaleString() : 'Ongoing'}`);
            console.log(`  Duration: ${hasEndTime ? durationMinutes + ' minutes' : 'Ongoing'}`);
            console.log(`  Participants: ${meeting.participants?.length || 0}`);
            console.log('---');
        });
    });
}

// Function to check current meeting state
function checkCurrentMeetingState() {
    console.log('🧪 Checking current meeting state...');
    
    chrome.runtime.sendMessage({
        type: 'getCurrentState'
    }, (state) => {
        if (chrome.runtime.lastError) {
            console.error('❌ Error getting current state:', chrome.runtime.lastError.message);
            return;
        }
        
        console.log('📊 Current meeting state:', state);
    });
}

// Function to clear test data
function clearTestMeetings() {
    console.log('🧹 Clearing test meetings...');
    
    chrome.runtime.sendMessage({
        type: 'getMeetings'
    }, (meetings) => {
        if (chrome.runtime.lastError) {
            console.error('❌ Error getting meetings:', chrome.runtime.lastError.message);
            return;
        }
        
        const nonTestMeetings = meetings.filter(m => !m.id.startsWith('test-meeting-'));
        
        if (nonTestMeetings.length !== meetings.length) {
            console.log(`🗑️ Removing ${meetings.length - nonTestMeetings.length} test meetings`);
            
            chrome.storage.local.set({ meetings: nonTestMeetings }, () => {
                console.log('✅ Test meetings cleared');
            });
        } else {
            console.log('✅ No test meetings found');
        }
    });
}

// Export functions to global scope
window.simulateMeetingEnd = simulateMeetingEnd;
window.testDurationDisplay = testDurationDisplay;
window.checkCurrentMeetingState = checkCurrentMeetingState;
window.clearTestMeetings = clearTestMeetings;

console.log('🧪 Test functions loaded:');
console.log('  • simulateMeetingEnd() - Create a test meeting with proper end time');
console.log('  • testDurationDisplay() - Check how durations are displayed');
console.log('  • checkCurrentMeetingState() - Check current meeting state');
console.log('  • clearTestMeetings() - Remove all test meetings');
console.log('  • findOngoingMeetings() - Find meetings showing as "Ongoing"');
console.log('  • fixOngoingMeetings() - Fix meetings without endTime');

// Function to check all stored meetings for missing endTime
function findOngoingMeetings() {
    console.log('🔍 Checking for meetings without endTime...');
    
    chrome.runtime.sendMessage({
        type: 'getMeetings'
    }, (meetings) => {
        if (chrome.runtime.lastError) {
            console.error('❌ Error getting meetings:', chrome.runtime.lastError.message);
            return;
        }
        
        const ongoingMeetings = meetings.filter(m => !m.endTime);
        const completedMeetings = meetings.filter(m => m.endTime);
        
        console.log(`\n📊 Meeting Status Summary:`);
        console.log(`   Total meetings: ${meetings.length}`);
        console.log(`   Completed meetings (with endTime): ${completedMeetings.length}`);
        console.log(`   Ongoing meetings (no endTime): ${ongoingMeetings.length}`);
        
        if (ongoingMeetings.length > 0) {
            console.log('\n🚨 Meetings showing as "Ongoing" in dashboard:');
            ongoingMeetings.forEach((meeting, index) => {
                console.log(`   ${index + 1}. ${meeting.title || meeting.id}`);
                console.log(`      Started: ${new Date(meeting.startTime).toLocaleString()}`);
                console.log(`      Participants: ${meeting.participants?.length || 0}`);
                console.log(`      Last updated: ${meeting.lastUpdated ? new Date(meeting.lastUpdated).toLocaleString() : 'Never'}`);
            });
            
            console.log('\n💡 These meetings need to be closed with an endTime to show proper duration.');
        } else {
            console.log('\n✅ All meetings have proper endTime!');
        }
    });
}

// Function to fix ongoing meetings by setting their endTime
function fixOngoingMeetings() {
    console.log('🔧 Fixing ongoing meetings...');
    
    chrome.runtime.sendMessage({
        type: 'getMeetings'
    }, (meetings) => {
        if (chrome.runtime.lastError) {
            console.error('❌ Error getting meetings:', chrome.runtime.lastError.message);
            return;
        }
        
        const ongoingMeetings = meetings.filter(m => !m.endTime);
        
        if (ongoingMeetings.length === 0) {
            console.log('✅ No ongoing meetings found to fix');
            return;
        }
        
        console.log(`🔧 Fixing ${ongoingMeetings.length} ongoing meetings...`);
        
        // Set endTime for each ongoing meeting (assume they ended 1 hour after last update or start)
        const updatedMeetings = meetings.map(meeting => {
            if (!meeting.endTime) {
                const estimatedEndTime = Math.max(
                    meeting.lastUpdated || meeting.startTime,
                    meeting.startTime + (60 * 60 * 1000) // At least 1 hour duration
                );
                
                console.log(`   Fixing: ${meeting.title || meeting.id}`);
                console.log(`     Start: ${new Date(meeting.startTime).toLocaleString()}`);
                console.log(`     Estimated end: ${new Date(estimatedEndTime).toLocaleString()}`);
                
                return {
                    ...meeting,
                    endTime: estimatedEndTime
                };
            }
            return meeting;
        });
        
        // Save the updated meetings
        chrome.storage.local.set({ meetings: updatedMeetings }, () => {
            if (chrome.runtime.lastError) {
                console.error('❌ Error saving fixed meetings:', chrome.runtime.lastError.message);
            } else {
                console.log('✅ Fixed ongoing meetings! Refresh the dashboard to see updated durations.');
                
                // Optionally reload the page to see changes
                if (confirm('Meetings fixed! Reload the dashboard to see updated durations?')) {
                    window.location.reload();
                }
            }
        });
    });
}

// Export new functions to global scope
window.findOngoingMeetings = findOngoingMeetings;
window.fixOngoingMeetings = fixOngoingMeetings;

// Auto-run basic tests
console.log('\n📊 Running basic tests...');
testDurationDisplay();
checkCurrentMeetingState();
findOngoingMeetings();
