// Enhanced Background service worker for Google Meet Tracker with improved storage
// Try to import the storage manager, fallback to legacy if it fails
try {
    importScripts('storage-manager.js');
    console.log('✅ Storage manager imported successfully');
} catch (error) {
    console.log('⚠️ Failed to import storage manager, will use fallback:', error);
}

let currentMeetingState = {
    state: 'none', // 'none', 'waiting', or 'active'
    participants: [],
    currentMeeting: null
};

let storageManager = null;

// Initialize enhanced storage when service worker starts
async function initializeEnhancedStorage() {
    console.log('🚀 Google Meet Tracker with enhanced storage starting...');
    
    // Always initialize legacy storage first as fallback
    await initializeLegacyStorage();
    
    // Try to initialize enhanced storage
    if (typeof MeetingStorageManager !== 'undefined') {
        try {
            console.log('🚀 Initializing enhanced storage...');
            storageManager = new MeetingStorageManager();
            await storageManager.init();
            console.log('✅ IndexedDB storage initialized successfully');
            
            // Migrate existing data from chrome.storage.local if it exists
            await migrateExistingData();
            
            // Set up periodic cleanup
            schedulePeriodicCleanup();
            
        } catch (error) {
            console.error('❌ Failed to initialize enhanced storage:', error);
            storageManager = null; // Ensure fallback to legacy
        }
    } else {
        console.log('⚠️ MeetingStorageManager not available, using legacy storage');
    }
}

// Initialize on extension install/update
chrome.runtime.onInstalled.addListener(async () => {
    console.log('Google Meet Tracker installed/updated');
    await initializeEnhancedStorage();
});

// Initialize on service worker startup
chrome.runtime.onStartup.addListener(async () => {
    console.log('Chrome started, initializing enhanced storage');
    await initializeEnhancedStorage();
});

// Initialize immediately when service worker loads
(async () => {
    console.log('Service worker loaded, initializing enhanced storage');
    await initializeEnhancedStorage();
})();

// Migrate existing data from chrome.storage.local to IndexedDB
async function migrateExistingData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['meetings'], async (result) => {
            if (result.meetings && result.meetings.length > 0) {
                console.log(`Migrating ${result.meetings.length} existing meetings to IndexedDB...`);
                
                try {
                    // Migrate each meeting
                    for (const meeting of result.meetings) {
                        await storageManager.saveMeeting(meeting);
                    }
                    
                    console.log('Migration completed successfully');
                    
                    // Clear old data after successful migration
                    chrome.storage.local.remove(['meetings'], () => {
                        console.log('Legacy storage cleared');
                    });
                    
                } catch (error) {
                    console.error('Migration failed:', error);
                }
            }
            resolve();
        });
    });
}

// Initialize legacy storage as fallback
async function initializeLegacyStorage() {
    chrome.storage.local.get(['meetings'], (result) => {
        if (!result.meetings) {
            chrome.storage.local.set({ meetings: [] });
        }
    });
}

// Handle messages from content script with enhanced storage
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`📬 Enhanced Background received message: "${request.action}"`);
    
    // Handle async operations properly
    const handleAsync = async () => {
        try {
            switch (request.action) {
                case 'meetingStarted':
                    await handleMeetingStarted(request.meeting, sender);
                    return { success: true };
                    
                case 'meetingUpdate':
                    await handleMeetingUpdate(request.meeting, request.minuteData, sender);
                    return { success: true };
                    
                case 'meetingEnded':
                    await handleMeetingEnded(request.meeting, sender);
                    return { success: true };
                    
                case 'updateIcon':
                    updateIcon(request.state, request.participants);
                    currentMeetingState.state = request.state;
                    currentMeetingState.participants = request.participants;
                    if (request.state === 'none') {
                        currentMeetingState.currentMeeting = null;
                    }
                    return { success: true };
                    
                case 'getMeetings':
                    console.log('🔍 Getting meetings from IndexedDB...');
                    const meetings = await getMeetings(request.options);
                    console.log(`📊 Retrieved ${meetings.length} meetings from storage`);
                    return meetings;
                    
                case 'getCurrentState':
                    return currentMeetingState;
                    
                case 'clearAllData':
                    const result = await clearAllData();
                    return result;
                    
                case 'getStorageStats':
                    if (storageManager) {
                        const stats = await storageManager.getStorageStats();
                        return stats;
                    } else {
                        return { error: 'Storage not initialized' };
                    }
                    
                case 'exportData':
                    if (storageManager) {
                        const exportData = await storageManager.exportData(request.options);
                        return exportData;
                    } else {
                        return { error: 'Storage not initialized' };
                    }
                    
                case 'cleanupOldData':
                    if (storageManager) {
                        const cleanupResult = await storageManager.cleanupOldData(request.options);
                        return cleanupResult;
                    } else {
                        return { error: 'Storage not initialized' };
                    }
                    
                case 'importMeetings':
                    if (storageManager) {
                        const importResult = await importMeetings(request.meetings);
                        return importResult;
                    } else {
                        return { error: 'Enhanced storage not initialized' };
                    }
                    
                default:
                    return { error: 'Unknown action: ' + request.action };
            }
        } catch (error) {
            console.error('Error handling message:', error);
            return { error: error.message };
        }
    };
    
    // Handle the async operation and send response
    handleAsync().then(result => {
        console.log(`✅ Sending response for ${request.action}:`, result);
        sendResponse(result);
    }).catch(error => {
        console.error(`❌ Error in ${request.action}:`, error);
        sendResponse({ error: error.message });
    });
    
    // Return true to indicate we will respond asynchronously
    return true;
});

// Enhanced meeting started handler
async function handleMeetingStarted(meeting, sender) {
    console.log('Meeting started (active):', meeting);
    
    if (storageManager) {
        // Check for ongoing meetings using IndexedDB
        const recentMeetings = await storageManager.getMeetings({ 
            limit: 10,
            dateRange: {
                start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 24 hours
                end: new Date().toISOString().split('T')[0]
            }
        });
        
        // End any ongoing meetings
        for (const existingMeeting of recentMeetings) {
            if (!existingMeeting.endTime) {
                console.log(`Ending ongoing meeting: ${existingMeeting.id}`);
                const updatedMeeting = { ...existingMeeting, endTime: Date.now() };
                await storageManager.saveMeeting(updatedMeeting);
            }
        }
    }
    
    // Update current state
    currentMeetingState.currentMeeting = meeting;
    currentMeetingState.state = 'active';
    updateIcon('active', meeting.participants);
}

// Enhanced meeting update handler
async function handleMeetingUpdate(meeting, minuteData, sender) {
    console.log('Meeting update:', minuteData);
    currentMeetingState.currentMeeting = meeting;
    currentMeetingState.participants = minuteData.participants;
    
    // Save meeting update with enhanced storage
    if (storageManager) {
        await storageManager.saveMeeting(meeting);
    } else {
        // Fallback to legacy storage
        await saveMeetingLegacy(meeting);
    }
}

// Enhanced meeting ended handler
async function handleMeetingEnded(meeting, sender) {
    console.log('Meeting ended:', meeting);
    
    // Save final meeting data
    if (storageManager) {
        await storageManager.saveMeeting(meeting);
    } else {
        await saveMeetingLegacy(meeting);
    }
    
    // Reset state
    currentMeetingState = {
        state: 'none',
        participants: [],
        currentMeeting: null
    };
    
    updateIcon('none', []);
}

// Enhanced get meetings function
async function getMeetings(options = {}) {
    if (storageManager) {
        return await storageManager.getMeetings(options);
    } else {
        // Fallback to legacy storage
        return new Promise((resolve) => {
            chrome.storage.local.get(['meetings'], (result) => {
                resolve(result.meetings || []);
            });
        });
    }
}

// Enhanced clear all data function
async function clearAllData() {
    try {
        if (storageManager) {
            await storageManager.clearAllData();
        } else {
            // Fallback to legacy storage
            chrome.storage.local.set({ meetings: [] });
        }
        
        // Reset current meeting state
        currentMeetingState = {
            state: 'none',
            participants: [],
            currentMeeting: null
        };
        
        console.log('All meeting data cleared');
        return { success: true };
        
    } catch (error) {
        console.error('Error clearing data:', error);
        return { success: false, error: error.message };
    }
}

// Import meetings function
async function importMeetings(meetings) {
    try {
        console.log(`📥 Importing ${meetings.length} meetings to enhanced storage...`);
        
        let imported = 0;
        for (const meeting of meetings) {
            await storageManager.saveMeeting(meeting);
            imported++;
        }
        
        console.log(`✅ Successfully imported ${imported} meetings`);
        return { success: true, imported: imported };
        
    } catch (error) {
        console.error('❌ Import failed:', error);
        return { success: false, error: error.message };
    }
}

// Legacy storage save function (fallback)
function saveMeetingLegacy(meeting) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['meetings'], (result) => {
            const meetings = result.meetings || [];
            const existingIndex = meetings.findIndex(m => m.id === meeting.id);
            
            if (existingIndex >= 0) {
                meetings[existingIndex] = meeting;
            } else {
                meetings.push(meeting);
            }
            
            chrome.storage.local.set({ meetings }, () => {
                console.log('Meeting saved to legacy storage');
                resolve();
            });
        });
    });
}

// Update extension icon (with debugging)
function updateIcon(state, participants) {
    console.log(`🎨 Enhanced Background: Updating icon for state "${state}" with ${participants.length} participants`);
    
    let iconPath;
    let badgeText = '';
    let badgeColor = '#4285f4';
    let title = 'Google Meet Tracker';

    switch (state) {
        case 'active':
            iconPath = {
                '16': 'icons/icon16-active.png',
                '48': 'icons/icon48-active.png',
                '128': 'icons/icon128-active.png'
            };
            const realParticipants = participants.filter(p => !p.includes('Studio Display'));
            badgeText = realParticipants.length.toString();
            badgeColor = '#34a853';
            title = `In meeting with ${badgeText} participant(s)`;
            console.log(`🟢 Setting ACTIVE icon: badge="${badgeText}", color="${badgeColor}"`);
            break;
        case 'waiting':
            iconPath = {
                '16': 'icons/icon16.png',
                '48': 'icons/icon48.png',
                '128': 'icons/icon128.png'
            };
            badgeText = '...';
            badgeColor = '#f57c00';
            title = 'Waiting in meeting lobby';
            console.log(`🟠 Setting WAITING icon: badge="${badgeText}", color="${badgeColor}"`);
            break;
        default:
            iconPath = {
                '16': 'icons/icon16.png',
                '48': 'icons/icon48.png',
                '128': 'icons/icon128.png'
            };
            title = 'Not in a meeting';
            console.log(`⚪ Setting NONE icon: no badge`);
            break;
    }
    
    chrome.action.setIcon({ path: iconPath });
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    chrome.action.setTitle({ title });
    
    console.log(`✅ Enhanced icon updated successfully: state="${state}", title="${title}"`);
}

// Schedule periodic cleanup - DISABLED TO PRESERVE ALL DATA
function schedulePeriodicCleanup() {
    // DISABLED: No automatic cleanup to preserve all meetings
    console.log('🚫 Periodic cleanup disabled - all meetings will be preserved indefinitely');
    
    /* ORIGINAL CLEANUP CODE DISABLED:
    // Run cleanup daily
    setInterval(async () => {
        if (storageManager) {
            try {
                const result = await storageManager.cleanupOldData({
                    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
                    maxMeetings: 1000, // Keep max 1000 meetings
                    compressOld: true
                });
                console.log('Periodic cleanup completed:', result);
            } catch (error) {
                console.error('Periodic cleanup failed:', error);
            }
        }
    }, 24 * 60 * 60 * 1000); // Every 24 hours
    */
}

// Handle tab updates (unchanged)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('meet.google.com')) {
        // Tab updated, content script will handle meeting detection
    }
});

// Handle tab removal (unchanged)
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (currentMeetingState.inMeeting) {
        chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
            if (tabs.length === 0) {
                currentMeetingState = {
                    inMeeting: false,
                    participants: [],
                    currentMeeting: null
                };
                updateIcon('none', []);
            }
        });
    }
});
