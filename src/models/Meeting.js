// Meeting Model - Represents a complete meeting (collection of sessions)
class Meeting {
    constructor(meetingId, title, url) {
        this.meetingId = meetingId; // Primary key - the Google Meet room ID
        this.title = title || meetingId;
        this.url = url;
        this.createdAt = Date.now();
        this.updatedAt = Date.now();
        
        // Derived fields (calculated from sessions)
        this.totalDuration = 0; // Sum of all session durations
        this.sessionCount = 0;
        this.startTime = null; // First session start time
        this.endTime = null; // Last session end time
        this.status = 'active'; // active, completed
        
        // Participants (unique across all sessions)
        this.participants = new Map(); // participantId -> participant info
        this.participantJoinCounts = new Map(); // participantId -> number of sessions joined
    }
    
    // Update meeting from sessions data
    updateFromSessions(sessions) {
        this.updatedAt = Date.now();
        
        if (sessions.length === 0) {
            this.sessionCount = 0;
            this.totalDuration = 0;
            this.startTime = null;
            this.endTime = null;
            this.status = 'completed';
            return;
        }
        
        // Sort sessions by start time
        const sortedSessions = sessions.sort((a, b) => a.startTime - b.startTime);
        
        // Calculate aggregated values
        this.sessionCount = sessions.length;
        this.startTime = sortedSessions[0].startTime;
        this.totalDuration = sessions.reduce((total, session) => {
            return total + (session.duration || 0);
        }, 0);
        
        // Find latest end time or mark as active if any session is ongoing
        const ongoingSessions = sessions.filter(s => !s.endTime);
        if (ongoingSessions.length > 0) {
            this.status = 'active';
            this.endTime = null;
        } else {
            this.status = 'completed';
            const endTimes = sessions.map(s => s.endTime).filter(t => t);
            this.endTime = endTimes.length > 0 ? Math.max(...endTimes) : null;
        }
        
        // Aggregate unique participants
        this.participants.clear();
        this.participantJoinCounts.clear();
        
        sessions.forEach(session => {
            if (session.participants && Array.isArray(session.participants)) {
                session.participants.forEach(participant => {
                    const id = participant.id || participant.name;
                    if (id) {
                        this.participants.set(id, {
                            id: id,
                            name: participant.name,
                            email: participant.email,
                            avatarUrl: participant.avatarUrl
                        });
                        
                        // Count join sessions
                        const currentCount = this.participantJoinCounts.get(id) || 0;
                        this.participantJoinCounts.set(id, currentCount + 1);
                    }
                });
            }
        });
    }
    
    // Convert to plain object for storage
    toJSON() {
        return {
            meetingId: this.meetingId,
            title: this.title,
            url: this.url,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            totalDuration: this.totalDuration,
            sessionCount: this.sessionCount,
            startTime: this.startTime,
            endTime: this.endTime,
            status: this.status,
            participants: Array.from(this.participants.values()),
            participantJoinCounts: Object.fromEntries(this.participantJoinCounts)
        };
    }
    
    // Create from stored data
    static fromJSON(data) {
        const meeting = new Meeting(data.meetingId, data.title, data.url);
        meeting.createdAt = data.createdAt;
        meeting.updatedAt = data.updatedAt;
        meeting.totalDuration = data.totalDuration || 0;
        meeting.sessionCount = data.sessionCount || 0;
        meeting.startTime = data.startTime;
        meeting.endTime = data.endTime;
        meeting.status = data.status || 'completed';
        
        // Restore participants
        if (data.participants) {
            data.participants.forEach(p => {
                meeting.participants.set(p.id, p);
            });
        }
        
        // Restore participant join counts
        if (data.participantJoinCounts) {
            Object.entries(data.participantJoinCounts).forEach(([id, count]) => {
                meeting.participantJoinCounts.set(id, count);
            });
        }
        
        return meeting;
    }
}

export default Meeting;
