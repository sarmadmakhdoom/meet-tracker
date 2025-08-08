// DIAGNOSTIC Background Script - Debug the 2-minute drop issue
console.log('🔍 DIAGNOSTIC MODE: Background service starting...');

class DiagnosticTracker {
    constructor() {
        this.meetings = new Map();
        this.activeSessions = new Map(); 
        this.currentState = {
            isActive: false,
            meetingId: null,
            sessionId: null,
            participants: [],
            participantCount: 0
        };
        
        // DIAGNOSTIC: Track service worker lifecycle
        this.startTime = Date.now();
        this.lastMessageTime = null;
        this.messageCount = 0;
        this.diagnosticLogs = [];
        
        // DIAGNOSTIC: Heartbeat to keep service worker alive
        this.heartbeatInterval = null;
        
        // IndexedDB for persistence
        this.db = null;
        this.dbName = 'MeetingTrackerDB';
        this.dbVersion = 3;
    }
    
    log(message, data = null) {
        const timestamp = new Date().toISOString();
        const uptime = Math.round((Date.now() - this.startTime) / 1000);
        const logEntry = `[${timestamp}] [${uptime}s] ${message}`;
        
        console.log('🔍 ' + logEntry, data || '');
        
        this.diagnosticLogs.push({
            timestamp,
            uptime,
            message,
            data: data ? JSON.stringify(data) : null
        });
        
        // Keep only last 100 logs
        if (this.diagnosticLogs.length > 100) {
            this.diagnosticLogs = this.diagnosticLogs.slice(-100);
        }
    }
    
    async init() {
        this.log('INIT: Diagnostic tracker initializing');
        
        // Initialize IndexedDB first
        try {
            await this.initDatabase();
            this.log('INIT: IndexedDB initialized successfully');
        } catch (error) {
            this.log('INIT ERROR: IndexedDB failed to initialize', { error: error.message });
        }
        
        // DIAGNOSTIC: Setup heartbeat to prevent service worker from going inactive
        this.startHeartbeat();
        
        // Setup message handlers with detailed logging
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.messageCount++;
            this.lastMessageTime = Date.now();
            
            const messageType = message.type || message.action;
            this.log(`MESSAGE RECEIVED: ${messageType}`, {
                messageCount: this.messageCount,
                senderTab: sender.tab?.id,
                senderUrl: sender.tab?.url
            });
            
            this.handleMessage(message, sender)
                .then(response => {
                    this.log(`MESSAGE RESPONSE: ${messageType} - SUCCESS`, response);
                    sendResponse(response);
                })
                .catch(error => {
                    this.log(`MESSAGE RESPONSE: ${messageType} - ERROR`, { error: error.message });
                    sendResponse({ error: error.message });
                });
            return true;
        });
        
        // DIAGNOSTIC: Log service worker lifecycle events
        chrome.runtime.onStartup.addListener(() => {
            this.log('LIFECYCLE: Extension startup');
        });
        
        chrome.runtime.onInstalled.addListener((details) => {
            this.log('LIFECYCLE: Extension installed/updated', { reason: details.reason });
        });
        
        // DIAGNOSTIC: Monitor tab changes
        if (chrome.tabs) {
            chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
                if (changeInfo.status === 'complete' && tab.url?.includes('meet.google.com')) {
                    this.log('TAB: Meet tab updated', { tabId, url: tab.url });
                }
            });
        }
        
        this.log('INIT: Diagnostic tracker initialized successfully');
    }
    
    startHeartbeat() {
        // DIAGNOSTIC: Send heartbeat every 10 seconds to keep service worker alive
        this.heartbeatInterval = setInterval(() => {
            const uptime = Math.round((Date.now() - this.startTime) / 1000);
            this.log(`HEARTBEAT: Service worker alive (${uptime}s)`, {
                activeSessions: this.activeSessions.size,
                lastMessage: this.lastMessageTime ? Math.round((Date.now() - this.lastMessageTime) / 1000) + 's ago' : 'never'
            });
        }, 10000);
    }
    
    async handleMessage(message, sender) {
        // COMPATIBILITY: Support both 'type' and 'action' message formats
        const messageType = message.type || message.action;
        const { data } = message;
        
        switch (messageType) {
            case 'participant_update':
                return await this.handleParticipantUpdate(data, sender);
                
            case 'session_end':
                return await this.handleSessionEnd(data);
                
            case 'minute_data':
                return await this.handleMinuteData(data);
                
            case 'get_current_state':
                return this.getCurrentState();
                
            case 'getActiveSession':
                // Support for popup.js API call
                return this.getActiveSessionForPopup();
                
            case 'get_dashboard_data':
                return this.getDashboardData();
                
            case 'getMeetings':
                // Support for old dashboard.js API call
                return this.getDashboardData();
                
            case 'force_end_meetings':
                return this.forceEndAllMeetings();
                
            // DIAGNOSTIC: New debug endpoints
            case 'get_diagnostic_logs':
                return {
                    logs: this.diagnosticLogs,
                    summary: {
                        uptime: Math.round((Date.now() - this.startTime) / 1000),
                        messageCount: this.messageCount,
                        activeSessions: this.activeSessions.size,
                        lastMessageTime: this.lastMessageTime
                    }
                };
                
            case 'ping':
                this.log('PING: Health check received');
                return { 
                    pong: true, 
                    uptime: Math.round((Date.now() - this.startTime) / 1000),
                    activeSessionCount: this.activeSessions.size
                };
                
            default:
                this.log(`UNKNOWN MESSAGE TYPE: ${messageType}`);
                throw new Error(`Unknown message type: ${messageType}`);
        }
    }
    
    async handleParticipantUpdate(data, sender) {
        const { meetingId, title, participants, dataSource } = data;
        
        this.log(`PARTICIPANT UPDATE: ${participants.length} participants in ${meetingId}`, {
            title,
            participantNames: participants.map(p => p.name),
            dataSource,
            tabId: sender.tab?.id
        });
        
        // Get or create meeting
        if (!this.meetings.has(meetingId)) {
            this.log(`MEETING CREATE: New meeting ${meetingId}`, { title });
            this.meetings.set(meetingId, {
                meetingId: meetingId,
                title: title || meetingId,
                url: sender.tab?.url,
                startTime: Date.now(),
                endTime: null,
                status: 'active',
                totalDuration: 0,
                sessionCount: 0,
                participants: new Map(),
                sessions: []
            });
        }
        
        const meeting = this.meetings.get(meetingId);
        
        // Find or create session
        const activeSession = Array.from(this.activeSessions.values())
            .find(s => s.meetingId === meetingId && !s.endTime);
            
        let session;
        if (!activeSession) {
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            session = {
                sessionId: sessionId,
                meetingId: meetingId,
                startTime: Date.now(),
                endTime: null,
                duration: null,
                participants: participants,
                minuteLogs: [],
                dataSource: dataSource,
                createdBy: 'participant_update',
                tabId: sender.tab?.id
            };
            
            this.activeSessions.set(sessionId, session);
            meeting.sessions.push(session);
            this.log(`SESSION CREATE: New session ${sessionId} for meeting ${meetingId}`);
            
            // CRITICAL: Save to database immediately
            try {
                await this.saveMeetingToDB(meeting);
                await this.saveSessionToDB(session);
                this.log(`DB PERSISTENCE: Meeting and session saved to IndexedDB`);
            } catch (error) {
                this.log(`DB PERSISTENCE ERROR: Failed to save to IndexedDB`, { error: error.message });
            }
        } else {
            session = activeSession;
            session.participants = participants;
            session.dataSource = dataSource;
            session.lastUpdate = Date.now();
            this.log(`SESSION UPDATE: Updated session ${session.sessionId}`, {
                participantCount: participants.length
            });
        }
        
        // Update current state
        this.currentState = {
            isActive: true,
            meetingId: meetingId,
            sessionId: session.sessionId,
            participants: participants,
            participantCount: participants.length
        };
        
        // Update icon
        this.updateIcon();
        
        const response = {
            success: true,
            sessionId: session.sessionId,
            sessionStartTime: session.startTime
        };
        
        this.log(`PARTICIPANT UPDATE COMPLETE: Response prepared`, response);
        return response;
    }
    
    async handleSessionEnd(data) {
        const { meetingId, reason } = data;
        
        this.log(`SESSION END REQUEST: ${meetingId}`, { reason });
        
        // Find active session for this meeting
        const activeSession = Array.from(this.activeSessions.values())
            .find(s => s.meetingId === meetingId && !s.endTime);
            
        if (activeSession) {
            // End the session
            activeSession.endTime = Date.now();
            activeSession.duration = activeSession.endTime - activeSession.startTime;
            activeSession.endReason = reason;
            
            this.log(`SESSION ENDED: ${activeSession.sessionId}`, {
                duration: Math.round(activeSession.duration / 60000) + 'm',
                reason
            });
            
            // Update meeting totals
            const meeting = this.meetings.get(meetingId);
            if (meeting) {
                meeting.totalDuration = meeting.sessions.reduce((total, s) => {
                    return total + (s.duration || 0);
                }, 0);
                meeting.sessionCount = meeting.sessions.length;
                
                // Check if meeting should be marked as completed
                const hasActiveSessions = meeting.sessions.some(s => !s.endTime);
                if (!hasActiveSessions) {
                    meeting.status = 'completed';
                    meeting.endTime = Math.max(...meeting.sessions.map(s => s.endTime || s.startTime));
                    this.log(`MEETING COMPLETED: ${meetingId}`, {
                        totalDuration: Math.round(meeting.totalDuration / 60000) + 'm',
                        sessionCount: meeting.sessionCount
                    });
                }
                
                // CRITICAL: Save updated session and meeting to database
                try {
                    await this.saveSessionToDB(activeSession);
                    await this.saveMeetingToDB(meeting);
                    this.log(`DB PERSISTENCE: Updated session and meeting saved to IndexedDB`);
                } catch (error) {
                    this.log(`DB PERSISTENCE ERROR: Failed to save session end to IndexedDB`, { error: error.message });
                }
            }
        } else {
            this.log(`SESSION END - NO ACTIVE SESSION FOUND: ${meetingId}`);
        }
        
        // Update current state
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
            endedSession: activeSession ? {
                sessionId: activeSession.sessionId,
                duration: activeSession.duration,
                endReason: activeSession.endReason
            } : null
        };
    }
    
    async handleMinuteData(data) {
        const { meetingId, minute, participants } = data;
        
        this.log(`MINUTE DATA: Minute ${minute} for ${meetingId}`, {
            participantCount: participants.length
        });
        
        // Find active session for this meeting
        const activeSession = Array.from(this.activeSessions.values())
            .find(s => s.meetingId === meetingId && !s.endTime);
            
        if (activeSession) {
            activeSession.minuteLogs.push({
                minute: minute,
                timestamp: Date.now(),
                participants: participants,
                participantCount: participants.length
            });
            
            this.log(`MINUTE LOGGED: Added to session ${activeSession.sessionId}`);
        } else {
            this.log(`MINUTE DATA - NO ACTIVE SESSION: ${meetingId}`, { minute });
        }
        
        return { success: true };
    }
    
    getCurrentState() {
        this.log('GET CURRENT STATE: Request received');
        return {
            ...this.currentState,
            diagnostics: {
                uptime: Math.round((Date.now() - this.startTime) / 1000),
                messageCount: this.messageCount,
                activeSessions: this.activeSessions.size,
                lastMessageTime: this.lastMessageTime
            }
        };
    }
    
    getDashboardData() {
        this.log('GET DASHBOARD DATA: Request received');
        
        const dashboardData = [];
        
        for (const meeting of this.meetings.values()) {
            // Get unique participants across all sessions
            const allParticipants = new Map();
            meeting.sessions.forEach(session => {
                if (session.participants) {
                    session.participants.forEach(p => {
                        allParticipants.set(p.id || p.name, p);
                    });
                }
            });
            
            // CRITICAL: Flatten structure to match dashboard expectations
            // Dashboard expects a flat meeting object, not nested structure
            dashboardData.push({
                meetingId: meeting.meetingId,
                title: meeting.title,
                url: meeting.url,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                status: meeting.status,
                totalDuration: meeting.totalDuration || 0,
                sessionCount: meeting.sessionCount || 0,
                participants: Array.from(allParticipants.values()),
                isActive: meeting.status === 'active',
                
                // Include session data for detailed analysis if needed
                sessions: meeting.sessions.map(s => ({
                    sessionId: s.sessionId,
                    meetingId: s.meetingId,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    duration: s.duration || (s.endTime ? s.endTime - s.startTime : Date.now() - s.startTime),
                    participantCount: s.participants ? s.participants.length : 0,
                    isActive: !s.endTime,
                    endReason: s.endReason,
                    dataSource: s.dataSource
                }))
            });
        }
        
        // Sort by start time, newest first
        dashboardData.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
        
        this.log('DASHBOARD DATA PREPARED', { meetingCount: dashboardData.length });
        return dashboardData;
    }
    
    forceEndAllMeetings() {
        this.log(`FORCE END ALL: ${this.activeSessions.size} active sessions`);
        
        let endedCount = 0;
        
        for (const session of this.activeSessions.values()) {
            if (!session.endTime) {
                session.endTime = Date.now();
                session.duration = session.endTime - session.startTime;
                session.endReason = 'force_cleanup';
                endedCount++;
            }
        }
        
        // Update all meetings
        for (const meeting of this.meetings.values()) {
            meeting.totalDuration = meeting.sessions.reduce((total, s) => {
                return total + (s.duration || 0);
            }, 0);
            meeting.status = 'completed';
            meeting.endTime = Date.now();
        }
        
        // Reset current state
        this.currentState = {
            isActive: false,
            meetingId: null,
            sessionId: null,
            participants: [],
            participantCount: 0
        };
        
        // Update icon
        this.updateIcon();
        
        this.log('FORCE END COMPLETE', { endedCount });
        
        return {
            success: true,
            message: `Ended ${endedCount} active sessions`,
            ended: endedCount,
            total: this.activeSessions.size
        };
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
            title = `DIAGNOSTIC: In meeting (${participantCount} participants)`;
        } else {
            iconPath = {
                '16': 'icons/icon16.png',
                '48': 'icons/icon48.png',
                '128': 'icons/icon128.png'
            };
            badgeText = '';
            badgeColor = '#4285f4';
            title = 'DIAGNOSTIC: Not in a meeting';
        }
        
        chrome.action.setIcon({ path: iconPath });
        chrome.action.setBadgeText({ text: badgeText });
        chrome.action.setBadgeBackgroundColor({ color: badgeColor });
        chrome.action.setTitle({ title });
        
        this.log('ICON UPDATED', { isActive, participantCount });
    }
    
    getActiveSessionForPopup() {
        this.log('GET ACTIVE SESSION FOR POPUP: Request received');
        
        if (!this.currentState.isActive || !this.currentState.meetingId) {
            this.log('GET ACTIVE SESSION FOR POPUP: No active meeting');
            return {
                state: 'none',
                participants: [],
                currentMeeting: null
            };
        }
        
        // Find the active session
        const sessionId = this.currentState.sessionId;
        const activeSession = sessionId ? this.activeSessions.get(sessionId) : null;
        
        if (!activeSession) {
            this.log('GET ACTIVE SESSION FOR POPUP: No active session found');
            return {
                state: 'none',
                participants: [],
                currentMeeting: null
            };
        }
        
        const currentDuration = Date.now() - activeSession.startTime;
        
        this.log('GET ACTIVE SESSION FOR POPUP: Returning active session data', {
            sessionId: activeSession.sessionId,
            meetingId: activeSession.meetingId,
            duration: Math.round(currentDuration / 60000) + 'm',
            participantCount: this.currentState.participants.length
        });
        
        return {
            state: 'active',
            participants: this.currentState.participants,
            currentMeeting: {
                id: activeSession.meetingId,
                title: activeSession.title,
                startTime: activeSession.startTime,
                sessionId: activeSession.sessionId,
                duration: currentDuration,
                isSession: true
            }
        };
    }
    
    // IndexedDB methods
    async initDatabase() {
        return new Promise((resolve, reject) => {
            this.log('DB INIT: Opening IndexedDB');
            
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                this.log('DB ERROR: Failed to open database', { error: request.error });
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.log('DB SUCCESS: Database opened successfully');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                this.log('DB UPGRADE: Database needs upgrade', {
                    oldVersion: event.oldVersion,
                    newVersion: event.newVersion
                });
                
                const db = event.target.result;
                
                // Create meetings store
                if (!db.objectStoreNames.contains('meetings')) {
                    this.log('DB CREATE: Creating meetings store');
                    const meetingStore = db.createObjectStore('meetings', { keyPath: 'meetingId' });
                    meetingStore.createIndex('startTime', 'startTime', { unique: false });
                    meetingStore.createIndex('status', 'status', { unique: false });
                    meetingStore.createIndex('date', 'date', { unique: false });
                }
                
                // Create sessions store
                if (!db.objectStoreNames.contains('sessions')) {
                    this.log('DB CREATE: Creating sessions store');
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
                    sessionStore.createIndex('meetingId', 'meetingId', { unique: false });
                    sessionStore.createIndex('startTime', 'startTime', { unique: false });
                    sessionStore.createIndex('endTime', 'endTime', { unique: false });
                }
                
                // Create participants store
                if (!db.objectStoreNames.contains('participants')) {
                    this.log('DB CREATE: Creating participants store');
                    const participantStore = db.createObjectStore('participants', { keyPath: 'name' });
                    participantStore.createIndex('totalMeetings', 'totalMeetings', { unique: false });
                }
                
                this.log('DB UPGRADE: Database upgrade completed');
            };
        });
    }
    
    async saveMeetingToDB(meeting) {
        if (!this.db) {
            this.log('DB SAVE ERROR: Database not available');
            return;
        }
        
        return new Promise((resolve, reject) => {
            this.log('DB SAVE: Saving meeting to IndexedDB', { meetingId: meeting.meetingId });
            
            const transaction = this.db.transaction(['meetings'], 'readwrite');
            const store = transaction.objectStore('meetings');
            
            // Prepare meeting data for storage
            const meetingData = {
                meetingId: meeting.meetingId,
                title: meeting.title,
                url: meeting.url,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                status: meeting.status,
                totalDuration: meeting.totalDuration,
                sessionCount: meeting.sessionCount,
                date: new Date(meeting.startTime).toISOString().split('T')[0],
                participants: Array.from(meeting.participants?.values() || []),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            store.put(meetingData);
            
            transaction.oncomplete = () => {
                this.log('DB SAVE SUCCESS: Meeting saved to IndexedDB', { meetingId: meeting.meetingId });
                resolve();
            };
            
            transaction.onerror = () => {
                this.log('DB SAVE ERROR: Failed to save meeting', { 
                    meetingId: meeting.meetingId,
                    error: transaction.error 
                });
                reject(transaction.error);
            };
        });
    }
    
    async saveSessionToDB(session) {
        if (!this.db) {
            this.log('DB SAVE ERROR: Database not available');
            return;
        }
        
        return new Promise((resolve, reject) => {
            this.log('DB SAVE: Saving session to IndexedDB', { sessionId: session.sessionId });
            
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');
            
            // Prepare session data for storage
            const sessionData = {
                sessionId: session.sessionId,
                meetingId: session.meetingId,
                startTime: session.startTime,
                endTime: session.endTime,
                duration: session.duration,
                participants: session.participants || [],
                minuteLogs: session.minuteLogs || [],
                endReason: session.endReason,
                dataSource: session.dataSource,
                createdBy: session.createdBy,
                tabId: session.tabId,
                date: new Date(session.startTime).toISOString().split('T')[0],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            store.put(sessionData);
            
            transaction.oncomplete = () => {
                this.log('DB SAVE SUCCESS: Session saved to IndexedDB', { sessionId: session.sessionId });
                resolve();
            };
            
            transaction.onerror = () => {
                this.log('DB SAVE ERROR: Failed to save session', {
                    sessionId: session.sessionId,
                    error: transaction.error
                });
                reject(transaction.error);
            };
        });
    }
}

// Initialize the diagnostic tracker
const diagnosticTracker = new DiagnosticTracker();
diagnosticTracker.init();

// Global access for debugging
self.diagnosticTracker = diagnosticTracker;

// DIAGNOSTIC: Log every 30 seconds
setInterval(() => {
    console.log('🔍 DIAGNOSTIC STATUS:', {
        uptime: Math.round((Date.now() - diagnosticTracker.startTime) / 1000) + 's',
        messageCount: diagnosticTracker.messageCount,
        activeSessions: diagnosticTracker.activeSessions.size,
        currentState: diagnosticTracker.currentState
    });
}, 30000);
