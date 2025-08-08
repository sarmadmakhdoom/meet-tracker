// Session Model - Represents a single join/leave cycle within a meeting
class Session {
    constructor(meetingId, title, url) {
        this.sessionId = this.generateSessionId(); // Unique session ID
        this.meetingId = meetingId; // Foreign key to Meeting
        this.title = title || meetingId;
        this.url = url;
        
        // Session timing
        this.startTime = Date.now();
        this.endTime = null;
        this.duration = null; // Calculated when session ends
        
        // Session data
        this.participants = []; // Participants in this specific session
        this.participantMinutes = []; // Minute-by-minute participant tracking
        this.endReason = null; // Why session ended (user_left, navigation, etc.)
        
        // Metadata
        this.dataSource = 'unknown'; // dom, network, hybrid
        this.createdAt = Date.now();
        this.updatedAt = Date.now();
    }
    
    // Generate unique session ID
    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `session_${timestamp}_${random}`;
    }
    
    // Update participants for this session
    updateParticipants(participants, dataSource = 'unknown') {
        this.participants = participants || [];
        this.dataSource = dataSource;
        this.updatedAt = Date.now();
    }
    
    // Add minute-by-minute tracking data
    addMinuteData(minute, participants) {
        const existingIndex = this.participantMinutes.findIndex(m => m.minute === minute);
        const minuteData = {
            minute: minute,
            timestamp: Date.now(),
            participants: participants || [],
            participantCount: (participants || []).length
        };
        
        if (existingIndex >= 0) {
            this.participantMinutes[existingIndex] = minuteData;
        } else {
            this.participantMinutes.push(minuteData);
        }
        
        this.updatedAt = Date.now();
    }
    
    // End the session
    end(reason = 'unknown') {
        this.endTime = Date.now();
        this.duration = this.endTime - this.startTime;
        this.endReason = reason;
        this.updatedAt = Date.now();
        
        console.log(`Session ${this.sessionId} ended:`, {
            meetingId: this.meetingId,
            duration: Math.round(this.duration / 60000),
            reason: reason,
            participantCount: this.participants.length
        });
    }
    
    // Check if session is currently active
    isActive() {
        return this.endTime === null;
    }
    
    // Get current duration (even if ongoing)
    getCurrentDuration() {
        if (this.duration !== null) {
            return this.duration; // Completed session
        }
        return Date.now() - this.startTime; // Ongoing session
    }
    
    // Convert to plain object for storage
    toJSON() {
        return {
            sessionId: this.sessionId,
            meetingId: this.meetingId,
            title: this.title,
            url: this.url,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            participants: this.participants,
            participantMinutes: this.participantMinutes,
            endReason: this.endReason,
            dataSource: this.dataSource,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
    
    // Create from stored data
    static fromJSON(data) {
        const session = Object.create(Session.prototype);
        Object.assign(session, data);
        return session;
    }
    
    // Get session summary for display
    getSummary() {
        const duration = this.getCurrentDuration();
        return {
            sessionId: this.sessionId,
            meetingId: this.meetingId,
            title: this.title,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: duration,
            durationMinutes: Math.round(duration / 60000),
            participantCount: this.participants.length,
            isActive: this.isActive(),
            endReason: this.endReason,
            dataSource: this.dataSource
        };
    }
}

export default Session;
