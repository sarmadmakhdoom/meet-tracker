// Test script for continuous minute-by-minute tracking
// Run this in a Google Meet tab console to test minute tracking

console.log('🧪 Testing minute-by-minute tracking system...');

// Function to test the minute tracking
function testMinuteTracking() {
    if (typeof tracker === 'undefined') {
        console.error('❌ SimpleMeetTracker not found. Make sure you are on a Google Meet page with the extension loaded.');
        return;
    }
    
    console.log('✅ SimpleMeetTracker found');
    console.log('Current meeting state:', tracker.meetingState);
    console.log('Current participants:', Array.from(tracker.participants.values()));
    
    if (tracker.meetingState.isActive) {
        console.log('📊 Meeting is active!');
        console.log('Meeting duration so far:', formatDuration(Date.now() - tracker.meetingState.startTime));
        console.log('Last minute logged:', tracker.lastMinuteLogged);
        console.log('Minute tracking interval:', tracker.minuteTrackingInterval ? 'Running' : 'Not running');
    } else {
        console.log('⏸️ No active meeting detected');
    }
}

// Function to simulate minute logging manually
function simulateMinuteLog() {
    if (typeof tracker === 'undefined' || !tracker.meetingState.isActive) {
        console.error('❌ No active meeting to log minute data for');
        return;
    }
    
    console.log('📝 Manually triggering minute log...');
    tracker.logCurrentMinute();
}

// Function to check storage for minute data
async function checkMinuteDataInStorage() {
    console.log('🔍 Checking storage for minute data...');
    
    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'getMeetings' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        
        console.log('📥 Received meetings:', response);
        
        if (Array.isArray(response)) {
            response.forEach((meeting, index) => {
                console.log(`Meeting ${index + 1}: ${meeting.title || meeting.id}`);
                console.log(`  Start: ${new Date(meeting.startTime).toLocaleString()}`);
                console.log(`  End: ${meeting.endTime ? new Date(meeting.endTime).toLocaleString() : 'Ongoing'}`);
                console.log(`  Participants: ${meeting.participants?.length || 0}`);
                console.log(`  Current Duration: ${meeting.currentDuration ? formatDuration(meeting.currentDuration) : 'Not set'}`);
                console.log(`  Minute Logs: ${meeting.minuteLogs?.length || 0} entries`);
                
                if (meeting.minuteLogs && meeting.minuteLogs.length > 0) {
                    console.log(`  Latest minute log:`, meeting.minuteLogs[meeting.minuteLogs.length - 1]);
                }
                console.log('---');
            });
        } else {
            console.log('⚠️ Unexpected response format:', response);
        }
        
    } catch (error) {
        console.error('❌ Error checking storage:', error);
    }
}

// Function to start manual meeting for testing
function startTestMeeting() {
    if (typeof tracker === 'undefined') {
        console.error('❌ SimpleMeetTracker not found');
        return;
    }
    
    console.log('🚀 Starting test meeting...');
    
    // Manually set meeting state for testing
    tracker.meetingState = {
        isActive: true,
        meetingId: 'test-meeting-' + Date.now(),
        startTime: Date.now(),
        meetingTitle: 'Test Meeting for Minute Tracking'
    };
    
    // Add some test participants
    tracker.participants.clear();
    tracker.participants.set('test1', {
        id: 'test1',
        name: 'Test User 1',
        joinTime: Date.now(),
        source: 'test'
    });
    tracker.participants.set('test2', {
        id: 'test2',
        name: 'Test User 2',
        joinTime: Date.now(),
        source: 'test'
    });
    
    console.log('✅ Test meeting started');
    console.log('Meeting state:', tracker.meetingState);
    console.log('Participants:', Array.from(tracker.participants.values()));
    
    // Start minute tracking
    tracker.startMinuteTracking();
    console.log('⏰ Minute tracking started');
}

// Function to stop test meeting
function stopTestMeeting() {
    if (typeof tracker === 'undefined') {
        console.error('❌ SimpleMeetTracker not found');
        return;
    }
    
    console.log('🛑 Stopping test meeting...');
    
    // Stop minute tracking
    tracker.stopMinuteTracking();
    
    // Set end time and mark as inactive
    tracker.meetingState.endTime = Date.now();
    tracker.meetingState.isActive = false;
    
    console.log('✅ Test meeting stopped');
    console.log('Final meeting state:', tracker.meetingState);
}

// Function to force a minute log every few seconds (for rapid testing)
function startRapidMinuteLogging(intervalSeconds = 10) {
    console.log(`⚡ Starting rapid minute logging every ${intervalSeconds} seconds...`);
    
    let minuteCounter = 1;
    const rapidInterval = setInterval(() => {
        if (typeof tracker === 'undefined' || !tracker.meetingState.isActive) {
            console.log('⏹️ Stopping rapid logging - no active meeting');
            clearInterval(rapidInterval);
            return;
        }
        
        // Force log current minute
        tracker.lastMinuteLogged = minuteCounter - 1; // Reset to force new log
        tracker.logCurrentMinute();
        
        minuteCounter++;
        console.log(`⏰ Rapid log ${minuteCounter - 1} completed`);
        
    }, intervalSeconds * 1000);
    
    // Store the interval so it can be cleared
    window.rapidMinuteInterval = rapidInterval;
    
    console.log('✅ Rapid minute logging started. Use stopRapidMinuteLogging() to stop.');
}

// Function to stop rapid minute logging
function stopRapidMinuteLogging() {
    if (window.rapidMinuteInterval) {
        clearInterval(window.rapidMinuteInterval);
        window.rapidMinuteInterval = null;
        console.log('✅ Rapid minute logging stopped');
    } else {
        console.log('⚠️ No rapid minute logging to stop');
    }
}

// Helper function to format duration
function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
}

// Export functions to global scope
window.testMinuteTracking = testMinuteTracking;
window.simulateMinuteLog = simulateMinuteLog;
window.checkMinuteDataInStorage = checkMinuteDataInStorage;
window.startTestMeeting = startTestMeeting;
window.stopTestMeeting = stopTestMeeting;
window.startRapidMinuteLogging = startRapidMinuteLogging;
window.stopRapidMinuteLogging = stopRapidMinuteLogging;

console.log('🧪 Minute tracking test functions loaded:');
console.log('  • testMinuteTracking() - Check current tracking state');
console.log('  • simulateMinuteLog() - Manually trigger a minute log');
console.log('  • checkMinuteDataInStorage() - View stored minute data');
console.log('  • startTestMeeting() - Start a test meeting with participants');
console.log('  • stopTestMeeting() - Stop the test meeting');
console.log('  • startRapidMinuteLogging(seconds) - Log minutes rapidly for testing');
console.log('  • stopRapidMinuteLogging() - Stop rapid logging');

// Auto-run basic test
console.log('\n📊 Running basic minute tracking test...');
testMinuteTracking();
