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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`📬 Background received: "${request.type || request.action}"`);
    
    const messageType = request.type || request.action;
    
    // Handle async operations
    const handleAsync = async () => {
        try {
            switch (messageType) {
                case 'update_participants':
                    await handleParticipantsUpdate(request.data, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'update_meeting_state':
                    await handleMeetingStateUpdate(request.data, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'meetingStarted':
                    await handleMeetingStarted(request.meeting, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'meetingUpdate':
                    await handleMeetingUpdate(request.meeting, request.minuteData, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'meetingEnded':
                    await handleMeetingEnded(request.meeting, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'updateIcon':
                    updateIcon(request.state, request.participants);
                    currentMeetingState.state = request.state;
                    currentMeetingState.participants = request.participants || [];
                    currentMeetingState.networkParticipants = request.networkParticipants || 0;
                    sendResponse({ success: true });
                    break;
                    
                case 'getMeetings':
                    console.log('📥 Background: Getting meetings from storage...');
                    const meetings = await getMeetings();
                    console.log(`📤 Background: Sending ${meetings.length} meetings to dashboard`);
                    sendResponse(meetings);
                    break;
                    
                case 'getCurrentState':
                    sendResponse(currentMeetingState);
                    break;
                    
                case 'clearAllData':
                    const clearResult = await clearAllData();
                    sendResponse(clearResult);
                    break;
                    
                case 'logMinuteData':
                    await handleMinuteDataLog(request.data, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'getNetworkStats':
                    sendResponse({
                        networkParticipants: currentMeetingState.networkParticipants,
                        totalParticipants: currentMeetingState.participants.length,
                        state: currentMeetingState.state
                    });
                    break;
                    
                case 'forceEndMeeting':
                    const forceEndResult = await forceEndCurrentMeeting();
                    sendResponse(forceEndResult);
                    break;
                    
                case 'getRealTimeState':
                    sendResponse({
                        currentMeeting: currentMeetingState.currentMeeting,
                        state: currentMeetingState.state,
                        participants: currentMeetingState.participants,
                        lastUpdate: Date.now()
                    });
                    break;
                    
                default:
                    console.warn(`⚠️ Unknown message type: ${messageType}`);
                    sendResponse({ error: `Unknown message type: ${messageType}` });
                    break;
            }
        } catch (error) {
            console.error('❌ Error handling message:', error);
            sendResponse({ error: error.message });
        }
    };
    
    // Execute async handler
    handleAsync();
    
    // Return true to indicate we will respond asynchronously
    return true;
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
    console.log('🚫 Meeting ended:', meeting.title || meeting.id);
    
    // Ensure the meeting has proper endTime
    const finalMeeting = {
        ...meeting,
        endTime: meeting.endTime || Date.now() // Set endTime if not already set
    };
    
    const duration = finalMeeting.endTime - finalMeeting.startTime;
    console.log(`📊 Meeting duration: ${Math.round(duration / 60000)} minutes`);
    
    // Save final meeting data with endTime
    await saveMeeting(finalMeeting);
    
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

// Handle participants update from network interception (enhanced)
async function handleParticipantsUpdate(data, sender) {
    const { meetingId, meetingTitle, participants } = data;
    
    // Analyze data sources
    const networkParticipants = participants.filter(p => p.source?.includes('sync') || p.source?.includes('network')).length;
    const domParticipants = participants.filter(p => p.source?.includes('dom')).length;
    const avatarCount = participants.filter(p => p.avatarUrl).length;
    
    console.log(`💶 Participants update: ${participants.length} participants in ${meetingId}`);
    console.log(`   Network: ${networkParticipants}, DOM: ${domParticipants}, Avatars: ${avatarCount}`);
    
    // Update current meeting state
    if (!currentMeetingState.currentMeeting || currentMeetingState.currentMeeting.id !== meetingId) {
        // New meeting detected
        const startTime = Date.now();
        console.log(`🚀 New meeting detected: ${meetingId} at ${new Date(startTime).toLocaleTimeString()}`);
        
        currentMeetingState.currentMeeting = {
            id: meetingId,
            title: meetingTitle || meetingId,
            startTime: startTime,
            url: sender.tab?.url,
            dataSource: networkParticipants > 0 ? 'network' : 'dom'
        };
        currentMeetingState.state = 'active';
    } else {
        // Update existing meeting title if provided
        if (meetingTitle && meetingTitle !== currentMeetingState.currentMeeting.title) {
            currentMeetingState.currentMeeting.title = meetingTitle;
            console.log(`📝 Meeting title updated: ${meetingTitle}`);
        }
    }
    
    // Update participants with enhanced data
    currentMeetingState.participants = participants;
    currentMeetingState.networkParticipants = networkParticipants;
    currentMeetingState.avatarCount = avatarCount;
    
    // Determine data source for icon
    const hasNetworkData = networkParticipants > 0;
    
    // Update icon with enhanced information
    updateIcon('active', participants, hasNetworkData);
    
    // Save meeting data with enhanced participant info
    const meeting = {
        ...currentMeetingState.currentMeeting,
        participants: participants.map(p => ({
            id: p.id,
            name: p.name,
            joinTime: p.joinTime,
            avatarUrl: p.avatarUrl,
            source: p.source,
            email: p.email,
            lastSeen: p.lastSeen
        })),
        lastUpdated: Date.now(),
        dataSource: hasNetworkData ? (domParticipants > 0 ? 'hybrid' : 'network') : 'dom'
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

// Handle minute data logging from content script
async function handleMinuteDataLog(minuteData, sender) {
    console.log(`⏰ Minute ${minuteData.minute}: ${minuteData.participantCount} participants in ${minuteData.meetingId}`);
    
    const meetings = await getMeetings();
    const meetingIndex = meetings.findIndex(m => m.id === minuteData.meetingId);
    
    if (meetingIndex >= 0) {
        const meeting = meetings[meetingIndex];
        
        // Initialize minute logs if not exists
        if (!meeting.minuteLogs) {
            meeting.minuteLogs = [];
        }
        
        // Add or update minute log
        const existingLogIndex = meeting.minuteLogs.findIndex(log => log.minute === minuteData.minute);
        
        const logEntry = {
            minute: minuteData.minute,
            timestamp: minuteData.timestamp,
            participants: minuteData.participants,
            participantCount: minuteData.participantCount,
            cumulativeDuration: minuteData.cumulativeDuration
        };
        
        if (existingLogIndex >= 0) {
            meeting.minuteLogs[existingLogIndex] = logEntry;
        } else {
            meeting.minuteLogs.push(logEntry);
        }
        
        // Update meeting's current duration and participant info
        meeting.currentDuration = minuteData.cumulativeDuration;
        meeting.lastUpdated = minuteData.timestamp;
        meeting.participants = minuteData.participants;
        
        // Save updated meeting
        meetings[meetingIndex] = meeting;
        await saveMeetings(meetings);
        
        console.log(`💾 Minute ${minuteData.minute} data logged for meeting ${minuteData.meetingId}`);
    } else {
        console.warn(`⚠️ Meeting ${minuteData.meetingId} not found for minute logging`);
    }
}

// Enhanced icon update with network participant count
function updateIcon(state, participants, hasNetworkData = false) {
    const participantCount = participants ? participants.length : 0;
    console.log(`🎨 Updating icon: ${state} (${participantCount} participants, ${currentMeetingState.networkParticipants} from network)`);
    
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
            
            badgeText = participantCount.toString();
            
            // Use different colors to indicate data source
            if (hasNetworkData || currentMeetingState.networkParticipants > 0) {
                badgeColor = '#0f9d58'; // Darker green for network data
            } else {
                badgeColor = '#34a853'; // Lighter green for DOM data
            }
            
            // Enhanced tooltip with data source info
            const networkCount = currentMeetingState.networkParticipants || 0;
            const avatarCount = currentMeetingState.avatarCount || 0;
            let dataSourceInfo = '';
            
            if (networkCount > 0) {
                dataSourceInfo = ` (${networkCount} network${avatarCount > 0 ? `, ${avatarCount} avatars` : ''})`;
            } else {
                dataSourceInfo = ` (DOM${avatarCount > 0 ? `, ${avatarCount} avatars` : ''})`;
            }
            
            title = `In meeting: ${participantCount} participant(s)${dataSourceInfo}`;
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

// Force end current meeting (zombie cleanup)
async function forceEndCurrentMeeting() {
    if (currentMeetingState.state !== 'active' || !currentMeetingState.currentMeeting) {
        return { success: false, message: 'No active meeting to end' };
    }
    
    console.log('🔧 Force ending current meeting:', currentMeetingState.currentMeeting.title);
    
    try {
        // First, try to send message to content script to end the meeting properly
        const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
        
        if (tabs.length > 0) {
            for (const tab of tabs) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'force_end_meeting' });
                    console.log('🔧 Sent force end message to tab:', tab.id);
                } catch (error) {
                    console.log('Could not send force end message to tab:', tab.id, error.message);
                }
            }
        }
        
        // Force end the meeting in background state regardless
        const endTime = Date.now();
        const finalMeeting = {
            ...currentMeetingState.currentMeeting,
            endTime,
            participants: currentMeetingState.participants,
            forceEnded: true
        };
        
        // Save the meeting
        await saveMeeting(finalMeeting);
        
        const duration = endTime - finalMeeting.startTime;
        console.log(`🔧 Force ended meeting after ${Math.round(duration / 60000)} minutes`);
        
        // Reset state
        currentMeetingState = {
            state: 'none',
            participants: [],
            currentMeeting: null,
            networkParticipants: 0
        };
        
        // Update icon
        updateIcon('none', []);
        
        return { 
            success: true, 
            message: `Meeting "${finalMeeting.title}" ended successfully`,
            duration: Math.round(duration / 60000)
        };
        
    } catch (error) {
        console.error('Error force ending meeting:', error);
        return { success: false, message: error.message };
    }
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
                    files: ['content-simple.js']
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
