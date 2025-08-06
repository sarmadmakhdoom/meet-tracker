// Network-enhanced background service worker for Google Meet Tracker

let currentMeetingState = {
    state: 'none',
    participants: [],
    currentMeeting: null,
    networkParticipants: 0
};

console.log('🌐 Network-enhanced Google Meet Tracker background loaded');

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('Google Meet Tracker (Network Enhanced) installed');
    
    // Setup declarative net request rules for monitoring
    setupNetworkMonitoring();
    
    // Initialize storage
    chrome.storage.local.get(['meetings'], (result) => {
        if (!result.meetings) {
            chrome.storage.local.set({ meetings: [] });
        }
    });
});

// Network monitoring is handled by content script injection
async function setupNetworkMonitoring() {
    try {
        // Network monitoring is now handled entirely by content script shims
        // The content script injects network interception directly into the page context
        console.log('✅ Network monitoring delegated to content script shims');
    } catch (error) {
        console.error('❌ Failed to setup network monitoring:', error);
    }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    console.log(`📬 Background received: "${request.type || request.action}"`);
    
    try {
        const messageType = request.type || request.action;
        
        switch (messageType) {
            case 'update_participants':
                await handleParticipantsUpdate(request.data, sender);
                break;
                
            case 'update_meeting_state':
                await handleMeetingStateUpdate(request.data, sender);
                break;
                
            case 'meetingStarted':
                await handleMeetingStarted(request.meeting, sender);
                break;
                
            case 'meetingUpdate':
                await handleMeetingUpdate(request.meeting, request.minuteData, sender);
                break;
                
            case 'meetingEnded':
                await handleMeetingEnded(request.meeting, sender);
                break;
                
            case 'updateIcon':
                updateIcon(request.state, request.participants);
                currentMeetingState.state = request.state;
                currentMeetingState.participants = request.participants || [];
                currentMeetingState.networkParticipants = request.networkParticipants || 0;
                break;
                
            case 'getMeetings':
                const meetings = await getMeetings();
                sendResponse(meetings);
                return true;
                
            case 'getCurrentState':
                sendResponse(currentMeetingState);
                break;
                
            case 'clearAllData':
                const result = await clearAllData();
                sendResponse(result);
                return true;
                
            case 'getNetworkStats':
                sendResponse({
                    networkParticipants: currentMeetingState.networkParticipants,
                    totalParticipants: currentMeetingState.participants.length,
                    state: currentMeetingState.state
                });
                break;
        }
    } catch (error) {
        console.error('❌ Error handling message:', error);
        sendResponse({ error: error.message });
    }
});

// Enhanced meeting started handler
async function handleMeetingStarted(meeting, sender) {
    console.log('🚀 Meeting started (network enhanced):', meeting.title);
    
    // End any ongoing meetings first
    const meetings = await getMeetings();
    const ongoingMeetings = meetings.filter(m => !m.endTime);
    
    if (ongoingMeetings.length > 0) {
        console.log(`Ending ${ongoingMeetings.length} ongoing meetings`);
        const now = Date.now();
        const updatedMeetings = meetings.map(m => {
            if (!m.endTime) {
                return { ...m, endTime: now };
            }
            return m;
        });
        await saveMeetings(updatedMeetings);
    }
    
    // Set current meeting state
    currentMeetingState.currentMeeting = meeting;
    currentMeetingState.state = 'active';
    
    // Update icon
    updateIcon('active', meeting.participants || []);
}

// Enhanced meeting update handler
async function handleMeetingUpdate(meeting, minuteData, sender) {
    console.log(`📝 Meeting update: ${minuteData.participants.length} participants`);
    
    currentMeetingState.currentMeeting = meeting;
    currentMeetingState.participants = minuteData.participants || [];
    
    // Save meeting update
    await saveMeetingUpdate(meeting);
}

// Enhanced meeting ended handler  
async function handleMeetingEnded(meeting, sender) {
    console.log('🚫 Meeting ended:', meeting.title);
    
    // Save final meeting data
    await saveMeeting(meeting);
    
    // Reset state
    currentMeetingState = {
        state: 'none',
        participants: [],
        currentMeeting: null,
        networkParticipants: 0
    };
    
    // Update icon
    updateIcon('none', []);
}

// Handle participants update from network interception
async function handleParticipantsUpdate(data, sender) {
    const { meetingId, meetingTitle, participants } = data;
    
    console.log(`💶 Participants update: ${participants.length} participants in ${meetingId}`);
    
    // Update current meeting state
    if (!currentMeetingState.currentMeeting || currentMeetingState.currentMeeting.id !== meetingId) {
        // New meeting detected
        currentMeetingState.currentMeeting = {
            id: meetingId,
            title: meetingTitle || meetingId,
            startTime: Date.now(),
            url: sender.tab?.url
        };
        currentMeetingState.state = 'active';
    }
    
    // Update participants
    currentMeetingState.participants = participants;
    currentMeetingState.networkParticipants = participants.length;
    
    // Update icon with network data
    updateIcon('active', participants);
    
    // Save meeting data
    const meeting = {
        ...currentMeetingState.currentMeeting,
        participants: participants,
        lastUpdated: Date.now()
    };
    
    await saveMeetingUpdate(meeting);
}

// Handle meeting state update from content script
async function handleMeetingStateUpdate(data, sender) {
    const { meetingState, participantCount } = data;
    
    console.log(`📋 Meeting state update: ${meetingState.isActive ? 'active' : 'inactive'} - ${participantCount} participants`);
    
    if (meetingState.isActive) {
        // Update current meeting state
        currentMeetingState.state = 'active';
        currentMeetingState.currentMeeting = {
            id: meetingState.meetingId,
            title: meetingState.meetingTitle || meetingState.meetingId,
            startTime: meetingState.startTime,
            url: sender.tab?.url
        };
        currentMeetingState.networkParticipants = participantCount;
        
        // Update icon
        updateIcon('active', currentMeetingState.participants);
    } else {
        // Meeting is not active
        if (currentMeetingState.state === 'active') {
            // Meeting ended
            await handleMeetingEnded(currentMeetingState.currentMeeting, sender);
        }
    }
}

// Enhanced icon update with network participant count
function updateIcon(state, participants) {
    console.log(`🎨 Updating icon: ${state} (${participants.length} participants, ${currentMeetingState.networkParticipants} from network)`);
    
    let iconPath;
    let badgeText = '';
    let badgeColor = '#4285f4';
    let title = 'Google Meet Tracker (Network Enhanced)';
    
    switch (state) {
        case 'active':
            iconPath = {
                '16': 'icons/icon16-active.png',
                '48': 'icons/icon48-active.png',
                '128': 'icons/icon128-active.png'
            };
            
            const participantCount = participants.length;
            badgeText = participantCount.toString();
            badgeColor = currentMeetingState.networkParticipants > 0 ? '#0f9d58' : '#34a853'; // Different green if network data
            
            const networkInfo = currentMeetingState.networkParticipants > 0 
                ? ` (${currentMeetingState.networkParticipants} from network)`
                : ' (DOM only)';
            title = `In meeting: ${participantCount} participant(s)${networkInfo}`;
            break;
            
        case 'waiting':
            iconPath = {
                '16': 'icons/icon16.png',
                '48': 'icons/icon48.png', 
                '128': 'icons/icon128.png'
            };
            badgeText = '...';
            badgeColor = '#f57c00';
            title = 'Waiting in meeting lobby';
            break;
            
        default:
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
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    chrome.action.setTitle({ title });
    
    console.log(`✅ Icon updated: ${title}`);
}

// Storage functions
async function getMeetings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['meetings'], (result) => {
            resolve(result.meetings || []);
        });
    });
}

async function saveMeetings(meetings) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ meetings }, () => {
            resolve();
        });
    });
}

async function saveMeeting(meeting) {
    const meetings = await getMeetings();
    const existingIndex = meetings.findIndex(m => m.id === meeting.id);
    
    if (existingIndex >= 0) {
        meetings[existingIndex] = meeting;
    } else {
        meetings.push(meeting);
    }
    
    await saveMeetings(meetings);
    console.log('💾 Meeting saved to storage');
}

async function saveMeetingUpdate(meeting) {
    const meetings = await getMeetings();
    const existingIndex = meetings.findIndex(m => m.id === meeting.id);
    
    if (existingIndex >= 0) {
        meetings[existingIndex] = meeting;
    } else {
        meetings.push(meeting);
    }
    
    await saveMeetings(meetings);
}

async function clearAllData() {
    return new Promise((resolve) => {
        chrome.storage.local.set({ meetings: [] }, () => {
            currentMeetingState = {
                state: 'none',
                participants: [],
                currentMeeting: null,
                networkParticipants: 0
            };
            console.log('🗑️ All meeting data cleared');
            resolve({ success: true });
        });
    });
}

// Tab management
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('meet.google.com')) {
        console.log('📍 Google Meet tab updated:', tab.url);
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    // Check if removed tab was a meeting tab
    if (currentMeetingState.state === 'active') {
        chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
            if (tabs.length === 0) {
                console.log('📍 No more Meet tabs, ending meeting');
                currentMeetingState = {
                    state: 'none',
                    participants: [],
                    currentMeeting: null,
                    networkParticipants: 0
                };
                updateIcon('none', []);
            }
        });
    }
});

// Cleanup old meetings (keep last 30 days)
async function cleanupOldMeetings() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const meetings = await getMeetings();
    const recentMeetings = meetings.filter(meeting => 
        meeting.startTime > thirtyDaysAgo
    );
    
    if (recentMeetings.length !== meetings.length) {
        await saveMeetings(recentMeetings);
        console.log(`🧹 Cleaned up ${meetings.length - recentMeetings.length} old meetings`);
    }
}

// Auto-detect existing meetings on startup
chrome.runtime.onStartup.addListener(() => {
    console.log('Extension started, checking for existing meetings');
    checkExistingMeetings();
});

// Also check when extension is installed/updated
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        setTimeout(checkExistingMeetings, 2000); // Give time for tabs to load
    }
});

// Check for existing Google Meet tabs and inject content script
async function checkExistingMeetings() {
    try {
        const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
        console.log(`Found ${tabs.length} existing Google Meet tabs`);
        
        for (const tab of tabs) {
            console.log(`Checking tab ${tab.id}: ${tab.url}`);
            
            // Inject content script into existing tabs
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content-network.js']
                });
                console.log(`✅ Injected content script into tab ${tab.id}`);
                
                // Give it a moment then request current state
                setTimeout(() => {
                    chrome.tabs.sendMessage(tab.id, { type: 'get_meeting_state' }, (response) => {
                        if (!chrome.runtime.lastError && response) {
                            console.log(`Tab ${tab.id} meeting state:`, response);
                            if (response.meetingState?.isActive) {
                                currentMeetingState = {
                                    state: 'active',
                                    participants: response.participants || [],
                                    currentMeeting: {
                                        id: response.meetingState.meetingId,
                                        title: response.meetingState.meetingTitle,
                                        startTime: response.meetingState.startTime,
                                        url: tab.url
                                    },
                                    networkParticipants: response.participantCount || 0
                                };
                                updateIcon('active', response.participants || []);
                            }
                        }
                    });
                }, 1000);
                
            } catch (injectError) {
                console.log(`Could not inject into tab ${tab.id}:`, injectError.message);
            }
        }
    } catch (error) {
        console.error('Error checking existing meetings:', error);
    }
}

// Periodically cleanup old meetings (simple setTimeout approach)
setInterval(async () => {
    try {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const meetings = await getMeetings();
        const recentMeetings = meetings.filter(meeting => 
            meeting.startTime > thirtyDaysAgo
        );
        
        if (recentMeetings.length !== meetings.length) {
            await saveMeetings(recentMeetings);
            console.log(`🧹 Cleaned up ${meetings.length - recentMeetings.length} old meetings`);
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}, 24 * 60 * 60 * 1000); // Run every 24 hours

// Debug info
console.log('🌐 Network-enhanced Google Meet Tracker background service ready');
