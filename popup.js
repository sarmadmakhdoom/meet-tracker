// Popup script for Google Meet Tracker

document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
});

async function initializePopup() {
    try {
        // Get current meeting state
        const state = await getCurrentMeetingState();
        displayMeetingState(state);
        
        // Set up event listeners
        setupEventListeners();
        
        // Hide loading, show content
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
        
    } catch (error) {
        console.error('Error initializing popup:', error);
        showError('Failed to load meeting status');
    }
}

function getCurrentMeetingState() {
    return new Promise((resolve) => {
        // First try to get state from background script
        chrome.runtime.sendMessage({ action: 'getCurrentState' }, (state) => {
            if (state && state.state !== 'none') {
                resolve(state);
                return;
            }
            
            // If not in meeting according to background, check active tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                
                if (activeTab && activeTab.url && activeTab.url.includes('meet.google.com')) {
                    // Send message to content script for detailed state
                    chrome.tabs.sendMessage(activeTab.id, { action: 'getMeetingState' }, (response) => {
                        if (chrome.runtime.lastError) {
                            // Content script not ready or tab not accessible
                            resolve({ state: 'none', participants: [], currentMeeting: null });
                        } else {
                            resolve(response || { state: 'none', participants: [], currentMeeting: null });
                        }
                    });
                } else {
                    // Not on a meet page
                    resolve({ state: 'none', participants: [], currentMeeting: null });
                }
            });
        });
    });
}

function displayMeetingState(state) {
    const statusElement = document.getElementById('meeting-status');
    const statusText = document.getElementById('status-text');
    const meetingInfo = document.getElementById('meeting-info');
    const participantsSection = document.getElementById('participants-section');
    
    // Reset all states first
    statusElement.className = 'status';
    meetingInfo.style.display = 'none';
    participantsSection.style.display = 'none';

    switch (state.state) {
        case 'active':
            statusElement.classList.add('active');
            statusText.textContent = 'In meeting';
            meetingInfo.style.display = 'block';
            participantsSection.style.display = 'block';
            updateMeetingInfo(state.currentMeeting);
            displayParticipants(state.participants);
            break;
        case 'waiting':
            statusElement.classList.add('waiting');
            statusText.textContent = 'Waiting in lobby';
            participantsSection.style.display = 'block'; // Show devices in lobby
            displayParticipants(state.participants);
            break;
        default: // 'none'
            statusElement.classList.add('inactive');
            statusText.textContent = 'Not in meeting';
            break;
    }
}

function updateMeetingInfo(meeting) {
    const durationElement = document.getElementById('meeting-duration');
    const startElement = document.getElementById('meeting-start');
    
    if (meeting.startTime) {
        const startTime = new Date(meeting.startTime);
        const now = new Date();
        const duration = Math.floor((now - startTime) / (1000 * 60)); // minutes
        
        startElement.textContent = startTime.toLocaleTimeString();
        durationElement.textContent = `${duration} minutes`;
    }
}

function displayParticipants(participants) {
    const participantList = document.getElementById('participant-list');
    const participantCount = document.getElementById('participant-count');
    
    // Names are now cleaned at the source (content.js), just ensure uniqueness
    const uniqueParticipants = [...new Set(participants)].filter(p => p && p.trim().length > 0);
    
    participantCount.textContent = uniqueParticipants.length;
    
    if (uniqueParticipants.length === 0) {
        participantList.innerHTML = '<div class="no-participants">No participants detected</div>';
    } else {
        const participantElements = uniqueParticipants.map(participant => 
            `<div class="participant">${escapeHtml(participant)}</div>`
        ).join('');
        
        participantList.innerHTML = participantElements;
    }
}

function setupEventListeners() {
    // Dashboard button
    document.getElementById('dashboard-btn').addEventListener('click', openDashboard);
    
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', refreshMeetingState);
    
    // Clear data button
    document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
}

function openDashboard() {
    // Create dashboard URL
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
    
    // Open dashboard in new tab
    chrome.tabs.create({ url: dashboardUrl }, () => {
        // Close popup
        window.close();
    });
}

async function refreshMeetingState() {
    const refreshBtn = document.getElementById('refresh-btn');
    const originalText = refreshBtn.textContent;
    
    // Show loading state
    refreshBtn.textContent = '🔄 Loading...';
    refreshBtn.disabled = true;
    
    try {
        const state = await getCurrentMeetingState();
        displayMeetingState(state);
    } catch (error) {
        console.error('Error refreshing state:', error);
        showError('Failed to refresh meeting status');
    } finally {
        // Reset button
        refreshBtn.textContent = originalText;
        refreshBtn.disabled = false;
    }
}

function showError(message) {
    const errorElement = document.getElementById('error');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    
    // Hide error after 5 seconds
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

function clearAllData() {
    if (confirm('Are you sure you want to clear all meeting data? This cannot be undone.')) {
        const clearBtn = document.getElementById('clear-data-btn');
        const originalText = clearBtn.textContent;
        
        // Show loading state
        clearBtn.textContent = '🗑️ Clearing...';
        clearBtn.disabled = true;
        
        chrome.runtime.sendMessage({ action: 'clearAllData' }, (response) => {
            if (response && response.success) {
                // Show success message briefly
                clearBtn.textContent = '✅ Cleared!';
                setTimeout(() => {
                    clearBtn.textContent = originalText;
                    clearBtn.disabled = false;
                }, 2000);
            } else {
                // Show error
                showError('Failed to clear data');
                clearBtn.textContent = originalText;
                clearBtn.disabled = false;
            }
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-refresh every 10 seconds if popup is open
setInterval(async () => {
    if (document.visibilityState === 'visible') {
        try {
            const state = await getCurrentMeetingState();
            displayMeetingState(state);
        } catch (error) {
            console.error('Auto-refresh error:', error);
        }
    }
}, 10000);
