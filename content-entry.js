// Content Script Entry Point - Simplified participant detection

console.log('🚀 Google Meet Tracker v2.0 - Content Script Loading...');

// Check if we're on a valid meeting page
function isMeetingPage() {
    return window.location.hostname === 'meet.google.com' &&
           window.location.pathname.match(/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
}

if (!isMeetingPage()) {
    console.log('❌ Not on a meeting page, content script will not initialize');
} else {
    console.log('📋 On meeting page, initializing tracker...');
    
    class MeetTracker {
        constructor() {
            this.meetingId = this.extractMeetingId();
            this.meetingTitle = null;
            this.participants = new Set();
            this.isActive = false;
            this.scanInterval = null;
            this.minuteInterval = null;
            this.currentMinute = 0;
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
            // Look for strong indicators of active meeting
            const leaveButton = document.querySelector('[aria-label*="Leave call"], [aria-label*="End call"]');
            if (leaveButton) return true;
            
            // Check for participant elements
            const participantElements = this.getParticipantElements();
            if (participantElements.length > 0) return true;
            
            // Check for meeting controls
            const micButton = document.querySelector('[aria-label*="microphone"], [data-is-muted]');
            const cameraButton = document.querySelector('[aria-label*="camera"], [data-is-video-on]');
            if (micButton && cameraButton) return true;
            
            return false;
        }
        
        getParticipantElements() {
            const selectors = [
                '[data-participant-id]',
                '[jsname="A5il2e"] [jscontroller]',
                '[data-self-name]',
                '.participant-tile'
            ];
            
            const elements = [];
            for (const selector of selectors) {
                elements.push(...document.querySelectorAll(selector));
            }
            
            return elements;
        }
        
        scanForParticipants() {
            const participantElements = this.getParticipantElements();
            const currentParticipants = new Set();
            
            participantElements.forEach((element, index) => {
                const participant = this.extractParticipantInfo(element, index);
                if (participant && participant.name) {
                    currentParticipants.add(JSON.stringify(participant));
                }
            });
            
            this.participants = currentParticipants;
            console.log(`👥 Found ${this.participants.size} participants`);
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
            
            console.log(`📤 Sending participant update: ${participants.length} participants`);
            
            if (chrome?.runtime?.id) {
                chrome.runtime.sendMessage({
                    type: 'participant_update',
                    data: data
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ Error sending update:', chrome.runtime.lastError);
                    } else {
                        console.log('✅ Update sent successfully');
                    }
                });
            }
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
            
            console.log('⏰ Started minute tracking');
        }
        
        logMinuteData() {
            if (!this.isActive) return;
            
            const participants = Array.from(this.participants).map(p => JSON.parse(p));
            
            const data = {
                meetingId: this.meetingId,
                minute: this.currentMinute + 1,
                participants: participants
            };
            
            console.log(`📊 Logging minute ${data.minute}: ${participants.length} participants`);
            
            if (chrome?.runtime?.id) {
                chrome.runtime.sendMessage({
                    type: 'minute_data',
                    data: data
                });
            }
        }
        
        handleMeetingEnd() {
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
                });
            }
            
            this.isActive = false;
            this.participants.clear();
            this.currentMinute = 0;
            
            console.log('🏁 Meeting ended');
        }
        
        scan() {
            const wasActive = this.isActive;
            const oldParticipantCount = this.participants.size;
            
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
                    console.log(`🚀 Meeting became active: ${this.meetingId}`);
                }
                
                // Send update if participants changed
                if (this.participants.size !== oldParticipantCount) {
                    this.sendParticipantUpdate();
                }
                
            } else if (wasActive) {
                // Meeting ended
                console.log(`🏁 Meeting ended: ${this.meetingId}`);
                this.handleMeetingEnd();
            }
        }
        
        init() {
            console.log(`📋 Initializing tracker for meeting: ${this.meetingId}`);
            
            // Start scanning
            this.scanInterval = setInterval(() => {
                this.scan();
            }, 3000);
            
            // Initial scan
            setTimeout(() => this.scan(), 1000);
            
            // Setup navigation detection
            window.addEventListener('beforeunload', () => {
                if (this.isActive) {
                    this.handleMeetingEnd();
                }
            });
            
            console.log('✅ Content script initialized');
        }
        
        destroy() {
            if (this.scanInterval) {
                clearInterval(this.scanInterval);
            }
            if (this.minuteInterval) {
                clearInterval(this.minuteInterval);
            }
            if (this.isActive) {
                this.handleMeetingEnd();
            }
        }
    }
    
    // Initialize the tracker
    const tracker = new MeetTracker();
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => tracker.init());
    } else {
        tracker.init();
    }
    
    // Global access for debugging
    window.meetTracker = tracker;
    
    console.log('✅ Google Meet Tracker v2.0 - Content Script Ready');
}
