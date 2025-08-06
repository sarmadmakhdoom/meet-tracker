// Simplified Google Meet participant tracker - focuses on immediate detection
// This version prioritizes DOM parsing over network interception for reliability

console.log('[SimpleMeetTracker] Starting simple participant tracker...');

class SimpleMeetTracker {
  constructor() {
    this.participants = new Map();
    this.meetingState = {
      isActive: false,
      meetingId: null,
      startTime: null,
      meetingTitle: null
    };
    this.lastUpdate = Date.now();
    this.minuteTrackingInterval = null;
    this.lastMinuteLogged = null;
    
    this.init();
  }

  init() {
    console.log('[SimpleMeetTracker] Initializing...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start());
    } else {
      this.start();
    }
  }

  start() {
    // Check if we're on a meet page
    if (!this.isMeetPage()) {
      console.log('[SimpleMeetTracker] Not on a Google Meet page');
      return;
    }

    console.log('[SimpleMeetTracker] Starting on Google Meet page');

    // Set up DOM observation
    this.setupDOMObserver();
    
    // Initial scan
    this.scanForParticipants();
    
    // Set up periodic scanning
    this.setupPeriodicScan();
    
    // Set up message listener
    this.setupMessageListener();
    
    // Check meeting state
    this.updateMeetingState();
  }

  isMeetPage() {
    return window.location.href.includes('meet.google.com/') && 
           !window.location.href.includes('/landing/');
  }

  setupDOMObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check if any added nodes contain participant data
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector && (
                  node.querySelector('*[data-participant-id]') ||
                  node.matches('*[data-participant-id]')
                )) {
                shouldScan = true;
                break;
              }
            }
          }
        }
      }
      
      if (shouldScan) {
        console.log('[SimpleMeetTracker] DOM changes detected, scanning for participants');
        setTimeout(() => this.scanForParticipants(), 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[SimpleMeetTracker] DOM observer set up');
  }

  setupPeriodicScan() {
    // Scan every 5 seconds for new participants
    setInterval(() => {
      this.scanForParticipants();
    }, 5000);
  }

  scanForParticipants() {
    const participantElements = document.querySelectorAll('*[data-participant-id]');
    
    if (participantElements.length === 0) {
      // Check if we're in a meeting but participants panel is closed
      const meetingControls = document.querySelectorAll('[data-is-muted], [data-is-video-on]');
      if (meetingControls.length > 0) {
        console.log('[SimpleMeetTracker] In meeting but participants panel may be closed');
        // Mark that we've lost participant visibility but meeting is still active
        this.lastParticipantVisibility = Date.now();
      } else {
        // No meeting controls, meeting might be ending
        this.checkForZombieMeeting();
      }
      return;
    }

    console.log(`[SimpleMeetTracker] Found ${participantElements.length} participant elements`);

    let newParticipants = 0;
    const currentParticipants = new Map();

    participantElements.forEach(element => {
      const id = element.dataset.participantId;
      if (!id) return;

      let name = this.extractParticipantName(element, id);
      if (!name || !this.isValidParticipantName(name)) {
        return;
      }

      // Clean and normalize the name
      name = this.normalizeParticipantName(name);

      // Look for avatar
      const img = element.querySelector('img');
      const avatarUrl = img?.src || null;

      const participant = {
        id,
        name,
        avatarUrl,
        joinTime: this.participants.get(id)?.joinTime || Date.now(),
        lastSeen: Date.now(),
        source: 'dom'
      };

      // Check if this is a new participant
      if (!this.participants.has(id)) {
        newParticipants++;
        console.log(`[SimpleMeetTracker] New participant: ${name}`);
      } else {
        // Check if name changed (better detection)
        const existing = this.participants.get(id);
        if (existing.name !== name && this.isValidParticipantName(name)) {
          console.log(`[SimpleMeetTracker] Participant name updated: ${existing.name} → ${name}`);
          participant.joinTime = existing.joinTime; // Preserve original join time
        }
      }

      currentParticipants.set(id, participant);
    });

    // Update participants list
    this.participants = currentParticipants;
    this.lastParticipantVisibility = Date.now();

    if (newParticipants > 0 || currentParticipants.size !== this.previousParticipantCount) {
      this.previousParticipantCount = currentParticipants.size;
      console.log(`[SimpleMeetTracker] Updated participant list: ${currentParticipants.size} participants`);
      
      // Update meeting state
      this.updateMeetingState();
      
      // Send to background
      this.sendUpdateToBackground();
    }
  }

  updateMeetingState() {
    const meetingId = this.getMeetingId();
    const isActive = this.participants.size > 0 || this.hasMeetingControls();

    if (isActive && !this.meetingState.isActive) {
      // Meeting started
      const startTime = Date.now();
      this.meetingState = {
        isActive: true,
        meetingId,
        startTime: startTime,
        meetingTitle: this.getMeetingTitle()
      };
      console.log(`[SimpleMeetTracker] Meeting started: ${this.meetingState.meetingTitle} at ${new Date(startTime).toLocaleTimeString()}`);
      
      // Send meeting start to background
      this.sendMeetingStateToBackground('started');
      
      // Start continuous minute tracking
      this.startMinuteTracking();
    } else if (!isActive && this.meetingState.isActive) {
      // Meeting ended
      const endTime = Date.now();
      this.meetingState.isActive = false;
      this.meetingState.endTime = endTime;
      
      const duration = endTime - this.meetingState.startTime;
      console.log(`[SimpleMeetTracker] Meeting ended after ${Math.round(duration / 60000)} minutes`);
      
      // Send meeting end to background with final meeting data
      this.sendMeetingStateToBackground('ended');
      
      // Stop minute tracking
      this.stopMinuteTracking();
      
      // Clear participants since meeting ended
      this.participants.clear();
    }

    // Update meeting title if it changed
    const currentTitle = this.getMeetingTitle();
    if (currentTitle && currentTitle !== this.meetingState.meetingTitle) {
      this.meetingState.meetingTitle = currentTitle;
    }
    
    // Always update the current time for duration calculation
    this.meetingState.lastUpdate = Date.now();
  }

  getMeetingId() {
    const url = window.location.pathname;
    return url.split('/').pop() || 'unknown';
  }

  getMeetingTitle() {
    const titleElement = document.querySelector('[data-meeting-title]');
    if (titleElement?.dataset.meetingTitle) {
      return titleElement.dataset.meetingTitle;
    }
    
    if (document.title && document.title !== 'Meet') {
      return document.title;
    }
    
    return this.getMeetingId();
  }

  hasMeetingControls() {
    return document.querySelectorAll('[data-is-muted], [data-is-video-on]').length > 0;
  }

  sendUpdateToBackground() {
    const data = {
      meetingId: this.meetingState.meetingId,
      meetingTitle: this.meetingState.meetingTitle,
      participants: Array.from(this.participants.values())
    };

    // Check if chrome runtime is available
    if (!chrome?.runtime?.id) {
      console.log('[SimpleMeetTracker] Extension context invalidated, skipping background update');
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: 'update_participants',
        data: data
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[SimpleMeetTracker] Background communication error:', chrome.runtime.lastError.message);
        } else {
          console.log(`[SimpleMeetTracker] Successfully sent ${data.participants.length} participants to background`);
        }
      });
    } catch (error) {
      console.log('[SimpleMeetTracker] Failed to send to background:', error.message);
    }
  }

  sendMeetingStateToBackground(eventType) {
    // Check if chrome runtime is available
    if (!chrome?.runtime?.id) {
      console.log('[SimpleMeetTracker] Extension context invalidated, skipping meeting state update');
      return;
    }

    const meetingData = {
      id: this.meetingState.meetingId,
      title: this.meetingState.meetingTitle,
      startTime: this.meetingState.startTime,
      endTime: this.meetingState.endTime,
      url: window.location.href,
      participants: Array.from(this.participants.values())
    };

    try {
      if (eventType === 'started') {
        chrome.runtime.sendMessage({
          type: 'meetingStarted',
          meeting: meetingData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[SimpleMeetTracker] Error sending meeting start:', chrome.runtime.lastError.message);
          } else {
            console.log('[SimpleMeetTracker] Meeting start sent to background');
          }
        });
      } else if (eventType === 'ended') {
        chrome.runtime.sendMessage({
          type: 'meetingEnded',
          meeting: meetingData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[SimpleMeetTracker] Error sending meeting end:', chrome.runtime.lastError.message);
          } else {
            console.log('[SimpleMeetTracker] Meeting end sent to background');
          }
        });
      }
    } catch (error) {
      console.log(`[SimpleMeetTracker] Failed to send meeting ${eventType} to background:`, error.message);
    }
  }

  setupMessageListener() {
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'get_meeting_state') {
          sendResponse({
            meetingState: this.meetingState,
            participants: Array.from(this.participants.values()),
            participantCount: this.participants.size
          });
          return true;
        } else if (message.type === 'force_end_meeting') {
          const result = this.forceEndMeeting();
          sendResponse({ success: result });
          return true;
        }
      });
    }
  }

  // Minute-by-minute tracking methods
  startMinuteTracking() {
    if (this.minuteTrackingInterval) {
      clearInterval(this.minuteTrackingInterval);
    }
    
    console.log('[SimpleMeetTracker] Starting minute-by-minute tracking');
    
    // Log first minute immediately
    this.logCurrentMinute();
    
    // Set up interval to log every minute (60 seconds)
    this.minuteTrackingInterval = setInterval(() => {
      if (this.meetingState.isActive) {
        this.logCurrentMinute();
        
        // Check if meeting is still active by scanning for participants
        this.scanForParticipants();
        
        // If no participants found for 2 minutes, assume meeting ended
        if (this.participants.size === 0 && !this.hasMeetingControls()) {
          const now = Date.now();
          const timeSinceLastParticipant = now - (this.lastMinuteLogged || now);
          
          if (timeSinceLastParticipant > 2 * 60 * 1000) { // 2 minutes
            console.log('[SimpleMeetTracker] No participants detected for 2 minutes, ending meeting');
            this.updateMeetingState(); // This will trigger meeting end
          }
        }
      } else {
        // Stop tracking if meeting is no longer active
        this.stopMinuteTracking();
      }
    }, 60 * 1000); // Every 60 seconds
  }

  stopMinuteTracking() {
    if (this.minuteTrackingInterval) {
      console.log('[SimpleMeetTracker] Stopping minute-by-minute tracking');
      clearInterval(this.minuteTrackingInterval);
      this.minuteTrackingInterval = null;
    }
  }

  logCurrentMinute() {
    if (!this.meetingState.isActive) return;
    
    const currentTime = Date.now();
    const currentMinute = Math.floor((currentTime - this.meetingState.startTime) / 60000); // Minutes since start
    
    // Only log if this is a new minute
    if (currentMinute !== this.lastMinuteLogged) {
      this.lastMinuteLogged = currentMinute;
      
      const minuteData = {
        meetingId: this.meetingState.meetingId,
        minute: currentMinute + 1, // 1-based minute numbering
        timestamp: currentTime,
        participants: Array.from(this.participants.values()),
        participantCount: this.participants.size,
        cumulativeDuration: currentTime - this.meetingState.startTime
      };
      
      console.log(`[SimpleMeetTracker] Minute ${minuteData.minute}: ${minuteData.participantCount} participants`);
      
      // Send minute data to background
      this.sendMinuteDataToBackground(minuteData);
    }
  }

  sendMinuteDataToBackground(minuteData) {
    if (!chrome?.runtime?.id) {
      console.log('[SimpleMeetTracker] Extension context invalidated, skipping minute data');
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: 'logMinuteData',
        data: minuteData
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[SimpleMeetTracker] Error sending minute data:', chrome.runtime.lastError.message);
        } else {
          console.log(`[SimpleMeetTracker] Minute ${minuteData.minute} logged successfully`);
        }
      });
    } catch (error) {
      console.log('[SimpleMeetTracker] Failed to send minute data:', error.message);
    }
  }

  // Improved participant name extraction
  extractParticipantName(element, id) {
    let name = '';
    
    // Method 1: Try sortKey attribute (most reliable)
    if (element.dataset.sortKey) {
      name = element.dataset.sortKey.replace(id, '').trim();
      if (name && this.isValidParticipantName(name)) {
        return name;
      }
    }
    
    // Method 2: Try aria-label attribute
    if (element.ariaLabel) {
      const ariaName = element.ariaLabel.replace(/\(.*?\)/g, '').trim();
      if (ariaName && this.isValidParticipantName(ariaName)) {
        return ariaName;
      }
    }
    
    // Method 3: Extract from text content (multiple strategies)
    const textContent = element.innerText || element.textContent || '';
    
    // Try first line (most common)
    const firstLine = textContent.split('\n')[0]?.trim();
    if (firstLine && this.isValidParticipantName(firstLine)) {
      return firstLine;
    }
    
    // Try text before parentheses or special characters
    const beforeParens = textContent.split('(')[0]?.trim();
    if (beforeParens && beforeParens !== textContent && this.isValidParticipantName(beforeParens)) {
      return beforeParens;
    }
    
    // Method 4: Look for nested name elements
    const nameElements = element.querySelectorAll('[data-self-name], [jsname="YEtHCd"], .participant-name');
    for (const nameEl of nameElements) {
      const candidateName = (nameEl.textContent || nameEl.innerText || '').trim();
      if (candidateName && this.isValidParticipantName(candidateName)) {
        return candidateName;
      }
    }
    
    // Method 5: Check for Google-specific selectors
    const googleNameEl = element.querySelector('[jsname] [dir="auto"]');
    if (googleNameEl) {
      const candidateName = (googleNameEl.textContent || googleNameEl.innerText || '').trim();
      if (candidateName && this.isValidParticipantName(candidateName)) {
        return candidateName;
      }
    }
    
    return null;
  }

  // Enhanced participant name validation
  isValidParticipantName(name) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return false;
    }
    
    name = name.trim();
    
    // Filter out very short names (likely UI elements)
    if (name.length < 2) {
      return false;
    }
    
    // Filter out very long names (likely concatenated UI text)
    if (name.length > 50) {
      return false;
    }
    
    // Filter out names that are mostly numbers or symbols
    if (!/^[A-Za-z0-9\s\u00C0-\u017F\u0100-\u017F\u1E00-\u1EFF\u2000-\u206F\u2070-\u209F\u20A0-\u20CF\u2100-\u214F\u2190-\u21FF\u2200-\u22FF]+$/.test(name)) {
      // Allow Unicode letters, basic Latin, extended Latin, and common symbols
      return false;
    }
    
    // Filter out obvious UI elements and invalid names
    const invalidNames = [
      'you', 'devices', 'frame_person', 'visual_effects', 'more_vert', 'more options',
      'backgrounds and effects', 'jump to bottom', 'others might still see',
      'camera', 'microphone', 'speakers', 'default', 'system', 'built-in',
      'external', 'usb', 'bluetooth', 'airpods', 'headphones', 'headset',
      'audio', 'video', 'reframe', 'share screen', 'present now', 'settings',
      'more', 'chat', 'people', 'activities', 'whiteboard', 'record',
      'live stream', 'mute', 'unmute', 'turn off camera', 'turn on camera',
      'turn off microphone', 'turn on microphone', 'leave call', 'end call',
      'join call', 'ask to join', 'captions', 'hand', 'raise hand', 'lower hand',
      'turn off captions', 'turn on captions', 'joined', 'left', 'disconnected',
      'reconnected', 'presenting', 'stopped presenting', 'entered', 'exited',
      'connected', 'meeting host', 'host', 'guest', 'visitor', 'organizer'
    ];
    
    if (invalidNames.includes(name.toLowerCase())) {
      return false;
    }
    
    // Filter out common UI phrases and instructions
    const invalidPatterns = [
      /^(try|click|tap|press|select|choose|enable|disable|turn|start|stop)\s/i,
      /\b(joined|left|disconnected|reconnected|presenting|stopped presenting)\b/i,
      /\b(share|sharing|screen|stop sharing|disappearing link)\b/i,
      /\b(annotation|annotating|try annotating|laser pointer)\b/i,
      /\s(now|here|this|that|button|icon|option|setting)$/i,
      /^\d+$/, // Pure numbers
      /^[_\-\.]+$/, // Only symbols
      /\b(unknown|undefined|null)\b/i
    ];
    
    for (const pattern of invalidPatterns) {
      if (pattern.test(name)) {
        return false;
      }
    }
    
    return true;
  }

  // Normalize participant names for consistency
  normalizeParticipantName(name) {
    if (!name) return '';
    
    // Remove extra whitespace
    name = name.trim().replace(/\s+/g, ' ');
    
    // Remove common suffixes that Google Meet adds
    name = name.replace(/\s*\(Host\)$/i, '');
    name = name.replace(/\s*\(You\)$/i, '');
    name = name.replace(/\s*\(Organizer\)$/i, '');
    name = name.replace(/\s*\(Guest\)$/i, '');
    
    // Remove trailing punctuation
    name = name.replace(/[\.,;:!?]+$/, '');
    
    return name.trim();
  }

  // Check for zombie meetings (meetings that should have ended)
  checkForZombieMeeting() {
    if (!this.meetingState.isActive) return;
    
    const now = Date.now();
    const timeSinceLastActivity = now - (this.lastParticipantVisibility || this.meetingState.startTime);
    
    // If no participants detected for 2 minutes and no meeting controls visible
    if (timeSinceLastActivity > 2 * 60 * 1000) {
      console.log('[SimpleMeetTracker] Zombie meeting detected - ending meeting after 2 minutes of inactivity');
      
      // Force end the meeting
      this.meetingState.isActive = false;
      this.meetingState.endTime = now;
      
      // Send meeting end to background
      this.sendMeetingStateToBackground('ended');
      
      // Stop minute tracking
      this.stopMinuteTracking();
      
      // Clear participants
      this.participants.clear();
      
      // Reset state
      this.lastParticipantVisibility = null;
    }
  }

  // Manual cleanup method that can be called from dashboard
  forceEndMeeting() {
    if (!this.meetingState.isActive) {
      console.log('[SimpleMeetTracker] No active meeting to end');
      return false;
    }
    
    console.log('[SimpleMeetTracker] Manually ending meeting:', this.meetingState.meetingTitle);
    
    const now = Date.now();
    this.meetingState.isActive = false;
    this.meetingState.endTime = now;
    
    // Send meeting end to background
    this.sendMeetingStateToBackground('ended');
    
    // Stop minute tracking
    this.stopMinuteTracking();
    
    // Clear participants
    this.participants.clear();
    
    return true;
  }
}

// Initialize the tracker
const tracker = new SimpleMeetTracker();

// Debug functions
window.debugSimpleMeetTracker = () => {
  console.log('Meeting State:', tracker.meetingState);
  console.log('Participants:', Array.from(tracker.participants.values()));
  
  return {
    meetingState: tracker.meetingState,
    participants: Array.from(tracker.participants.values()),
    participantCount: tracker.participants.size
  };
};

window.testSimpleExtraction = () => {
  console.log('🧪 Testing simple participant extraction...');
  tracker.scanForParticipants();
  return window.debugSimpleMeetTracker();
};

console.log('[SimpleMeetTracker] Simple tracker loaded. Use debugSimpleMeetTracker() to check state.');
