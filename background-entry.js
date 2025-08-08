// Background Service Entry Point - Loads modular components
// This file acts as a module loader for the new architecture

console.log('🚀 Google Meet Tracker v2.0 - Background Service Loading...');

// In a real implementation, these would be proper ES6 modules
// For now, we'll include the necessary files in order

// Since Chrome Extensions don't support ES6 modules in service workers yet,
// we need to include all files manually or use a build process

// For this demonstration, we'll create a simplified version that works
// with the current Chrome Extension limitations

class MeetingTrackerV2 {
    constructor() {
        this.meetings = new Map(); // meetingId -> meeting data with sessions
        this.activeSessions = new Map(); // sessionId -> session data
        this.currentState = {
            isActive: false,
            meetingId: null,
            sessionId: null,
            participants: [],
            participantCount: 0
        };
    }
    
    init() {
        console.log('📋 Initializing Meeting Tracker v2.0...');
        
        // Setup message handlers
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender)
                .then(response => sendResponse(response))
                .catch(error => {
                    console.error('❌ Error handling message:', error);
                    sendResponse({ error: error.message });
                });
            return true;
        });
        
        // Setup extension handlers
        chrome.runtime.onInstalled.addListener(() => {
            console.log('🎉 Meeting Tracker v2.0 installed!');
        });
        
        console.log('✅ Meeting Tracker v2.0 initialized');
    }
    
    async handleMessage(message, sender) {
        const { type, data } = message;
        
        switch (type) {
            case 'participant_update':
                return await this.handleParticipantUpdate(data, sender);
                
            case 'session_end':
                return await this.handleSessionEnd(data);
                
            case 'minute_data':
                return await this.handleMinuteData(data);
                
            case 'get_current_state':
                return this.getCurrentState();
                
            case 'get_dashboard_data':
                return this.getDashboardData();
                
            case 'force_end_meetings':
                return this.forceEndAllMeetings();
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    }
    
    async handleParticipantUpdate(data, sender) {
        const { meetingId, title, participants, dataSource } = data;
        
        console.log(`👥 Participant update: ${participants.length} participants in ${meetingId}`);
        
        // Get or create meeting
        if (!this.meetings.has(meetingId)) {
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
        
        // Create new session if none active for this meeting
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
                dataSource: dataSource
            };
            
            this.activeSessions.set(sessionId, session);
            meeting.sessions.push(session);
            console.log(`🆕 Created new session: ${sessionId}`);
        } else {
            session = activeSession;
            session.participants = participants;
            session.dataSource = dataSource;
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
        
        return {
            success: true,
            sessionId: session.sessionId,
            sessionStartTime: session.startTime
        };
    }
    
    async handleSessionEnd(data) {
        const { meetingId, reason } = data;
        
        console.log(`🚪 Ending session for ${meetingId}: ${reason}`);
        
        // Find active session for this meeting
        const activeSession = Array.from(this.activeSessions.values())
            .find(s => s.meetingId === meetingId && !s.endTime);
            
        if (activeSession) {
            // End the session
            activeSession.endTime = Date.now();
            activeSession.duration = activeSession.endTime - activeSession.startTime;
            activeSession.endReason = reason;
            
            console.log(`✅ Session ${activeSession.sessionId} ended (${Math.round(activeSession.duration / 60000)}m)`);
            
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
                }
            }
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
            
            console.log(`📊 Minute ${minute} logged for session ${activeSession.sessionId}`);
        }
        
        return { success: true };
    }
    
    getCurrentState() {
        return this.currentState;
    }
    
    getDashboardData() {
        // Convert meetings to dashboard format
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
            
            dashboardData.push({
                meeting: {
                    meetingId: meeting.meetingId,
                    title: meeting.title,
                    url: meeting.url,
                    startTime: meeting.startTime,
                    endTime: meeting.endTime,
                    status: meeting.status,
                    participants: Array.from(allParticipants.values())
                },
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
                })),
                sessionCount: meeting.sessionCount,
                totalDuration: meeting.totalDuration,
                isActive: meeting.status === 'active'
            });
        }
        
        // Sort by start time, newest first
        dashboardData.sort((a, b) => (b.meeting.startTime || 0) - (a.meeting.startTime || 0));
        
        return dashboardData;
    }
    
    forceEndAllMeetings() {
        console.log(`🧹 Force ending ${this.activeSessions.size} active sessions`);
        
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
}

// Initialize the tracker
const tracker = new MeetingTrackerV2();
tracker.init();

// Global access for debugging
self.meetingTracker = tracker;
