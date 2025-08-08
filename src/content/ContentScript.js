// New Simplified Content Script - Focuses only on participant detection
class ContentScript {
    constructor() {
        this.meetingId = null;
        this.meetingTitle = null;
        this.participants = new Set();
        this.participantMemory = new Map(); // For participant retention
        this.isActive = false;
        this.lastUpdate = 0;
        
        // Timing
        this.scanInterval = null;
        this.minuteInterval = null;
        this.currentMinute = 0;
        
        // Configuration
        this.scanIntervalMs = 3000; // Scan every 3 seconds
        this.minuteIntervalMs = 60000; // Log every minute
        this.participantRetentionMs = 30000; // Remember participants for 30 seconds
    }
    
    init() {
        console.log('🚀 Content Script initializing...');
        
        // Check if we're on a meeting page
        if (!this.isMeetingPage()) {
            console.log('❌ Not on a meeting page, skipping initialization');
            return;
        }
        
        this.meetingId = this.extractMeetingId();
        console.log(`📋 Meeting ID: ${this.meetingId}`);
        
        // Setup observers and intervals
        this.setupMeetingDetection();
        this.setupNavigationDetection();
        
        console.log('✅ Content Script initialized');
    }
    
    isMeetingPage() {
        return window.location.hostname === 'meet.google.com' &&
               window.location.pathname.match(/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    }
    
    extractMeetingId() {
        const pathParts = window.location.pathname.split('/');
        return pathParts[pathParts.length - 1];
    }
    
    extractMeetingTitle() {
        // Try various selectors for meeting title
        const titleSelectors = [
            '[data-meeting-title]',
            'title',
            'h1',
            '.meeting-title'
        ];
        
        for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                const title = element.textContent || element.getAttribute('data-meeting-title');
                if (title && title !== 'Meet' && title !== this.meetingId) {
                    return title.trim();
                }
            }
        }
        
        return this.meetingId; // Fallback to meeting ID
    }
    
    setupMeetingDetection() {
        // Start scanning for meeting activity
        this.scanInterval = setInterval(() => {
            this.scanForMeetingActivity();
        }, this.scanIntervalMs);
        
        // Initial scan
        setTimeout(() => this.scanForMeetingActivity(), 1000);
    }
    
    scanForMeetingActivity() {
        const wasActive = this.isActive;
        const oldParticipants = new Set(this.participants);
        
        // Check if meeting is active
        this.isActive = this.detectActiveMeeting();
        
        if (this.isActive) {
            // Update meeting title
            this.meetingTitle = this.extractMeetingTitle();
            
            // Scan for participants
            this.scanForParticipants();
            
            // Check if we need to start minute tracking
            if (!wasActive) {
                this.startMinuteTracking();
                console.log(`🚀 Meeting became active: ${this.meetingId}`);
            }
            
            // Send participant update to background
            if (this.hasParticipantChanges(oldParticipants)) {
                this.sendParticipantUpdate();
            }
            
        } else if (wasActive) {
            // Meeting ended
            console.log(`🏁 Meeting ended: ${this.meetingId}`);
            this.handleMeetingEnd();
        }
    }
    
    detectActiveMeeting() {
        // Strong indicators of active meeting
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
        // Various selectors for participant elements
        const selectors = [
            '[data-participant-id]',
            '[jsname="A5il2e"] [jscontroller]', // Main participant grid
            '[data-self-name]',
            '.participant-tile',
            '[aria-label*="participant"]'
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
        const now = Date.now();
        
        participantElements.forEach((element, index) => {
            const participant = this.extractParticipantInfo(element, index);
            if (participant && participant.name) {
                currentParticipants.add(JSON.stringify(participant));
                
                // Update participant memory
                this.participantMemory.set(participant.id || participant.name, {
                    ...participant,
                    lastSeen: now
                });
            }
        });
        
        // If no current participants but we have recent ones in memory, use them
        if (currentParticipants.size === 0 && this.participantMemory.size > 0) {
            for (const [id, participant] of this.participantMemory.entries()) {
                if (now - participant.lastSeen < this.participantRetentionMs) {
                    currentParticipants.add(JSON.stringify({
                        ...participant,
                        source: 'memory'
                    }));
                }
            }
        }
        
        // Clean up old participant memory
        for (const [id, participant] of this.participantMemory.entries()) {
            if (now - participant.lastSeen > this.participantRetentionMs * 2) {
                this.participantMemory.delete(id);
            }
        }
        
        this.participants = currentParticipants;
        console.log(`👥 Found ${this.participants.size} participants`);
    }
    
    extractParticipantInfo(element, index) {
        // Try to extract participant information
        let name = '';
        let id = '';
        let avatarUrl = '';
        let email = '';
        
        // Try various methods to extract name
        if (element.dataset.sortKey) {
            name = element.dataset.sortKey.trim();
        } else if (element.ariaLabel) {
            name = element.ariaLabel.replace(/\(.*?\)/g, '').trim();
        } else {
            const textContent = element.textContent || element.innerText || '';
            const lines = textContent.split('\n').filter(line => line.trim());
            name = lines[0]?.trim() || '';
        }
        
        // Extract ID if available
        if (element.dataset.participantId) {
            id = element.dataset.participantId;
        } else if (element.dataset.selfName) {
            id = element.dataset.selfName;
        } else {
            id = name || `participant_${index}`;
        }
        
        // Extract avatar if available
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
            email: email,
            avatarUrl: avatarUrl,
            source: 'dom',
            joinTime: Date.now(),
            lastSeen: Date.now()
        };
    }
    
    hasParticipantChanges(oldParticipants) {
        if (oldParticipants.size !== this.participants.size) {
            return true;
        }
        
        for (const participant of this.participants) {
            if (!oldParticipants.has(participant)) {
                return true;
            }
        }
        
        return false;
    }
    
    sendParticipantUpdate() {
        const participants = Array.from(this.participants).map(p => JSON.parse(p));
        
        const data = {
            meetingId: this.meetingId,
            title: this.meetingTitle,
            participants: participants,
            dataSource: 'dom'
        };
        
        console.log(`📤 Sending participant update:`, {
            meetingId: this.meetingId,
            participantCount: participants.length,
            participantNames: participants.map(p => p.name)
        });
        
        if (chrome?.runtime?.id) {
            chrome.runtime.sendMessage({
                type: 'participant_update',
                data: data
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Error sending participant update:', chrome.runtime.lastError);
                } else {
                    console.log('✅ Participant update sent successfully');
                }
            });
        }
    }
    
    startMinuteTracking() {
        if (this.minuteInterval) {
            clearInterval(this.minuteInterval);
        }
        
        this.currentMinute = 0;
        
        // Log first minute immediately
        this.logMinuteData();
        
        // Set up minute interval
        this.minuteInterval = setInterval(() => {
            this.currentMinute++;
            this.logMinuteData();
        }, this.minuteIntervalMs);
        
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
        // Stop tracking
        if (this.minuteInterval) {
            clearInterval(this.minuteInterval);
            this.minuteInterval = null;
        }
        
        // Send session end
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
        
        // Reset state
        this.isActive = false;
        this.participants.clear();
        this.currentMinute = 0;
        
        console.log('🏁 Meeting end handled');
    }
    
    setupNavigationDetection() {
        // Detect navigation away from meeting
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        const handleNavigation = () => {
            if (this.isActive && !this.isMeetingPage()) {
                console.log('🧭 Navigation detected, ending meeting');
                this.handleMeetingEnd();
            }
        };
        
        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            setTimeout(handleNavigation, 100);
        };
        
        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            setTimeout(handleNavigation, 100);
        };
        
        window.addEventListener('popstate', handleNavigation);
        window.addEventListener('beforeunload', () => {
            if (this.isActive) {
                this.handleMeetingEnd();
            }
        });
    }
    
    // Cleanup method
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
        
        console.log('🧹 Content Script cleaned up');
    }
}

// Initialize the content script
const contentScript = new ContentScript();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => contentScript.init());
} else {
    contentScript.init();
}

// Global access for debugging
window.meetTracker = contentScript;

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentScript;
}
