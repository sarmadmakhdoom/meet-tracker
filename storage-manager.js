// Enhanced Storage Manager for Google Meet Tracker
// Uses IndexedDB for better performance and larger storage capacity

class MeetingStorageManager {
    constructor() {
        this.dbName = 'MeetingTrackerDB';
        this.dbVersion = 2; // Updated version for new schema
        this.db = null;
    }

    // Initialize the database
    async init() {
        return new Promise((resolve, reject) => {
            try {
                console.log(`💾 IndexedDB: Opening database "${this.dbName}" version ${this.dbVersion}`);
                
                // Check if IndexedDB is available first
                if (!self.indexedDB) {
                    const error = new Error('IndexedDB is not available in this context');
                    console.error('❌ IndexedDB not available:', error);
                    reject(error);
                    return;
                }
                
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = (event) => {
                    const error = request.error || event.target?.error || new Error('Unknown IndexedDB error');
                    console.error('❌ IndexedDB open error:');
                    console.error('Error name:', error.name || 'Unknown');
                    console.error('Error message:', error.message || 'No message');
                    console.error('Error code:', error.code || 'No code');
                    console.error('Request readyState:', request.readyState);
                    console.error('Full error:', error);
                    reject(error);
                };
                
                request.onsuccess = (event) => {
                    try {
                        this.db = request.result;
                        console.log(`✅ IndexedDB: Successfully opened database "${this.dbName}"`);
                        console.log('📋 Available object stores:', Array.from(this.db.objectStoreNames));
                        resolve();
                    } catch (successError) {
                        console.error('❌ IndexedDB success handler error:', successError);
                        reject(successError);
                    }
                };
                
                request.onupgradeneeded = (event) => {
                    try {
                        console.log('🔄 IndexedDB: Database upgrade needed');
                        const db = event.target.result;
                        
                        console.log('📊 Current version:', event.oldVersion, '-> New version:', event.newVersion);
                        console.log('📋 Existing stores:', Array.from(db.objectStoreNames));
                        
                        // Create meeting sessions store (NEW: session-based model)
                        if (!db.objectStoreNames.contains('meetingSessions')) {
                            console.log('🆕 Creating meetingSessions object store...');
                            const sessionStore = db.createObjectStore('meetingSessions', { keyPath: 'sessionId' });
                            sessionStore.createIndex('meetingId', 'meetingId', { unique: false });
                            sessionStore.createIndex('startTime', 'startTime', { unique: false });
                            sessionStore.createIndex('endTime', 'endTime', { unique: false });
                            sessionStore.createIndex('date', 'date', { unique: false });
                            sessionStore.createIndex('participants', 'participants', { unique: false, multiEntry: true });
                            console.log('✅ Created meetingSessions store with indexes');
                        }
                        
                        // Keep meetings store for backward compatibility but mark as deprecated
                        if (!db.objectStoreNames.contains('meetings')) {
                            console.log('📝 Creating meetings object store (deprecated - keeping for compatibility)...');
                            const meetingStore = db.createObjectStore('meetings', { keyPath: 'id' });
                            meetingStore.createIndex('startTime', 'startTime', { unique: false });
                            meetingStore.createIndex('endTime', 'endTime', { unique: false });
                            meetingStore.createIndex('date', 'date', { unique: false });
                            meetingStore.createIndex('participants', 'participants', { unique: false, multiEntry: true });
                            console.log('✅ Created meetings store with indexes (deprecated)');
                        }
                        
                        // Create participants store for analytics
                        if (!db.objectStoreNames.contains('participants')) {
                            console.log('👥 Creating participants object store...');
                            const participantStore = db.createObjectStore('participants', { keyPath: 'name' });
                            participantStore.createIndex('meetingCount', 'meetingCount', { unique: false });
                            participantStore.createIndex('totalTime', 'totalTime', { unique: false });
                            console.log('✅ Created participants store with indexes');
                        }
                        
                        // Create meeting minutes store (separate for better performance)
                        if (!db.objectStoreNames.contains('meetingMinutes')) {
                            console.log('⏰ Creating meetingMinutes object store...');
                            const minutesStore = db.createObjectStore('meetingMinutes', { keyPath: ['meetingId', 'timestamp'] });
                            minutesStore.createIndex('meetingId', 'meetingId', { unique: false });
                            minutesStore.createIndex('timestamp', 'timestamp', { unique: false });
                            console.log('✅ Created meetingMinutes store with indexes');
                        }
                        
                        // Create settings store
                        if (!db.objectStoreNames.contains('settings')) {
                            console.log('⚙️ Creating settings object store...');
                            db.createObjectStore('settings', { keyPath: 'key' });
                            console.log('✅ Created settings store');
                        }
                        
                        console.log('✅ IndexedDB upgrade completed successfully');
                        
                    } catch (upgradeError) {
                        console.error('❌ IndexedDB upgrade error:', upgradeError);
                        reject(upgradeError);
                    }
                };
                
                request.onblocked = (event) => {
                    console.warn('⚠️ IndexedDB upgrade blocked - another tab may be open');
                };
                
            } catch (initError) {
                console.error('❌ IndexedDB initialization error:', initError);
                reject(initError);
            }
        });
    }

    // Save a meeting with optimized structure
    async saveMeeting(meeting) {
        return new Promise(async (resolve, reject) => {
            try {
                // Handle participant updates safely
                const participantUpdates = [];
                
                // Only process participants if they exist and are valid
                if (meeting.participants && Array.isArray(meeting.participants)) {
                    for (const participant of meeting.participants) {
                        // Extract participant name safely
                        let participantName = '';
                        if (typeof participant === 'string') {
                            participantName = participant;
                        } else if (participant && typeof participant === 'object') {
                            participantName = participant.name || participant.displayName || participant.id || 'Unknown';
                        }
                        
                        // Skip if we couldn't extract a valid name
                        if (!participantName || participantName === 'Unknown' || participantName === 'undefined') {
                            continue;
                        }
                        
                        try {
                            const existing = await this.getParticipant(participantName);
                            participantUpdates.push({
                                name: participantName,
                                meetingCount: (existing?.meetingCount || 0) + 1,
                                totalTime: (existing?.totalTime || 0) + (meeting.endTime ? (meeting.endTime - meeting.startTime) : 0),
                                lastMeeting: meeting.startTime,
                                meetings: [...(existing?.meetings || []), meeting.id]
                            });
                        } catch (participantError) {
                            console.warn(`⚠️ Error processing participant ${participantName}:`, participantError);
                            // Continue with other participants even if one fails
                        }
                    }
                }
                
                // Now start the transaction with all data ready
                const transaction = this.db.transaction(['meetings', 'meetingMinutes', 'participants'], 'readwrite');
                const meetingStore = transaction.objectStore('meetings');
                const minutesStore = transaction.objectStore('meetingMinutes');
                const participantStore = transaction.objectStore('participants');

                // Optimize meeting object structure
                const optimizedMeeting = {
                    ...meeting,
                    date: new Date(meeting.startTime).toISOString().split('T')[0], // Add date index
                    duration: meeting.endTime ? (meeting.endTime - meeting.startTime) : null,
                    participantCount: meeting.participants ? meeting.participants.length : 0
                };

                // Remove minutes from main meeting object to reduce size
                const { minutes, ...meetingWithoutMinutes } = optimizedMeeting;
                
                // Save main meeting record
                meetingStore.put(meetingWithoutMinutes);

                // Save meeting minutes separately for better performance
                if (minutes && minutes.length > 0) {
                    minutes.forEach(minute => {
                        minutesStore.put({
                            meetingId: meeting.id,
                            timestamp: minute.timestamp,
                            participants: minute.participants
                        });
                    });
                }

                // Update participant analytics with pre-computed data
                participantUpdates.forEach(participantData => {
                    participantStore.put(participantData);
                });

                transaction.oncomplete = () => {
                    console.log('✅ Meeting saved to IndexedDB:', meeting.id);
                    resolve();
                };
                transaction.onerror = () => {
                    console.error('❌ Error saving meeting to IndexedDB:', transaction.error);
                    reject(transaction.error);
                };
            } catch (error) {
                console.error('❌ Error preparing meeting data:', error);
                reject(error);
            }
        });
    }

    // FIXED: Get meetings with proper session-based data structure
    async getMeetings(options = {}) {
        console.log('📊 getMeetings called - redirecting to session-based data');
        
        try {
            // Get all sessions and convert to meeting-like format for dashboard compatibility
            const sessions = await this.getAllSessions(options);
            
            // Convert sessions to meeting format that dashboard expects
            const meetings = sessions.map(session => {
                // Calculate duration properly
                const duration = session.endTime ? 
                    (session.endTime - session.startTime) : 
                    (session.duration || (Date.now() - session.startTime));
                    
                return {
                    // Dashboard expects these fields
                    id: session.sessionId,
                    meetingId: session.meetingId,
                    title: session.title || session.meetingId,
                    startTime: session.startTime,
                    endTime: session.endTime,
                    duration: duration,
                    participants: session.participants || [],
                    url: session.url,
                    
                    // Session-specific fields
                    sessionId: session.sessionId,
                    isSession: true,
                    isActive: !session.endTime,
                    dataSource: session.dataSource || 'unknown',
                    endReason: session.endReason,
                    
                    // Computed fields
                    participantCount: session.participants ? session.participants.length : 0,
                    durationMinutes: Math.round(duration / 60000),
                    date: new Date(session.startTime).toISOString().split('T')[0]
                };
            });
            
            console.log(`📊 Converted ${sessions.length} sessions to meeting format for dashboard`);
            return meetings;
            
        } catch (error) {
            console.error('❌ Error in getMeetings (session-based):', error);
            
            // Fallback to old meetings table if session approach fails
            console.log('🔄 Falling back to old meetings table...');
            return this.getOldMeetings(options);
        }
    }
    
    // Keep old meeting method as fallback
    async getOldMeetings(options = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetings'], 'readonly');
            const store = transaction.objectStore('meetings');
            
            let request;
            
            if (options.dateRange) {
                const keyRange = IDBKeyRange.bound(options.dateRange.start, options.dateRange.end);
                request = store.index('date').getAll(keyRange);
            } else if (options.participant) {
                request = store.index('participants').getAll(options.participant);
            } else {
                request = store.getAll();
            }

            request.onsuccess = () => {
                let meetings = request.result;
                
                // FIX: Add proper duration calculation for old meetings
                meetings = meetings.map(meeting => ({
                    ...meeting,
                    duration: meeting.endTime ? 
                        (meeting.endTime - meeting.startTime) : 
                        (meeting.duration || (Date.now() - meeting.startTime)),
                    isActive: !meeting.endTime,
                    durationMinutes: meeting.endTime ? 
                        Math.round((meeting.endTime - meeting.startTime) / 60000) : 
                        Math.round((Date.now() - meeting.startTime) / 60000)
                }));
                
                if (options.limit) {
                    meetings = meetings.slice(0, options.limit);
                }
                
                if (options.sortBy === 'duration') {
                    meetings.sort((a, b) => (b.duration || 0) - (a.duration || 0));
                }
                
                resolve(meetings);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    // Get meeting minutes for a specific meeting
    async getMeetingMinutes(meetingId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetingMinutes'], 'readonly');
            const store = transaction.objectStore('meetingMinutes');
            const request = store.index('meetingId').getAll(meetingId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get participant analytics
    async getParticipant(name) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['participants'], 'readonly');
            const store = transaction.objectStore('participants');
            const request = store.get(name);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Get storage statistics
    async getStorageStats() {
        const meetings = await this.getMeetings();
        const totalMeetings = meetings.length;
        const totalDuration = meetings.reduce((sum, m) => sum + (m.duration || 0), 0);
        
        return {
            totalMeetings,
            totalDuration,
            averageDuration: totalMeetings > 0 ? totalDuration / totalMeetings : 0,
            oldestMeeting: meetings.length > 0 ? Math.min(...meetings.map(m => m.startTime)) : null,
            newestMeeting: meetings.length > 0 ? Math.max(...meetings.map(m => m.startTime)) : null
        };
    }

    // Cleanup old data with more granular control - DISABLED TO PRESERVE ALL DATA
    async cleanupOldData(options = {}) {
        // DISABLED: Return without doing any cleanup to preserve all data
        console.log('🚫 Data cleanup disabled - preserving all meetings');
        return { deleted: 0, compressed: 0, message: 'Cleanup disabled to preserve all data' };
        
        /* ORIGINAL CODE DISABLED TO PRESERVE DATA:
        const {
            maxAge = 90 * 24 * 60 * 60 * 1000, // 90 days default
            maxMeetings = 1000, // Keep at most 1000 meetings
            compressOld = true // Compress meetings older than 30 days
        } = options;

        const cutoffDate = Date.now() - maxAge;
        const meetings = await this.getMeetings();
        
        // Sort by date, newest first
        meetings.sort((a, b) => b.startTime - a.startTime);
        
        const toDelete = [];
        const toCompress = [];

        meetings.forEach((meeting, index) => {
            if (meeting.startTime < cutoffDate || index >= maxMeetings) {
                toDelete.push(meeting.id);
            } else if (compressOld && meeting.startTime < (Date.now() - 30 * 24 * 60 * 60 * 1000)) {
                toCompress.push(meeting.id);
            }
        });

        // Delete old meetings and their minutes
        for (const meetingId of toDelete) {
            await this.deleteMeeting(meetingId);
        }

        // Compress old meetings (remove detailed minutes, keep summary)
        for (const meetingId of toCompress) {
            await this.compressMeeting(meetingId);
        }

        return { deleted: toDelete.length, compressed: toCompress.length };
        */
    }

    // Delete a meeting and all associated data
    async deleteMeeting(meetingId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetings', 'meetingMinutes'], 'readwrite');
            
            // Delete meeting
            transaction.objectStore('meetings').delete(meetingId);
            
            // Delete associated minutes
            const minutesStore = transaction.objectStore('meetingMinutes');
            const index = minutesStore.index('meetingId');
            const request = index.openCursor(IDBKeyRange.only(meetingId));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // Compress a meeting by removing detailed minutes
    async compressMeeting(meetingId) {
        // Get meeting and its minutes
        const meeting = await this.getMeeting(meetingId);
        const minutes = await this.getMeetingMinutes(meetingId);

        if (!meeting || !minutes.length) return;

        // Create compressed version with summary data only
        const compressedMeeting = {
            ...meeting,
            compressed: true,
            originalMinuteCount: minutes.length,
            participantSummary: this.summarizeParticipants(minutes)
        };

        // Save compressed meeting
        await this.saveMeeting(compressedMeeting);

        // Delete detailed minutes
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetingMinutes'], 'readwrite');
            const store = transaction.objectStore('meetingMinutes');
            const index = store.index('meetingId');
            const request = index.openCursor(IDBKeyRange.only(meetingId));

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // Summarize participants for compressed meetings
    summarizeParticipants(minutes) {
        const participantTime = {};
        
        minutes.forEach((minute, index) => {
            const nextMinute = minutes[index + 1];
            const duration = nextMinute ? (nextMinute.timestamp - minute.timestamp) : 60000; // 1 minute default
            
            minute.participants.forEach(participant => {
                participantTime[participant] = (participantTime[participant] || 0) + duration;
            });
        });

        return Object.entries(participantTime)
            .map(([name, time]) => ({ name, time }))
            .sort((a, b) => b.time - a.time);
    }

    // Get a single meeting
    async getMeeting(meetingId) {
        return new Promise((resolve, reject) => {
            try {
                // Validate inputs
                if (!meetingId) {
                    console.warn('⚠️ getMeeting called with no meetingId');
                    resolve(null);
                    return;
                }
                
                if (!this.db) {
                    console.error('❌ IndexedDB not initialized');
                    reject(new Error('IndexedDB not initialized'));
                    return;
                }
                
                console.log(`🔍 IndexedDB: Getting meeting ${meetingId}`);
                
                const transaction = this.db.transaction(['meetings'], 'readonly');
                const store = transaction.objectStore('meetings');
                const request = store.get(meetingId);

                request.onsuccess = () => {
                    const result = request.result;
                    console.log(`📋 IndexedDB: Found meeting ${meetingId}:`, result ? {
                        id: result.id,
                        title: result.title,
                        startTime: result.startTime,
                        endTime: result.endTime
                    } : 'null');
                    resolve(result);
                };
                
                request.onerror = () => {
                    const error = request.error;
                    console.error('❌ IndexedDB getMeeting error:', {
                        meetingId,
                        errorName: error?.name,
                        errorMessage: error?.message,
                        errorCode: error?.code
                    });
                    reject(error);
                };
                
                transaction.onerror = () => {
                    const error = transaction.error;
                    console.error('❌ IndexedDB transaction error:', {
                        meetingId,
                        errorName: error?.name,
                        errorMessage: error?.message,
                        errorCode: error?.code
                    });
                    reject(error);
                };
                
            } catch (error) {
                console.error('❌ IndexedDB getMeeting exception:', {
                    meetingId,
                    errorName: error.name,
                    errorMessage: error.message,
                    errorStack: error.stack?.substring(0, 200)
                });
                reject(error);
            }
        });
    }

    // Export data for backup
    async exportData(options = {}) {
        const meetings = await this.getMeetings();
        const participants = await this.getAllParticipants();
        
        const exportData = {
            meetings: meetings,
            participants: participants,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };

        if (options.includeMinutes) {
            // Include detailed minutes for recent meetings
            const recentMeetings = meetings; // Export ALL meetings, no limits
                
            exportData.meetingMinutes = {};
            for (const meeting of recentMeetings) {
                exportData.meetingMinutes[meeting.id] = await this.getMeetingMinutes(meeting.id);
            }
        }

        return exportData;
    }

    // Get all participants
    async getAllParticipants() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['participants'], 'readonly');
            const store = transaction.objectStore('participants');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // SESSION-BASED METHODS (NEW APPROACH)
    
    // Save a meeting session (each join/leave cycle is a separate session)
    async saveMeetingSession(session) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log(`💾 Saving meeting session:`, {
                    sessionId: session.sessionId,
                    meetingId: session.meetingId,
                    startTime: new Date(session.startTime).toISOString(),
                    endTime: session.endTime ? new Date(session.endTime).toISOString() : 'ongoing',
                    duration: session.endTime ? Math.round((session.endTime - session.startTime) / 60000) : 'ongoing'
                });
                
                // Check if database is available
                if (!this.db) {
                    console.error('❌ Database not available in saveMeetingSession');
                    console.log('🔄 Attempting to reinitialize database...');
                    try {
                        await this.init();
                        if (!this.db) {
                            console.error('❌ Database reinitialize failed in saveMeetingSession');
                            reject(new Error('Database not available after reinitialize'));
                            return;
                        }
                    } catch (initError) {
                        console.error('❌ Database reinitialize error in saveMeetingSession:', initError);
                        reject(initError);
                        return;
                    }
                }
                
                const transaction = this.db.transaction(['meetingSessions', 'meetingMinutes', 'participants'], 'readwrite');
                const sessionStore = transaction.objectStore('meetingSessions');
                const minutesStore = transaction.objectStore('meetingMinutes');
                const participantStore = transaction.objectStore('participants');

                // Optimize session object structure
                const optimizedSession = {
                    ...session,
                    date: new Date(session.startTime).toISOString().split('T')[0],
                    duration: session.endTime ? (session.endTime - session.startTime) : null,
                    participantCount: session.participants ? session.participants.length : 0
                };

                // Remove minutes from main session object to reduce size
                const { minuteLogs, ...sessionWithoutMinutes } = optimizedSession;
                
                // Save session record
                sessionStore.put(sessionWithoutMinutes);

                // Save session minutes separately
                if (minuteLogs && minuteLogs.length > 0) {
                    minuteLogs.forEach(minute => {
                        minutesStore.put({
                            meetingId: session.sessionId, // Use sessionId for minutes
                            timestamp: minute.timestamp,
                            participants: minute.participants,
                            sessionId: session.sessionId
                        });
                    });
                }

                // Update participant analytics
                if (session.participants && Array.isArray(session.participants)) {
                    session.participants.forEach(async (participant) => {
                        let participantName = '';
                        if (typeof participant === 'string') {
                            participantName = participant;
                        } else if (participant && typeof participant === 'object') {
                            participantName = participant.name || participant.displayName || participant.id || 'Unknown';
                        }
                        
                        if (!participantName || participantName === 'Unknown') return;
                        
                        try {
                            const existing = await this.getParticipant(participantName);
                            const sessionDuration = session.endTime ? (session.endTime - session.startTime) : 0;
                            
                            participantStore.put({
                                name: participantName,
                                meetingCount: (existing?.meetingCount || 0) + 1,
                                totalTime: (existing?.totalTime || 0) + sessionDuration,
                                lastMeeting: session.startTime,
                                sessions: [...(existing?.sessions || []), session.sessionId]
                            });
                        } catch (error) {
                            console.warn(`⚠️ Error updating participant ${participantName}:`, error);
                        }
                    });
                }

                transaction.oncomplete = () => {
                    console.log('✅ Meeting session saved to IndexedDB:', session.sessionId);
                    resolve();
                };
                transaction.onerror = () => {
                    console.error('❌ Error saving session to IndexedDB:', transaction.error);
                    reject(transaction.error);
                };
            } catch (error) {
                console.error('❌ Error preparing session data:', error);
                reject(error);
            }
        });
    }
    
    // Get all sessions for a specific meeting ID
    async getMeetingSessions(meetingId) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`🔍 Getting sessions for meeting: ${meetingId}`);
                
                // Check if database is available
                if (!this.db) {
                    console.error('❌ Database not available in getMeetingSessions');
                    console.log('🔄 Attempting to reinitialize database...');
                    // Try to reinitialize
                    this.init().then(() => {
                        if (!this.db) {
                            console.error('❌ Database reinitialize failed');
                            resolve([]); // Return empty array instead of rejecting
                            return;
                        }
                        // Retry the operation
                        this.getMeetingSessions(meetingId).then(resolve).catch(reject);
                    }).catch(error => {
                        console.error('❌ Database reinitialize error:', error);
                        resolve([]); // Return empty array instead of rejecting
                    });
                    return;
                }
                
                const transaction = this.db.transaction(['meetingSessions'], 'readonly');
                const store = transaction.objectStore('meetingSessions');
                const index = store.index('meetingId');
                const request = index.getAll(meetingId);

                request.onsuccess = () => {
                    const sessions = request.result;
                    console.log(`📋 Found ${sessions.length} sessions for meeting ${meetingId}`);
                    
                    // Sort sessions by start time
                    sessions.sort((a, b) => a.startTime - b.startTime);
                    resolve(sessions);
                };
                
                request.onerror = () => {
                    console.error('❌ Error getting meeting sessions:', request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error('❌ Error in getMeetingSessions:', error);
                resolve([]); // Return empty array instead of rejecting
            }
        });
    }
    
    // Get all sessions (for dashboard display)
    async getAllSessions(options = {}) {
        return new Promise((resolve, reject) => {
            try {
                // Check if database is available
                if (!this.db) {
                    console.error('❌ Database not available in getAllSessions');
                    console.log('🔄 Attempting to reinitialize database...');
                    // Try to reinitialize
                    this.init().then(() => {
                        if (!this.db) {
                            console.error('❌ Database reinitialize failed');
                            resolve([]); // Return empty array instead of rejecting
                            return;
                        }
                        // Retry the operation
                        this.getAllSessions(options).then(resolve).catch(reject);
                    }).catch(error => {
                        console.error('❌ Database reinitialize error:', error);
                        resolve([]); // Return empty array instead of rejecting
                    });
                    return;
                }
                
                const transaction = this.db.transaction(['meetingSessions'], 'readonly');
                const store = transaction.objectStore('meetingSessions');
                let request;
                
                if (options.dateRange) {
                    const keyRange = IDBKeyRange.bound(options.dateRange.start, options.dateRange.end);
                    request = store.index('date').getAll(keyRange);
                } else {
                    request = store.getAll();
                }

                request.onsuccess = () => {
                    let sessions = request.result;
                    
                    // Apply filters
                    if (options.limit) {
                        sessions = sessions.slice(0, options.limit);
                    }
                    
                    if (options.sortBy === 'duration') {
                        sessions.sort((a, b) => (b.duration || 0) - (a.duration || 0));
                    } else {
                        // Default sort by start time, newest first
                        sessions.sort((a, b) => b.startTime - a.startTime);
                    }
                    
                    resolve(sessions);
                };
                
                request.onerror = () => reject(request.error);
            } catch (error) {
                console.error('❌ Error in getAllSessions:', error);
                resolve([]); // Return empty array instead of rejecting
            }
        });
    }
    
    // Get sessions grouped by meeting ID (for aggregated view)
    async getGroupedMeetingSessions() {
        try {
            const sessions = await this.getAllSessions();
            const grouped = {};
            
            sessions.forEach(session => {
                if (!grouped[session.meetingId]) {
                    grouped[session.meetingId] = {
                        meetingId: session.meetingId,
                        title: session.title,
                        sessions: [],
                        totalDuration: 0,
                        firstStartTime: session.startTime,
                        lastEndTime: session.endTime
                    };
                }
                
                grouped[session.meetingId].sessions.push(session);
                
                if (session.duration) {
                    grouped[session.meetingId].totalDuration += session.duration;
                }
                
                // Track earliest start and latest end
                if (session.startTime < grouped[session.meetingId].firstStartTime) {
                    grouped[session.meetingId].firstStartTime = session.startTime;
                }
                
                if (session.endTime && (!grouped[session.meetingId].lastEndTime || session.endTime > grouped[session.meetingId].lastEndTime)) {
                    grouped[session.meetingId].lastEndTime = session.endTime;
                }
            });
            
            // Sort sessions within each meeting
            Object.values(grouped).forEach(meeting => {
                meeting.sessions.sort((a, b) => a.startTime - b.startTime);
            });
            
            return Object.values(grouped);
        } catch (error) {
            console.error('❌ Error getting grouped sessions:', error);
            return [];
        }
    }
    
    // Delete a specific session
    async deleteSession(sessionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetingSessions', 'meetingMinutes'], 'readwrite');
            
            // Delete session
            transaction.objectStore('meetingSessions').delete(sessionId);
            
            // Delete associated minutes
            const minutesStore = transaction.objectStore('meetingMinutes');
            const request = minutesStore.openCursor();
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.sessionId === sessionId) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
    
    // Generate unique session ID
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Clear all data (updated to include sessions)
    async clearAllData() {
        const storeNames = ['meetings', 'meetingSessions', 'meetingMinutes', 'participants'];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeNames, 'readwrite');
            
            storeNames.forEach(storeName => {
                if (this.db.objectStoreNames.contains(storeName)) {
                    transaction.objectStore(storeName).clear();
                }
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // NEW: Get meetings aggregated by meetingId AND date (combines sessions for dashboard)
    async getMeetingsAggregated(options = {}) {
        try {
            console.log('📊 getMeetingsAggregated called - providing meeting-centric view grouped by date');
            
            // Get all sessions first (similar to getMeetings)
            const sessions = await this.getAllSessions(options);
            
            // Group sessions by meetingId AND date to separate recurring meetings
            const meetingsMap = {};
            
            sessions.forEach(session => {
                const sessionDate = new Date(session.startTime).toISOString().split('T')[0];
                // Create composite key: meetingId + date
                const compositeKey = `${session.meetingId}_${sessionDate}`;
                
                // Create meeting entry if it doesn't exist
                if (!meetingsMap[compositeKey]) {
                    meetingsMap[compositeKey] = {
                        id: compositeKey,             // Use composite key as unique id
                        meetingId: session.meetingId, // Keep original meetingId
                        title: session.title || session.meetingId,
                        url: session.url,
                        startTime: session.startTime, // Will be updated to earliest time
                        endTime: session.endTime,     // Will be updated to latest time
                        duration: 0,                  // Will accumulate all sessions
                        participants: [],             // Will combine unique participants
                        sessions: [],                 // Will store all sessions
                        isSession: false,             // Indicate this is an aggregated meeting
                        isActive: session.endTime ? false : true,  // Active if any session is active
                        sessionCount: 0,
                        dataSource: session.dataSource || 'unknown',
                        participantCount: 0,
                        participantsMap: {},          // For tracking unique participants
                        date: sessionDate
                    };
                }
                
                const meeting = meetingsMap[compositeKey];
                
                // Add session to meeting's sessions
                meeting.sessions.push(session);
                meeting.sessionCount++;
                
                // Calculate duration and update if session is ended
                if (session.endTime) {
                    const sessionDuration = session.endTime - session.startTime;
                    meeting.duration += sessionDuration;
                }
                
                // Update start time (earliest within the same day)
                if (session.startTime < meeting.startTime) {
                    meeting.startTime = session.startTime;
                }
                
                // Update end time (latest within the same day)
                if (session.endTime && (!meeting.endTime || session.endTime > meeting.endTime)) {
                    meeting.endTime = session.endTime;
                }
                
                // If any session is active, mark meeting as active
                if (!session.endTime) {
                    meeting.isActive = true;
                    meeting.endTime = null; // Null out end time for active meetings
                }
                
                // Add participants (unique within this day's meeting)
                if (session.participants && Array.isArray(session.participants)) {
                    session.participants.forEach(p => {
                        // Handle different participant data formats
                        let participantName = '';
                        let participantId = '';
                        
                        if (typeof p === 'string') {
                            participantName = p;
                            participantId = p;  // Use name as ID
                        } else if (p && typeof p === 'object') {
                            participantName = p.name || p.displayName || p.id || 'Unknown';
                            participantId = p.id || p.email || participantName;
                        }
                        
                        // Only add if not already included in this day's meeting
                        if (participantName && participantName !== 'Unknown' && !meeting.participantsMap[participantId]) {
                            meeting.participantsMap[participantId] = true;
                            meeting.participants.push(p); // Add original participant object
                        }
                    });
                }
            });
            
            // Convert map to array and finalize meeting objects
            const aggregatedMeetings = Object.values(meetingsMap).map(meeting => {
                // Calculate participant count from unique participants
                meeting.participantCount = meeting.participants.length;
                
                // Calculate durationMinutes for convenience
                meeting.durationMinutes = Math.round(meeting.duration / 60000);
                
                // Remove temporary tracking field
                delete meeting.participantsMap;
                
                return meeting;
            });
            
            // Sort by start time, newest first
            aggregatedMeetings.sort((a, b) => b.startTime - a.startTime);
            
            console.log(`📊 Aggregated ${sessions.length} sessions into ${aggregatedMeetings.length} meetings (grouped by meetingId + date)`);
            return aggregatedMeetings;
        } catch (error) {
            console.error('❌ Error in getMeetingsAggregated:', error);
            return [];
        }
    }
}

// Export the storage manager
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MeetingStorageManager;
} else if (typeof window !== 'undefined') {
    window.MeetingStorageManager = MeetingStorageManager;
}
