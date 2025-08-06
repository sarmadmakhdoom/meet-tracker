// Background service worker for Google Meet Tracker

let currentMeetingState = {
    state: 'none', // 'none', 'waiting', or 'active'
    participants: [],
    currentMeeting: null
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('Google Meet Tracker installed');
    
    // Initialize storage if needed
    chrome.storage.local.get(['meetings'], (result) => {
        if (!result.meetings) {
            chrome.storage.local.set({ meetings: [] });
        } else {
            // Clean up any meetings that shouldn't be ongoing
            cleanupOrphanedMeetings();
        }
    });
});

// Also run cleanup when service worker starts up
chrome.runtime.onStartup.addListener(() => {
    console.log('Chrome started, cleaning up orphaned meetings');
    cleanupOrphanedMeetings();
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'meetingStarted':
            handleMeetingStarted(request.meeting, sender);
            break;
            
        case 'meetingUpdate':
            handleMeetingUpdate(request.meeting, request.minuteData, sender);
            break;
            
        case 'meetingEnded':
            handleMeetingEnded(request.meeting, sender);
            break;
            
        case 'updateIcon':
            updateIcon(request.state, request.participants);
            // Update the state keeper
            currentMeetingState.state = request.state;
            currentMeetingState.participants = request.participants;
            if (request.state !== 'active') {
                // Clear meeting object if not in an active call
                // but keep it if waiting, in case we need the URL
                if (request.state === 'none') {
                    currentMeetingState.currentMeeting = null;
                }
            }
            break;
            
        case 'getMeetings':
            getMeetings(sendResponse);
            return true; // Will respond asynchronously
            
        case 'getCurrentState':
            sendResponse(currentMeetingState);
            break;
            
        case 'clearAllData':
            clearAllData(sendResponse);
            return true; // Will respond asynchronously
    }
});

// Handle meeting started
function handleMeetingStarted(meeting, sender) {
    console.log('Meeting started (active):', meeting);
    
    // First, check if we need to end any previous ongoing meetings
    chrome.storage.local.get(['meetings'], (result) => {
        const meetings = result.meetings || [];
        
        // Find any ongoing meetings (meetings without endTime)
        const ongoingMeetings = meetings.filter(m => !m.endTime);
        
        if (ongoingMeetings.length > 0) {
            console.log(`Found ${ongoingMeetings.length} ongoing meetings. Ending them...`);
            
            // End all ongoing meetings
            const now = Date.now();
            const updatedMeetings = meetings.map(m => {
                if (!m.endTime) {
                    return { ...m, endTime: now };
                }
                return m;
            });
            
            chrome.storage.local.set({ meetings: updatedMeetings }, () => {
                console.log('Previous ongoing meetings ended');
            });
        }
        
        // Now start the new meeting
        currentMeetingState.currentMeeting = meeting;
        currentMeetingState.state = 'active';
        
        // Update icon to active state
        updateIcon('active', meeting.participants);
    });
}

// Handle meeting update
function handleMeetingUpdate(meeting, minuteData, sender) {
    console.log('Meeting update:', minuteData);
    currentMeetingState.currentMeeting = meeting;
    currentMeetingState.participants = minuteData.participants;
    
    // Update stored meeting data
    saveMeetingUpdate(meeting);
}

// Handle meeting ended
function handleMeetingEnded(meeting, sender) {
    console.log('Meeting ended:', meeting);
    
    // Save final meeting data
    saveMeeting(meeting);
    
    // Reset state
    currentMeetingState = {
        state: 'none',
        participants: [],
        currentMeeting: null
    };
    
    // Update icon to inactive state
    updateIcon('none', []);
}

// Save meeting to storage
function saveMeeting(meeting) {
    chrome.storage.local.get(['meetings'], (result) => {
        const meetings = result.meetings || [];
        
        // Check if meeting already exists (update scenario)
        const existingIndex = meetings.findIndex(m => m.id === meeting.id);
        
        if (existingIndex >= 0) {
            meetings[existingIndex] = meeting;
        } else {
            meetings.push(meeting);
        }
        
        chrome.storage.local.set({ meetings }, () => {
            console.log('Meeting saved to storage');
        });
    });
}

// Save meeting update to storage
function saveMeetingUpdate(meeting) {
    chrome.storage.local.get(['meetings'], (result) => {
        const meetings = result.meetings || [];
        
        // Find and update existing meeting or add new one
        const existingIndex = meetings.findIndex(m => m.id === meeting.id);
        
        if (existingIndex >= 0) {
            meetings[existingIndex] = meeting;
        } else {
            meetings.push(meeting);
        }
        
        chrome.storage.local.set({ meetings });
    });
}

// Get all meetings from storage
function getMeetings(sendResponse) {
    chrome.storage.local.get(['meetings'], (result) => {
        sendResponse(result.meetings || []);
    });
}

// Update extension icon
function updateIcon(state, participants) {
    let iconPath;
    let badgeText = '';
    let badgeColor = '#4285f4'; // Default blue
    let title = 'Google Meet Tracker';

    switch (state) {
        case 'active':
            iconPath = {
                '16': 'icons/icon16-active.png',
                '48': 'icons/icon48-active.png',
                '128': 'icons/icon128-active.png'
            };
            const realParticipants = participants.filter(p => !p.includes('Studio Display'));
            badgeText = realParticipants.length.toString();
            badgeColor = '#34a853'; // Green for active
            title = `In meeting with ${badgeText} participant(s)`;
            break;
        case 'waiting':
            iconPath = {
                '16': 'icons/icon16.png', // Use default icon
                '48': 'icons/icon48.png',
                '128': 'icons/icon128.png'
            };
            badgeText = '...';
            badgeColor = '#f57c00'; // Orange for waiting
            title = 'Waiting in meeting lobby';
            break;
        default: // 'none'
            iconPath = {
                '16': 'icons/icon16.png',
                '48': 'icons/icon48.png',
                '128': 'icons/icon128.png'
            };
            title = 'Not in a meeting';
            break;
    }
    
    // Update icon
    chrome.action.setIcon({ path: iconPath });
    
    // Update badge
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    
    // Update title
    chrome.action.setTitle({ title });
}

// Handle tab updates to manage meeting state
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('meet.google.com')) {
        // Tab updated, content script will handle meeting detection
    }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // If the removed tab was a meet tab and we're in a meeting, end it
    if (currentMeetingState.inMeeting) {
        chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
            if (tabs.length === 0) {
                // No more meet tabs, likely ended meeting
                currentMeetingState = {
                    inMeeting: false,
                    participants: [],
                    currentMeeting: null
                };
                updateIcon(false, []);
            }
        });
    }
});

// Cleanup meetings older than 90 days (optional)
function cleanupOldMeetings() {
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    
    chrome.storage.local.get(['meetings'], (result) => {
        const meetings = result.meetings || [];
        const filteredMeetings = meetings.filter(meeting => 
            meeting.startTime > ninetyDaysAgo
        );
        
        if (filteredMeetings.length !== meetings.length) {
            chrome.storage.local.set({ meetings: filteredMeetings }, () => {
                console.log(`Cleaned up ${meetings.length - filteredMeetings.length} old meetings`);
            });
        }
    });
}

// Clear all data function
function clearAllData(sendResponse) {
    chrome.storage.local.set({ meetings: [] }, () => {
        // Also reset current meeting state
        currentMeetingState = {
            state: 'none',
            participants: [],
            currentMeeting: null
        };
        console.log('All meeting data cleared');
        sendResponse({ success: true });
    });
}

// Smart cleanup of meetings that are no longer active based on open tabs
function cleanupOrphanedMeetings() {
    chrome.storage.local.get(['meetings'], (result) => {
        const meetings = result.meetings || [];
        const ongoingMeetings = meetings.filter(m => !m.endTime);
        
        if (ongoingMeetings.length === 0) {
            console.log('No ongoing meetings to check');
            return;
        }
        
        // Query all Google Meet tabs
        chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
            console.log(`Found ${tabs.length} Google Meet tabs, ${ongoingMeetings.length} ongoing meetings`);
            
            const activeMeetingCodes = new Set();
            
            // Extract meeting codes from active tabs
            tabs.forEach(tab => {
                const meetingCodeMatch = tab.url.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:\?|$)/);
                if (meetingCodeMatch) {
                    activeMeetingCodes.add(meetingCodeMatch[1]);
                    console.log(`Active meeting tab found: ${meetingCodeMatch[1]}`);
                }
            });
            
            // Check if any ongoing meetings don't have corresponding tabs
            let hasOrphanedMeetings = false;
            const now = Date.now();
            
            const updatedMeetings = meetings.map(meeting => {
                // If meeting is ongoing but no tab exists for this meeting code
                if (!meeting.endTime && !activeMeetingCodes.has(meeting.id)) {
                    console.log(`Ending orphaned meeting: ${meeting.id} (no corresponding tab found)`);
                    hasOrphanedMeetings = true;
                    return { ...meeting, endTime: now };
                }
                return meeting;
            });
            
            if (hasOrphanedMeetings) {
                chrome.storage.local.set({ meetings: updatedMeetings }, () => {
                    console.log('Cleaned up orphaned meetings');
                });
            }
        });
    });
}

// Run cleanup weekly for old meetings
setInterval(cleanupOldMeetings, 7 * 24 * 60 * 60 * 1000);

// Run orphaned meeting cleanup every 5 minutes (more frequent but smarter)
setInterval(cleanupOrphanedMeetings, 5 * 60 * 1000);
