// Meeting Manager - Handles meeting lifecycle and session management
class MeetingManager {
    constructor(storageManager) {
        this.storage = storageManager;
        this.activeMeetings = new Map(); // meetingId -> Meeting object
        this.activeSessions = new Map(); // sessionId -> Session object
        this.meetingToCurrentSession = new Map(); // meetingId -> current sessionId
    }
    
    // Create or get existing meeting
    async getOrCreateMeeting(meetingId, title, url) {
        // Check if meeting is already in memory
        if (this.activeMeetings.has(meetingId)) {
            return this.activeMeetings.get(meetingId);
        }
        
        // Try to load from storage
        let meeting = await this.storage.getMeeting(meetingId);
        
        if (!meeting) {
            // Create new meeting
            meeting = new Meeting(meetingId, title, url);
            console.log(`✨ Created new meeting: ${meetingId}`);
        } else {
            console.log(`🔄 Loaded existing meeting: ${meetingId}`);
        }
        
        // Add to active meetings
        this.activeMeetings.set(meetingId, meeting);
        
        return meeting;
    }
    
    // Start a new session for a meeting
    async startSession(meetingId, title, url) {
        console.log(`🚀 Starting new session for meeting: ${meetingId}`);
        
        // End any existing session for this meeting
        await this.endCurrentSession(meetingId, 'new_session_started');
        
        // Get or create the meeting
        const meeting = await this.getOrCreateMeeting(meetingId, title, url);
        
        // Create new session
        const session = new Session(meetingId, title, url);
        
        // Store session references
        this.activeSessions.set(session.sessionId, session);
        this.meetingToCurrentSession.set(meetingId, session.sessionId);
        
        console.log(`✅ Session ${session.sessionId} started for meeting ${meetingId}`);
        
        return session;
    }
    
    // Update participants in current session
    async updateSessionParticipants(meetingId, participants, dataSource = 'unknown') {
        const currentSessionId = this.meetingToCurrentSession.get(meetingId);
        
        if (!currentSessionId) {
            console.log(`⚠️ No active session for meeting ${meetingId}, creating new session`);
            const session = await this.startSession(meetingId, meetingId, null);
            session.updateParticipants(participants, dataSource);
            return session;
        }
        
        const session = this.activeSessions.get(currentSessionId);
        if (!session) {
            console.error(`❌ Session ${currentSessionId} not found in memory`);
            return null;
        }
        
        session.updateParticipants(participants, dataSource);
        console.log(`👥 Updated ${participants.length} participants in session ${currentSessionId}`);
        
        return session;
    }
    
    // Add minute-by-minute data to current session
    async addSessionMinuteData(meetingId, minute, participants) {
        const currentSessionId = this.meetingToCurrentSession.get(meetingId);
        
        if (!currentSessionId) {
            console.warn(`⚠️ No active session for meeting ${meetingId} to log minute data`);
            return;
        }
        
        const session = this.activeSessions.get(currentSessionId);
        if (!session) {
            console.error(`❌ Session ${currentSessionId} not found in memory`);
            return;
        }
        
        session.addMinuteData(minute, participants);
        console.log(`⏰ Logged minute ${minute} for session ${currentSessionId}`);
    }
    
    // End current session for a meeting
    async endCurrentSession(meetingId, reason = 'session_ended') {
        const currentSessionId = this.meetingToCurrentSession.get(meetingId);
        
        if (!currentSessionId) {
            console.log(`📝 No active session to end for meeting ${meetingId}`);
            return null;
        }
        
        const session = this.activeSessions.get(currentSessionId);
        if (!session) {
            console.error(`❌ Session ${currentSessionId} not found in memory`);
            return null;
        }
        
        // End the session
        session.end(reason);
        
        // Save session to storage
        await this.storage.saveSession(session);
        
        // Remove from active tracking
        this.activeSessions.delete(currentSessionId);
        this.meetingToCurrentSession.delete(meetingId);
        
        console.log(`✅ Session ${currentSessionId} ended and saved`);
        
        // Update meeting totals
        await this.updateMeetingFromSessions(meetingId);
        
        return session;
    }
    
    // Update meeting totals from all its sessions
    async updateMeetingFromSessions(meetingId) {
        const meeting = await this.storage.updateMeetingFromSessions(meetingId);
        
        if (meeting) {
            // Update in-memory meeting
            this.activeMeetings.set(meetingId, meeting);
            
            // If meeting is completed, remove from active meetings
            if (meeting.status === 'completed') {
                this.activeMeetings.delete(meetingId);
                console.log(`🏁 Meeting ${meetingId} completed and removed from active meetings`);
            }
        }
        
        return meeting;
    }
    
    // Get current session for a meeting
    getCurrentSession(meetingId) {
        const currentSessionId = this.meetingToCurrentSession.get(meetingId);
        return currentSessionId ? this.activeSessions.get(currentSessionId) : null;
    }
    
    // Get current meeting state
    getCurrentMeetingState(meetingId) {
        const meeting = this.activeMeetings.get(meetingId);
        const session = this.getCurrentSession(meetingId);
        
        if (!meeting && !session) {
            return null;
        }
        
        return {
            meeting: meeting,
            currentSession: session,
            isActive: session && session.isActive(),
            totalDuration: meeting ? meeting.totalDuration : 0,
            currentSessionDuration: session ? session.getCurrentDuration() : 0
        };
    }
    
    // Get all active sessions
    getAllActiveSessions() {
        return Array.from(this.activeSessions.values())
            .map(session => session.getSummary())
            .filter(summary => summary.isActive);
    }
    
    // Force end all sessions (cleanup)
    async endAllSessions(reason = 'force_cleanup') {
        console.log(`🧹 Force ending ${this.activeSessions.size} active sessions`);
        
        const endPromises = Array.from(this.meetingToCurrentSession.keys())
            .map(meetingId => this.endCurrentSession(meetingId, reason));
        
        const results = await Promise.allSettled(endPromises);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        
        console.log(`✅ Successfully ended ${successful}/${results.length} sessions`);
        
        return { ended: successful, total: results.length };
    }
    
    // Get meeting with sessions (for dashboard)
    async getMeetingWithSessions(meetingId) {
        return await this.storage.getMeetingWithSessions(meetingId);
    }
    
    // Get dashboard data
    async getDashboardData(options = {}) {
        return await this.storage.getDashboardData(options);
    }
    
    // Get statistics
    async getStats() {
        const stats = await this.storage.getStats();
        
        // Add current active session info
        stats.activeSessions = this.activeSessions.size;
        stats.activeMeetingsInMemory = this.activeMeetings.size;
        
        return stats;
    }
}

// Import dependencies (would be handled by build system)
// import Meeting from '../models/Meeting.js';
// import Session from '../models/Session.js';

export default MeetingManager;
