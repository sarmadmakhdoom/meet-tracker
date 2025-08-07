// Enhanced Storage Manager for Google Meet Tracker
// Uses IndexedDB for better performance and larger storage capacity

class MeetingStorageManager {
    constructor() {
        this.dbName = 'MeetingTrackerDB';
        this.dbVersion = 1;
        this.db = null;
    }

    // Initialize the database
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create meetings store
                if (!db.objectStoreNames.contains('meetings')) {
                    const meetingStore = db.createObjectStore('meetings', { keyPath: 'id' });
                    meetingStore.createIndex('startTime', 'startTime', { unique: false });
                    meetingStore.createIndex('endTime', 'endTime', { unique: false });
                    meetingStore.createIndex('date', 'date', { unique: false });
                    meetingStore.createIndex('participants', 'participants', { unique: false, multiEntry: true });
                }
                
                // Create participants store for analytics
                if (!db.objectStoreNames.contains('participants')) {
                    const participantStore = db.createObjectStore('participants', { keyPath: 'name' });
                    participantStore.createIndex('meetingCount', 'meetingCount', { unique: false });
                    participantStore.createIndex('totalTime', 'totalTime', { unique: false });
                }
                
                // Create meeting minutes store (separate for better performance)
                if (!db.objectStoreNames.contains('meetingMinutes')) {
                    const minutesStore = db.createObjectStore('meetingMinutes', { keyPath: ['meetingId', 'timestamp'] });
                    minutesStore.createIndex('meetingId', 'meetingId', { unique: false });
                    minutesStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                // Create settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
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

    // Get meetings with advanced filtering
    async getMeetings(options = {}) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['meetings'], 'readonly');
            const store = transaction.objectStore('meetings');
            
            let request;
            
            if (options.dateRange) {
                // Use date index for efficient date range queries
                const keyRange = IDBKeyRange.bound(options.dateRange.start, options.dateRange.end);
                request = store.index('date').getAll(keyRange);
            } else if (options.participant) {
                // Use participant index for participant-specific queries
                request = store.index('participants').getAll(options.participant);
            } else {
                // Get all meetings
                request = store.getAll();
            }

            request.onsuccess = () => {
                let meetings = request.result;
                
                // Apply additional filters
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
            const transaction = this.db.transaction(['meetings'], 'readonly');
            const store = transaction.objectStore('meetings');
            const request = store.get(meetingId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
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

    // Clear all data
    async clearAllData() {
        const storeNames = ['meetings', 'meetingMinutes', 'participants'];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeNames, 'readwrite');
            
            storeNames.forEach(storeName => {
                transaction.objectStore(storeName).clear();
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

// Export the storage manager
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MeetingStorageManager;
} else if (typeof window !== 'undefined') {
    window.MeetingStorageManager = MeetingStorageManager;
}
