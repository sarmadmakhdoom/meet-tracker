// Debug script for troubleshooting participant detection issues
// Run this in the Google Meet tab console to diagnose problems

console.log('🔍 Starting Google Meet Participant Detection Debug...');

function debugParticipantDetection() {
    const results = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        issues: [],
        findings: {},
        recommendations: []
    };

    console.log('🌐 Current URL:', results.url);

    // 1. Check if we're on a Google Meet page
    if (!window.location.href.includes('meet.google.com/')) {
        results.issues.push('Not on a Google Meet page');
        return results;
    }

    // 2. Check if content script is loaded
    results.findings.contentScriptLoaded = typeof window.debugNetworkMeetTracker === 'function';
    console.log('📄 Content script loaded:', results.findings.contentScriptLoaded);

    // 3. Check if network shims are active
    results.findings.networkShimsActive = window.meetTrackerShimsActive === true;
    results.findings.debugShimsAvailable = typeof window.debugMeetTrackerShims === 'function';
    console.log('🌐 Network shims active:', results.findings.networkShimsActive);
    console.log('🔧 Debug shims available:', results.findings.debugShimsAvailable);

    if (results.findings.debugShimsAvailable) {
        const shimStatus = window.debugMeetTrackerShims();
        results.findings.shimStatus = shimStatus;
        console.log('🔧 Shim status:', shimStatus);
    }

    // 4. Check for participant elements in DOM
    const participantElements = {
        dataParticipantId: document.querySelectorAll('*[data-participant-id]'),
        dataTabId: document.querySelectorAll('*[data-tab-id]'),
        dataPanelId: document.querySelectorAll('*[data-panel-id]'),
        possibleParticipants: document.querySelectorAll('[role="listitem"], [data-participant-id], .participant, [aria-label*="participant"]')
    };

    results.findings.domElements = {
        participantIds: participantElements.dataParticipantId.length,
        tabIds: participantElements.dataTabId.length,
        panelIds: participantElements.dataPanelId.length,
        possibleParticipants: participantElements.possibleParticipants.length
    };

    console.log('🏗️ DOM Elements found:', results.findings.domElements);

    // Log some sample elements for inspection
    if (participantElements.dataParticipantId.length > 0) {
        console.log('👤 Sample participant elements:');
        Array.from(participantElements.dataParticipantId).slice(0, 3).forEach((el, i) => {
            console.log(`  ${i + 1}:`, {
                id: el.dataset.participantId,
                sortKey: el.dataset.sortKey,
                text: el.innerText?.substring(0, 50),
                element: el
            });
        });
    }

    // 5. Check for meeting controls (indicators of active meeting)
    const meetingIndicators = {
        muteButtons: document.querySelectorAll('[data-is-muted]'),
        videoButtons: document.querySelectorAll('[data-is-video-on]'),
        meetingTitle: document.querySelector('[data-meeting-title]'),
        callControls: document.querySelectorAll('[role="toolbar"], .call-controls, [aria-label*="meeting"]')
    };

    results.findings.meetingIndicators = {
        muteButtons: meetingIndicators.muteButtons.length,
        videoButtons: meetingIndicators.videoButtons.length,
        hasMeetingTitle: !!meetingIndicators.meetingTitle,
        meetingTitle: meetingIndicators.meetingTitle?.dataset?.meetingTitle,
        callControls: meetingIndicators.callControls.length
    };

    console.log('🎮 Meeting indicators:', results.findings.meetingIndicators);

    // 6. Test network interception
    console.log('🌐 Testing network interception...');
    
    // Check if fetch was replaced
    const originalFetch = window.fetch.toString().includes('originalFetch');
    results.findings.fetchIntercepted = originalFetch;
    console.log('🌐 Fetch intercepted:', originalFetch);

    // Check if XMLHttpRequest was replaced  
    const xhrIntercepted = XMLHttpRequest.prototype.open.toString().includes('Proxy');
    results.findings.xhrIntercepted = xhrIntercepted;
    console.log('🌐 XHR intercepted:', xhrIntercepted);

    // 7. Check for recent network activity
    results.findings.recentNetworkEvents = [];
    
    // Set up temporary listener to catch events
    const tempListener = (event) => {
        results.findings.recentNetworkEvents.push({
            type: event.type,
            detail: event.detail
        });
    };

    window.addEventListener('gmal-message', tempListener);
    window.addEventListener('meettracker-network-data', tempListener);

    setTimeout(() => {
        window.removeEventListener('gmal-message', tempListener);
        window.removeEventListener('meettracker-network-data', tempListener);
        console.log('📡 Recent network events captured:', results.findings.recentNetworkEvents.length);
    }, 2000);

    // 8. Analyze issues and provide recommendations
    if (!results.findings.contentScriptLoaded) {
        results.issues.push('Content script not loaded');
        results.recommendations.push('Reload the page or reinstall extension');
    }

    if (!results.findings.networkShimsActive) {
        results.issues.push('Network shims not active');
        results.recommendations.push('Check console for shim loading errors');
    }

    if (results.findings.domElements.participantIds === 0) {
        results.issues.push('No participant elements found in DOM');
        if (results.findings.meetingIndicators.muteButtons === 0) {
            results.recommendations.push('Make sure you are in an active meeting');
        } else {
            results.recommendations.push('Try opening the participants panel');
        }
    }

    if (!results.findings.fetchIntercepted && !results.findings.xhrIntercepted) {
        results.issues.push('Network interception not working');
        results.recommendations.push('Check for CSP errors in console');
    }

    // 9. Try manual participant extraction
    if (results.findings.domElements.participantIds > 0) {
        console.log('🔄 Attempting manual participant extraction...');
        
        const manualParticipants = [];
        participantElements.dataParticipantId.forEach(element => {
            const id = element.dataset.participantId;
            let name = '';
            
            if (element.dataset.sortKey) {
                name = element.dataset.sortKey.replace(id, '').trim();
            } else {
                name = element.innerText.split('\n')[0].trim();
            }

            if (id && name) {
                manualParticipants.push({ id, name, element });
            }
        });

        results.findings.manualParticipants = manualParticipants;
        console.log('👥 Manual extraction found:', manualParticipants.length, 'participants');
        manualParticipants.forEach(p => console.log(`  - ${p.name} (${p.id})`));
    }

    return results;
}

// Run the debug analysis
const debugResults = debugParticipantDetection();

// Display summary
console.log('\n📊 DEBUG SUMMARY:');
console.log('================');
console.log('Issues found:', debugResults.issues.length);
debugResults.issues.forEach(issue => console.log(`❌ ${issue}`));

console.log('\nRecommendations:');
debugResults.recommendations.forEach(rec => console.log(`💡 ${rec}`));

console.log('\n🔍 Full debug results stored in window.lastDebugResults');
window.lastDebugResults = debugResults;

// Helper function to test manual DOM extraction
window.testManualExtraction = () => {
    console.log('🧪 Testing manual DOM extraction...');
    
    const participantElements = document.querySelectorAll('*[data-participant-id]');
    console.log(`Found ${participantElements.length} participant elements`);
    
    if (participantElements.length === 0) {
        console.log('❌ No participant elements found. Try:');
        console.log('   1. Open the participants panel in Google Meet');
        console.log('   2. Make sure you are in an active meeting');
        return [];
    }
    
    const extracted = [];
    participantElements.forEach((element, index) => {
        const id = element.dataset.participantId;
        let name = '';
        
        if (element.dataset.sortKey) {
            name = element.dataset.sortKey.replace(id, '').trim();
        } else {
            const textLines = element.innerText.split('\n');
            name = textLines[0]?.trim() || '';
        }

        // Look for avatar
        const img = element.querySelector('img');
        const avatarUrl = img?.src || null;

        console.log(`${index + 1}. ${name} (${id})`, avatarUrl ? '🖼️' : '');
        
        extracted.push({
            id,
            name,
            avatarUrl,
            element,
            rawText: element.innerText.substring(0, 100)
        });
    });
    
    return extracted;
};

// Helper function to test network shims
window.testNetworkShims = () => {
    console.log('🌐 Testing network shims...');
    
    if (!window.meetTrackerShimsActive) {
        console.log('❌ Network shims not active');
        return false;
    }
    
    // Test fetch interception
    console.log('🔄 Making test fetch request...');
    fetch('https://meet.google.com/test')
        .then(() => console.log('✅ Fetch completed'))
        .catch(() => console.log('✅ Fetch intercepted (expected error)'));
    
    return true;
};

console.log('\n🛠️ Available debug functions:');
console.log('  - testManualExtraction() - Test DOM participant extraction');
console.log('  - testNetworkShims() - Test network interception');
console.log('  - debugNetworkMeetTracker() - Get current tracker state');
console.log('  - window.lastDebugResults - View full debug results');

// Auto-test if we have content script
if (typeof window.debugNetworkMeetTracker === 'function') {
    console.log('\n🔍 Current tracker state:');
    console.log(window.debugNetworkMeetTracker());
}
