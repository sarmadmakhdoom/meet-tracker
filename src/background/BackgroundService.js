// New Background Service Worker - Clean and modular
class BackgroundService {
    constructor() {
        this.storageManager = null;
        this.meetingManager = null;
        this.initialized = false;
        
        // State tracking
        this.currentState = {
            isActive: false,
            meetingId: null,
            sessionId: null,
            participants: [],
            participantCount: 0
        };
    }
    
    async init() {
        try {
            console.log('🚀 Initializing Background Service...');
            
            // Initialize storage
            this.storageManager = new StorageManager();
            await this.storageManager.init();
            
            // Initialize meeting manager
            this.meetingManager = new MeetingManager(this.storageManager);
            
            // Setup message handlers
            this.setupMessageHandlers();
            
            // Setup extension lifecycle handlers
            this.setupExtensionHandlers();
            
            this.initialized = true;
            console.log('✅ Background Service initialized successfully');
            
        } catch (error) {
            console.error('❌ Background Service initialization failed:', error);
            throw error;
        }
    }
    
    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log(`📨 Message received: ${message.type}`);
            
            // Handle all messages asynchronously
            this.handleMessage(message, sender)
                .then(response => sendResponse(response))
                .catch(error => {
                    console.error(`❌ Error handling message ${message.type}:`, error);
                    sendResponse({ error: error.message });
                });
            
            return true; // Keep message channel open for async response
        });
    }
    
    async handleMessage(message, sender) {
        if (!this.initialized) {
            throw new Error('Background service not initialized');
        }
        
        const { type, data } = message;
        
        switch (type) {
            case 'participant_update':
                return await this.handleParticipantUpdate(data, sender);
                
            case 'session_end':
                return await this.handleSessionEnd(data);
                
            case 'minute_data':
                return await this.handleMinuteData(data);
                
            case 'get_current_state':
                return await this.getCurrentState();
                
            case 'get_dashboard_data':
                return await this.getDashboardData(data?.options || {});
                
            case 'force_end_meetings':
                return await this.forceEndAllMeetings();
                
            case 'get_stats':
                return await this.getStats();
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    }
    
    async handleParticipantUpdate(data, sender) {
        const { meetingId, title, participants, dataSource } = data;
        const url = sender.tab?.url;
        
        console.log(`👥 Participant update: ${participants.length} participants in ${meetingId}`);
        
        // Update session with participants
        const session = await this.meetingManager.updateSessionParticipants(
            meetingId, 
            participants, 
            dataSource
        );
        
        if (!session) {
            // No active session, create one
            const newSession = await this.meetingManager.startSession(meetingId, title, url);
            newSession.updateParticipants(participants, dataSource);
        }
        
        // Update current state
        this.currentState = {
            isActive: true,
            meetingId: meetingId,
            sessionId: session?.sessionId,
            participants: participants,
            participantCount: participants.length
        };
        
        // Update icon
        this.updateIcon();
        
        return {
            success: true,
            sessionId: session?.sessionId,
            sessionStartTime: session?.startTime
        };
    }
    
    async handleSessionEnd(data) {
        const { meetingId, reason } = data;
        
        console.log(`🚪 Session end requested for ${meetingId}: ${reason}`);
        
        const endedSession = await this.meetingManager.endCurrentSession(meetingId, reason);
        
        // Update current state if this was the active meeting
        if (this.currentState.meetingId === meetingId) {
            this.currentState = {
                isActive: false,
                meetingId: null,
                sessionId: null,
                participants: [],
                participantCount: 0
            };
        }
        
        // Update icon
        this.updateIcon();
        
        return {
            success: true,
            endedSession: endedSession?.getSummary()
        };
    }
    
    async handleMinuteData(data) {
        const { meetingId, minute, participants } = data;
        
        await this.meetingManager.addSessionMinuteData(meetingId, minute, participants);
        
        return { success: true };
    }
    
    async getCurrentState() {
        const activeSessions = this.meetingManager.getAllActiveSessions();
        
        if (activeSessions.length === 0) {
            return {
                isActive: false,
                meetingId: null,
                sessionId: null,
                participants: [],
                participantCount: 0
            };
        }
        
        // Return most recent active session
        const currentSession = activeSessions[0];
        
        return {
            isActive: true,
            meetingId: currentSession.meetingId,
            sessionId: currentSession.sessionId,
            startTime: currentSession.startTime,
            duration: currentSession.duration,
            participants: this.currentState.participants,
            participantCount: this.currentState.participantCount
        };
    }
    
    async getDashboardData(options) {
        return await this.meetingManager.getDashboardData(options);
    }
    
    async forceEndAllMeetings() {
        const result = await this.meetingManager.endAllSessions('force_cleanup');
        
        // Reset state
        this.currentState = {
            isActive: false,
            meetingId: null,
            sessionId: null,
            participants: [],
            participantCount: 0
        };
        
        // Update icon
        this.updateIcon();
        
        return {
            success: true,
            message: `Ended ${result.ended} active sessions`,
            ...result
        };
    }
    
    async getStats() {
        return await this.meetingManager.getStats();
    }
    
    updateIcon() {
        const { isActive, participantCount } = this.currentState;
        
        let iconPath, badgeText, badgeColor, title;
        
        if (isActive) {
            iconPath = {
                '16': 'icons/icon16-active.png',
                '48': 'icons/icon48-active.png',
                '128': 'icons/icon128-active.png'
            };
            badgeText = participantCount.toString();
            badgeColor = '#34a853';
            title = `In meeting: ${participantCount} participant(s)`;
        } else {
            iconPath = {
                '16': 'icons/icon16.png',
                '48': 'icons/icon48.png',
                '128': 'icons/icon128.png'
            };
            badgeText = '';
            badgeColor = '#4285f4';
            title = 'Not in a meeting';
        }
        
        chrome.action.setIcon({ path: iconPath });
        chrome.action.setBadgeText({ text: badgeText });
        chrome.action.setBadgeBackgroundColor({ color: badgeColor });
        chrome.action.setTitle({ title });
    }
    
    setupExtensionHandlers() {
        // Handle extension install/startup
        chrome.runtime.onInstalled.addListener(async (details) => {
            console.log('Extension installed/updated:', details.reason);
            
            if (details.reason === 'install') {
                console.log('Welcome! Google Meet Tracker installed.');
            }
        });
        
        // Handle extension startup
        chrome.runtime.onStartup.addListener(async () => {
            console.log('Extension started, checking for zombie sessions...');
            
            // Clean up any sessions that might have been left active
            setTimeout(() => {
                this.cleanupZombieSessions();
            }, 5000);
        });
    }
    
    async cleanupZombieSessions() {
        try {
            const activeSessions = await this.storageManager.getActiveSessions();
            
            if (activeSessions.length > 0) {
                console.log(`🧟 Found ${activeSessions.length} zombie sessions, cleaning up...`);
                
                for (const session of activeSessions) {
                    session.end('zombie_cleanup');
                    await this.storageManager.saveSession(session);
                }
                
                // Update meetings from sessions
                const meetingIds = [...new Set(activeSessions.map(s => s.meetingId))];
                for (const meetingId of meetingIds) {
                    await this.storageManager.updateMeetingFromSessions(meetingId);
                }
                
                console.log(`✅ Cleaned up ${activeSessions.length} zombie sessions`);
            }
        } catch (error) {
            console.error('❌ Error cleaning up zombie sessions:', error);
        }
    }
}

// Initialize the background service
const backgroundService = new BackgroundService();

// Auto-initialize when script loads
backgroundService.init().catch(error => {
    console.error('❌ Failed to initialize background service:', error);
});

// Export for testing/debugging
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackgroundService;
}

// Global access for debugging
self.backgroundService = backgroundService;
