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
                            const nodeText = node.textContent || '';
                            if (node.querySelector && (
                                node.querySelector('[data-participant-id]') ||
                                node.querySelector('[aria-label*="camera"]') ||
                                node.querySelector('[aria-label*="microphone"]') ||
                                node.querySelector('[aria-label*="Join"]') ||
                                node.querySelector('[aria-label*="Leave"]') ||
                                node.querySelector('[aria-label*="Ask to join"]') ||
                                node.querySelector('button') ||
                                nodeText.includes('You left the meeting') ||
                                nodeText.includes('Rejoin') ||
                                nodeText.includes('Return to home') ||
                                nodeText.includes('Ask to join') ||
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
        
        const urlPattern = window.location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/);
        if (!urlPattern) {
            console.log('Result: Not on a meeting URL. State: none');
            return 'none';
        }
        console.log('Debug: On a meeting URL.');

        // --- Post-Meeting Check ---
        // If the "Rejoin" or "Return to home screen" buttons are visible, the meeting has ended.
        const rejoinButton = document.querySelector('button[aria-label*="Rejoin"]');
        const returnHomeButton = document.querySelector('a[href*="https://meet.google.com"]');
        
        // Check for text content that indicates post-meeting screen
        const postMeetingTexts = [
            'You left the meeting',
            'The meeting has ended', 
            'Thanks for joining',
            'Return to home screen',
            'Rejoin'
        ];
        
        let hasPostMeetingText = false;
        for (let text of postMeetingTexts) {
            if (document.body.textContent.includes(text)) {
                hasPostMeetingText = true;
                console.log(`Found post-meeting text: "${text}"`);
                break;
            }
        }
        
        if (rejoinButton || returnHomeButton || hasPostMeetingText) {
            console.log(`Result: Found post-meeting indicators (Rejoin: ${!!rejoinButton}, Return Home: ${!!returnHomeButton}, Text: ${hasPostMeetingText}). State: none`);
            return 'none';
        }

        // --- Active Meeting Check ---
        // Strongest indicator of being in an active call is the "Leave call" button.
        const leaveCallButton = document.querySelector('[aria-label*="Leave call"], [aria-label*="End call"]');
        if (leaveCallButton) {
            console.log('Result: Found \"Leave call\" button. State: active');
            return 'active';
        }

        // --- Waiting Room Check ---
        const joinButton = document.querySelector('[aria-label*="Join"], button[jsname="Qx7uuf"]');
        const askToJoinButton = document.querySelector('[aria-label*="Ask to join"]');
        
        // Check for companion mode button by text content
        let useCompanionModeButton = null;
        const buttons = document.querySelectorAll('button');
        for (let button of buttons) {
            const buttonText = button.textContent.toLowerCase();
            if (buttonText.includes('use companion mode') || buttonText.includes('join now') || buttonText.includes('ask to join')) {
                useCompanionModeButton = button;
                break;
            }
        }
        
        // Check for waiting room specific text patterns
        const waitingRoomTexts = [
            'Join now', 'Ask to join', 'Waiting to join',
            'Someone will let you in soon', 'You\'re waiting for someone to let you in',
            'Check your audio and video', 'Preview your audio and video'
        ];
        
        let hasWaitingText = false;
        for (let text of waitingRoomTexts) {
            if (document.body.textContent.includes(text)) {
                hasWaitingText = true;
                console.log(`Found waiting room text: "${text}"`);
                break;
            }
        }
        
        // Check for camera/microphone preview elements (typical in waiting room)
        const previewVideo = document.querySelector('video[autoplay], video[muted]');
        const micCamControls = document.querySelector('[aria-label*="Turn on camera"], [aria-label*="Turn off camera"], [aria-label*="microphone"]');

        if (joinButton || askToJoinButton || useCompanionModeButton || hasWaitingText || (previewVideo && micCamControls)) {
            console.log(`Result: In preview/waiting room (Join: ${!!joinButton}, AskToJoin: ${!!askToJoinButton}, Companion: ${!!useCompanionModeButton}, WaitingText: ${hasWaitingText}, Preview: ${!!(previewVideo && micCamControls)}). State: waiting`);
            return 'waiting';
        }
        
        // --- Fallback check for active meeting ---
        const participantGrid = document.querySelector('[jsname="A5il2e"]');
        const hasRealParticipants = getParticipants(true).length > 0;
        if (participantGrid || hasRealParticipants) {
            console.log(`Result: Found participant grid or real participants. State: active`);
            return 'active';
        }

        console.log('Result: On meeting URL but no definitive state found. Defaulting to none.');
        // If on a meeting URL but none of the above, assume it's a loading state or the user is not in the call.
        return 'none';
    }

    // Extract participant names using multiple reliable methods
    function getParticipants(realOnly = false) {
        console.log('🔍 Starting participant detection...');
        
        // Method 1: Try people panel first (most reliable for names)
        const peoplePanelNames = getParticipantsFromPeoplePanel();
        if (peoplePanelNames.length > 0) {
            console.log(`✅ Found ${peoplePanelNames.length} participants from people panel`);
            return realOnly ? peoplePanelNames.filter(p => isRealParticipant(p)) : peoplePanelNames;
        }
        
        // Method 2: Try to extract names from participant tiles
        const tileNames = getParticipantsFromTiles();
        if (tileNames.length > 0) {
            console.log(`✅ Found ${tileNames.length} participants from tiles`);
            return realOnly ? tileNames.filter(p => isRealParticipant(p)) : tileNames;
        }
        
        // Method 3: Try to get names from video overlays
        const overlayNames = getParticipantsFromVideoOverlays();
        if (overlayNames.length > 0) {
            console.log(`✅ Found ${overlayNames.length} participants from video overlays`);
            return realOnly ? overlayNames.filter(p => isRealParticipant(p)) : overlayNames;
        }
        
        // Method 4: Last resort - count participants and use placeholders
        const participantCount = getParticipantCountFromVideoTiles();
        if (participantCount > 0) {
            console.log(`⚠️ Could not extract names, using ${participantCount} placeholders`);
            const placeholders = [];
            for (let i = 1; i <= participantCount; i++) {
                placeholders.push(`Participant ${i}`);
            }
            return placeholders;
        }
        
        console.log('❌ No participant data found');
        return [];
    }
    
    // Get participants from the people panel (most reliable source)
    function getParticipantsFromPeoplePanel() {
        const participants = [];
        
        // The people panel is the most reliable source for participant names
        const peoplePanel = document.querySelector('[jsname="hsqVEd"]');
        if (!peoplePanel) {
            console.log('👥 People panel not found or not open');
            return participants;
        }
        
        // Get all name elements from the people panel
        const nameElements = peoplePanel.querySelectorAll('[jsname="YEtHCd"]');
        console.log(`👥 Found ${nameElements.length} entries in people panel`);
        
        nameElements.forEach((element, index) => {
            const rawText = element.textContent?.trim() || '';
            const cleanName = cleanParticipantName(rawText);
            
            console.log(`Entry ${index + 1}: "${rawText}" -> "${cleanName}"`);
            
            if (cleanName && isValidParticipantName(cleanName)) {
                participants.push(cleanName);
                console.log(`✅ Added: ${cleanName}`);
            } else {
                console.log(`❌ Rejected: ${cleanName || rawText} (failed validation)`);
            }
        });
        
        return participants;
    }
    
    // Get participants from participant tiles
    function getParticipantsFromTiles() {
        const participants = [];
        const participantTiles = document.querySelectorAll('[data-participant-id]');
        
        console.log(`📹 Found ${participantTiles.length} participant tiles`);
        
        participantTiles.forEach((tile, index) => {
            const participantId = tile.getAttribute('data-participant-id');
            let foundName = null;
            
            // Try multiple selectors to find names in tiles
            const nameSelectors = [
                '.zWfAib',      // Common name overlay
                '.VUbVFb',      // Alternative name class  
                '.V4YR2b',      // Another name class
                '.rKjVjd',      // Name container
                '[data-self-name]', // Self name attribute
                '.participant-name' // Generic participant name class
            ];
            
            // Try each selector
            for (const selector of nameSelectors) {
                const nameElement = tile.querySelector(selector);
                if (nameElement) {
                    const text = nameElement.textContent?.trim();
                    if (text) {
                        const cleanName = cleanParticipantName(text);
                        if (cleanName && isValidParticipantName(cleanName)) {
                            foundName = cleanName;
                            break;
                        }
                    }
                }
            }
            
            console.log(`Tile ${index + 1} (ID: ${participantId}): ${foundName || 'No name found'}`);
            
            if (foundName) {
                participants.push(foundName);
            }
        });
        
        return [...new Set(participants)]; // Remove duplicates
    }
    
    // Get participants from video overlays (name labels on videos)
    function getParticipantsFromVideoOverlays() {
        const participants = [];
        
        // Look for video elements with name overlays
        const videos = document.querySelectorAll('video');
        console.log(`📹 Found ${videos.length} video elements`);
        
        videos.forEach((video, index) => {
            // Look for name overlays near the video element
            const container = video.closest('[data-participant-id]') || video.parentElement;
            if (!container) return;
            
            // Search for text that looks like names in the video container
            const textElements = container.querySelectorAll('*');
            
            textElements.forEach(element => {
                const text = element.textContent?.trim();
                if (text && text.length > 1 && text.length < 50) {
                    // Check if this looks like a name (contains letters and possibly spaces)
                    if (/^[A-Za-z][A-Za-z\s]*$/.test(text)) {
                        const cleanName = cleanParticipantName(text);
                        if (cleanName && isValidParticipantName(cleanName)) {
                            participants.push(cleanName);
                            console.log(`Video ${index + 1}: Found name "${cleanName}"`);
                        }
                    }
                }
            });
        });
        
        return [...new Set(participants)]; // Remove duplicates
    }
    
    // Count participants from video tiles (fallback method)
    function getParticipantCountFromVideoTiles() {
        // Count actual video elements that represent participants
        const videoElements = document.querySelectorAll('video');
        const participantTiles = document.querySelectorAll('[data-participant-id]');
        
        // Filter out videos that might not be participant videos (like screen shares)
        const participantVideos = Array.from(videoElements).filter(video => {
            // Check if video has srcObject (active video stream)
            return video.srcObject && video.srcObject.getVideoTracks().length > 0;
        });
        
        const videoCount = participantVideos.length;
        const tileCount = participantTiles.length;
        
        console.log(`📹 Active video streams: ${videoCount}, Participant tiles: ${tileCount}`);
        
        // Return the more conservative count
        return Math.min(videoCount, tileCount) || Math.max(videoCount, tileCount);
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
        
        // Filter out screen sharing related text patterns
        const screenSharingPatterns = [
            /\bdisappearing\s+link\b/i,
            /\bshare\s+screen\b/i,
            /\bsharing\s+screen\b/i,
            /\bstop\s+sharing\b/i,
            /\bpresenting\b/i,
            /\bpresentation\b/i,
            /\bstop\s+presenting\b/i,
            /\bscreen\s+share\b/i,
            /\bannotation\b/i,
            /\bannotating\b/i,
            /\btry\s+annotating\b/i,
            /\blaser\s+pointer\b/i,
            /\bpointer\b/i,
            /\bcursor\b/i,
            /\bhighlight\b/i,
            /\bdraw\b/i,
            /\bdrawing\b/i
        ];
        
        for (let pattern of screenSharingPatterns) {
            if (pattern.test(name)) {
                console.log(`✗ Filtered out screen sharing text: "${name}"`);
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
            'Streaming', 'Recording', 'Recorded', 'Moderator', 'Admin',
            // Screen sharing specific terms
            'disappearing link', 'Disappearing Link', 'DISAPPEARING LINK',
            'link', 'Link', 'LINK', 'disappearing', 'Disappearing'
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
            'minimize', 'maximize', 'close', 'exit', 'controls', 'toolbar',
            // Additional screen sharing terms
            'disappearing', 'disappear', 'link expires', 'temporary link', 'temp link'
        ];
        
        // Check if name contains any invalid patterns
        for (let invalid of [...invalidNames, ...screenSharingElements]) {
            if (name.toLowerCase().includes(invalid.toLowerCase())) {
                console.log(`✗ Filtered out invalid name pattern: "${name}" (matched: ${invalid})`);
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
            'sticker', 'pen', 'pointer', 'text', 'fields', 'annotating', 'laser',
            'link', 'disappearing', 'annotation', 'presenting'
        ];
        if (!name.includes(' ') && singleWordUIElements.includes(name.toLowerCase())) {
            return false;
        }
        
        // Additional check: if the name looks like a UI instruction or action
        const uiInstructionPatterns = [
            /^(try|click|tap|press|select|choose|enable|disable|turn|start|stop)\s/i,
            /\s(now|here|this|that|button|icon|option|setting)$/i
        ];
        
        for (let pattern of uiInstructionPatterns) {
            if (pattern.test(name)) {
                console.log(`✗ Filtered out UI instruction: "${name}"`);
                return false;
            }
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

    // Extract meeting title from the page
    function getMeetingTitle() {
        // Try multiple approaches to get the meeting title
        
        // Method 1: Look for the meeting title in the document title
        if (document.title && document.title !== 'Google Meet' && !document.title.includes('Meet - ')) {
            const titleMatch = document.title.match(/^(.+?) - Google Meet$/);
            if (titleMatch) {
                return titleMatch[1].trim();
            }
        }
        
        // Method 2: Look for meeting info in the UI
        const meetingInfoSelectors = [
            '[data-meeting-title]',
            '[aria-label*="meeting"][aria-label*="title"]',
            '.meeting-title',
            '.call-title',
            '[jsname="r4nke"]', // Meeting info panel
            '[jsname="JAPqpe"]' // Alternative meeting info
        ];
        
        for (let selector of meetingInfoSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                const title = element.textContent.trim();
                if (title.length > 2 && title.length < 200) {
                    return title;
                }
            }
        }
        
        // Method 3: Look in the more info panel or settings
        const infoButtons = document.querySelectorAll('[aria-label*="info"], [aria-label*="details"]');
        // This would require clicking the info button to get the title, which might be intrusive
        
        // Method 4: Try to extract from URL parameters or hash
        const urlParams = new URLSearchParams(window.location.search);
        const titleFromUrl = urlParams.get('title') || urlParams.get('name');
        if (titleFromUrl) {
            return decodeURIComponent(titleFromUrl);
        }
        
        // Fallback: Use meeting code as title
        const meetingCode = window.location.pathname.match(/\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/)?.[1];
        return meetingCode ? `Meeting ${meetingCode}` : 'Untitled Meeting';
    }

    // Start a new meeting session
    function startMeetingSession() {
        console.log('Meeting started');
        
        const title = getMeetingTitle();
        console.log('Detected meeting title:', title);
        
        currentMeeting = {
            id: generateMeetingId(),
            title: title,
            url: window.location.href,
            startTime: Date.now(),
            endTime: null,
            participants: [],
            minutes: []
        };

        // Send message to background script
        try {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({
                    action: 'meetingStarted',
                    meeting: currentMeeting
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('Extension context invalidated:', chrome.runtime.lastError.message);
                    }
                });
            }
        } catch (error) {
            console.log('Extension context invalidated:', error.message);
        }
    }

    // End the current meeting session
    function endMeetingSession() {
        console.log('Meeting ended');
        
        if (currentMeeting) {
            currentMeeting.endTime = Date.now();
            
            // Send final meeting data
            try {
                if (chrome.runtime && chrome.runtime.id) {
                    chrome.runtime.sendMessage({
                        action: 'meetingEnded',
                        meeting: currentMeeting
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('Extension context invalidated:', chrome.runtime.lastError.message);
                        }
                    });
                }
            } catch (error) {
                console.log('Extension context invalidated:', error.message);
            }
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
            try {
                if (chrome.runtime && chrome.runtime.id) {
                    chrome.runtime.sendMessage({
                        action: 'meetingUpdate',
                        meeting: currentMeeting,
                        minuteData: minuteData
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('Extension context invalidated:', chrome.runtime.lastError.message);
                        }
                    });
                }
            } catch (error) {
                console.log('Extension context invalidated:', error.message);
            }
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
        console.log(`🔔 Updating extension icon to state: "${state}"`);
        try {
            if (chrome.runtime && chrome.runtime.id) {
                const participants = getParticipants();
                console.log(`📨 Sending updateIcon message: state="${state}", participants=[${participants.join(', ')}]`);
                
                chrome.runtime.sendMessage({
                    action: 'updateIcon',
                    state: state,
                    participants: participants
                }, (response) => {
                    // Handle potential extension context invalidation
                    if (chrome.runtime.lastError) {
                        console.log('Extension context invalidated, stopping updates:', chrome.runtime.lastError.message);
                        if (meetingInterval) {
                            clearInterval(meetingInterval);
                            meetingInterval = null;
                        }
                    } else {
                        console.log(`✅ Icon update message sent successfully for state: "${state}"`);
                    }
                });
            } else {
                console.log('⚠️ Chrome runtime not available for icon update');
            }
        } catch (error) {
            console.log('Extension context invalidated, stopping updates:', error.message);
            if (meetingInterval) {
                clearInterval(meetingInterval);
                meetingInterval = null;
            }
        }
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
        if (meetingState === 'active') {
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
        try {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({ action: 'clearAllData' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.log('Extension context invalidated:', chrome.runtime.lastError.message);
                        return;
                    }
                    if (response && response.success) {
                        console.log('✅ All meeting data cleared successfully!');
                    } else {
                        console.log('❌ Failed to clear meeting data');
                    }
                });
            }
        } catch (error) {
            console.log('Extension context invalidated:', error.message);
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
