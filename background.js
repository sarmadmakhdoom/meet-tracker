// Network-enhanced background service worker for Google Meet Tracker

// Import storage manager
importScripts('storage-manager.js');

let currentMeetingState = {
    state: 'none',
    participants: [],
    currentMeeting: null,
    networkParticipants: 0
};

// Initialize storage manager
let storageManager = null;

console.log('🌐 Network-enhanced Google Meet Tracker background loaded');

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
    console.log('Google Meet Tracker (Network Enhanced) installed');
    
    // Initialize IndexedDB storage
    await initializeStorageManager();
    
    // Setup declarative net request rules for monitoring
    setupNetworkMonitoring();
});

// Initialize storage manager
async function initializeStorageManager() {
    try {
        storageManager = new MeetingStorageManager();
        await storageManager.init();
        console.log('✅ IndexedDB storage manager initialized');
    } catch (error) {
        console.error('❌ Failed to initialize storage manager:', error);
        // Fallback: we'll handle this in the individual functions
    }
}

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
                    
                case 'meetingEndedByNavigation':
                    await handleMeetingEndedByNavigation(request.meetingId, request.reason, sender);
                    sendResponse({ success: true });
                    break;
                    
                case 'deleteMeeting':
                    const deleteResult = await deleteMeeting(request.meetingId);
                    sendResponse(deleteResult);
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
        // Check if this meeting already exists in storage (rejoin scenario)
        const existingMeeting = await findExistingOrRecentMeeting(meetingId);
        
        if (existingMeeting) {
            // Rejoining an existing meeting
            console.log(`🔄 Rejoining existing meeting: ${meetingId} (original start: ${new Date(existingMeeting.startTime).toLocaleTimeString()})`);
            
            // Resume the existing meeting instead of creating a new one
            currentMeetingState.currentMeeting = {
                id: meetingId,
                title: meetingTitle || existingMeeting.title || meetingId,
                startTime: existingMeeting.startTime, // Keep original start time!
                url: sender.tab?.url,
                dataSource: networkParticipants > 0 ? 'network' : 'dom',
                resumed: true, // Flag to indicate this was resumed
                resumedAt: Date.now() // Track when we resumed
            };
            
            // If the meeting was previously ended, remove the endTime to make it active again
            if (existingMeeting.endTime) {
                console.log(`🔄 Removing endTime from resumed meeting (was ended at ${new Date(existingMeeting.endTime).toLocaleTimeString()})`);
            }
        } else {
            // Truly new meeting
            const startTime = Date.now();
            console.log(`🚀 New meeting detected: ${meetingId} at ${new Date(startTime).toLocaleTimeString()}`);
            
            currentMeetingState.currentMeeting = {
                id: meetingId,
                title: meetingTitle || meetingId,
                startTime: startTime,
                url: sender.tab?.url,
                dataSource: networkParticipants > 0 ? 'network' : 'dom'
            };
        }
        
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
    
    // If this is a resumed meeting, remove any previous endTime to make it active again
    if (currentMeetingState.currentMeeting.resumed) {
        delete meeting.endTime;
        console.log(`🔄 Resumed meeting - removed endTime to make it active again`);
    }
    
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

// Helper function to find existing or recent meeting (for rejoin logic)
async function findExistingOrRecentMeeting(meetingId) {
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available for meeting lookup');
            return null;
        }
        
        // First, try to get the exact meeting by ID
        const exactMeeting = await storage.getMeeting(meetingId);
        
        if (exactMeeting) {
            // Check if it's an ongoing meeting (no endTime) - definitely rejoin
            if (!exactMeeting.endTime) {
                console.log(`🔄 Found ongoing meeting: ${meetingId}`);
                return exactMeeting;
            }
            
            // If it ended recently (within last 10 minutes), treat as rejoin
            const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
            if (exactMeeting.endTime > tenMinutesAgo) {
                const gapMinutes = Math.round((Date.now() - exactMeeting.endTime) / 60000);
                console.log(`🔄 Found recently ended meeting: ${meetingId} (ended ${gapMinutes}m ago, treating as rejoin)`);
                return exactMeeting;
            }
            
            // If it ended more than 10 minutes ago, consider it a new session
            const gapHours = Math.round((Date.now() - exactMeeting.endTime) / (60 * 60 * 1000));
            console.log(`🆕 Found old meeting: ${meetingId} (ended ${gapHours}h ago, treating as new session)`);
            return null;
        }
        
        console.log(`🆕 No existing meeting found for: ${meetingId}`);
        return null;
        
    } catch (error) {
        console.error('❌ Error finding existing meeting:', error);
        return null;
    }
}

// Storage functions using IndexedDB
async function ensureStorageManager() {
    if (!storageManager) {
        await initializeStorageManager();
    }
    return storageManager;
}

async function getMeetings() {
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available, returning empty array');
            return [];
        }
        return await storage.getMeetings();
    } catch (error) {
        console.error('❌ Error getting meetings from IndexedDB:', error);
        return [];
    }
}

async function saveMeetings(meetings) {
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available, cannot save meetings');
            return;
        }
        
        // IndexedDB storage saves meetings individually, not as an array
        // Save each meeting individually
        for (const meeting of meetings) {
            await storage.saveMeeting(meeting);
        }
        console.log(`💾 Saved ${meetings.length} meetings to IndexedDB`);
    } catch (error) {
        console.error('❌ Error saving meetings to IndexedDB:', error);
    }
}

async function saveMeeting(meeting) {
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available, cannot save meeting');
            return;
        }
        
        // Validate meeting data before saving
        if (!meeting || !meeting.id || !meeting.startTime) {
            console.error('❌ Invalid meeting data:', meeting);
            return;
        }
        
        // Log meeting data for debugging
        console.log(`💾 Saving meeting to IndexedDB:`, {
            id: meeting.id,
            title: meeting.title,
            startTime: new Date(meeting.startTime).toISOString(),
            endTime: meeting.endTime ? new Date(meeting.endTime).toISOString() : null,
            participantCount: meeting.participants ? meeting.participants.length : 0,
            resumed: meeting.resumed || false
        });
        
        await storage.saveMeeting(meeting);
        console.log(`✅ Meeting saved successfully to IndexedDB: ${meeting.id}`);
    } catch (error) {
        console.error('❌ Error saving meeting to IndexedDB:', {
            error: error,
            message: error.message || 'Unknown error',
            name: error.name || 'Unknown error type',
            meetingId: meeting?.id || 'Unknown ID'
        });
    }
}

async function saveMeetingUpdate(meeting) {
    // Same as saveMeeting for IndexedDB (it handles updates automatically)
    await saveMeeting(meeting);
}

async function clearAllData() {
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available, cannot clear data');
            return { success: false, message: 'Storage not available' };
        }
        
        await storage.clearAllData();
        
        currentMeetingState = {
            state: 'none',
            participants: [],
            currentMeeting: null,
            networkParticipants: 0
        };
        
        console.log('🗑️ All meeting data cleared from IndexedDB');
        return { success: true };
    } catch (error) {
        console.error('❌ Error clearing data from IndexedDB:', error);
        return { success: false, message: error.message };
    }
}

// Delete individual meeting by ID
async function deleteMeeting(meetingId) {
    console.log(`🗑️ Deleting meeting: ${meetingId}`);
    
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available, cannot delete meeting');
            return { success: false, message: 'Storage not available' };
        }
        
        // First, get the meeting to return its details
        const meeting = await storage.getMeeting(meetingId);
        if (!meeting) {
            console.warn(`⚠️ Meeting ${meetingId} not found`);
            return { success: false, message: 'Meeting not found' };
        }
        
        console.log(`🔍 Found meeting to delete: "${meeting.title}" started at ${new Date(meeting.startTime).toLocaleString()}`);
        
        // Delete the meeting using IndexedDB storage manager
        await storage.deleteMeeting(meetingId);
        
        console.log(`✅ Successfully deleted meeting: ${meetingId}`);
        
        return { 
            success: true, 
            message: `Successfully deleted meeting "${meeting.title || meetingId}"`,
            deletedMeeting: {
                id: meeting.id,
                title: meeting.title,
                startTime: meeting.startTime
            }
        };
        
    } catch (error) {
        console.error('❌ Error deleting meeting:', error);
        return { success: false, message: error.message };
    }
}

// Force end current meeting (zombie cleanup)
async function forceEndCurrentMeeting() {
    console.log('🔧 Force ending zombie meetings...');
    
    try {
        // Get all meetings from storage
        const meetings = await getMeetings();
        
        // Find all ongoing meetings (meetings without endTime)
        const ongoingMeetings = meetings.filter(meeting => !meeting.endTime);
        
        if (ongoingMeetings.length === 0) {
            console.log('📝 No ongoing meetings found in database');
            return { success: false, message: 'No ongoing meetings found to end' };
        }
        
        console.log(`🔍 Found ${ongoingMeetings.length} ongoing meetings to end:`);
        ongoingMeetings.forEach(meeting => {
            console.log(`  - "${meeting.title}" (${meeting.id}) started at ${new Date(meeting.startTime).toLocaleTimeString()}`);
        });
        
        // First, try to send message to content scripts to end meetings properly
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
        
        // Force end all ongoing meetings in the database
        const endTime = Date.now();
        let endedCount = 0;
        let totalDuration = 0;
        
        const updatedMeetings = meetings.map(meeting => {
            if (!meeting.endTime) {
                // This is an ongoing meeting - end it
                const duration = endTime - meeting.startTime;
                totalDuration += duration;
                endedCount++;
                
                return {
                    ...meeting,
                    endTime,
                    forceEnded: true,
                    forceEndReason: 'manual_cleanup'
                };
            }
            return meeting;
        });
        
        // Save all meetings back to storage
        await saveMeetings(updatedMeetings);
        
        console.log(`🔧 Force ended ${endedCount} ongoing meetings`);
        
        // Reset current meeting state if it was one of the ended meetings
        if (currentMeetingState.currentMeeting && 
            ongoingMeetings.some(m => m.id === currentMeetingState.currentMeeting.id)) {
            console.log('🔄 Resetting current meeting state');
            currentMeetingState = {
                state: 'none',
                participants: [],
                currentMeeting: null,
                networkParticipants: 0
            };
            
            // Update icon
            updateIcon('none', []);
        }
        
        const avgDuration = endedCount > 0 ? Math.round(totalDuration / endedCount / 60000) : 0;
        
        return { 
            success: true, 
            message: `Successfully ended ${endedCount} ongoing meeting${endedCount !== 1 ? 's' : ''} (avg duration: ${avgDuration} min)`,
            endedCount,
            avgDuration
        };
        
    } catch (error) {
        console.error('Error force ending meetings:', error);
        return { success: false, message: error.message };
    }
}

// Tab management
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('meet.google.com')) {
        console.log('📍 Google Meet tab updated:', tab.url);
    }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    console.log('🗂️ Tab removed:', tabId);
    
    // Check if removed tab was a meeting tab and if we have an active meeting
    if (currentMeetingState.state === 'active' && currentMeetingState.currentMeeting) {
        try {
            // Query remaining Google Meet tabs
            const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
            console.log(`📍 ${tabs.length} Google Meet tabs remaining after tab ${tabId} closed`);
            
            if (tabs.length === 0) {
                console.log('🚫 No more Meet tabs, automatically ending zombie meeting');
                
                // End the current meeting since no tabs are open
                const endTime = Date.now();
                const finalMeeting = {
                    ...currentMeetingState.currentMeeting,
                    endTime,
                    participants: currentMeetingState.participants,
                    autoEnded: true, // Mark that this was auto-ended due to tab closure
                    reason: 'tab_closed'
                };
                
                // Save the meeting
                await saveMeeting(finalMeeting);
                
                const duration = endTime - finalMeeting.startTime;
                console.log(`🔧 Auto-ended zombie meeting after ${Math.round(duration / 60000)} minutes (reason: tab closed)`);
                
                // Reset state
                currentMeetingState = {
                    state: 'none',
                    participants: [],
                    currentMeeting: null,
                    networkParticipants: 0
                };
                
                // Update icon
                updateIcon('none', []);
            } else {
                // There are still Meet tabs open, but check if any are active
                console.log(`📋 Checking remaining ${tabs.length} Meet tabs for active meetings...`);
                
                let hasActiveMeeting = false;
                for (const tab of tabs) {
                    try {
                        // Send a message to check if the tab has an active meeting
                        const response = await new Promise((resolve) => {
                            chrome.tabs.sendMessage(tab.id, { type: 'get_meeting_state' }, (response) => {
                                // Ignore chrome.runtime.lastError to avoid console errors
                                resolve(response);
                            });
                        });
                        
                        if (response && response.meetingState && response.meetingState.isActive) {
                            hasActiveMeeting = true;
                            console.log(`📍 Found active meeting in tab ${tab.id}`);
                            break;
                        }
                    } catch (error) {
                        // Tab might not respond, continue checking others
                        console.log(`Could not check tab ${tab.id}:`, error.message);
                    }
                }
                
                if (!hasActiveMeeting) {
                    console.log('🚫 No active meetings found in remaining tabs, ending zombie meeting');
                    
                    // End the current meeting since no active meetings were found
                    const endTime = Date.now();
                    const finalMeeting = {
                        ...currentMeetingState.currentMeeting,
                        endTime,
                        participants: currentMeetingState.participants,
                        autoEnded: true, // Mark that this was auto-ended
                        reason: 'no_active_tabs'
                    };
                    
                    // Save the meeting
                    await saveMeeting(finalMeeting);
                    
                    const duration = endTime - finalMeeting.startTime;
                    console.log(`🔧 Auto-ended zombie meeting after ${Math.round(duration / 60000)} minutes (reason: no active tabs)`);
                    
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
            }
        } catch (error) {
            console.error('❌ Error during automatic zombie meeting cleanup:', error);
            
            // Fallback: reset state anyway to prevent permanent zombie state
            currentMeetingState = {
                state: 'none',
                participants: [],
                currentMeeting: null,
                networkParticipants: 0
            };
            updateIcon('none', []);
        }
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

// Detect and cleanup zombie meetings - check every 2 minutes
async function detectAndCleanupZombieMeetings() {
    console.log('🕵️ Running periodic zombie meeting detection...');
    
    try {
        // Check if we have an active meeting in our state
        if (currentMeetingState.state !== 'active' || !currentMeetingState.currentMeeting) {
            console.log('📝 No active meeting in background state, skipping zombie detection');
            return;
        }
        
        console.log(`🔍 Checking for zombie meeting: "${currentMeetingState.currentMeeting.title}" (ID: ${currentMeetingState.currentMeeting.id})`);
        
        // Get all Google Meet tabs
        const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
        console.log(`📋 Found ${tabs.length} Google Meet tabs`);
        
        if (tabs.length === 0) {
            console.log('🚫 No Google Meet tabs found - ending zombie meeting');
            await endZombieMeeting('no_meet_tabs');
            return;
        }
        
        // Check each tab to see if any has an active meeting
        let activeMeetingFound = false;
        let checkedTabs = 0;
        
        for (const tab of tabs) {
            try {
                console.log(`🔍 Checking tab ${tab.id}: ${tab.url}`);
                
                // Send message to content script to get meeting state
                const response = await new Promise((resolve) => {
                    chrome.tabs.sendMessage(tab.id, { type: 'get_meeting_state' }, (response) => {
                        // Ignore chrome.runtime.lastError to avoid console spam
                        resolve(response || null);
                    });
                });
                
                checkedTabs++;
                
                if (response && response.meetingState) {
                    const { meetingState, participants, participantCount } = response;
                    console.log(`📊 Tab ${tab.id} meeting state:`, {
                        isActive: meetingState.isActive,
                        meetingId: meetingState.meetingId,
                        participantCount: participantCount || 0
                    });
                    
                    // Check if this tab has an active meeting
                    if (meetingState.isActive && meetingState.meetingId) {
                        activeMeetingFound = true;
                        console.log(`✅ Found active meeting in tab ${tab.id}: ${meetingState.meetingId}`);
                        
                        // Update our current meeting state with fresh data if it matches
                        if (currentMeetingState.currentMeeting.id === meetingState.meetingId) {
                            console.log('🔄 Updating current meeting state with fresh data from tab');
                            currentMeetingState.participants = participants || [];
                            currentMeetingState.networkParticipants = participantCount || 0;
                            
                            // Update the meeting in storage with latest participant data
                            const meeting = {
                                ...currentMeetingState.currentMeeting,
                                participants: participants || [],
                                lastUpdated: Date.now()
                            };
                            await saveMeetingUpdate(meeting);
                        }
                        break; // Found active meeting, no need to check other tabs
                    } else {
                        console.log(`📝 Tab ${tab.id} has no active meeting`);
                    }
                } else {
                    console.log(`⚠️ Tab ${tab.id} did not respond or has no meeting state`);
                }
                
            } catch (error) {
                console.log(`❌ Error checking tab ${tab.id}:`, error.message);
                checkedTabs++;
            }
        }
        
        console.log(`📋 Checked ${checkedTabs}/${tabs.length} tabs, active meeting found: ${activeMeetingFound}`);
        
        // If no active meeting was found in any tab, end the zombie meeting
        if (!activeMeetingFound) {
            console.log('🚫 No active meetings found in any tabs - ending zombie meeting');
            await endZombieMeeting('no_active_meeting_in_tabs');
        } else {
            console.log('✅ Active meeting confirmed, continuing tracking');
        }
        
    } catch (error) {
        console.error('❌ Error during zombie meeting detection:', error);
    }
}

// Handle meeting ended by navigation (URL change)
async function handleMeetingEndedByNavigation(meetingId, reason, sender) {
    console.log(`🔀 Meeting ended by navigation: ${meetingId} (reason: ${reason})`);
    
    // Check if this matches our current meeting
    if (currentMeetingState.currentMeeting && currentMeetingState.currentMeeting.id === meetingId) {
        const endTime = Date.now();
        const finalMeeting = {
            ...currentMeetingState.currentMeeting,
            endTime,
            participants: currentMeetingState.participants,
            navigationEnded: true,
            reason: reason
        };
        
        // Save the meeting
        await saveMeeting(finalMeeting);
        
        const duration = endTime - finalMeeting.startTime;
        console.log(`🔧 Meeting ended by navigation after ${Math.round(duration / 60000)} minutes (reason: ${reason})`);
        
        // Reset state
        currentMeetingState = {
            state: 'none',
            participants: [],
            currentMeeting: null,
            networkParticipants: 0
        };
        
        // Update icon
        updateIcon('none', []);
    } else {
        console.log(`⚠️ Navigation-ended meeting ${meetingId} doesn't match current meeting`);
    }
}

// Helper function to end zombie meetings
async function endZombieMeeting(reason) {
    if (!currentMeetingState.currentMeeting) {
        console.log('⚠️ No current meeting to end');
        return;
    }
    
    const endTime = Date.now();
    const finalMeeting = {
        ...currentMeetingState.currentMeeting,
        endTime,
        participants: currentMeetingState.participants,
        autoEnded: true,
        reason: reason
    };
    
    // Save the meeting
    await saveMeeting(finalMeeting);
    
    const duration = endTime - finalMeeting.startTime;
    console.log(`🔧 Auto-ended zombie meeting "${finalMeeting.title}" after ${Math.round(duration / 60000)} minutes (reason: ${reason})`);
    
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

// Periodic zombie meeting detection (every 2 minutes)
setInterval(async () => {
    await detectAndCleanupZombieMeetings();
}, 2 * 60 * 1000); // Run every 2 minutes

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
