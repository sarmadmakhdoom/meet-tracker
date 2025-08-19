// Debug script to check current aggregation logic
// Run this in browser console on the dashboard page

console.log('🔍 Debugging aggregation logic...');

// Check if we can access the background script
if (typeof chrome !== 'undefined' && chrome.runtime) {
    // Get fresh aggregated data
    chrome.runtime.sendMessage({ action: 'getMeetingsAggregated' }, (response) => {
        console.log('📊 Fresh aggregated meetings:', response);
        
        if (Array.isArray(response)) {
            console.log(`📈 Total aggregated meetings: ${response.length}`);
            
            // Group by original meetingId to see the separation
            const groupedByMeetingId = {};
            response.forEach(meeting => {
                const originalMeetingId = meeting.meetingId;
                if (!groupedByMeetingId[originalMeetingId]) {
                    groupedByMeetingId[originalMeetingId] = [];
                }
                groupedByMeetingId[originalMeetingId].push({
                    id: meeting.id,
                    date: meeting.date,
                    sessionCount: meeting.sessionCount,
                    startTime: new Date(meeting.startTime).toLocaleString()
                });
            });
            
            console.log('📋 Meetings grouped by original meetingId:', groupedByMeetingId);
            
            // Check for any meetings that span multiple dates
            Object.entries(groupedByMeetingId).forEach(([meetingId, meetings]) => {
                if (meetings.length > 1) {
                    console.log(`🔍 MeetingId "${meetingId}" has ${meetings.length} separate date entries:`, meetings);
                }
            });
        }
    });
} else {
    console.error('❌ Chrome extension APIs not available');
}
