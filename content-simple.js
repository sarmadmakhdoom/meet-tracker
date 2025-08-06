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
      // If no participants found, check if we're in a meeting
      const meetingControls = document.querySelectorAll('[data-is-muted], [data-is-video-on]');
      if (meetingControls.length > 0) {
        console.log('[SimpleMeetTracker] In meeting but participants panel may be closed');
      }
      return;
    }

    console.log(`[SimpleMeetTracker] Found ${participantElements.length} participant elements`);

    let newParticipants = 0;
    const currentParticipants = new Map();

    participantElements.forEach(element => {
      const id = element.dataset.participantId;
      if (!id) return;

      let name = '';
      
      // Try to extract name from sortKey first
      if (element.dataset.sortKey) {
        name = element.dataset.sortKey.replace(id, '').trim();
      }
      
      // Fallback to innerText
      if (!name) {
        const textContent = element.innerText || '';
        name = textContent.split('\n')[0]?.trim() || '';
      }

      if (!name) return;

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
      }

      currentParticipants.set(id, participant);
    });

    // Update participants list
    this.participants = currentParticipants;

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
