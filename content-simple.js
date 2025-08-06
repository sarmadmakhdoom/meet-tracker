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
    } else if (!isActive && this.meetingState.isActive) {
      // Meeting ended
      this.meetingState.isActive = false;
      this.meetingState.endTime = Date.now();
      console.log('[SimpleMeetTracker] Meeting ended');
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
