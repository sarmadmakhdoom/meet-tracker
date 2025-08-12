// Network-enhanced background service worker for Google Meet Tracker

// Import storage manager
importScripts('storage-manager.js');

let currentMeetingState = {
    state: 'none',
    participants: [],
    currentMeeting: null,
    networkParticipants: 0
};

// Session-based meeting tracking (PERSISTENT APPROACH)
let activeSessions = {}; // Maps sessionId to session data
let meetingToSessionMap = {}; // Maps meetingId to current sessionId
let sessionDataLoaded = false; // Flag to track if we've loaded persistent data

// Initialize storage manager
let storageManager = null;

// Periodic session auto-save timer
let autoSaveTimer = null;

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
        console.log('💾 Initializing IndexedDB storage manager...');
        
        // Check if IndexedDB is available (note: service workers use 'self' instead of 'window')
        if (!self.indexedDB && !window?.indexedDB) {
            throw new Error('IndexedDB not supported in this browser/context');
        }
        
        console.log('📋 Environment check:', {
            isServiceWorker: typeof importScripts !== 'undefined',
            hasWindow: typeof window !== 'undefined',
            hasSelf: typeof self !== 'undefined',
            hasIndexedDB: !!(self.indexedDB || window?.indexedDB),
            userAgent: navigator.userAgent?.substring(0, 100)
        });
        
        storageManager = new MeetingStorageManager();
        await storageManager.init();
        
        console.log('✅ IndexedDB storage manager initialized successfully');
        
        // Test basic functionality
        try {
            const testMeetings = await storageManager.getMeetings();
            console.log(`📋 IndexedDB test: Retrieved ${testMeetings.length} existing meetings`);
        } catch (testError) {
            console.warn('⚠️ IndexedDB test failed:', testError);
        }
        
    } catch (error) {
        console.error('❌ Failed to initialize storage manager:');
        console.error('Error name:', error.name || 'Unknown');
        console.error('Error message:', error.message || 'No message');
        console.error('Error code:', error.code || 'No code');
        console.error('Error stack:', error.stack || 'No stack');
        console.error('Full error object:', error);
        
        // Try to get more details about the error
        try {
            console.error('Error toString:', error.toString());
            console.error('Error constructor:', error.constructor.name);
            console.error('Error keys:', Object.keys(error));
        } catch (logError) {
            console.error('Could not log error details:', logError);
        }
        
        // Set storageManager to null to indicate failure
        storageManager = null;
        
        // Don't throw - let the extension continue with degraded functionality
        console.warn('⚠️ Extension will continue with limited functionality (no persistent storage)');
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
    const messageType = request.type || request.action;
    const timestamp = new Date().toISOString();
    
    console.log(`🔍 [${timestamp}] Background received: "${messageType}" from tab ${sender.tab?.id}`);
    
    // Handle async operations
    const handleAsync = async () => {
        try {
            switch (messageType) {
                case 'update_participants':
                    const sessionInfo = await handleParticipantsUpdate(request.data, sender);
                    sendResponse({ 
                        success: true, 
                        sessionId: sessionInfo?.sessionId,
                        sessionStartTime: sessionInfo?.sessionStartTime
                    });
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
                    console.log('📥 Background: Getting sessions from storage for dashboard...');
                    const sessions = await getSessions();
                    console.log(`📤 Background: Sending ${sessions.length} sessions to dashboard`);
                    sendResponse(sessions);
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
                    
                // getRealTimeState removed - replaced by getActiveSession
                    
                case 'getActiveSession':
                    const activeSessionData = await getActiveSessionData();
                    sendResponse(activeSessionData);
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

// Enhanced meeting ended handler (SESSION-BASED APPROACH)
async function handleMeetingEnded(meeting, sender) {
    console.log('🚫 Meeting ended:', meeting.title || meeting.id);
    
    const meetingId = meeting.id || meeting.meetingId;
    if (!meetingId) {
        console.error('❌ Cannot end meeting - no meeting ID provided');
        return;
    }
    
    console.log('📋 Meeting end request from content script:', {
        meetingId,
        title: meeting.title,
        reason: meeting.reason,
        participantCount: meeting.participants?.length || 0,
        note: 'Background script manages all session timing - content script provides meeting ID only'
    });
    
    // End the active session for this meeting using session-based approach
    // Background script manages ALL timing - content script only provides meeting ID and reason
    await endActiveSession(meetingId, meeting.reason || 'meeting_ended');
    
    // Reset current meeting state
    currentMeetingState = {
        state: 'none',
        participants: [],
        currentMeeting: null,
        networkParticipants: 0
    };
    
    // Update icon
    updateIcon('none', []);
    
    console.log('✅ Meeting end processed via session-based approach');
}

// Handle participants update from network interception (SESSION-BASED APPROACH)
async function handleParticipantsUpdate(data, sender) {
    const { meetingId, meetingTitle, participants } = data;
    const timestamp = new Date().toISOString();
    
    // Analyze data sources
    const networkParticipants = participants.filter(p => p.source?.includes('sync') || p.source?.includes('network')).length;
    const domParticipants = participants.filter(p => p.source?.includes('dom')).length;
    const avatarCount = participants.filter(p => p.avatarUrl).length;
    
    console.log(`🔍 [${timestamp}] PARTICIPANTS UPDATE: ${participants.length} participants in ${meetingId}`);
    console.log(`   Network: ${networkParticipants}, DOM: ${domParticipants}, Avatars: ${avatarCount}`);
    console.log(`   Meeting title: "${meetingTitle}", Tab ID: ${sender.tab?.id}`);
    
    // Ensure we've loaded persistent session data on first access
    await ensureSessionDataLoaded();
    
    // Check if we have an active session for this meeting
    const currentSessionId = meetingToSessionMap[meetingId];
    let activeSession = currentSessionId ? activeSessions[currentSessionId] : null;
    
    // SIMPLIFIED: If no session in memory, create a new session (no restoration)
    if (!activeSession) {
        console.log(`🔍 No active session in memory for meeting ${meetingId}, creating NEW session`);
        activeSession = await createNewSession(meetingId, meetingTitle, participants, sender, networkParticipants);
        
        // Log session recovery for debugging
        if (activeSession && activeSession.continued) {
            console.log(`🔄 RECOVERED SESSION: Found and restored session ${activeSession.sessionId} for meeting ${meetingId}`);
            console.log(`   Original start time: ${new Date(activeSession.startTime).toISOString()}`);
            console.log(`   Gap since last update: ${activeSession.lastUpdated ? Math.round((Date.now() - activeSession.lastUpdated) / 1000) : 'unknown'} seconds`);
        }
    } else {
        console.log(`🗋 Found existing session in memory: ${activeSession.sessionId}`);
        
        // Update last activity timestamp to prevent session cleanup
        activeSession.lastUpdated = Date.now();
    }
    
    console.log(`📝 Using session ${activeSession.sessionId} for meeting ${meetingId}`);
    console.log(`   Session started: ${new Date(activeSession.startTime).toISOString()}`);
    console.log(`   Current duration: ${Math.round((Date.now() - activeSession.startTime) / 60000)} minutes`);
    console.log(`   Session details:`, {
        sessionId: activeSession.sessionId,
        meetingId: activeSession.meetingId,
        title: activeSession.title,
        startTime: new Date(activeSession.startTime).toISOString(),
        isActive: activeSession.isActive,
        continued: activeSession.continued,
        fallback: activeSession.fallback,
        lastUpdated: activeSession.lastUpdated ? new Date(activeSession.lastUpdated).toISOString() : 'never'
    });
    
    // Always update existing session (but don't recreate it!)
    if (activeSession) {
        // Update existing session data
        activeSession.participants = participants;
        activeSession.lastUpdated = Date.now();
        activeSession.url = sender.tab?.url || activeSession.url; // Keep URL updated
        
        // Update title if provided
        if (meetingTitle && meetingTitle !== activeSession.title) {
            activeSession.title = meetingTitle;
            if (currentMeetingState.currentMeeting) {
                currentMeetingState.currentMeeting.title = meetingTitle;
            }
            console.log(`📝 Session title updated: ${meetingTitle}`);
        }
        
        // Update current meeting state to track this session
        currentMeetingState.currentMeeting = {
            id: meetingId,
            title: activeSession.title,
            startTime: activeSession.startTime,
            sessionId: activeSession.sessionId,
            url: activeSession.url,
            dataSource: activeSession.dataSource
        };
        currentMeetingState.state = 'active';
    }
    
    // Update participants with enhanced data
    currentMeetingState.participants = participants;
    currentMeetingState.networkParticipants = networkParticipants;
    currentMeetingState.avatarCount = avatarCount;
    
    // Determine data source for icon
    const hasNetworkData = networkParticipants > 0;
    
    // Update icon with enhanced information
    updateIcon('active', participants, hasNetworkData);
    
    // Update the active session with current participant data
    activeSession.participants = participants.map(p => ({
        id: p.id,
        name: p.name,
        joinTime: p.joinTime,
        avatarUrl: p.avatarUrl,
        source: p.source,
        email: p.email,
        lastSeen: p.lastSeen
    }));
    activeSession.dataSource = hasNetworkData ? (domParticipants > 0 ? 'hybrid' : 'network') : 'dom';
    
    // Note: We don't save the session to storage here - sessions are only saved when they end
    // This keeps the storage operations minimal and ensures we only store complete session data
    
    // Return session info for content script caching
    return {
        sessionId: activeSession.sessionId,
        sessionStartTime: activeSession.startTime
    };
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

// Handle minute data logging from content script (SESSION-BASED APPROACH)
async function handleMinuteDataLog(minuteData, sender) {
    const { minute, meetingId, participantCount, cumulativeDuration, resumed, previousDuration, sessionDuration } = minuteData;
    
    // Get the active session for this meeting
    const sessionId = meetingToSessionMap[meetingId];
    const activeSession = sessionId ? activeSessions[sessionId] : null;
    
    if (!activeSession) {
        console.warn(`⚠️ No active session found for meeting ${meetingId}, ignoring minute data`);
        return;
    }
    
    const currentSessionDuration = Date.now() - activeSession.startTime;
    
    console.log(`⏰ Minute ${minute}: ${participantCount} participants in ${meetingId} (session: ${activeSession.sessionId}, duration: ${Math.round(currentSessionDuration / 60000)}m)`);
    
    // Add minute log to the active session (in memory)
    if (!activeSession.minuteLogs) {
        activeSession.minuteLogs = [];
    }
    
    const logEntry = {
        minute: minute,
        timestamp: minuteData.timestamp,
        participants: minuteData.participants,
        participantCount: participantCount,
        sessionDuration: currentSessionDuration, // Use actual session duration
        sessionId: activeSession.sessionId
    };
    
    // Update or add the minute log
    const existingLogIndex = activeSession.minuteLogs.findIndex(log => log.minute === minute);
    if (existingLogIndex >= 0) {
        activeSession.minuteLogs[existingLogIndex] = logEntry;
    } else {
        activeSession.minuteLogs.push(logEntry);
    }
    
    // Update session's current participant info
    activeSession.participants = minuteData.participants;
    activeSession.lastUpdated = minuteData.timestamp;
    
    console.log(`📝 Minute ${minute} logged for session ${activeSession.sessionId} (session duration: ${Math.round(currentSessionDuration / 60000)}m)`);
    
    // Note: Session data is only saved to storage when the session ends
    // This keeps the system performant and ensures we only store complete session data
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
            
        case 'inactive':
        case 'none':
        default:
            iconPath = {
                '16': 'icons/icon16.png',
                '48': 'icons/icon48.png',
                '128': 'icons/icon128.png'
            };
            badgeText = '';  // Explicitly clear the badge
            badgeColor = '#4285f4';
            title = 'Not in a meeting';
            break;
    }
    
    // Update icon with explicit error handling
    try {
        chrome.action.setIcon({ path: iconPath });
        chrome.action.setBadgeText({ text: badgeText });
        chrome.action.setBadgeBackgroundColor({ color: badgeColor });
        chrome.action.setTitle({ title });
        
        console.log(`✅ Icon updated: ${title} (badge: "${badgeText}")`);
    } catch (error) {
        console.error('❌ Error updating icon:', error);
        // Try to at least clear the badge if there's an error
        try {
            chrome.action.setBadgeText({ text: '' });
        } catch (badgeError) {
            console.error('❌ Error clearing badge:', badgeError);
        }
    }
}

// Get active session data for popup
async function getActiveSessionData() {
    try {
        console.log('🔍 [BACKGROUND DEBUG] getActiveSessionData called:', {
            currentState: currentMeetingState.state,
            hasCurrentMeeting: !!currentMeetingState.currentMeeting,
            currentMeetingId: currentMeetingState.currentMeeting?.id,
            activeSessions: Object.keys(activeSessions),
            meetingToSessionMap: Object.keys(meetingToSessionMap)
        });
        
        // Check if we have any active session
        if (currentMeetingState.state !== 'active' || !currentMeetingState.currentMeeting) {
            console.log('🔍 [BACKGROUND DEBUG] No active meeting state, returning none');
            return {
                state: 'none',
                participants: [],
                currentMeeting: null
            };
        }
        
        const meetingId = currentMeetingState.currentMeeting.id;
        const sessionId = meetingToSessionMap[meetingId];
        const activeSession = sessionId ? activeSessions[sessionId] : null;
        
        console.log('🔍 [BACKGROUND DEBUG] Session lookup:', {
            meetingId,
            sessionId,
            hasActiveSession: !!activeSession,
            sessionStartTime: activeSession?.startTime,
            sessionTitle: activeSession?.title
        });
        
        if (!activeSession) {
            console.warn(`⚠️ No active session found for meeting ${meetingId}`);
            console.warn('Available sessions:', Object.keys(activeSessions));
            console.warn('Meeting to session mapping:', meetingToSessionMap);
            return {
                state: 'none',
                participants: [],
                currentMeeting: null
            };
        }
        
        // Calculate current session duration
        const currentSessionDuration = Date.now() - activeSession.startTime;
        
        console.log('🔍 [BACKGROUND DEBUG] Session data for popup:', {
            sessionId: activeSession.sessionId,
            meetingId: activeSession.meetingId,
            title: activeSession.title,
            startTime: new Date(activeSession.startTime).toISOString(),
            duration: currentSessionDuration,
            durationMinutes: Math.round(currentSessionDuration / 60000),
            participantCount: (currentMeetingState.participants || activeSession.participants || []).length
        });
        
        // Return session-based data formatted for popup
        const sessionData = {
            state: 'active',
            participants: currentMeetingState.participants || activeSession.participants || [],
            currentMeeting: {
                id: activeSession.meetingId,
                title: activeSession.title,
                startTime: activeSession.startTime, // Use session start time!
                sessionId: activeSession.sessionId,
                url: activeSession.url,
                duration: currentSessionDuration,
                isSession: true // Flag to indicate this is session-based data
            },
            networkParticipants: currentMeetingState.networkParticipants || 0,
            avatarCount: currentMeetingState.avatarCount || 0
        };
        
        console.log('🔍 [BACKGROUND DEBUG] Returning session data to popup:', sessionData);
        return sessionData;
        
    } catch (error) {
        console.error('❌ Error getting active session data:', error);
        return {
            state: 'none',
            participants: [],
            currentMeeting: null
        };
    }
}

// SESSION-BASED HELPER FUNCTIONS

// Ensure session data is loaded from storage on first access
async function ensureSessionDataLoaded() {
    if (sessionDataLoaded) {
        return; // Already loaded
    }
    
    try {
        console.log('🔄 Loading persistent session data...');
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available for session loading');
            sessionDataLoaded = true; // Mark as loaded (with no data)
            return;
        }
        
        // Get all ongoing sessions from storage (sessions without endTime)
        const allSessions = await storage.getAllSessions();
        const ongoingSessions = allSessions.filter(session => !session.endTime);
        
        console.log(`🔍 Found ${ongoingSessions.length} ongoing sessions in storage`);
        
        // Restore ongoing sessions to memory with enhanced recovery logic
        for (const session of ongoingSessions) {
            // Check if session is recent (within last 8 hours, extended from 4)
            const eightHoursAgo = Date.now() - (8 * 60 * 60 * 1000);
            if (session.startTime > eightHoursAgo) {
                const sessionAge = Math.round((Date.now() - session.startTime) / (60 * 60 * 1000));
                console.log(`🔄 Restoring session: ${session.sessionId} for meeting ${session.meetingId} (${sessionAge}h old)`);
                
                // Restore to memory with recovery markers
                activeSessions[session.sessionId] = {
                    ...session,
                    isActive: true,
                    minuteLogs: session.minuteLogs || [],
                    lastUpdated: Date.now(),
                    restoredFromStorage: true,
                    restoredAt: Date.now()
                };
                meetingToSessionMap[session.meetingId] = session.sessionId;
                
                console.log(`✅ Session restored: duration ${Math.round((Date.now() - session.startTime) / 60000)}m, last updated: ${session.lastUpdated ? new Date(session.lastUpdated).toISOString() : 'never'}`);
            } else {
                // Session is too old, mark as ended
                const sessionAge = Math.round((Date.now() - session.startTime) / (60 * 60 * 1000));
                console.log(`⏰ Auto-ending stale session: ${session.sessionId} (${sessionAge} hours old)`);
                await endActiveSession(session.meetingId, 'stale_session_cleanup');
            }
        }
        
        console.log(`✅ Session data loaded: ${Object.keys(activeSessions).length} active sessions restored`);
        sessionDataLoaded = true;
        
    } catch (error) {
        console.error('❌ Error loading session data:', error);
        sessionDataLoaded = true; // Mark as loaded even on error to prevent repeated attempts
    }
}

// Always create a new session for each meeting join (SESSION-BASED TRACKING)
// This ensures accurate session-based tracking where each join = new session
async function createNewSession(meetingId, meetingTitle, participants, sender, networkParticipants) {
    try {
        const storage = await ensureStorageManager();
        
        // ALWAYS create a completely new session - no restoration or continuation
        // This is the correct approach for session-based tracking
        
        // No existing session found, create a new one
        const sessionId = storage ? storage.generateSessionId() : `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        console.log(`🚀 Creating NEW session for meeting: ${meetingId} (session: ${sessionId})`);
        
        const activeSession = {
            sessionId: sessionId,
            meetingId: meetingId,
            title: meetingTitle || meetingId,
            participants: participants,
            startTime: startTime,
            endTime: null,
            isActive: true,
            minuteLogs: [],
            url: sender.tab?.url,
            dataSource: networkParticipants > 0 ? 'network' : 'dom',
            lastUpdated: Date.now()
        };
        
        activeSessions[sessionId] = activeSession;
        meetingToSessionMap[meetingId] = sessionId;
        
        // CRITICAL: Save new session to database immediately
        try {
            const storage = await ensureStorageManager();
            if (storage) {
                await storage.saveMeetingSession(activeSession);
                console.log(`💾 IMMEDIATE SAVE: New session ${sessionId} saved to IndexedDB`);
            }
        } catch (error) {
            console.error('❌ IMMEDIATE SAVE ERROR: Failed to save new session:', error.message);
        }
        
        return activeSession;
        
    } catch (error) {
        console.error('❌ Error finding/creating session:', error);
        
        // Fallback: create basic session
        const sessionId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const activeSession = {
            sessionId: sessionId,
            meetingId: meetingId,
            title: meetingTitle || meetingId,
            participants: participants,
            startTime: Date.now(),
            endTime: null,
            isActive: true,
            minuteLogs: [],
            url: sender.tab?.url,
            dataSource: networkParticipants > 0 ? 'network' : 'dom',
            fallback: true,
            lastUpdated: Date.now()
        };
        
        activeSessions[sessionId] = activeSession;
        meetingToSessionMap[meetingId] = sessionId;
        
        return activeSession;
    }
}

// Get recent sessions for a meeting ID (used for debugging/logging)
async function getRecentSessions(meetingId) {
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available for session lookup');
            return [];
        }
        
        // Use the new session-based storage methods
        const sessions = await storage.getMeetingSessions(meetingId);
        
        // Sort by start time, most recent first
        return sessions.sort((a, b) => b.startTime - a.startTime);
        
    } catch (error) {
        console.error('❌ Error getting recent sessions:', error);
        return [];
    }
}

// End current active session for a meeting
async function endActiveSession(meetingId, reason = 'meeting_ended') {
    console.log(`🔧 endActiveSession called for meeting: ${meetingId}, reason: ${reason}`);
    
    const sessionId = meetingToSessionMap[meetingId];
    if (!sessionId) {
        console.log(`⚠️ No active session found for meeting: ${meetingId}`);
        console.log('📋 Current meetingToSessionMap:', Object.keys(meetingToSessionMap));
        return;
    }
    
    const session = activeSessions[sessionId];
    if (!session) {
        console.log(`⚠️ Session ${sessionId} not found in active sessions`);
        console.log('📋 Current active sessions:', Object.keys(activeSessions));
        return;
    }
    
    const endTime = Date.now();
    const duration = endTime - session.startTime;
    
    console.log(`🚫 Ending session: ${sessionId} for meeting: ${meetingId} (${Math.round(duration / 60000)}m, reason: ${reason})`);
    console.log(`📊 Session details before ending:`, {
        sessionId: session.sessionId,
        meetingId: session.meetingId,
        title: session.title,
        startTime: new Date(session.startTime).toISOString(),
        participantCount: session.participants ? session.participants.length : 0,
        hasMinuteLogs: session.minuteLogs ? session.minuteLogs.length : 0
    });
    
    // Update session with end time
    session.endTime = endTime;
    session.isActive = false;
    session.endReason = reason;
    
    // Save the completed session to storage with comprehensive error handling
    let sessionSaved = false;
    try {
        console.log('💾 Attempting to save session to storage...');
        const storage = await ensureStorageManager();
        if (!storage) {
            console.error('❌ Storage manager not available!');
            // Try to save to old meeting format as fallback
            console.log('🔄 Attempting fallback to old meeting format...');
            await saveFallbackMeeting(session);
            console.log('✅ Saved session as fallback meeting');
            sessionSaved = true;
        } else {
            console.log('📝 Saving session to IndexedDB...');
            await storage.saveMeetingSession(session);
            console.log(`✅ Session ${sessionId} saved to storage with ${Math.round(duration / 60000)}m duration`);
            sessionSaved = true;
        }
    } catch (error) {
        console.error('❌ Error saving ended session:', {
            error: error.message,
            errorName: error.name,
            sessionId,
            meetingId,
            sessionTitle: session.title
        });
        
        // Try fallback save
        try {
            console.log('🔄 Attempting fallback save after error...');
            await saveFallbackMeeting(session);
            console.log('✅ Fallback save successful');
            sessionSaved = true;
        } catch (fallbackError) {
            console.error('❌ Fallback save also failed:', fallbackError.message);
        }
    }
    
    if (!sessionSaved) {
        console.error(`❌ CRITICAL: Failed to save session ${sessionId} - meeting data may be lost!`);
        // Keep session data in memory for manual recovery
        session._failedToSave = true;
        session._failedAt = Date.now();
        console.log('🔄 Keeping failed session in memory for manual recovery');
        return; // Don't clean up if we couldn't save
    }
    
    // Clean up active session tracking
    delete activeSessions[sessionId];
    delete meetingToSessionMap[meetingId];
    
    console.log(`🧹 Cleaned up session tracking for ${sessionId}`);
}

// Fallback function to save session as old-style meeting
async function saveFallbackMeeting(session) {
    const fallbackMeeting = {
        id: session.meetingId,
        title: session.title,
        startTime: session.startTime,
        endTime: session.endTime,
        participants: session.participants || [],
        minuteLogs: session.minuteLogs || [],
        url: session.url,
        sessionId: session.sessionId, // Keep reference to original session
        dataSource: session.dataSource,
        endReason: session.endReason,
        savedAsFallback: true
    };
    
    await saveMeeting(fallbackMeeting);
}

// Helper function to find existing or recent meeting (for rejoin logic)
async function findExistingOrRecentMeeting(meetingId) {
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available for meeting lookup');
            return null;
        }
        
        // Validate meetingId
        if (!meetingId || typeof meetingId !== 'string') {
            console.warn('⚠️ Invalid meetingId for lookup:', meetingId);
            return null;
        }
        
        console.log(`🔍 Looking up existing meeting: ${meetingId}`);
        
        // First, try to get the exact meeting by ID
        const exactMeeting = await storage.getMeeting(meetingId);
        
        if (exactMeeting) {
            console.log(`📋 Found existing meeting:`, {
                id: exactMeeting.id,
                title: exactMeeting.title,
                startTime: exactMeeting.startTime ? new Date(exactMeeting.startTime).toISOString() : 'null',
                endTime: exactMeeting.endTime ? new Date(exactMeeting.endTime).toISOString() : 'null',
                currentDuration: exactMeeting.currentDuration,
                resumed: exactMeeting.resumed
            });
            
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
        console.error('❌ Error finding existing meeting:', {
            meetingId,
            errorName: error.name,
            errorMessage: error.message,
            errorCode: error.code,
            errorStack: error.stack?.substring(0, 200)
        });
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

// Get sessions for dashboard display (DATABASE ONLY)
async function getSessions() {
    try {
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available, returning empty array');
            return [];
        }
        
        // FIXED: Only get sessions from database, not from memory
        // Dashboard should show persistent data only
        const allSessions = await storage.getAllSessions();
        
        console.log(`📊 Found ${allSessions.length} total sessions in database`);
        
        // Convert sessions to dashboard format
        const formattedSessions = allSessions.map(session => {
            const duration = session.endTime ? (session.endTime - session.startTime) : (Date.now() - session.startTime);
            const isActive = !session.endTime; // No end time = still active
            
            return {
                id: session.sessionId,
                meetingId: session.meetingId,
                title: session.title || session.meetingId,
                startTime: session.startTime,
                endTime: session.endTime || null,
                duration: duration,
                participants: session.participants || [],
                url: session.url,
                sessionId: session.sessionId,
                isSession: true,
                isActive: isActive,
                dataSource: session.dataSource || 'unknown'
            };
        });
        
        // Sort by start time, most recent first
        formattedSessions.sort((a, b) => b.startTime - a.startTime);
        
        const activeSessions = formattedSessions.filter(s => s.isActive).length;
        const completedSessions = formattedSessions.length - activeSessions;
        
        console.log(`📊 Retrieved ${formattedSessions.length} total sessions for dashboard (${activeSessions} active, ${completedSessions} completed)`);
        return formattedSessions;
    } catch (error) {
        console.error('❌ Error getting sessions from IndexedDB:', error);
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
        
        // Detailed meeting data validation
        console.log(`🔍 Validating meeting data:`, {
            hasId: !!meeting?.id,
            id: meeting?.id,
            hasStartTime: !!meeting?.startTime,
            startTime: meeting?.startTime,
            isValidStartTime: meeting?.startTime && typeof meeting.startTime === 'number' && meeting.startTime > 0,
            meetingObject: typeof meeting,
            keys: meeting ? Object.keys(meeting) : 'no meeting object'
        });
        
        if (!meeting) {
            console.error('❌ Invalid meeting data: meeting is null or undefined');
            return;
        }
        
        if (!meeting.id || typeof meeting.id !== 'string' || meeting.id.trim() === '') {
            console.error('❌ Invalid meeting data: missing or invalid meeting ID', {
                id: meeting.id,
                type: typeof meeting.id,
                meeting: meeting
            });
            return;
        }
        
        if (!meeting.startTime || typeof meeting.startTime !== 'number' || meeting.startTime <= 0) {
            console.error('❌ Invalid meeting data: missing or invalid start time', {
                startTime: meeting.startTime,
                type: typeof meeting.startTime,
                isNumber: typeof meeting.startTime === 'number',
                isPositive: meeting.startTime > 0,
                meeting: meeting
            });
            return;
        }
        
        // Additional validation for important fields
        const validatedMeeting = {
            ...meeting,
            id: String(meeting.id).trim(),
            title: meeting.title || meeting.id,
            startTime: Number(meeting.startTime),
            endTime: meeting.endTime ? Number(meeting.endTime) : undefined,
            participants: Array.isArray(meeting.participants) ? meeting.participants : [],
            minuteLogs: Array.isArray(meeting.minuteLogs) ? meeting.minuteLogs : []
        };
        
        // Log validated meeting data for debugging
        console.log(`💾 Saving validated meeting to IndexedDB:`, {
            id: validatedMeeting.id,
            title: validatedMeeting.title,
            startTime: new Date(validatedMeeting.startTime).toISOString(),
            endTime: validatedMeeting.endTime ? new Date(validatedMeeting.endTime).toISOString() : null,
            participantCount: validatedMeeting.participants.length,
            resumed: validatedMeeting.resumed || false,
            hasMinuteLogs: validatedMeeting.minuteLogs.length > 0
        });
        
        await storage.saveMeeting(validatedMeeting);
        console.log(`✅ Meeting saved successfully to IndexedDB: ${validatedMeeting.id}`);
    } catch (error) {
        console.error('❌ Error saving meeting to IndexedDB:', {
            errorName: error.name,
            errorMessage: error.message,
            errorCode: error.code,
            errorStack: error.stack?.substring(0, 300),
            meetingId: meeting?.id || 'Unknown ID',
            meetingData: meeting ? {
                id: meeting.id,
                startTime: meeting.startTime,
                title: meeting.title,
                hasParticipants: !!meeting.participants,
                participantCount: meeting.participants?.length
            } : 'No meeting data'
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
    
    // SIMPLIFIED: Only end session if ALL Meet tabs are closed
    if (currentMeetingState.state === 'active' && currentMeetingState.currentMeeting) {
        try {
            // Query remaining Google Meet tabs
            const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
            console.log(`📍 ${tabs.length} Google Meet tabs remaining after tab ${tabId} closed`);
            
            if (tabs.length === 0) {
                console.log('🚫 No more Meet tabs, ending current session');
                
                // End the current session using the session-based approach
                const meetingId = currentMeetingState.currentMeeting.id;
                await endActiveSession(meetingId, 'all_tabs_closed');
                
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
                console.log(`📋 ${tabs.length} Meet tabs still open, continuing session tracking`);
                // Don't check individual tabs for activity - let content scripts handle it
                // This prevents false session endings
            }
        } catch (error) {
            console.error('❌ Error during tab removal handling:', error);
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

// COMPLETELY DISABLED: Zombie meeting detection that was causing sessions to end prematurely
// This function has been completely disabled to prevent automatic session ending
// Users can manually clean up zombie sessions via the popup if needed
async function detectAndCleanupZombieMeetings() {
    console.log('🚫 Zombie meeting detection DISABLED - sessions will only end on legitimate meeting end or manual cleanup');
    // This function is intentionally empty to prevent automatic session ending
    return;
}

// Handle meeting ended by navigation (URL change) - SESSION-BASED APPROACH
async function handleMeetingEndedByNavigation(meetingId, reason, sender) {
    console.log(`🔀 Meeting ended by navigation: ${meetingId} (reason: ${reason})`);
    
    // End the active session for this meeting
    await endActiveSession(meetingId, `navigation_${reason}`);
    
    // Check if this matches our current meeting state and reset it
    if (currentMeetingState.currentMeeting && currentMeetingState.currentMeeting.id === meetingId) {
        console.log(`🔧 Meeting session ended by navigation (reason: ${reason})`);
        
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

// Helper function to end zombie meetings (SESSION-BASED APPROACH)
async function endZombieMeeting(reason) {
    if (!currentMeetingState.currentMeeting) {
        console.log('⚠️ No current meeting to end');
        return;
    }
    
    const meetingId = currentMeetingState.currentMeeting.id;
    
    // End the active session using the session-based approach
    await endActiveSession(meetingId, `zombie_${reason}`);
    
    const duration = Date.now() - currentMeetingState.currentMeeting.startTime;
    console.log(`🔧 Auto-ended zombie meeting "${currentMeetingState.currentMeeting.title}" after ${Math.round(duration / 60000)} minutes (reason: ${reason})`);
    
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

// COMPLETELY REMOVED: All timer-based zombie meeting detection
// User has manual controls in the popup to end zombie meetings when needed
// Keeping only legitimate meeting end detection (tab close, navigation, UI detection)

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

// Add debugging functions to global scope for manual inspection
self.debugMeetingTracker = {
    getCurrentState: () => currentMeetingState,
    getActiveSessions: () => activeSessions,
    getMeetingToSessionMap: () => meetingToSessionMap,
    
    // Check for failed sessions that couldn't be saved
    getFailedSessions: () => {
        const failed = Object.values(activeSessions).filter(session => session._failedToSave);
        console.log(`🔍 Found ${failed.length} failed sessions:`);
        failed.forEach(session => {
            console.log(`  - ${session.sessionId}: ${session.title} (failed at ${new Date(session._failedAt).toISOString()})`);
        });
        return failed;
    },
    
    // Manually retry saving failed sessions
    retryFailedSessions: async () => {
        const failed = Object.values(activeSessions).filter(session => session._failedToSave);
        console.log(`🔄 Retrying ${failed.length} failed sessions...`);
        
        let retryResults = [];
        for (const session of failed) {
            try {
                const storage = await ensureStorageManager();
                if (storage) {
                    await storage.saveMeetingSession(session);
                    console.log(`✅ Successfully saved failed session: ${session.sessionId}`);
                    // Remove failed marker
                    delete session._failedToSave;
                    delete session._failedAt;
                    retryResults.push({ sessionId: session.sessionId, success: true });
                } else {
                    await saveFallbackMeeting(session);
                    console.log(`✅ Saved failed session as fallback: ${session.sessionId}`);
                    delete session._failedToSave;
                    delete session._failedAt;
                    retryResults.push({ sessionId: session.sessionId, success: true, method: 'fallback' });
                }
            } catch (error) {
                console.error(`❌ Failed to retry session ${session.sessionId}:`, error.message);
                retryResults.push({ sessionId: session.sessionId, success: false, error: error.message });
            }
        }
        
        console.log('🔄 Retry results:', retryResults);
        return retryResults;
    },
    
    // Force end a specific session
    forceEndSession: async (sessionId, reason = 'manual_debug') => {
        const session = activeSessions[sessionId];
        if (!session) {
            console.log(`⚠️ Session ${sessionId} not found`);
            return { success: false, message: 'Session not found' };
        }
        
        try {
            await endActiveSession(session.meetingId, reason);
            console.log(`✅ Force ended session: ${sessionId}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error force ending session ${sessionId}:`, error);
            return { success: false, error: error.message };
        }
    }
};

// PERIODIC SESSION AUTO-SAVE AND HEARTBEAT
// This prevents session data loss if the background service worker is terminated

// Periodic auto-save function
async function periodicSessionAutoSave() {
    try {
        const activeSessionsList = Object.values(activeSessions).filter(session => session.isActive);
        
        if (activeSessionsList.length === 0) {
            console.log('⏰ Auto-save: No active sessions to save');
            return;
        }
        
        console.log(`⏰ AUTO-SAVE: Saving ${activeSessionsList.length} active sessions to IndexedDB...`);
        
        const storage = await ensureStorageManager();
        if (!storage) {
            console.warn('⚠️ Storage manager not available for auto-save');
            return;
        }
        
        let savedCount = 0;
        let errorCount = 0;
        
        for (const session of activeSessionsList) {
            try {
                // Update last saved timestamp
                session.lastAutoSaved = Date.now();
                
                await storage.saveMeetingSession(session);
                savedCount++;
                
                console.log(`✅ Auto-saved session: ${session.sessionId} (${session.title})`);
            } catch (error) {
                errorCount++;
                console.error(`❌ Auto-save failed for session ${session.sessionId}:`, error.message);
            }
        }
        
        console.log(`⏰ AUTO-SAVE COMPLETE: ${savedCount} sessions saved, ${errorCount} errors`);
        
        // Log current session status for debugging
        activeSessionsList.forEach(session => {
            const duration = Math.round((Date.now() - session.startTime) / 60000);
            console.log(`📊 Active session: ${session.sessionId} - ${session.title} (${duration}m duration)`);
        });
        
    } catch (error) {
        console.error('❌ Error during periodic auto-save:', error);
    }
}

// Start periodic auto-save timer (runs every 30 seconds)
function startAutoSaveTimer() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
    }
    
    // Run immediately, then every 30 seconds
    periodicSessionAutoSave();
    
    autoSaveTimer = setInterval(periodicSessionAutoSave, 30 * 1000); // 30 seconds
    
    console.log('⏰ Started periodic session auto-save timer (30 second intervals)');
}

// Stop auto-save timer
function stopAutoSaveTimer() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
        console.log('⏰ Stopped periodic session auto-save timer');
    }
}

// Heartbeat to keep service worker alive
const HEARTBEAT_INTERVAL = 20 * 1000; // 20 seconds
let heartbeatTimer = null;

function startHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
    }
    
    heartbeatTimer = setInterval(() => {
        console.log(`💓 Service worker heartbeat - ${Object.keys(activeSessions).length} active sessions`);
    }, HEARTBEAT_INTERVAL);
    
    console.log('💓 Started service worker heartbeat');
}

// Periodic badge sync function to ensure badges stay accurate
async function periodicBadgeSync() {
    try {
        const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
        const hasActiveMeeting = currentMeetingState.state === 'active';
        const participantCount = hasActiveMeeting ? (currentMeetingState.participants?.length || 0) : 0;
        
        if (tabs.length === 0 && hasActiveMeeting) {
            // No Meet tabs but we think there's an active meeting - clean up
            console.log('🧹 Badge sync: No Meet tabs found but extension shows active meeting - cleaning up');
            currentMeetingState = {
                state: 'none',
                participants: [],
                currentMeeting: null,
                networkParticipants: 0
            };
            updateIcon('none', []);
        } else if (hasActiveMeeting) {
            // Ensure badge reflects current participant count
            console.log(`🔄 Badge sync: Confirming badge shows ${participantCount} participants`);
            updateIcon('active', currentMeetingState.participants || [], currentMeetingState.networkParticipants > 0);
        } else {
            // Ensure badge is cleared when not in meeting
            console.log('🔄 Badge sync: Ensuring badge is cleared (not in meeting)');
            updateIcon('none', []);
        }
    } catch (error) {
        console.error('❌ Error during periodic badge sync:', error);
    }
}

// Start periodic badge sync (every 30 seconds)
setInterval(periodicBadgeSync, 30 * 1000);

// Initialize auto-save and heartbeat on background startup
startAutoSaveTimer();
startHeartbeat();

// Debug info
console.log('🌐 Network-enhanced Google Meet Tracker background service ready');
console.log('🔧 Debug functions available: self.debugMeetingTracker');
console.log('⏰ Periodic session auto-save, heartbeat, and badge sync initialized');
