// Enhanced network-based Google Meet participant tracker

class NetworkMeetTracker {
  constructor() {
    this.participantData = new Map();
    this.meetingState = {
      isActive: false,
      meetingId: null,
      startTime: null,
      participantCount: 0,
      meetingTitle: null
    };
    this.observers = {
      mutation: null,
      intersection: null
    };
    this.networkData = {
      lastSyncTime: null,
      participantUpdates: new Set()
    };
    
    this.init();
  }

  init() {
    console.log('[MeetTracker] Initializing enhanced network-based tracker');
    
    // Set up network interception shims
    this.injectNetworkShims();
    
    // Listen for network data events
    this.setupNetworkListeners();
    
    // Set up DOM observation for fallback and UI integration
    this.setupDOMObservation();
    
    // Listen for page visibility changes
    this.setupVisibilityHandler();
    
    // Initial state check
    this.checkMeetingState();
    
    // Listen for messages from the background script
    this.setupMessageListener();
  }

  // Inject network interception shims using external file to avoid CSP issues
  injectNetworkShims() {
    try {
      // Use external network shim file to avoid CSP restrictions
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('network-shim.js');
      
      script.onload = () => {
        console.log('[MeetTracker] External network shims loaded successfully');
        this.networkShimsActive = true;
        
        // Verify shims are working
        setTimeout(() => {
          if (window.debugMeetTrackerShims) {
            const shimStatus = window.debugMeetTrackerShims();
            console.log('[MeetTracker] Shim status:', shimStatus);
          }
        }, 1000);
      };
      
      script.onerror = (error) => {
        console.warn('[MeetTracker] Failed to load external network shims, falling back to DOM monitoring only:', error);
        this.networkShimsActive = false;
      };
      
      // Inject the script as early as possible
      (document.head || document.documentElement).appendChild(script);
      
    } catch (error) {
      console.warn('[MeetTracker] Could not inject network shims, using DOM-only approach:', error);
      this.networkShimsActive = false;
    }
  }

  // Set up listeners for network data events
  setupNetworkListeners() {
    window.addEventListener('meettracker-network-data', (event) => {
      this.handleNetworkData(event.detail);
    });
  }

  // Process intercepted network data
  handleNetworkData(detail) {
    const { type, url, data, timestamp } = detail;
    
    try {
      // Parse different types of network responses
      if (url.includes('SyncMeetingSpaceCollections')) {
        this.parseSyncData(data);
      } else if (url.includes('/call/participants')) {
        this.parseParticipantData(data);
      } else if (url.includes('BatchExecute')) {
        this.parseBatchExecuteData(data);
      } else if (url.includes('/calendar/')) {
        this.parseCalendarData(data);
      }
      
      this.networkData.lastSyncTime = timestamp;
      
      // Update meeting state based on participants
      this.updateMeetingState();
      
      // Send updates to background script
      this.sendUpdateToBackground();
    } catch (error) {
      console.debug('[MeetTracker] Error parsing network data:', error);
    }
  }

  // Parse Google Meet sync data for participant information
  parseSyncData(data) {
    try {
      // Google Meet sync data is often in a proprietary format
      // Look for participant identifiers and names
      const lines = data.split('\n');
      
      for (const line of lines) {
        if (line.includes('participantId') || line.includes('displayName')) {
          try {
            const json = JSON.parse(line);
            if (json.displayName && json.participantId) {
              this.updateParticipant({
                id: json.participantId,
                name: json.displayName,
                joinTime: json.joinTime || Date.now(),
                source: 'sync'
              });
            }
          } catch (e) {
            // Try regex parsing for non-JSON data
            const nameMatch = line.match(/"displayName"\s*:\s*"([^"]+)"/);  
            const idMatch = line.match(/"participantId"\s*:\s*"([^"]+)"/);  
            
            if (nameMatch && idMatch) {
              this.updateParticipant({
                id: idMatch[1],
                name: nameMatch[1],
                joinTime: Date.now(),
                source: 'sync'
              });
            }
          }
        }
      }
    } catch (error) {
      console.debug('[MeetTracker] Error parsing sync data:', error);
    }
  }

  // Parse participant-specific API calls
  parseParticipantData(data) {
    try {
      const jsonData = JSON.parse(data);
      if (jsonData.participants) {
        jsonData.participants.forEach(participant => {
          this.updateParticipant({
            id: participant.id || participant.participantId,
            name: participant.name || participant.displayName,
            joinTime: participant.joinTime || Date.now(),
            status: participant.status,
            source: 'participant_api'
          });
        });
      }
    } catch (error) {
      console.debug('[MeetTracker] Error parsing participant data:', error);
    }
  }

  // Parse BatchExecute responses (Google's batched API system)
  parseBatchExecuteData(data) {
    try {
      // BatchExecute responses often contain multiple wrapped JSON responses
      const responses = data.split('\n').filter(line => line.startsWith('['));
      
      for (const response of responses) {
        try {
          const parsed = JSON.parse(response);
          if (Array.isArray(parsed)) {
            this.extractParticipantsFromBatchResponse(parsed);
          }
        } catch (e) {
          // Skip unparseable responses
        }
      }
    } catch (error) {
      console.debug('[MeetTracker] Error parsing batch execute data:', error);
    }
  }

  // Extract participants from complex batch response structure
  extractParticipantsFromBatchResponse(data) {
    // Recursively search for participant data in nested arrays
    const findParticipants = (obj) => {
      if (Array.isArray(obj)) {
        obj.forEach(findParticipants);
      } else if (obj && typeof obj === 'object') {
        if (obj.displayName && (obj.participantId || obj.id)) {
          this.updateParticipant({
            id: obj.participantId || obj.id,
            name: obj.displayName,
            joinTime: obj.joinTime || Date.now(),
            source: 'batch_execute'
          });
        }
        Object.values(obj).forEach(findParticipants);
      }
    };
    
    findParticipants(data);
  }

  // Parse calendar data for meeting details
  parseCalendarData(data) {
    try {
      const jsonData = JSON.parse(data);
      if (jsonData.summary) {
        this.meetingState.meetingTitle = jsonData.summary;
      }
      if (jsonData.attendees) {
        jsonData.attendees.forEach(attendee => {
          if (attendee.email && attendee.displayName) {
            this.updateParticipant({
              id: attendee.email,
              name: attendee.displayName,
              email: attendee.email,
              joinTime: Date.now(),
              source: 'calendar'
            });
          }
        });
      }
    } catch (error) {
      console.debug('[MeetTracker] Error parsing calendar data:', error);
    }
  }

  // Update participant information in our local data store
  updateParticipant(participant) {
    const { id, name } = participant;
    
    if (!id || !name) return;
    
    const existingParticipant = this.participantData.get(id);
    
    if (existingParticipant) {
      // Update existing participant
      this.participantData.set(id, {
        ...existingParticipant,
        ...participant,
        lastSeen: Date.now()
      });
    } else {
      // Add new participant
      this.participantData.set(id, {
        id,
        name,
        joinTime: participant.joinTime || Date.now(),
        lastSeen: Date.now(),
        ...participant
      });
      
      // Mark as an update that needs to be sent to background
      this.networkData.participantUpdates.add(id);
    }
  }

  // Update meeting state based on current participants
  updateMeetingState() {
    // Get meeting ID from URL
    const meetingId = this.getMeetingIdFromUrl();
    const currentTime = Date.now();
    
    // Check if this is a new meeting or existing meeting
    if (!this.meetingState.isActive) {
      this.meetingState = {
        isActive: true,
        meetingId,
        startTime: currentTime,
        participantCount: this.participantData.size,
        meetingTitle: this.getMeetingTitle()
      };
    } else {
      // Update existing meeting state
      this.meetingState.participantCount = this.participantData.size;
      
      // If title was null, try to get it again
      if (!this.meetingState.meetingTitle) {
        this.meetingState.meetingTitle = this.getMeetingTitle();
      }
    }
  }

  // Get meeting ID from URL
  getMeetingIdFromUrl() {
    try {
      const url = new URL(window.location.href);
      // Google Meet URLs follow the pattern: https://meet.google.com/xxx-yyyy-zzz
      const pathParts = url.pathname.split('/');
      return pathParts[pathParts.length - 1] || url.pathname;
    } catch (e) {
      return window.location.pathname;
    }
  }

  // Get meeting title from DOM or URL
  getMeetingTitle() {
    // Try to get the meeting title from DOM
    const titleElement = document.querySelector('[data-meeting-title]');
    if (titleElement && titleElement.dataset.meetingTitle) {
      return titleElement.dataset.meetingTitle;
    }
    
    // Fallback to document title
    if (document.title && document.title !== 'Meet') {
      return document.title;
    }
    
    // Last resort, use meeting ID
    return this.getMeetingIdFromUrl();
  }

  // Set up DOM observation for fallback and meeting state detection
  setupDOMObservation() {
    // Function to set up the mutation observer
    const setupObserver = () => {
      try {
        // Setup mutation observer to watch for relevant DOM changes
        this.observers.mutation = new MutationObserver((mutations) => {
          // Check for indicators of an active meeting
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              // Look for meeting title changes
              const titleElem = document.querySelector('[data-meeting-title]');
              if (titleElem && titleElem.dataset.meetingTitle) {
                this.meetingState.meetingTitle = titleElem.dataset.meetingTitle;
              }
              
              // Look for participant DOM elements as fallback
              const participantElements = document.querySelectorAll('[data-participant-id]');
              if (participantElements.length > 0) {
                // Extract participant info from DOM as fallback
                this.extractParticipantsFromDOM(participantElements);
              }
            }
          }
        });
        
        // Start observing - use documentElement if body is not available yet
        const targetElement = document.body || document.documentElement;
        if (targetElement) {
          this.observers.mutation.observe(targetElement, {
            childList: true,
            subtree: true
          });
          console.log('[MeetTracker] DOM observation started');
        } else {
          console.warn('[MeetTracker] No suitable element found for DOM observation');
        }
      } catch (error) {
        console.warn('[MeetTracker] Error setting up DOM observation:', error);
      }
    };
    
    // Set up the observer when the DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupObserver);
    } else {
      // DOM is already loaded
      setupObserver();
    }
  }

  // Extract participant information from DOM elements (fallback method)
  extractParticipantsFromDOM(participantElements) {
    Array.from(participantElements).forEach(element => {
      const id = element.dataset.participantId;
      if (!id) return;
      
      let name;
      if (element.dataset.sortKey) {
        name = element.dataset.sortKey.replace(id, '').trim();
      } else {
        name = element.innerText.split('\n')[0].trim();
      }
      
      if (name) {
        this.updateParticipant({
          id,
          name,
          joinTime: Date.now(),
          source: 'dom'
        });
      }
    });
  }

  // Setup visibility change handler to update meeting state
  setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // When tab becomes visible, check meeting state
        this.checkMeetingState();
      }
    });
  }

  // Check if we're in an active meeting
  checkMeetingState() {
    // Check URL for meeting pattern
    const isMeetUrl = window.location.href.includes('meet.google.com/') && 
                     !window.location.href.includes('/landing/');
    
    if (isMeetUrl) {
      // Look for indicators of an active call
      const hasParticipants = document.querySelectorAll('[data-participant-id]').length > 0;
      const hasMeetingControls = document.querySelectorAll('[data-is-muted]').length > 0;
      
      if (hasParticipants || hasMeetingControls) {
        // We're in an active meeting
        this.updateMeetingState();
        this.sendMeetingStateToBackground();
      }
    }
  }

  // Set up message listener for background script communication
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'get_meeting_state') {
        // Send the current meeting state
        sendResponse({
          meetingState: this.meetingState,
          participantCount: this.participantData.size,
          participants: Array.from(this.participantData.values())
        });
        return true;
      }
    });
  }

  // Send update to background script
  sendUpdateToBackground() {
    if (this.networkData.participantUpdates.size === 0) return;
    
    // Get participants that need to be updated
    const updatedParticipants = Array.from(this.networkData.participantUpdates)
      .map(id => this.participantData.get(id))
      .filter(Boolean);
    
    // Clear the update set
    this.networkData.participantUpdates.clear();
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'update_participants',
      data: {
        meetingId: this.meetingState.meetingId,
        meetingTitle: this.meetingState.meetingTitle,
        participants: updatedParticipants
      }
    });
  }

  // Send meeting state to background
  sendMeetingStateToBackground() {
    chrome.runtime.sendMessage({
      type: 'update_meeting_state',
      data: {
        meetingState: this.meetingState,
        participantCount: this.participantData.size
      }
    });
  }
}

// Initialize the tracker when the content script loads
const tracker = new NetworkMeetTracker();

// Debug function that can be called from console
window.debugNetworkMeetTracker = () => {
  console.log('Meeting State:', tracker.meetingState);
  console.log('Participants:', Array.from(tracker.participantData.values()));
  return {
    meetingState: tracker.meetingState,
    participants: Array.from(tracker.participantData.values())
  };
};
