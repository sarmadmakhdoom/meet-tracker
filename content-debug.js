// DIAGNOSTIC Content Script - Debug the 2-minute drop issue

console.log('🔍 DIAGNOSTIC CONTENT: Starting diagnostic content script...');

// Check if we're on a valid meeting page
function isMeetingPage() {
    return window.location.hostname === 'meet.google.com' &&
           window.location.pathname.match(/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
}

if (!isMeetingPage()) {
    console.log('❌ DIAGNOSTIC: Not on a meeting page, content script will not initialize');
} else {
    console.log('📋 DIAGNOSTIC: On meeting page, initializing diagnostic tracker...');
    
    class DiagnosticMeetTracker {
        constructor() {
            this.meetingId = this.extractMeetingId();
            this.meetingTitle = null;
            this.participants = new Set();
            this.isActive = false;
            this.scanInterval = null;
            this.minuteInterval = null;
            this.currentMinute = 0;
            this.pingInterval = null;
            
            // DIAGNOSTIC: Track timing and communication
            this.startTime = Date.now();
            this.lastScanTime = null;
            this.lastBackgroundResponse = null;
            this.communicationErrors = [];
            this.scanCount = 0;
            this.messageCount = 0;
            this.participantHistory = [];
        }
        
        log(message, data = null) {
            const timestamp = new Date().toISOString();
            const uptime = Math.round((Date.now() - this.startTime) / 1000);
            const logEntry = `[${timestamp}] [${uptime}s] CONTENT: ${message}`;
            
            console.log('🔍 ' + logEntry, data || '');
        }
        
        extractMeetingId() {
            const pathParts = window.location.pathname.split('/');
            return pathParts[pathParts.length - 1];
        }
        
        extractMeetingTitle() {
            const titleElement = document.querySelector('[data-meeting-title]');
            if (titleElement?.dataset.meetingTitle) {
                return titleElement.dataset.meetingTitle;
            }
            
            if (document.title && document.title !== 'Meet') {
                return document.title;
            }
            
            return this.meetingId;
        }
        
        detectActiveMeeting() {
            this.log('MEETING DETECTION: Starting detection scan');
            
            // Look for strong indicators of active meeting
            const leaveButton = document.querySelector('[aria-label*="Leave call"], [aria-label*="End call"]');
            if (leaveButton) {
                this.log('MEETING DETECTION: Found leave button - meeting is active');
                return true;
            }
            
            // Check for participant elements
            const participantElements = this.getParticipantElements();
            if (participantElements.length > 0) {
                this.log('MEETING DETECTION: Found participant elements - meeting is active', {
                    participantElementCount: participantElements.length
                });
                return true;
            }
            
            // Check for meeting controls
            const micButton = document.querySelector('[aria-label*="microphone"], [data-is-muted]');
            const cameraButton = document.querySelector('[aria-label*="camera"], [data-is-video-on]');
            if (micButton && cameraButton) {
                this.log('MEETING DETECTION: Found mic and camera controls - meeting is active');
                return true;
            }
            
            this.log('MEETING DETECTION: No active meeting indicators found');
            return false;
        }
        
        getParticipantElements() {
            const selectors = [
                '[data-participant-id]',
                '[jsname="A5il2e"] [jscontroller]',
                '[data-self-name]',
                '.participant-tile',
                '[aria-label*="participant"]'
            ];
            
            const elements = [];
            for (const selector of selectors) {
                const found = document.querySelectorAll(selector);
                if (found.length > 0) {
                    this.log(`PARTICIPANT ELEMENTS: Found ${found.length} elements with selector: ${selector}`);
                    elements.push(...found);
                }
            }
            
            return elements;
        }
        
        scanForParticipants() {
            this.log('PARTICIPANT SCAN: Starting participant scan');
            
            const participantElements = this.getParticipantElements();
            const currentParticipants = new Set();
            
            participantElements.forEach((element, index) => {
                const participant = this.extractParticipantInfo(element, index);
                if (participant && participant.name) {
                    currentParticipants.add(JSON.stringify(participant));
                    this.log(`PARTICIPANT FOUND: ${participant.name}`, {
                        id: participant.id,
                        source: participant.source
                    });
                }
            });
            
            // Track participant changes
            const participantCount = currentParticipants.size;
            if (participantCount !== this.participants.size) {
                this.log('PARTICIPANT CHANGE: Participant count changed', {
                    from: this.participants.size,
                    to: participantCount,
                    participants: Array.from(currentParticipants).map(p => JSON.parse(p).name)
                });
            }
            
            this.participants = currentParticipants;
            
            // Add to history
            this.participantHistory.push({
                timestamp: Date.now(),
                count: participantCount,
                participants: Array.from(currentParticipants).map(p => JSON.parse(p).name)
            });
            
            // Keep only last 10 entries
            if (this.participantHistory.length > 10) {
                this.participantHistory = this.participantHistory.slice(-10);
            }
            
            this.log(`PARTICIPANT SCAN COMPLETE: Found ${participantCount} participants`);
        }
        
        extractParticipantInfo(element, index) {
            let name = '';
            let id = '';
            let avatarUrl = '';
            
            // Extract name
            if (element.dataset.sortKey) {
                name = element.dataset.sortKey.trim();
            } else if (element.ariaLabel) {
                name = element.ariaLabel.replace(/\(.*?\)/g, '').trim();
            } else {
                const textContent = element.textContent || element.innerText || '';
                const lines = textContent.split('\n').filter(line => line.trim());
                name = lines[0]?.trim() || '';
            }
            
            // Extract ID
            if (element.dataset.participantId) {
                id = element.dataset.participantId;
            } else {
                id = name || `participant_${index}`;
            }
            
            // Extract avatar
            const img = element.querySelector('img[src*="googleusercontent.com"]');
            if (img) {
                avatarUrl = img.src;
            }
            
            // Validate name
            if (!name || 
                name.length < 1 || 
                name === 'undefined' ||
                name.includes('undefined') ||
                /^[\s\n\t]+$/.test(name)) {
                this.log('PARTICIPANT INVALID: Rejected participant with invalid name', {
                    name, 
                    element: element.outerHTML?.substring(0, 100)
                });
                return null;
            }
            
            return {
                id: id,
                name: name,
                email: '',
                avatarUrl: avatarUrl,
                source: 'dom',
                joinTime: Date.now(),
                lastSeen: Date.now()
            };
        }
        
        sendParticipantUpdate() {
            const participants = Array.from(this.participants).map(p => JSON.parse(p));
            
            const data = {
                meetingId: this.meetingId,
                title: this.meetingTitle,
                participants: participants,
                dataSource: 'dom'
            };
            
            this.messageCount++;
            this.log(`SENDING MESSAGE: Participant update #${this.messageCount}`, {
                participantCount: participants.length,
                participantNames: participants.map(p => p.name)
            });
            
            if (!chrome?.runtime?.id) {
                const error = 'Chrome runtime not available';
                this.log('ERROR: Chrome runtime not available');
                this.communicationErrors.push({
                    timestamp: Date.now(),
                    error: error,
                    type: 'runtime_unavailable'
                });
                return;
            }
            
            const sendTime = Date.now();
            
            chrome.runtime.sendMessage({
                type: 'participant_update',
                data: data
            }, (response) => {
                const responseTime = Date.now() - sendTime;
                
                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError.message;
                    this.log('ERROR: Background communication failed', {
                        error: error,
                        responseTime: responseTime + 'ms'
                    });
                    
                    this.communicationErrors.push({
                        timestamp: Date.now(),
                        error: error,
                        type: 'communication_error',
                        responseTime: responseTime
                    });
                } else {
                    this.lastBackgroundResponse = Date.now();
                    this.log('SUCCESS: Background responded', {
                        response: response,
                        responseTime: responseTime + 'ms'
                    });
                    
                    // Clear old errors on successful communication
                    if (this.communicationErrors.length > 0) {
                        this.log('RECOVERY: Communication restored after errors');
                        this.communicationErrors = [];
                    }
                }
            });
        }
        
        startPingTest() {
            // DIAGNOSTIC: Ping background service every 15 seconds
            this.pingInterval = setInterval(() => {
                if (chrome?.runtime?.id) {
                    const pingTime = Date.now();
                    chrome.runtime.sendMessage({
                        type: 'ping'
                    }, (response) => {
                        const responseTime = Date.now() - pingTime;
                        
                        if (chrome.runtime.lastError) {
                            this.log('PING FAILED: Background service not responding', {
                                error: chrome.runtime.lastError.message,
                                responseTime: responseTime + 'ms'
                            });
                        } else {
                            this.log('PING SUCCESS: Background service alive', {
                                response: response,
                                responseTime: responseTime + 'ms'
                            });
                        }
                    });
                } else {
                    this.log('PING FAILED: Chrome runtime not available');
                }
            }, 15000);
        }
        
        startMinuteTracking() {
            if (this.minuteInterval) {
                clearInterval(this.minuteInterval);
            }
            
            this.currentMinute = 0;
            this.logMinuteData();
            
            this.minuteInterval = setInterval(() => {
                this.currentMinute++;
                this.logMinuteData();
            }, 60000);
            
            this.log('MINUTE TRACKING: Started minute tracking');
        }
        
        logMinuteData() {
            if (!this.isActive) return;
            
            const participants = Array.from(this.participants).map(p => JSON.parse(p));
            
            const data = {
                meetingId: this.meetingId,
                minute: this.currentMinute + 1,
                participants: participants
            };
            
            this.log(`MINUTE DATA: Logging minute ${data.minute}`, {
                participantCount: participants.length
            });
            
            if (chrome?.runtime?.id) {
                chrome.runtime.sendMessage({
                    type: 'minute_data',
                    data: data
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        this.log('MINUTE DATA ERROR', chrome.runtime.lastError.message);
                    } else {
                        this.log('MINUTE DATA SUCCESS', response);
                    }
                });
            }
        }
        
        handleMeetingEnd() {
            this.log('MEETING END: Processing meeting end');
            
            if (this.minuteInterval) {
                clearInterval(this.minuteInterval);
                this.minuteInterval = null;
            }
            
            const data = {
                meetingId: this.meetingId,
                reason: 'meeting_ended'
            };
            
            if (chrome?.runtime?.id) {
                chrome.runtime.sendMessage({
                    type: 'session_end',
                    data: data
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        this.log('MEETING END ERROR', chrome.runtime.lastError.message);
                    } else {
                        this.log('MEETING END SUCCESS', response);
                    }
                });
            }
            
            this.isActive = false;
            this.participants.clear();
            this.currentMinute = 0;
            
            this.log('MEETING END: Complete');
        }
        
        scan() {
            const wasActive = this.isActive;
            const oldParticipantCount = this.participants.size;
            
            this.scanCount++;
            this.lastScanTime = Date.now();
            
            this.log(`SCAN: Starting scan #${this.scanCount}`);
            
            // Check if meeting is active
            this.isActive = this.detectActiveMeeting();
            
            if (this.isActive) {
                // Update title
                this.meetingTitle = this.extractMeetingTitle();
                
                // Scan for participants
                this.scanForParticipants();
                
                // Start minute tracking if newly active
                if (!wasActive) {
                    this.startMinuteTracking();
                    this.log(`MEETING STARTED: Meeting became active - ${this.meetingId}`);
                }
                
                // Send update if participants changed
                if (this.participants.size !== oldParticipantCount) {
                    this.sendParticipantUpdate();
                }
                
            } else if (wasActive) {
                // Meeting ended
                this.log(`MEETING ENDED: Meeting no longer active - ${this.meetingId}`);
                this.handleMeetingEnd();
            }
            
            this.log(`SCAN COMPLETE: #${this.scanCount} - Active: ${this.isActive}, Participants: ${this.participants.size}`);
        }
        
        init() {
            this.log(`INIT: Initializing diagnostic tracker for meeting ${this.meetingId}`);
            
            // Start ping test to monitor background service
            this.startPingTest();
            
            // Start scanning
            this.scanInterval = setInterval(() => {
                this.scan();
            }, 3000);
            
            // Initial scan
            setTimeout(() => this.scan(), 1000);
            
            // Setup navigation detection
            window.addEventListener('beforeunload', () => {
                this.log('PAGE UNLOAD: Page is unloading');
                if (this.isActive) {
                    this.handleMeetingEnd();
                }
            });
            
            // DIAGNOSTIC: Log status every 30 seconds
            setInterval(() => {
                this.log('STATUS REPORT', {
                    uptime: Math.round((Date.now() - this.startTime) / 1000) + 's',
                    scanCount: this.scanCount,
                    messageCount: this.messageCount,
                    isActive: this.isActive,
                    participantCount: this.participants.size,
                    lastBackgroundResponse: this.lastBackgroundResponse ? 
                        Math.round((Date.now() - this.lastBackgroundResponse) / 1000) + 's ago' : 'never',
                    communicationErrors: this.communicationErrors.length
                });
            }, 30000);
            
            this.log('INIT: Diagnostic tracker initialized successfully');
        }
        
        destroy() {
            this.log('DESTROY: Cleaning up diagnostic tracker');
            
            if (this.scanInterval) {
                clearInterval(this.scanInterval);
            }
            if (this.minuteInterval) {
                clearInterval(this.minuteInterval);
            }
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
            }
            if (this.isActive) {
                this.handleMeetingEnd();
            }
        }
        
        // DIAGNOSTIC: Get diagnostic info
        getDiagnosticInfo() {
            return {
                uptime: Math.round((Date.now() - this.startTime) / 1000),
                meetingId: this.meetingId,
                isActive: this.isActive,
                scanCount: this.scanCount,
                messageCount: this.messageCount,
                participantCount: this.participants.size,
                communicationErrors: this.communicationErrors,
                participantHistory: this.participantHistory,
                lastBackgroundResponse: this.lastBackgroundResponse,
                runtimeAvailable: !!(chrome?.runtime?.id)
            };
        }
    }
    
    // Initialize the tracker
    const diagnosticTracker = new DiagnosticMeetTracker();
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => diagnosticTracker.init());
    } else {
        diagnosticTracker.init();
    }
    
    // Global access for debugging
    window.diagnosticMeetTracker = diagnosticTracker;
    
    // DIAGNOSTIC: Expose debug functions
    window.getMeetTrackerDiagnostics = () => diagnosticTracker.getDiagnosticInfo();
    
    console.log('✅ DIAGNOSTIC CONTENT: Diagnostic tracker ready');
}
