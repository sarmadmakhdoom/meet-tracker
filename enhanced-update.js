// Enhanced Update Script - Combines proven techniques from working Google Meet Attendance List extension
// Run this in the console to add enhanced participant detection with avatars

console.log('🚀 Applying Enhanced Google Meet Tracker Updates...');

// Add enhanced CSS for participant display with avatars
const enhancedCSS = `
<style>
.participant-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    margin-bottom: 6px;
    border: 1px solid rgba(255,255,255,0.1);
}

.participant-row {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 12px;
}

.participant-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255,255,255,0.2);
}

.participant-avatar-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4285f4, #34a853);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 14px;
    border: 2px solid rgba(255,255,255,0.2);
}

.participant-info {
    flex: 1;
    min-width: 0;
}

.participant-name {
    font-weight: 500;
    color: #e8eaed;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
}

.participant-details {
    font-size: 12px;
    color: #9aa0a6;
    line-height: 1.2;
}

.source-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.source-indicator.network {
    background: #0f9d58;
    box-shadow: 0 0 4px rgba(15, 157, 88, 0.4);
}

.source-indicator.dom {
    background: #34a853;
    box-shadow: 0 0 4px rgba(52, 168, 83, 0.4);
}

.source-indicator.calendar {
    background: #4285f4;
    box-shadow: 0 0 4px rgba(66, 133, 244, 0.4);
}

.source-indicator.unknown {
    background: #9aa0a6;
}

.stats-breakdown {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 8px;
    padding: 8px 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 6px;
}

.stat-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #e8eaed;
}

.indicator-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.indicator-dot.network {
    background: #0f9d58;
    box-shadow: 0 0 6px rgba(15, 157, 88, 0.5);
}

.indicator-dot.dom {
    background: #34a853;
    box-shadow: 0 0 6px rgba(52, 168, 83, 0.5);
}

.indicator-dot.avatar {
    background: #ff9800;
    box-shadow: 0 0 6px rgba(255, 152, 0, 0.5);
}

.enhanced-info {
    background: linear-gradient(135deg, rgba(15, 157, 88, 0.1), rgba(52, 168, 83, 0.1));
    border: 1px solid rgba(15, 157, 88, 0.2);
    border-radius: 8px;
    padding: 12px;
    margin-top: 12px;
}

.enhanced-title {
    font-weight: 600;
    color: #0f9d58;
    margin-bottom: 6px;
    font-size: 13px;
}
</style>
`;

// Inject enhanced CSS
if (!document.getElementById('enhanced-meet-tracker-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'enhanced-meet-tracker-styles';
    styleElement.innerHTML = enhancedCSS;
    document.head.appendChild(styleElement);
    console.log('✅ Enhanced CSS injected');
}

// Test function to simulate enhanced participant data
window.testEnhancedParticipants = () => {
    const testParticipants = [
        {
            id: 'user1@example.com',
            name: 'John Doe',
            email: 'john.doe@example.com',
            joinTime: Date.now() - 300000, // 5 minutes ago
            avatarUrl: 'https://lh3.googleusercontent.com/a/default-user=s32-c',
            source: 'sync'
        },
        {
            id: 'user2@example.com', 
            name: 'Jane Smith',
            email: 'jane.smith@example.com',
            joinTime: Date.now() - 180000, // 3 minutes ago
            avatarUrl: null,
            source: 'dom_scroll'
        },
        {
            id: 'user3@example.com',
            name: 'Bob Wilson', 
            email: 'bob.wilson@example.com',
            joinTime: Date.now() - 120000, // 2 minutes ago
            avatarUrl: 'https://lh3.googleusercontent.com/a/default-user=s32-c',
            source: 'calendar_event'
        }
    ];

    console.log('🧪 Testing enhanced participant display');
    
    // Find participants list in popup
    const participantsList = document.getElementById('participantsList');
    if (!participantsList) {
        console.log('Participants list not found - create test display');
        
        // Create test display
        const testContainer = document.createElement('div');
        testContainer.id = 'test-participants-display';
        testContainer.innerHTML = `
            <div style="background: #1f1f1f; padding: 16px; border-radius: 8px; margin: 16px; color: #e8eaed;">
                <h3 style="margin-bottom: 12px; color: #0f9d58;">Enhanced Participants Test</h3>
                <div id="testParticipantsList"></div>
                <div id="testNetworkStats" style="margin-top: 12px;"></div>
            </div>
        `;
        document.body.appendChild(testContainer);
        
        displayTestParticipants(testParticipants, 'testParticipantsList', 'testNetworkStats');
    } else {
        displayTestParticipants(testParticipants, 'participantsList', 'networkStats');
    }
};

function displayTestParticipants(participants, listId, statsId) {
    const participantsList = document.getElementById(listId);
    const networkStats = document.getElementById(statsId);
    
    if (!participantsList) return;
    
    participantsList.innerHTML = '';
    
    // Sort participants by join time
    const sortedParticipants = [...participants].sort((a, b) => a.joinTime - b.joinTime);
    
    sortedParticipants.forEach(participant => {
        const div = document.createElement('div');
        div.className = 'participant-item';
        
        // Create avatar element
        let avatarHtml = '';
        if (participant.avatarUrl) {
            avatarHtml = `<img class="participant-avatar" src="${participant.avatarUrl}" alt="${participant.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`;
            avatarHtml += `<div class="participant-avatar-placeholder" style="display: none;">${participant.name.charAt(0).toUpperCase()}</div>`;
        } else {
            avatarHtml = `<div class="participant-avatar-placeholder">${participant.name.charAt(0).toUpperCase()}</div>`;
        }
        
        // Create data source indicator
        let sourceIndicator = '';
        let sourceClass = 'unknown';
        let sourceTooltip = 'Unknown data source';
        
        if (participant.source) {
            if (participant.source.includes('sync') || participant.source.includes('network')) {
                sourceClass = 'network';
                sourceTooltip = 'Data from network monitoring';
            } else if (participant.source.includes('dom')) {
                sourceClass = 'dom';
                sourceTooltip = 'Data from DOM parsing';
            } else if (participant.source.includes('calendar')) {
                sourceClass = 'calendar';
                sourceTooltip = 'Data from calendar API';
            }
        }
        
        sourceIndicator = `<span class="source-indicator ${sourceClass}" title="${sourceTooltip}"></span>`;
        
        div.innerHTML = `
            <div class="participant-row">
                ${avatarHtml}
                <div class="participant-info">
                    <div class="participant-name">
                        ${participant.name}
                        ${sourceIndicator}
                    </div>
                    <div class="participant-details">
                        Joined: ${new Date(participant.joinTime).toLocaleTimeString()}
                        ${participant.email ? ` • ${participant.email}` : ''}
                    </div>
                </div>
            </div>
        `;
        participantsList.appendChild(div);
    });
    
    // Show enhanced network stats with data source breakdown
    const networkParticipants = participants.filter(p => p.source?.includes('sync') || p.source?.includes('network')).length;
    const domParticipants = participants.filter(p => p.source?.includes('dom')).length;
    const calendarParticipants = participants.filter(p => p.source?.includes('calendar')).length;
    const avatarCount = participants.filter(p => p.avatarUrl).length;
    
    if (networkStats && (networkParticipants > 0 || domParticipants > 0)) {
        let statsHtml = '<div class="stats-breakdown">';
        
        if (networkParticipants > 0) {
            statsHtml += `
                <div class="stat-item network">
                    <span class="indicator-dot network"></span>
                    Network: ${networkParticipants}
                </div>
            `;
        }
        
        if (domParticipants > 0) {
            statsHtml += `
                <div class="stat-item dom">
                    <span class="indicator-dot dom"></span>
                    DOM: ${domParticipants}
                </div>
            `;
        }
        
        if (calendarParticipants > 0) {
            statsHtml += `
                <div class="stat-item calendar">
                    <span class="indicator-dot calendar"></span>
                    Calendar: ${calendarParticipants}
                </div>
            `;
        }
        
        if (avatarCount > 0) {
            statsHtml += `
                <div class="stat-item avatar">
                    <span class="indicator-dot avatar"></span>
                    Avatars: ${avatarCount}
                </div>
            `;
        }
        
        statsHtml += '</div>';
        
        networkStats.innerHTML = statsHtml;
        networkStats.style.display = 'block';
    }
}

// Enhanced debug function
window.debugEnhancedMeetTracker = () => {
    console.log('🔍 Enhanced Meet Tracker Debug Info:');
    
    // Check if content script is active
    const hasContentScript = window.debugNetworkMeetTracker !== undefined;
    console.log('Content Script Active:', hasContentScript);
    
    if (hasContentScript) {
        const debugInfo = window.debugNetworkMeetTracker();
        console.log('Meeting State:', debugInfo.meetingState);
        console.log('Participants:', debugInfo.participants);
        
        // Analyze participant data sources
        const participants = debugInfo.participants || [];
        const sources = {};
        const avatars = participants.filter(p => p.avatarUrl).length;
        
        participants.forEach(p => {
            if (p.source) {
                sources[p.source] = (sources[p.source] || 0) + 1;
            }
        });
        
        console.log('Data Sources:', sources);
        console.log('Participants with Avatars:', avatars);
    }
    
    // Check if network shims are active
    if (window.debugMeetTrackerShims) {
        const shimStatus = window.debugMeetTrackerShims();
        console.log('Network Shims Status:', shimStatus);
    }
    
    return {
        hasContentScript,
        participantCount: hasContentScript ? window.debugNetworkMeetTracker().participants.length : 0,
        shimsActive: window.meetTrackerShimsActive || false
    };
};

console.log('✅ Enhanced Google Meet Tracker loaded!');
console.log('🧪 Run testEnhancedParticipants() to see enhanced UI');
console.log('🔍 Run debugEnhancedMeetTracker() for debug info');

// Auto-run test if we're in the extension popup
if (window.location.href.includes('extension://')) {
    setTimeout(() => {
        console.log('Auto-running enhanced participant test...');
        window.testEnhancedParticipants();
    }, 1000);
}
