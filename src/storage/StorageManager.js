// New Storage Manager with proper Meeting-Session relationship
class StorageManager {
    constructor() {
        this.dbName = 'MeetingTrackerDB_v3'; // New database version
        this.dbVersion = 1;
        this.db = null;
    }
    
    // Initialize database with new schema
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('❌ Failed to open database:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ Database initialized successfully');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('🔄 Creating new database schema...');
                
                // Meetings table (primary entities)
                if (!db.objectStoreNames.contains('meetings')) {
                    const meetingStore = db.createObjectStore('meetings', { keyPath: 'meetingId' });
                    meetingStore.createIndex('status', 'status', { unique: false });
                    meetingStore.createIndex('startTime', 'startTime', { unique: false });
                    meetingStore.createIndex('endTime', 'endTime', { unique: false });
                    meetingStore.createIndex('date', 'date', { unique: false }); // YYYY-MM-DD format
                    console.log('✅ Created meetings store');
                }
                
                // Sessions table (related to meetings via meetingId)
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
                    sessionStore.createIndex('meetingId', 'meetingId', { unique: false }); // Foreign key
                    sessionStore.createIndex('startTime', 'startTime', { unique: false });
                    sessionStore.createIndex('endTime', 'endTime', { unique: false });
                    sessionStore.createIndex('date', 'date', { unique: false });
                    sessionStore.createIndex('active', 'active', { unique: false }); // For finding active sessions
                    console.log('✅ Created sessions store');
                }
                
                // Participants table (aggregated data for analytics)
                if (!db.objectStoreNames.contains('participants')) {
                    const participantStore = db.createObjectStore('participants', { keyPath: 'participantId' });
                    participantStore.createIndex('name', 'name', { unique: false });
                    participantStore.createIndex('email', 'email', { unique: false });
                    participantStore.createIndex('totalMeetings', 'totalMeetings', { unique: false });
                    participantStore.createIndex('totalTime', 'totalTime', { unique: false });
                    console.log('✅ Created participants store');
                }
                
                // Session minutes (detailed minute-by-minute data)
                if (!db.objectStoreNames.contains('sessionMinutes')) {
                    const minutesStore = db.createObjectStore('sessionMinutes', { keyPath: ['sessionId', 'minute'] });
                    minutesStore.createIndex('sessionId', 'sessionId', { unique: false });
                    minutesStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('✅ Created session minutes store');
                }
                
                console.log('✅ Database schema created successfully');
            };
        });
    }
    
    // MEETING OPERATIONS
    
    async saveMeeting(meeting) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetings'], 'readwrite');
            const store = transaction.objectStore('meetings');
            
            // Add date field for indexing
            const meetingData = {
                ...meeting.toJSON(),
                date: meeting.startTime ? new Date(meeting.startTime).toISOString().split('T')[0] : null
            };
            
            store.put(meetingData);
            
            transaction.oncomplete = () => {
                console.log(`✅ Meeting ${meeting.meetingId} saved`);
                resolve();
            };
            
            transaction.onerror = () => {
                console.error(`❌ Failed to save meeting ${meeting.meetingId}:`, transaction.error);
                reject(transaction.error);
            };
        });
    }
    
    async getMeeting(meetingId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetings'], 'readonly');
            const store = transaction.objectStore('meetings');
            const request = store.get(meetingId);
            
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? Meeting.fromJSON(result) : null);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    async getAllMeetings(options = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetings'], 'readonly');
            const store = transaction.objectStore('meetings');
            
            let request;
            if (options.dateRange) {
                const index = store.index('date');
                const keyRange = IDBKeyRange.bound(options.dateRange.start, options.dateRange.end);
                request = index.getAll(keyRange);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => {
                let meetings = request.result.map(data => Meeting.fromJSON(data));
                
                // Apply additional filters
                if (options.status) {
                    meetings = meetings.filter(m => m.status === options.status);
                }
                
                // Sort by start time, newest first
                meetings.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
                
                // Apply limit
                if (options.limit) {
                    meetings = meetings.slice(0, options.limit);
                }
                
                resolve(meetings);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // SESSION OPERATIONS
    
    async saveSession(session) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions', 'sessionMinutes'], 'readwrite');
            const sessionStore = transaction.objectStore('sessions');
            const minutesStore = transaction.objectStore('sessionMinutes');
            
            // Prepare session data
            const sessionData = {
                ...session.toJSON(),
                date: new Date(session.startTime).toISOString().split('T')[0],
                active: session.isActive()
            };
            
            // Remove participant minutes from main session object
            const { participantMinutes, ...sessionWithoutMinutes } = sessionData;
            
            // Save session
            sessionStore.put(sessionWithoutMinutes);
            
            // Save participant minutes separately
            if (participantMinutes && participantMinutes.length > 0) {
                participantMinutes.forEach(minute => {
                    minutesStore.put({
                        sessionId: session.sessionId,
                        minute: minute.minute,
                        timestamp: minute.timestamp,
                        participants: minute.participants,
                        participantCount: minute.participantCount
                    });
                });
            }
            
            transaction.oncomplete = () => {
                console.log(`✅ Session ${session.sessionId} saved`);
                resolve();
            };
            
            transaction.onerror = () => {
                console.error(`❌ Failed to save session ${session.sessionId}:`, transaction.error);
                reject(transaction.error);
            };
        });
    }
    
    async getSession(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions', 'sessionMinutes'], 'readonly');
            const sessionStore = transaction.objectStore('sessions');
            const minutesStore = transaction.objectStore('sessionMinutes');
            
            const sessionRequest = sessionStore.get(sessionId);
            
            sessionRequest.onsuccess = () => {
                const sessionData = sessionRequest.result;
                if (!sessionData) {
                    resolve(null);
                    return;
                }
                
                // Get session minutes
                const minutesRequest = minutesStore.index('sessionId').getAll(sessionId);
                
                minutesRequest.onsuccess = () => {
                    const minutes = minutesRequest.result;
                    
                    // Reconstruct session with minutes
                    const completeSessionData = {
                        ...sessionData,
                        participantMinutes: minutes
                    };
                    
                    resolve(Session.fromJSON(completeSessionData));
                };
                
                minutesRequest.onerror = () => {
                    reject(minutesRequest.error);
                };
            };
            
            sessionRequest.onerror = () => {
                reject(sessionRequest.error);
            };
        });
    }
    
    async getSessionsForMeeting(meetingId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const index = store.index('meetingId');
            const request = index.getAll(meetingId);
            
            request.onsuccess = () => {
                const sessions = request.result.map(data => Session.fromJSON(data));
                // Sort by start time
                sessions.sort((a, b) => a.startTime - b.startTime);
                resolve(sessions);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    async getActiveSessions() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const index = store.index('active');
            const request = index.getAll(true);
            
            request.onsuccess = () => {
                const sessions = request.result.map(data => Session.fromJSON(data));
                resolve(sessions);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // COMBINED OPERATIONS
    
    // Get meeting with all its sessions (for complete view)
    async getMeetingWithSessions(meetingId) {
        const [meeting, sessions] = await Promise.all([
            this.getMeeting(meetingId),
            this.getSessionsForMeeting(meetingId)
        ]);
        
        if (meeting) {
            // Update meeting with latest session data
            meeting.updateFromSessions(sessions);
        }
        
        return {
            meeting: meeting,
            sessions: sessions
        };
    }
    
    // Update meeting from its sessions (recalculate totals)
    async updateMeetingFromSessions(meetingId) {
        const sessions = await this.getSessionsForMeeting(meetingId);
        let meeting = await this.getMeeting(meetingId);
        
        if (!meeting && sessions.length > 0) {
            // Create meeting if it doesn't exist but has sessions
            const firstSession = sessions[0];
            meeting = new Meeting(meetingId, firstSession.title, firstSession.url);
        }
        
        if (meeting) {
            meeting.updateFromSessions(sessions);
            await this.saveMeeting(meeting);
        }
        
        return meeting;
    }
    
    // Get dashboard data (meetings with session summaries)
    async getDashboardData(options = {}) {
        const meetings = await this.getAllMeetings(options);
        
        // For each meeting, get basic session info
        const meetingsWithSessions = await Promise.all(
            meetings.map(async (meeting) => {
                const sessions = await this.getSessionsForMeeting(meeting.meetingId);
                
                // Update meeting totals from sessions
                meeting.updateFromSessions(sessions);
                
                return {
                    meeting: meeting,
                    sessions: sessions.map(s => s.getSummary()),
                    sessionCount: sessions.length,
                    totalDuration: meeting.totalDuration,
                    isActive: meeting.status === 'active'
                };
            })
        );
        
        return meetingsWithSessions;
    }
    
    // UTILITY OPERATIONS
    
    async getStats() {
        const [meetings, sessions] = await Promise.all([
            this.getAllMeetings(),
            this.getAllSessions()
        ]);
        
        const totalMeetings = meetings.length;
        const totalSessions = sessions.length;
        const completedMeetings = meetings.filter(m => m.status === 'completed');
        const totalDuration = meetings.reduce((sum, m) => sum + (m.totalDuration || 0), 0);
        const averageDuration = totalMeetings > 0 ? totalDuration / totalMeetings : 0;
        
        return {
            totalMeetings,
            totalSessions,
            completedMeetings: completedMeetings.length,
            activeMeetings: totalMeetings - completedMeetings.length,
            totalDuration,
            averageDuration,
            averageSessionsPerMeeting: totalMeetings > 0 ? totalSessions / totalMeetings : 0
        };
    }
    
    async getAllSessions(options = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const request = store.getAll();
            
            request.onsuccess = () => {
                let sessions = request.result.map(data => Session.fromJSON(data));
                
                // Sort by start time, newest first
                sessions.sort((a, b) => b.startTime - a.startTime);
                
                if (options.limit) {
                    sessions = sessions.slice(0, options.limit);
                }
                
                resolve(sessions);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // Clean up old data (optional)
    async cleanupOldData(maxAge = 90 * 24 * 60 * 60 * 1000) {
        const cutoffDate = Date.now() - maxAge;
        
        // Get old meetings
        const allMeetings = await this.getAllMeetings();
        const oldMeetings = allMeetings.filter(m => 
            m.startTime && m.startTime < cutoffDate && m.status === 'completed'
        );
        
        console.log(`🧹 Cleaning up ${oldMeetings.length} old meetings`);
        
        // Delete old meetings and their sessions
        for (const meeting of oldMeetings) {
            await this.deleteMeeting(meeting.meetingId);
        }
        
        return { deleted: oldMeetings.length };
    }
    
    async deleteMeeting(meetingId) {
        const transaction = this.db.transaction(['meetings', 'sessions', 'sessionMinutes'], 'readwrite');
        const meetingStore = transaction.objectStore('meetings');
        const sessionStore = transaction.objectStore('sessions');
        const minutesStore = transaction.objectStore('sessionMinutes');
        
        // Delete meeting
        meetingStore.delete(meetingId);
        
        // Delete all sessions for this meeting
        const sessionIndex = sessionStore.index('meetingId');
        const sessionRequest = sessionIndex.openCursor(IDBKeyRange.only(meetingId));
        
        sessionRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const sessionId = cursor.value.sessionId;
                
                // Delete session
                cursor.delete();
                
                // Delete session minutes
                const minutesIndex = minutesStore.index('sessionId');
                const minutesRequest = minutesIndex.openCursor(IDBKeyRange.only(sessionId));
                minutesRequest.onsuccess = (event) => {
                    const minutesCursor = event.target.result;
                    if (minutesCursor) {
                        minutesCursor.delete();
                        minutesCursor.continue();
                    }
                };
                
                cursor.continue();
            }
        };
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log(`✅ Meeting ${meetingId} and all related data deleted`);
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

// Import the models (assuming they're available)
// import Meeting from '../models/Meeting.js';
// import Session from '../models/Session.js';

export default StorageManager;
