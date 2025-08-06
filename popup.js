// Popup script for Google Meet Tracker

document.addEventListener('DOMContentLoaded', () => {
    initializePopup();
});

async function initializePopup() {
    try {
        // Get current meeting state and recent meetings in parallel
        const [state, recentMeetings] = await Promise.all([
            getCurrentMeetingState(),
            getRecentMeetings()
        ]);
        
        displayMeetingState(state);
        displayRecentMeetings(recentMeetings);
        
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

function getRecentMeetings() {
    return new Promise((resolve) => {
        try {
            if (!chrome.runtime || !chrome.runtime.id) {
                resolve([]);
                return;
            }
            
            chrome.runtime.sendMessage({ action: 'getMeetings' }, (response) => {
                if (chrome.runtime.lastError || !Array.isArray(response)) {
                    resolve([]);
                    return;
                }
                
                // Get last 5 meetings, sorted by start time
                const recentMeetings = response
                    .filter(m => m.endTime) // Only completed meetings
                    .sort((a, b) => b.startTime - a.startTime)
                    .slice(0, 5);
                    
                resolve(recentMeetings);
            });
        } catch (error) {
            console.log('Error getting recent meetings:', error);
            resolve([]);
        }
    });
}

function getCurrentMeetingState() {
    return new Promise((resolve) => {
        try {
            if (!chrome.runtime || !chrome.runtime.id) {
                resolve({ state: 'none', participants: [], currentMeeting: null });
                return;
            }
            
            // First try to get state from background script
            chrome.runtime.sendMessage({ action: 'getCurrentState' }, (state) => {
                if (chrome.runtime.lastError) {
                    console.log('Extension context invalidated:', chrome.runtime.lastError.message);
                    resolve({ state: 'none', participants: [], currentMeeting: null });
                    return;
                }
                
                if (state && state.state !== 'none') {
                    resolve(state);
                    return;
                }
                
                // If not in meeting according to background, check active tab
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (chrome.runtime.lastError) {
                        resolve({ state: 'none', participants: [], currentMeeting: null });
                        return;
                    }
                    
                    const activeTab = tabs[0];
                    
                    if (activeTab && activeTab.url && activeTab.url.includes('meet.google.com')) {
                        // Send message to content script for detailed state
                        chrome.tabs.sendMessage(activeTab.id, { type: 'get_meeting_state' }, (response) => {
                            if (chrome.runtime.lastError) {
                                // Content script not ready or tab not accessible
                                resolve({ state: 'none', participants: [], currentMeeting: null });
                            } else if (response && response.meetingState) {
                                // Convert network-based response format to expected format
                                const convertedState = {
                                    state: response.meetingState.isActive ? 'active' : 'none',
                                    participants: response.participants || [],
                                    currentMeeting: response.meetingState.isActive ? {
                                        id: response.meetingState.meetingId,
                                        title: response.meetingState.meetingTitle,
                                        startTime: response.meetingState.startTime
                                    } : null
                                };
                                resolve(convertedState);
                            } else {
                                resolve({ state: 'none', participants: [], currentMeeting: null });
                            }
                        });
                    } else {
                        // Not on a meet page
                        resolve({ state: 'none', participants: [], currentMeeting: null });
                    }
                });
            });
        } catch (error) {
            console.log('Extension context invalidated:', error.message);
            resolve({ state: 'none', participants: [], currentMeeting: null });
        }
    });
}

function displayMeetingState(state) {
    const statusElement = document.getElementById('meeting-status');
    const statusText = document.getElementById('status-text');
    const currentMeetingCard = document.getElementById('current-meeting');
    const currentDuration = document.getElementById('current-duration');
    
    // Reset all states first
    statusElement.className = 'status';
    currentMeetingCard.style.display = 'none';
    currentDuration.style.display = 'none';

    switch (state.state) {
        case 'active':
            statusElement.classList.add('active', 'has-duration');
            statusText.textContent = 'In active meeting';
            currentMeetingCard.style.display = 'block';
            currentDuration.style.display = 'block';
            updateCurrentMeetingInfo(state.currentMeeting, state.participants);
            break;
        case 'waiting':
            statusElement.classList.add('waiting', 'has-duration');
            statusText.textContent = 'Waiting in meeting lobby';
            currentDuration.textContent = 'Waiting to join...';
            currentDuration.style.display = 'block';
            break;
        default: // 'none'
            statusElement.classList.add('inactive');
            statusText.textContent = 'Not in meeting';
            break;
    }
}

function updateCurrentMeetingInfo(meeting, participants) {
    const durationElement = document.getElementById('meeting-duration');
    const startElement = document.getElementById('meeting-start');
    const currentDuration = document.getElementById('current-duration');
    const currentParticipants = document.getElementById('current-participants');
    
    if (meeting && meeting.startTime) {
        const startTime = new Date(meeting.startTime);
        const now = new Date();
        const durationMs = now - startTime;
        
        console.log('Duration calculation:', {
            startTime: startTime.toISOString(),
            now: now.toISOString(),
            durationMs,
            durationMinutes: Math.floor(durationMs / (1000 * 60))
        });
        
        startElement.textContent = startTime.toLocaleTimeString();
        durationElement.textContent = formatDuration(durationMs);
        currentDuration.textContent = `Active for ${formatDuration(durationMs)}`;
        
        // Display participants as chips with better filtering for consistency
        const participantNames = participants ? participants.map(p => {
            // Handle different participant data formats
            if (typeof p === 'string') {
                return p.trim();
            } else if (p && typeof p === 'object') {
                return p.name || p.displayName || p.id || 'Unknown';
            } else {
                return String(p || 'Unknown');
            }
        }).filter(name => {
            // Filter out invalid names and duplicates
            return name && 
                   name.length > 0 && 
                   name !== 'Unknown' && 
                   name !== 'undefined' &&
                   !name.includes('undefined');
        }) : [];
        
        // Remove duplicates and sort for consistency
        const uniqueParticipants = [...new Set(participantNames)].sort();
        
        if (uniqueParticipants.length > 0) {
            const participantChips = uniqueParticipants.map(name => 
                `<span class="participants-chip">${escapeHtml(name)}</span>`
            ).join('');
            currentParticipants.innerHTML = `<div style="margin-bottom: 4px; color: #9aa0a6; font-size: 11px;">${uniqueParticipants.length} participants:</div>${participantChips}`;
        } else {
            currentParticipants.innerHTML = '<div style="color: #9aa0a6; font-size: 11px;">No participants detected</div>';
        }
    } else {
        console.log('Meeting info missing:', { meeting, hasStartTime: meeting?.startTime });
    }
}

function displayRecentMeetings(meetings) {
    const container = document.getElementById('recent-meetings-list');
    
    if (!meetings || meetings.length === 0) {
        container.innerHTML = '<div class="no-meetings">No recent meetings found</div>';
        return;
    }
    
    const meetingElements = meetings.map(meeting => {
        const startTime = new Date(meeting.startTime);
        const duration = meeting.endTime ? (meeting.endTime - meeting.startTime) : 0;
        const participantCount = meeting.participants ? meeting.participants.length : 0;
        
        // Get meeting title or generate a default one
        const meetingTitle = meeting.title || `Meeting ${meeting.id}`;
        const truncatedTitle = meetingTitle.length > 25 ? meetingTitle.substring(0, 22) + '...' : meetingTitle;
        
        // Format time - show today's meetings as time only, others as date + time
        const isToday = startTime.toDateString() === new Date().toDateString();
        const timeDisplay = isToday 
            ? startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : startTime.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
              startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        return `
            <div class="meeting-item">
                <div class="meeting-left">
                    <div class="meeting-title">${escapeHtml(truncatedTitle)}</div>
                    <div class="meeting-time">${timeDisplay}</div>
                    <div class="meeting-stats">${participantCount} participant${participantCount !== 1 ? 's' : ''}</div>
                </div>
                <div class="meeting-right">
                    <div class="meeting-duration-badge">${formatDuration(duration)}</div>
                    <div class="participant-count">${getRelativeTime(startTime)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = meetingElements;
}

function formatDuration(ms) {
    if (ms <= 0) return '0m';
    
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}

function getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
        return `${diffDays}d ago`;
    } else if (diffHours > 0) {
        return `${diffHours}h ago`;
    } else {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return diffMinutes > 0 ? `${diffMinutes}m ago` : 'Just now';
    }
}


function setupEventListeners() {
    // Dashboard button
    document.getElementById('dashboard-btn').addEventListener('click', openDashboard);
}

function openDashboard() {
    try {
        if (!chrome.runtime || !chrome.runtime.id) {
            showError('Extension context invalidated. Please refresh the page.');
            return;
        }
        
        // Create dashboard URL
        const dashboardUrl = chrome.runtime.getURL('dashboard.html');
        
        // Open dashboard in new tab
        chrome.tabs.create({ url: dashboardUrl }, () => {
            if (chrome.runtime.lastError) {
                showError('Failed to open dashboard: ' + chrome.runtime.lastError.message);
                return;
            }
            // Close popup
            window.close();
        });
    } catch (error) {
        showError('Extension context invalidated: ' + error.message);
    }
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
