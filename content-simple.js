// Simplified Google Meet participant tracker - focuses on immediate detection
// This version prioritizes DOM parsing over network interception for reliability

console.log('[SimpleMeetTracker] Starting simple participant tracker...');

class SimpleMeetTracker {
  constructor() {
    this.participants = new Map();
    this.participantMemory = new Map(); // Persistent participant memory
    this.meetingState = {
      isActive: false,
      meetingId: null,
      startTime: null,
      meetingTitle: null
    };
    this.lastUpdate = Date.now();
    this.minuteTrackingInterval = null;
    this.lastMinuteLogged = null;
    this.lastParticipantDetection = null;
    this.participantRetentionTime = 3 * 60 * 1000; // Keep participants for 3 minutes
    
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
    
    // Set up URL change detection
    this.setupURLChangeDetection();
    
    // Check meeting state
    this.updateMeetingState();
  }

  isMeetPage() {
    return window.location.href.includes('meet.google.com/') && 
           !window.location.href.includes('/landing/');
  }

  setupDOMObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldCheckMeetingState = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any added nodes are related to meeting elements
          for (let node of mutation.addedNodes) {
            if (node.nodeType === 1) { // Element node
              const nodeText = node.textContent || '';
              if (node.querySelector && (
                node.querySelector('[data-participant-id]') ||
                node.querySelector('[aria-label*="camera"]') ||
                node.querySelector('[aria-label*="microphone"]') ||
                node.querySelector('[aria-label*="Join"]') ||
                node.querySelector('[aria-label*="Leave"]') ||
                node.querySelector('[aria-label*="End call"]') ||
                node.querySelector('[aria-label*="Ask to join"]') ||
                node.querySelector('[aria-label*="Rejoin"]') ||
                node.querySelector('button') ||
                nodeText.includes('You left the meeting') ||
                nodeText.includes('Thanks for joining') ||
                nodeText.includes('The meeting has ended') ||
                nodeText.includes('Rejoin') ||
                nodeText.includes('Return to home') ||
                nodeText.includes('Ask to join') ||
                nodeText.includes('Meeting ended') ||
                node.querySelector('video')
              )) {
                shouldCheckMeetingState = true;
                console.log('[SimpleMeetTracker] Meeting-related DOM change detected:', nodeText.substring(0, 100));
                break;
              }
            }
          }
        }
      });
      
      if (shouldCheckMeetingState) {
        console.log('[SimpleMeetTracker] DOM changed, rechecking meeting state...');
        setTimeout(() => {
          this.scanForParticipants();
          this.updateMeetingState();
        }, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[SimpleMeetTracker] Enhanced DOM observer set up');
  }

  setupPeriodicScan() {
    // Scan every 5 seconds for new participants
    setInterval(() => {
      this.scanForParticipants();
    }, 5000);
    
    // Additional aggressive meeting state checking every 10 seconds
    setInterval(() => {
      this.aggressiveMeetingStateCheck();
    }, 10000);
    
    // Very frequent meeting end detection (every 2 seconds)
    setInterval(() => {
      this.frequentMeetingEndCheck();
    }, 2000);
    
    // Network-based detection (check if Meet API calls are still happening)
    this.setupNetworkDetection();
    
    // Page visibility and focus detection
    this.setupPageVisibilityDetection();
  }

  scanForParticipants() {
    const participantElements = document.querySelectorAll('*[data-participant-id]');
    const now = Date.now();
    
    if (participantElements.length === 0) {
      console.log('[SimpleMeetTracker] ⚠️ No participant elements found');
      
      // Check if we're in a meeting but participants panel is closed
      const meetingControls = document.querySelectorAll('[data-is-muted], [data-is-video-on]');
      if (meetingControls.length > 0) {
        console.log('[SimpleMeetTracker] ✅ In meeting but participants panel may be closed - using retained participants');
        this.lastParticipantVisibility = now;
        
        // Use retained participants from memory
        const retainedParticipants = this.getRetainedParticipants();
        if (retainedParticipants.size > 0) {
          console.log(`[SimpleMeetTracker] 🧠 Using ${retainedParticipants.size} retained participants from memory`);
          this.participants = retainedParticipants;
          
          // Send retained participants to background
          this.sendUpdateToBackground();
          return;
        }
      } else {
        // No meeting controls - check if we should use retained participants
        const retainedParticipants = this.getRetainedParticipants();
        if (retainedParticipants.size > 0 && this.meetingState.isActive) {
          console.log(`[SimpleMeetTracker] 🧠 No controls but meeting active - using ${retainedParticipants.size} retained participants`);
          this.participants = retainedParticipants;
          this.sendUpdateToBackground();
          return;
        }
        
        // No participants and no controls - might be zombie meeting
        this.checkForZombieMeeting();
      }
      return;
    }

    console.log(`[SimpleMeetTracker] 🔍 Found ${participantElements.length} participant elements`);

    let newParticipants = 0;
    const currentParticipants = new Map();
    const validParticipants = new Map();

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
        joinTime: this.participants.get(id)?.joinTime || this.participantMemory.get(id)?.joinTime || now,
        lastSeen: now,
        source: 'dom'
      };

      // Check if this is a new participant
      if (!this.participants.has(id) && !this.participantMemory.has(id)) {
        newParticipants++;
        console.log(`[SimpleMeetTracker] ➕ New participant: ${name}`);
      } else {
        // Check if name changed (better detection)
        const existing = this.participants.get(id) || this.participantMemory.get(id);
        if (existing && existing.name !== name && this.isValidParticipantName(name)) {
          console.log(`[SimpleMeetTracker] 📝 Participant name updated: ${existing.name} → ${name}`);
          participant.joinTime = existing.joinTime; // Preserve original join time
        }
      }

      currentParticipants.set(id, participant);
      validParticipants.set(id, participant);
      
      // Store in persistent memory
      this.participantMemory.set(id, {
        ...participant,
        firstSeen: this.participantMemory.get(id)?.firstSeen || now,
        detectionCount: (this.participantMemory.get(id)?.detectionCount || 0) + 1
      });
    });

    // Clean up old participants from memory (older than retention time)
    this.cleanupParticipantMemory(now);
    
    // If we found participants, update our detection timestamp
    if (currentParticipants.size > 0) {
      this.lastParticipantDetection = now;
      console.log(`[SimpleMeetTracker] ✅ Successfully detected ${currentParticipants.size} participants`);
    }

    // Merge current participants with recently retained ones if needed
    const finalParticipants = this.mergeWithRetainedParticipants(currentParticipants, now);

    // Update participants list
    this.participants = finalParticipants;
    this.lastParticipantVisibility = now;

    const participantCountChanged = finalParticipants.size !== this.previousParticipantCount;
    
    if (newParticipants > 0 || participantCountChanged) {
      this.previousParticipantCount = finalParticipants.size;
      console.log(`[SimpleMeetTracker] 📊 Updated participant list: ${finalParticipants.size} participants (${Array.from(finalParticipants.values()).map(p => p.name).join(', ')})`);
      
      // Update meeting state
      this.updateMeetingState();
      
      // Send to background
      this.sendUpdateToBackground();
    }
  }

  updateMeetingState() {
    const meetingId = this.getMeetingId();
    const hasMeetingControls = this.hasMeetingControls();
    const hasParticipants = this.participants.size > 0;
    const hasRetainedParticipants = this.getRetainedParticipants().size > 0;
    
    // Meeting is active if it has controls OR participants (including retained ones)
    const isActive = hasMeetingControls || hasParticipants || (this.meetingState.isActive && hasRetainedParticipants);

    if (isActive && !this.meetingState.isActive) {
      // Meeting started - let the session-based background handle the logic
      const startTime = Date.now();
      
      // Simple meeting start - let background script handle session continuation
      this.meetingState = {
        isActive: true,
        meetingId,
        startTime: startTime,
        meetingTitle: this.getMeetingTitle(),
        resumed: false // This doesn't matter anymore - background handles sessions
      };
      
      console.log(`[SimpleMeetTracker] 🚀 Meeting detected: ${this.meetingState.meetingTitle} at ${new Date(startTime).toLocaleTimeString()}`);
      
      // Send meeting start to background - background will handle session logic
      this.sendMeetingStateToBackground('started');
      
      // Start continuous minute tracking
      this.startMinuteTracking();
      
    } else if (!isActive && this.meetingState.isActive) {
      // Meeting ended - but ensure we have the final participant list
      const endTime = Date.now();
      
      // If we have no current participants, try to use retained participants for the final count
      if (this.participants.size === 0) {
        const retainedParticipants = this.getRetainedParticipants();
        if (retainedParticipants.size > 0) {
          console.log(`[SimpleMeetTracker] 🧠 Meeting ending but using ${retainedParticipants.size} retained participants for final count`);
          this.participants = retainedParticipants;
        }
      }
      
      this.meetingState.isActive = false;
      this.meetingState.endTime = endTime;
      
      const totalDuration = endTime - this.meetingState.startTime;
      const sessionDuration = this.meetingState.resumedAt ? 
        endTime - this.meetingState.resumedAt : totalDuration;
      
      console.log(`[SimpleMeetTracker] 🏁 Meeting ended - Total: ${Math.round(totalDuration / 60000)}m, Session: ${Math.round(sessionDuration / 60000)}m, Final participants: ${this.participants.size}`);
      
      // Send meeting end to background with final meeting data (including retained participants)
      this.sendMeetingStateToBackground('ended');
      
      // Stop minute tracking
      this.stopMinuteTracking();
      
      // Clear participants since meeting ended
      this.participants.clear();
      
      // Clear participant memory after a longer delay to ensure proper meeting end processing
      setTimeout(() => {
        console.log('[SimpleMeetTracker] 🧹 Clearing participant memory after meeting end');
        this.participantMemory.clear();
      }, 10000); // 10 seconds delay
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
    console.log('[SimpleMeetTracker] === Detecting Meeting State ===');
    
    // First check: Are we on a valid meeting URL?
    const urlPattern = window.location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/);
    if (!urlPattern) {
      console.log('[SimpleMeetTracker] Not on a meeting URL - not in meeting');
      return false;
    }
    
    // CRITICAL: Check for post-meeting indicators first (most reliable)
    const rejoinButton = document.querySelector('button[aria-label*="Rejoin"]');
    const returnHomeButton = document.querySelector('a[href*="https://meet.google.com"], a[href*="/"]');
    
    // Check for post-meeting text content
    const postMeetingTexts = [
      'You left the meeting',
      'The meeting has ended', 
      'Thanks for joining',
      'Return to home screen',
      'Rejoin',
      'Meeting ended',
      'You have left the meeting'
    ];
    
    const bodyText = document.body.textContent || '';
    let hasPostMeetingText = false;
    for (let text of postMeetingTexts) {
      if (bodyText.includes(text)) {
        hasPostMeetingText = true;
        console.log(`[SimpleMeetTracker] Found post-meeting text: "${text}"`);
        break;
      }
    }
    
    if (rejoinButton || returnHomeButton || hasPostMeetingText) {
      console.log(`[SimpleMeetTracker] Found post-meeting indicators (Rejoin: ${!!rejoinButton}, Return Home: ${!!returnHomeButton}, Text: ${hasPostMeetingText}) - not in meeting`);
      return false;
    }
    
    // PRIMARY CHECK: "Leave call" or "End call" button is strongest indicator of active meeting
    const leaveCallButton = document.querySelector('[aria-label*="Leave call"], [aria-label*="End call"]');
    if (leaveCallButton) {
      console.log('[SimpleMeetTracker] Found "Leave call" button - in active meeting');
      return true;
    }
    
    // Check for waiting room / pre-meeting state
    const joinButton = document.querySelector('[aria-label*="Join"], button[jsname="Qx7uuf"]');
    const askToJoinButton = document.querySelector('[aria-label*="Ask to join"]');
    
    // Check for companion mode button by text content
    let useCompanionModeButton = null;
    const buttons = document.querySelectorAll('button');
    for (let button of buttons) {
      const buttonText = button.textContent?.toLowerCase() || '';
      if (buttonText.includes('use companion mode') || buttonText.includes('join now') || buttonText.includes('ask to join')) {
        useCompanionModeButton = button;
        break;
      }
    }
    
    // Check for waiting room specific text patterns
    const waitingRoomTexts = [
      'Join now', 'Ask to join', 'Waiting to join',
      'Someone will let you in soon', "You're waiting for someone to let you in",
      'Check your audio and video', 'Preview your audio and video'
    ];
    
    let hasWaitingText = false;
    for (let text of waitingRoomTexts) {
      if (bodyText.includes(text)) {
        hasWaitingText = true;
        console.log(`[SimpleMeetTracker] Found waiting room text: "${text}"`);
        break;
      }
    }
    
    // Check for camera/microphone preview elements (typical in waiting room)
    const previewVideo = document.querySelector('video[autoplay], video[muted]');
    const micCamControls = document.querySelector('[aria-label*="Turn on camera"], [aria-label*="Turn off camera"], [aria-label*="microphone"]');
    
    if (joinButton || askToJoinButton || useCompanionModeButton || hasWaitingText || (previewVideo && micCamControls)) {
      console.log(`[SimpleMeetTracker] In preview/waiting room (Join: ${!!joinButton}, AskToJoin: ${!!askToJoinButton}, Companion: ${!!useCompanionModeButton}, WaitingText: ${hasWaitingText}, Preview: ${!!(previewVideo && micCamControls)}) - not in active meeting`);
      return false;
    }
    
    // Fallback check for active meeting using participant grid or participants
    const participantGrid = document.querySelector('[jsname="A5il2e"]');
    const hasParticipants = this.participants.size > 0;
    
    if (participantGrid || hasParticipants) {
      console.log(`[SimpleMeetTracker] Found participant grid or participants (Grid: ${!!participantGrid}, Participants: ${hasParticipants}) - in active meeting`);
      return true;
    }
    
    // Additional fallback checks
    const controls = document.querySelectorAll('[data-is-muted], [data-is-video-on]').length > 0;
    const meetingArea = document.querySelector('[data-allocation-index]'); // Main meeting area
    const videoElements = document.querySelectorAll('video').length > 0;
    
    const hasIndicators = controls || meetingArea || videoElements;
    console.log(`[SimpleMeetTracker] Final check - controls: ${controls}, meetingArea: ${!!meetingArea}, videos: ${videoElements}, result: ${hasIndicators}`);
    
    return hasIndicators;
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
    
    // Simple duration calculation - let background handle session logic
    const cumulativeDuration = currentTime - this.meetingState.startTime;
    const currentMinute = Math.floor(cumulativeDuration / 60000); // Minutes since start
    
    // Only log if this is a new minute
    if (currentMinute !== this.lastMinuteLogged) {
      this.lastMinuteLogged = currentMinute;
      
      const minuteData = {
        meetingId: this.meetingState.meetingId,
        minute: currentMinute + 1, // 1-based minute numbering
        timestamp: currentTime,
        participants: Array.from(this.participants.values()),
        participantCount: this.participants.size,
        cumulativeDuration: cumulativeDuration,
        resumed: false, // Content script no longer handles resume logic
        previousDuration: 0,
        sessionDuration: cumulativeDuration
      };
      
      console.log(`[SimpleMeetTracker] Minute ${minuteData.minute}: ${minuteData.participantCount} participants`);
      
      // Send minute data to background - background will handle session logic
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
      'connected', 'meeting host', 'host', 'guest', 'visitor', 'organizer',
      'draw', 'drawing', 'annotation', 'annotate', 'pen', 'marker', 'highlighter'
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
  
  // Aggressive meeting state checking - more frequent and thorough
  aggressiveMeetingStateCheck() {
    console.log('[SimpleMeetTracker] Running aggressive meeting state check...');
    
    // Check current meeting controls state
    const hasMeetingControls = this.hasMeetingControls();
    const hasParticipants = this.participants.size > 0;
    const currentlyActive = this.meetingState.isActive;
    
    console.log(`[SimpleMeetTracker] Aggressive check: controls=${hasMeetingControls}, participants=${hasParticipants}, active=${currentlyActive}`);
    
    // If we think the meeting is active but there's no evidence of it
    if (currentlyActive && !hasMeetingControls && !hasParticipants) {
      const now = Date.now();
      const timeSinceStart = now - this.meetingState.startTime;
      
      // If the meeting has been "active" for at least 30 seconds but shows no signs of life
      if (timeSinceStart > 30 * 1000) {
        console.log('[SimpleMeetTracker] Aggressive check: Ending meeting due to no activity signs');
        
        this.meetingState.isActive = false;
        this.meetingState.endTime = now;
        
        // Send meeting end to background
        this.sendMeetingStateToBackground('ended');
        
        // Stop minute tracking
        this.stopMinuteTracking();
        
        // Clear participants
        this.participants.clear();
        
        return;
      }
    }
    
    // Force a fresh scan for participants
    this.scanForParticipants();
    
    // Update meeting state based on fresh data
    this.updateMeetingState();
  }

  setupURLChangeDetection() {
    // Store the original URL
    let currentUrl = window.location.href;
    
    console.log('[SimpleMeetTracker] Setting up URL change detection');
    
    // Override history.pushState to detect navigation
    const originalPushState = history.pushState;
    history.pushState = function(state, title, url) {
      const result = originalPushState.apply(this, arguments);
      const newUrl = window.location.href;
      
      if (newUrl !== currentUrl) {
        console.log(`[SimpleMeetTracker] URL changed from ${currentUrl} to ${newUrl}`);
        currentUrl = newUrl;
        tracker.handleURLChange(newUrl);
      }
      
      return result;
    };
    
    // Override history.replaceState to detect navigation
    const originalReplaceState = history.replaceState;
    history.replaceState = function(state, title, url) {
      const result = originalReplaceState.apply(this, arguments);
      const newUrl = window.location.href;
      
      if (newUrl !== currentUrl) {
        console.log(`[SimpleMeetTracker] URL replaced from ${currentUrl} to ${newUrl}`);
        currentUrl = newUrl;
        tracker.handleURLChange(newUrl);
      }
      
      return result;
    };
    
    // Listen for back/forward navigation
    window.addEventListener('popstate', (event) => {
      const newUrl = window.location.href;
      
      if (newUrl !== currentUrl) {
        console.log(`[SimpleMeetTracker] URL changed via popstate from ${currentUrl} to ${newUrl}`);
        currentUrl = newUrl;
        tracker.handleURLChange(newUrl);
      }
    });
    
    // Listen for hashchange (less common in Meet but good to have)
    window.addEventListener('hashchange', (event) => {
      const newUrl = window.location.href;
      
      if (newUrl !== currentUrl) {
        console.log(`[SimpleMeetTracker] URL hash changed from ${currentUrl} to ${newUrl}`);
        currentUrl = newUrl;
        tracker.handleURLChange(newUrl);
      }
    });
    
    // Also periodically check for URL changes (fallback)
    setInterval(() => {
      const newUrl = window.location.href;
      if (newUrl !== currentUrl) {
        console.log(`[SimpleMeetTracker] URL change detected via polling from ${currentUrl} to ${newUrl}`);
        currentUrl = newUrl;
        tracker.handleURLChange(newUrl);
      }
    }, 2000); // Check every 2 seconds
  }
  
  handleURLChange(newUrl) {
    console.log(`[SimpleMeetTracker] Handling URL change: ${newUrl}`);
    
    const oldUrl = this.currentUrl || window.location.href;
    const oldMeetingId = this.meetingState.meetingId;
    
    // Check if we navigated away from Google Meet entirely
    if (!newUrl.includes('meet.google.com')) {
      console.log('[SimpleMeetTracker] Navigated away from Google Meet - ending meeting');
      
      if (this.meetingState.isActive) {
        this.forceEndMeetingInternal('navigation_away_from_meet');
      }
      return;
    }
    
    // Check if we navigated away from the specific meeting
    if (!this.isMeetPageFromUrl(newUrl)) {
      console.log('[SimpleMeetTracker] Navigated away from meeting page - ending meeting');
      
      if (this.meetingState.isActive) {
        this.forceEndMeetingInternal('navigation_away_from_meeting');
      }
      return;
    }
    
    // Check if we're on a meeting ended or landing page
    if (newUrl.includes('/landing/') || newUrl.includes('/ended/') || newUrl.includes('/thankyou/')) {
      console.log('[SimpleMeetTracker] On meeting ended/landing page - ending meeting');
      
      if (this.meetingState.isActive) {
        this.forceEndMeetingInternal('meeting_ended_page');
      }
      return;
    }
    
    // Extract meeting IDs from URLs
    const oldMeetingIdFromUrl = this.getMeetingIdFromUrl(oldUrl);
    const newMeetingIdFromUrl = this.getMeetingIdFromUrl(newUrl);
    
    console.log(`[SimpleMeetTracker] URL change analysis:`, {
      oldUrl: oldUrl.substring(0, 100),
      newUrl: newUrl.substring(0, 100),
      oldMeetingIdFromUrl,
      newMeetingIdFromUrl,
      currentMeetingId: oldMeetingId
    });
    
    // Check if meeting ID changed in URL (switched to different meeting)
    if (oldMeetingIdFromUrl && newMeetingIdFromUrl && oldMeetingIdFromUrl !== newMeetingIdFromUrl) {
      console.log(`[SimpleMeetTracker] Meeting ID changed in URL: ${oldMeetingIdFromUrl} → ${newMeetingIdFromUrl}`);
      
      if (this.meetingState.isActive) {
        this.forceEndMeetingInternal('meeting_id_changed');
      }
      
      // Reset state for potential new meeting
      this.meetingState = {
        isActive: false,
        meetingId: newMeetingIdFromUrl,
        startTime: null,
        meetingTitle: null
      };
      
      this.participants.clear();
    }
    
    // If we're still on a meeting page, update meeting state
    if (this.isMeetPageFromUrl(newUrl)) {
      console.log('[SimpleMeetTracker] Still on meeting page after URL change - updating state');
      
      // Update stored URL
      this.currentUrl = newUrl;
      
      // Re-scan for participants and update state after URL change
      setTimeout(() => {
        this.scanForParticipants();
        this.updateMeetingState();
      }, 1000); // Give page time to load
    }
  }
  
  isMeetPageFromUrl(url) {
    return url.includes('meet.google.com/') && 
           !url.includes('/landing/') &&
           !url.includes('/ended/');
  }
  
  getMeetingIdFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      
      // Google Meet URLs typically have format: meet.google.com/xxx-yyyy-zzz
      // Extract the last path segment that looks like a meeting ID
      const lastPart = pathParts[pathParts.length - 1];
      
      // Meeting IDs are typically in format xxx-yyyy-zzz (3-4-3 chars with dashes)
      // or longer alphanumeric strings
      if (lastPart && (lastPart.includes('-') || lastPart.length >= 8)) {
        return lastPart;
      }
      
      return null;
    } catch (e) {
      console.warn('[SimpleMeetTracker] Failed to parse URL:', url);
      return null;
    }
  }

  // Frequent meeting end detection (every 2 seconds)
  frequentMeetingEndCheck() {
    if (!this.meetingState.isActive) return;
    
    // Quick checks for meeting end indicators
    const bodyText = document.body.textContent || '';
    const immediateEndSignals = [
      'You left the meeting',
      'Thanks for joining', 
      'The meeting has ended',
      'Meeting ended',
      'Rejoin',
      'Return to home screen'
    ];
    
    for (let signal of immediateEndSignals) {
      if (bodyText.includes(signal)) {
        console.log(`[SimpleMeetTracker] Frequent check: Found end signal "${signal}" - ending meeting`);
        this.forceEndMeetingInternal('text_detection');
        return;
      }
    }
    
    // Check if Leave button disappeared (strong indicator)
    const leaveButton = document.querySelector('[aria-label*="Leave call"], [aria-label*="End call"]');
    const joinButton = document.querySelector('[aria-label*="Join"], [aria-label*="Ask to join"]');
    
    if (!leaveButton && joinButton) {
      console.log('[SimpleMeetTracker] Frequent check: Leave button gone, Join button appeared - ending meeting');
      this.forceEndMeetingInternal('button_change');
      return;
    }
    
    // Check for URL changes to non-meeting pages
    if (!this.isMeetPage()) {
      console.log('[SimpleMeetTracker] Frequent check: No longer on meeting page - ending meeting');
      this.forceEndMeetingInternal('page_navigation');
      return;
    }
  }
  
  // Network-based detection
  setupNetworkDetection() {
    console.log('[SimpleMeetTracker] Setting up network-based detection');
    
    // Track network requests to Google Meet APIs
    this.lastNetworkActivity = Date.now();
    
    // Override fetch to monitor Google Meet API calls
    const originalFetch = window.fetch;
    const tracker = this;
    
    window.fetch = function(...args) {
      const url = args[0];
      if (typeof url === 'string' && (url.includes('meet.google.com') || url.includes('googleapis.com'))) {
        tracker.lastNetworkActivity = Date.now();
        console.log('[SimpleMeetTracker] Network activity detected:', url.substring(0, 100));
      }
      return originalFetch.apply(this, args);
    };
    
    // Check network activity every 30 seconds
    setInterval(() => {
      if (this.meetingState.isActive) {
        const timeSinceLastActivity = Date.now() - this.lastNetworkActivity;
        
        // If no network activity for 5 minutes, meeting might be dead
        if (timeSinceLastActivity > 5 * 60 * 1000) {
          console.log('[SimpleMeetTracker] No network activity for 5 minutes - checking meeting state');
          this.aggressiveMeetingStateCheck();
        }
      }
    }, 30000);
  }
  
  // Page visibility and focus detection  
  setupPageVisibilityDetection() {
    console.log('[SimpleMeetTracker] Setting up page visibility detection');
    
    // Track when user switches tabs/windows
    document.addEventListener('visibilitychange', () => {
      const isVisible = document.visibilityState === 'visible';
      console.log(`[SimpleMeetTracker] Tab visibility changed: ${isVisible ? 'visible' : 'hidden'}`);
      
      if (isVisible && this.meetingState.isActive) {
        console.log('[SimpleMeetTracker] Tab became visible - checking meeting state');
        setTimeout(() => {
          this.scanForParticipants();
          this.updateMeetingState();
        }, 1000);
      } else if (!isVisible && this.meetingState.isActive) {
        console.log('[SimpleMeetTracker] Tab became hidden - continuing background tracking');
        // Don't stop tracking, just note the visibility change
        // Background tracking will continue via the background script
      }
    });
    
    // Track window focus changes
    window.addEventListener('focus', () => {
      console.log('[SimpleMeetTracker] Window focused');
      if (this.meetingState.isActive) {
        console.log('[SimpleMeetTracker] Window focused - checking meeting state');
        setTimeout(() => {
          this.scanForParticipants();
          this.updateMeetingState();
        }, 500);
      }
    });
    
    window.addEventListener('blur', () => {
      console.log('[SimpleMeetTracker] Window blurred');
      // Continue tracking even when window loses focus
    });
    
    // Track beforeunload (page about to close)
    window.addEventListener('beforeunload', () => {
      if (this.meetingState.isActive) {
        console.log('[SimpleMeetTracker] Page unloading - ending meeting');
        this.forceEndMeetingInternal('page_unload');
      }
    });
  }
  
  // Internal method to force end meeting with reason
  forceEndMeetingInternal(reason) {
    if (!this.meetingState.isActive) {
      return false;
    }
    
    console.log(`[SimpleMeetTracker] Force ending meeting due to: ${reason}`);
    
    const now = Date.now();
    const meetingId = this.meetingState.meetingId;
    
    this.meetingState.isActive = false;
    this.meetingState.endTime = now;
    this.meetingState.endReason = reason;
    
    // Special handling for navigation-based endings
    const navigationReasons = [
      'navigation_away_from_meet',
      'navigation_away_from_meeting',
      'meeting_ended_page',
      'meeting_id_changed',
      'page_navigation',
      'page_unload'
    ];
    
    if (navigationReasons.includes(reason)) {
      // Send navigation end notification to background
      this.sendNavigationEndToBackground(meetingId, reason);
    } else {
      // Send regular meeting end to background
      this.sendMeetingStateToBackground('ended');
    }
    
    // Stop minute tracking
    this.stopMinuteTracking();
    
    // Clear participants
    this.participants.clear();
    
    return true;
  }
  
  // Send navigation end notification to background
  sendNavigationEndToBackground(meetingId, reason) {
    if (!chrome?.runtime?.id) {
      console.log('[SimpleMeetTracker] Extension context invalidated, skipping navigation end notification');
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: 'meetingEndedByNavigation',
        meetingId: meetingId,
        reason: reason
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[SimpleMeetTracker] Error sending navigation end:', chrome.runtime.lastError.message);
        } else {
          console.log('[SimpleMeetTracker] Navigation end sent to background');
        }
      });
    } catch (error) {
      console.log('[SimpleMeetTracker] Failed to send navigation end to background:', error.message);
    }
  }

  // Manual cleanup method that can be called from dashboard
  forceEndMeeting() {
    if (!this.meetingState.isActive) {
      console.log('[SimpleMeetTracker] No active meeting to end');
      return false;
    }
    
    console.log('[SimpleMeetTracker] Manually ending meeting:', this.meetingState.meetingTitle);
    return this.forceEndMeetingInternal('manual_cleanup');
  }
  
  // Participant memory management methods
  getRetainedParticipants() {
    const now = Date.now();
    const retainedParticipants = new Map();
    
    // Return participants that were seen recently (within retention time)
    for (const [id, participant] of this.participantMemory) {
      const timeSinceLastSeen = now - participant.lastSeen;
      if (timeSinceLastSeen <= this.participantRetentionTime) {
        retainedParticipants.set(id, {
          id: participant.id,
          name: participant.name,
          avatarUrl: participant.avatarUrl,
          joinTime: participant.joinTime || participant.firstSeen,
          lastSeen: participant.lastSeen,
          source: 'memory',
          retainedFor: timeSinceLastSeen
        });
      }
    }
    
    console.log(`[SimpleMeetTracker] 🧠 Retrieved ${retainedParticipants.size} participants from memory (${Array.from(retainedParticipants.values()).map(p => p.name).join(', ')})`);
    return retainedParticipants;
  }
  
  cleanupParticipantMemory(now) {
    const beforeCount = this.participantMemory.size;
    const maxRetentionTime = this.participantRetentionTime * 2; // Keep in memory for twice as long
    
    // Remove participants that haven't been seen for a very long time
    for (const [id, participant] of this.participantMemory) {
      const timeSinceLastSeen = now - participant.lastSeen;
      if (timeSinceLastSeen > maxRetentionTime) {
        this.participantMemory.delete(id);
      }
    }
    
    const afterCount = this.participantMemory.size;
    if (beforeCount !== afterCount) {
      console.log(`[SimpleMeetTracker] 🧹 Cleaned up participant memory: ${beforeCount} → ${afterCount} participants`);
    }
  }
  
  mergeWithRetainedParticipants(currentParticipants, now) {
    if (currentParticipants.size === 0 && this.meetingState.isActive) {
      // If no current participants but meeting is active, use retained participants
      const retainedParticipants = this.getRetainedParticipants();
      if (retainedParticipants.size > 0) {
        console.log(`[SimpleMeetTracker] 🔄 No current participants detected, using ${retainedParticipants.size} retained participants`);
        return retainedParticipants;
      }
    } else if (currentParticipants.size > 0) {
      // If we have current participants, use them but also check if we should merge with retained ones
      const retainedParticipants = this.getRetainedParticipants();
      
      // Add any retained participants that aren't in current list (they might have temporarily disappeared)
      for (const [id, retainedParticipant] of retainedParticipants) {
        if (!currentParticipants.has(id)) {
          // Only add if they were seen very recently (within 30 seconds)
          const timeSinceLastSeen = now - retainedParticipant.lastSeen;
          if (timeSinceLastSeen <= 30000) { // 30 seconds
            console.log(`[SimpleMeetTracker] 🔄 Adding recently retained participant: ${retainedParticipant.name} (last seen ${Math.round(timeSinceLastSeen/1000)}s ago)`);
            currentParticipants.set(id, {
              ...retainedParticipant,
              source: 'retained',
              lastSeen: retainedParticipant.lastSeen // Keep original lastSeen time
            });
          }
        }
      }
    }
    
    return currentParticipants;
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
