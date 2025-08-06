// Content script for Google Meet pages
(function() {
    'use strict';

    let currentMeeting = null;
    let meetingInterval = null;
    let meetingState = 'none'; // Can be 'none', 'waiting', or 'active'
    let lastParticipants = [];

    // Constants
    const CHECK_INTERVAL = 5000; // Check every 5 seconds for more responsive detection
    const MINUTE_INTERVAL = 60000; // Record participants every minute
    const PARTICIPANT_SELECTORS = [
        '[data-participant-id]',
        '[jsname="GQRdcd"] c-wiz[data-participant-id]',
        '[aria-label*="participant"]',
        '.uGOf1d', // Participant tiles
        '[jsname="V67aGc"]', // Participant list items
        '[data-resolution-cap] [data-participant-id]' // Video tiles with participant data
    ];

    // Initialize the tracker
    function init() {
        console.log('Google Meet Tracker: Content script loaded on:', window.location.href);
        
        // Start monitoring for meetings
        startMeetingDetection();
        
        // Set up DOM observer for dynamic changes
        setupDOMObserver();
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener(handleMessage);
        
        // Also check on visibility change (tab focus)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                setTimeout(checkMeetingState, 1000);
            }
        });
    }

    // Start detecting meeting state
    function startMeetingDetection() {
        // Check immediately and then every minute
        checkMeetingState();
        
        if (meetingInterval) {
            clearInterval(meetingInterval);
        }
        
        meetingInterval = setInterval(checkMeetingState, CHECK_INTERVAL);
    }
    
    // Set up DOM mutation observer
    function setupDOMObserver() {
        const observer = new MutationObserver((mutations) => {
            // Check for significant DOM changes that might indicate meeting state change
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if any added nodes are related to meeting elements
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === 1) { // Element node
                            if (node.querySelector && (
                                node.querySelector('[data-participant-id]') ||
                                node.querySelector('[aria-label*="camera"]') ||
                                node.querySelector('[aria-label*="microphone"]') ||
                                node.querySelector('video')
                            )) {
                                shouldCheck = true;
                                break;
                            }
                        }
                    }
                }
            });
            
            if (shouldCheck) {
                console.log('DOM changed, rechecking meeting state...');
                setTimeout(checkMeetingState, 500);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Check if currently in a meeting
    function checkMeetingState() {
        const previousState = meetingState;
        meetingState = detectMeetingState();

        console.log(`State transition: ${previousState} -> ${meetingState}`);

        if (meetingState !== previousState) {
            if (meetingState === 'active') {
                startMeetingSession();
            } else if (previousState === 'active') {
                endMeetingSession();
            }
        }

        if (meetingState === 'active') {
            recordMeetingMinute();
        }

        // Update extension icon with the new state
        updateExtensionIcon(meetingState);
    }

    // Detect if user is currently in a meeting and return the state
    function detectMeetingState() {
        console.log('--- Detecting Meeting State ---');
        
        const urlPattern = window.location.pathname.match(/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
        if (!urlPattern) {
            console.log('Result: Not on a meeting URL. State: none');
            return 'none';
        }
        console.log('Debug: On a meeting URL.');

        // --- Active Meeting Check ---
        // Strongest indicator of being in an active call is the "Leave call" button.
        const leaveCallButton = document.querySelector('[aria-label*="Leave call"], [aria-label*="End call"]');
        if (leaveCallButton) {
            console.log('Result: Found "Leave call" button. State: active');
            return 'active';
        }

        // --- Waiting Room Check ---
        const joinButton = document.querySelector('[aria-label*="Join"], button[jsname="Qx7uuf"]');
        const askToJoinButton = document.querySelector('[aria-label*="Ask to join"]');
        
        // Check for companion mode button by text content
        let useCompanionModeButton = null;
        const buttons = document.querySelectorAll('button');
        for (let button of buttons) {
            if (button.textContent.includes('Use Companion mode')) {
                useCompanionModeButton = button;
                break;
            }
        }

        if (joinButton || askToJoinButton || useCompanionModeButton) {
            console.log(`Result: In preview room (Join button: ${!!joinButton}, AskToJoin: ${!!askToJoinButton}, Companion: ${!!useCompanionModeButton}). State: waiting`);
            return 'waiting';
        }
        
        // --- Fallback check for active meeting ---
        const participantGrid = document.querySelector('[jsname="A5il2e"]');
        const hasRealParticipants = getParticipants(true).length > 0;
        if (participantGrid || hasRealParticipants) {
            console.log(`Result: Found participant grid or real participants. State: active`);
            return 'active';
        }

        console.log('Result: On meeting URL but no definitive state found. Defaulting to waiting.');
        // If on a meeting URL but none of the above, assume it's a waiting/loading state.
        return 'waiting';
    }

    // Extract participant names from the meeting
    function getParticipants(realOnly = false) {
        const participants = new Set();
        
        // Focus on the most reliable participant detection methods
        // Method 1: Try to get participants from the people panel (most reliable)
        const peoplePanel = document.querySelector('[jsname="hsqVEd"]');
        if (peoplePanel) {
            const nameElements = peoplePanel.querySelectorAll('[jsname="YEtHCd"]');
            nameElements.forEach(element => {
                const name = element.textContent.trim();
                if (name && isValidParticipantName(name)) {
                    participants.add(name);
                }
            });
        }
        
        // Method 2: Look for participant tiles with data-participant-id
        const participantTiles = document.querySelectorAll('[data-participant-id]');
        console.log('Found participant tiles:', participantTiles.length);
        
        participantTiles.forEach((tile, index) => {
            console.log(`Analyzing tile ${index}:`, tile);
            
            // Try multiple approaches to find names in the tile
            let foundNames = [];
            
            // Approach 1: Look for common name overlay classes
            const nameSelectors = [
                '.zWfAib', '.VUbVFb', '.V4YR2b', '[data-self-name]',
                '.participant-name', '.name-overlay', '.user-name',
                'div[data-tooltip]', 'span[title]', '[aria-label]'
            ];
            
            nameSelectors.forEach(selector => {
                const elements = tile.querySelectorAll(selector);
                elements.forEach(el => {
                    let name = el.textContent || el.getAttribute('aria-label') || el.getAttribute('data-self-name') || el.getAttribute('title') || el.getAttribute('data-tooltip');
                    if (name) {
                        foundNames.push(`${selector}: "${name.trim()}"`);
                        name = cleanParticipantName(name);
                        if (name && isValidParticipantName(name)) {
                            participants.add(name);
                            console.log(`✓ Added participant from ${selector}:`, name);
                        } else {
                            console.log(`✗ Filtered out from ${selector}:`, name);
                        }
                    }
                });
            });
            
            // Approach 2: Look for any text that might be a name
            const allTextElements = tile.querySelectorAll('*');
            allTextElements.forEach(el => {
                const text = el.textContent?.trim();
                if (text && text.length > 2 && text.length < 50 && /^[a-zA-Z\s]+$/.test(text)) {
                    // This might be a name, let's see if it passes our filters
                    const cleanName = cleanParticipantName(text);
                    if (cleanName && isValidParticipantName(cleanName) && !foundNames.some(f => f.includes(cleanName))) {
                        foundNames.push(`text: "${text}"`);
                        participants.add(cleanName);
                        console.log(`✓ Added participant from text content:`, cleanName);
                    }
                }
            });
            
            console.log(`Tile ${index} found names:`, foundNames);
        });
        
        // Method 3: Look in captions/transcript area for speaker names
        const captionElements = document.querySelectorAll('[jsname="dsyhDe"] [jsname="YEtHCd"]');
        captionElements.forEach(element => {
            const name = element.textContent.trim();
            if (name && isValidParticipantName(name)) {
                participants.add(name);
            }
        });

        let finalParticipants = Array.from(participants);
        
        // Apply additional filtering if requested
        if (realOnly) {
            finalParticipants = finalParticipants.filter(p => isRealParticipant(p));
        }

        console.log('Participant detection:', {
            peoplePanel: !!peoplePanel,
            participantTiles: participantTiles.length,
            captionElements: captionElements.length,
            rawParticipants: Array.from(participants),
            filteredParticipants: finalParticipants
        });

        return finalParticipants;
    }
    
    // Check if a name is a valid participant name (not a UI element)
    function isValidParticipantName(name) {
        if (!name || name.trim().length === 0) return false;
        
        // Filter out join/leave notification messages
        const joinLeavePatterns = [
            /\b(joined|left|disconnected|reconnected)\b/i,
            /\b(has joined|has left|is presenting|stopped presenting)\b/i,
            /\b(entered|exited|connected|connection)\b/i
        ];
        
        for (let pattern of joinLeavePatterns) {
            if (pattern.test(name)) {
                console.log(`✗ Filtered out join/leave message: "${name}"`);
                return false;
            }
        }
        
        // Filter out common UI elements and non-names
        const invalidNames = [
            'You', 'you', 'devices', 'frame_person', 'visual_effects',
            'Backgrounds and effects', 'more_vert', 'More options',
            'Jump to bottom', 'Others might still see', 'Studio Display',
            'Camera', 'Microphone', 'Speakers', 'Default', 'System',
            'Built-in', 'External', 'USB', 'Bluetooth', 'AirPods',
            'HeadPhones', 'Headset', 'Audio', 'Video', 'Reframe',
            'Share screen', 'Present now', 'Settings', 'More', 'Chat',
            'People', 'Activities', 'Whiteboard', 'Record', 'Live stream',
            'Mute', 'Unmute', 'Turn off camera', 'Turn on camera',
            'Turn off microphone', 'Turn on microphone', 'Leave call',
            'End call', 'Join call', 'Ask to join', 'Captions', 'Hand',
            'Raise hand', 'Lower hand', 'Turn off captions', 'Turn on captions',
            'joined', 'left', 'disconnected', 'reconnected', 'presenting',
            'stopped presenting', 'entered', 'exited', 'connected',
            'Meeting host', 'Host', 'Guest', 'Visitor', 'Organizer',
            'LivelyMeeting', 'Meeting', 'keep', 'Keep', 'save', 'Save',
            'Emma Lively', 'Lively', 'Live', 'Stream', 'Broadcasting',
            'Streaming', 'Recording', 'Recorded', 'Moderator', 'Admin'
        ];
        
        // Filter out screen sharing and annotation tools
        const screenSharingElements = [
            'stylus_laser_pointer', 'Try annotating', 'arrow_drop_up', 'arrow_drop_down',
            'sticker', 'Stickers', 'ink_pen', 'Pen', 'stylus_laser_ink', 'textformat',
            'fields', 'text', 'laser_pointer', 'annotation', 'annotating',
            'screen sharing', 'share screen', 'stop sharing', 'sharing screen',
            'Show my screen', 'screen anyway', 'present', 'presenting', 'presentation', 'stop presenting',
            'cursor', 'pointer', 'highlight', 'draw', 'drawing', 'Color', 'color picker',
            'Black', 'Green', 'Red', 'Blue', 'Yellow', 'White', 'BlackGreen', 'RedBlue',
            'YellowWhite', 'BlackGreenRed', 'BlueYellow', 'WhiteBlack', 'GreenRedBlue',
            'select color', 'choose color', 'color options', 'palette',
            'Pin', 'Unpin', 'Zoom', 'zoom in', 'zoom out', 'fit to screen', 'full screen',
            'minimize', 'maximize', 'close', 'exit', 'controls', 'toolbar'
        ];
        
        // Check if name contains any invalid patterns
        for (let invalid of [...invalidNames, ...screenSharingElements]) {
            if (name.toLowerCase().includes(invalid.toLowerCase())) {
                return false;
            }
        }
        
        // Filter out very short names (likely UI elements)
        if (name.trim().length < 2) return false;
        
        // Filter out names that are mostly symbols or numbers
        if (!/^[a-zA-Z\s]+$/.test(name.trim())) return false;
        
        // Filter out strings with underscores (likely UI element IDs)
        if (name.includes('_') || name.includes('-') || name.includes('.')) {
            return false;
        }
        
        // Filter out very long strings (likely concatenated UI text)
        if (name.length > 50) {
            return false;
        }
        
        // Filter out single words that are likely UI elements (but allow real names)
        const singleWordUIElements = [
            'reframe', 'settings', 'chat', 'people', 'more', 'share', 'present', 'record',
            'sticker', 'pen', 'pointer', 'text', 'fields', 'annotating', 'laser'
        ];
        if (!name.includes(' ') && singleWordUIElements.includes(name.toLowerCase())) {
            return false;
        }
        
        return true;
    }
    
    // Check if a participant is a real person (not a device)
    function isRealParticipant(name) {
        if (!isValidParticipantName(name)) return false;
        
        // Additional device filtering
        const deviceKeywords = [
            'Studio Display', 'Camera', 'Microphone', 'Speakers',
            'Built-in', 'External', 'USB', 'Bluetooth', 'AirPods',
            'HeadPhones', 'Headset', 'Default', 'System'
        ];
        
        for (let keyword of deviceKeywords) {
            if (name.includes(keyword)) {
                return false;
            }
        }
        
        return true;
    }

    // Extract participant name from an element
    function extractParticipantName(element) {
        let name = '';
        
        // Try different attributes and properties
        const nameSelectors = [
            'data-self-name',
            'aria-label',
            'title',
            'data-tooltip',
            '[jsname="YEtHCd"]'
        ];

        for (let selector of nameSelectors) {
            if (selector.startsWith('[')) {
                const nameEl = element.querySelector(selector);
                if (nameEl) {
                    name = nameEl.textContent;
                    break;
                }
            } else {
                name = element.getAttribute(selector);
                if (name) break;
            }
        }

        if (!name) {
            name = element.textContent;
        }

        return cleanParticipantName(name);
    }

    // Clean up participant name
    function cleanParticipantName(name) {
        if (!name) return '';
        
        name = name.trim();
        
        // Remove common suffixes/prefixes
        name = name.replace(/\s*\(You\)$/i, '');
        name = name.replace(/^You\s*[-:]/i, '');
        name = name.replace(/\s*\(Host\)$/i, '');
        name = name.replace(/\s*\(Guest\)$/i, '');
        name = name.replace(/\s*\(Presenting\)$/i, '');
        name = name.replace(/\s*\(Organizer\)$/i, '');
        name = name.replace(/\s*\(Moderator\)$/i, '');
        
        // Remove meeting-related suffixes
        name = name.replace(/Meeting host$/i, '');
        name = name.replace(/LivelyMeeting$/i, '');
        name = name.replace(/Lively$/i, '');
        
        // Remove email addresses
        name = name.replace(/\s*<[^>]+>/, '');
        
        // Fix duplicated names by checking if string is duplicated
        // e.g., "Abdul JamalAbdul Jamal" -> "Abdul Jamal"
        if (name.length >= 4 && name.length % 2 === 0) {
            const midPoint = name.length / 2;
            const firstHalf = name.substring(0, midPoint);
            const secondHalf = name.substring(midPoint);
            
            if (firstHalf === secondHalf) {
                console.log(`Fixed duplicated name: "${name}" -> "${firstHalf}"`);
                name = firstHalf;
            }
        }
        
        // Clean up concatenated UI text like "Emma LivelyMeeting host"
        const cleanedName = name.replace(/(LivelyMeeting\s*host|Meeting\s*host|Visitor|keep|Keep)$/i, '').trim();
        if (cleanedName.length > 0 && cleanedName !== name) {
            console.log(`Cleaned UI suffix: "${name}" -> "${cleanedName}"`);
            name = cleanedName;
        }
        
        return name.trim();
    }

    // Start a new meeting session
    function startMeetingSession() {
        console.log('Meeting started');
        
        currentMeeting = {
            id: generateMeetingId(),
            url: window.location.href,
            startTime: Date.now(),
            endTime: null,
            participants: [],
            minutes: []
        };

        // Send message to background script
        chrome.runtime.sendMessage({
            action: 'meetingStarted',
            meeting: currentMeeting
        });
    }

    // End the current meeting session
    function endMeetingSession() {
        console.log('Meeting ended');
        
        if (currentMeeting) {
            currentMeeting.endTime = Date.now();
            
            // Send final meeting data
            chrome.runtime.sendMessage({
                action: 'meetingEnded',
                meeting: currentMeeting
            });
        }

        currentMeeting = null;
        lastParticipants = [];
    }

    // Record meeting data for the current minute
    function recordMeetingMinute() {
        if (!currentMeeting) return;

        const participants = getParticipants();
        const now = Date.now();

        // Only record if participants changed or it's been a minute
        const lastRecord = currentMeeting.minutes[currentMeeting.minutes.length - 1];
        const shouldRecord = !lastRecord || 
                            (now - lastRecord.timestamp) >= MINUTE_INTERVAL || 
                            JSON.stringify(participants.sort()) !== JSON.stringify(lastParticipants.sort());

        if (shouldRecord) {
            const minuteData = {
                timestamp: now,
                participants: [...participants]
            };

            currentMeeting.minutes.push(minuteData);
            
            // Update overall participants list
            participants.forEach(p => {
                if (!currentMeeting.participants.includes(p)) {
                    currentMeeting.participants.push(p);
                }
            });

            lastParticipants = [...participants];

            console.log('Recording meeting minute:', minuteData);

            // Send update to background script
            chrome.runtime.sendMessage({
                action: 'meetingUpdate',
                meeting: currentMeeting,
                minuteData: minuteData
            });
        }
    }

    // Generate consistent meeting ID based on the Google Meet room code
    function generateMeetingId() {
        // Extract the meeting room code from the URL (e.g., "abc-defg-hij")
        const meetingCode = window.location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/)?.[1];
        if (meetingCode) {
            // Use just the meeting code as the unique identifier
            // This ensures the same meeting room always gets the same ID
            return meetingCode;
        }
        // Fallback for non-standard URLs
        return window.location.pathname.replace(/[^a-z0-9]/gi, '-') || 'unknown-meeting';
    }

    // Update extension icon based on meeting state
    function updateExtensionIcon(state) {
        chrome.runtime.sendMessage({
            action: 'updateIcon',
            state: state,
            participants: getParticipants()
        });
    }

    // Handle messages from background script
    function handleMessage(request, sender, sendResponse) {
        if (request.action === 'getMeetingState') {
            sendResponse({
                state: meetingState,
                participants: getParticipants(),
                currentMeeting: currentMeeting
            });
        }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (meetingInterval) {
            clearInterval(meetingInterval);
        }
        if (isInMeeting) {
            endMeetingSession();
        }
    });

    // Debug function to manually check state
    window.debugMeetTracker = function() {
        console.log('===== MANUAL DEBUG TRIGGER =====');
        const currentState = detectMeetingState();
        console.log('Current Detected State:', currentState);
        console.log('Internal State Variable:', meetingState);
        console.log('Current meeting object:', currentMeeting);
        
        console.log('--- Key Selectors Status ---');
        const selectorsToDebug = {
            leaveButton: '[aria-label*="Leave call"], [aria-label*="End call"]',
            joinButton: '[aria-label*="Join"], button[jsname="Qx7uuf"]',
            askToJoinButton: '[aria-label*="Ask to join"]',
            participantGrid: '[jsname="A5il2e"]',
            anyParticipant: '[data-participant-id]'
        };

        for (const [key, selector] of Object.entries(selectorsToDebug)) {
            const element = document.querySelector(selector);
            console.log(`${key}:`, element ? 'FOUND' : 'NOT FOUND', `(selector: ${selector})`);
        }

        const allParticipants = getParticipants(false);
        const realParticipants = getParticipants(true);
        console.log('All Detected Participants:', allParticipants);
        console.log('Filtered (Real) Participants:', realParticipants);
        
        // Force a state check and UI update
        checkMeetingState();
        console.log('==============================');
    };
    
    // Debug function to clear all data
    window.clearMeetData = function() {
        chrome.runtime.sendMessage({ action: 'clearAllData' }, (response) => {
            if (response && response.success) {
                console.log('✅ All meeting data cleared successfully!');
            } else {
                console.log('❌ Failed to clear meeting data');
            }
        });
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
