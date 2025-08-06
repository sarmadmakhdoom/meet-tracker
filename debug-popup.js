// Debug utility for popup issues - run this in popup console (F12 on popup)

window.debugPopupExtension = () => {
  console.log('🔍 Popup Debug Information');
  console.log('========================');
  
  // Check extension context
  console.log('Extension Context:', {
    hasChrome: typeof chrome !== 'undefined',
    hasRuntime: chrome && chrome.runtime,
    extensionId: chrome.runtime?.id,
    lastError: chrome.runtime?.lastError
  });
  
  // Check DOM elements
  console.log('\n📋 DOM Elements:');
  const elements = [
    'loading', 'main-content', 'error', 'meeting-status', 
    'status-text', 'current-meeting', 'current-duration',
    'meeting-duration', 'meeting-start', 'current-participants'
  ];
  
  elements.forEach(id => {
    const element = document.getElementById(id);
    console.log(`${id}:`, element ? '✅ Found' : '❌ Missing');
  });
  
  // Test background communication
  console.log('\n🔄 Testing Background Communication...');
  
  if (chrome.runtime && chrome.runtime.id) {
    // Test getCurrentState
    chrome.runtime.sendMessage({ action: 'getCurrentState' }, (response) => {
      console.log('Background State Response:', response);
      if (chrome.runtime.lastError) {
        console.error('Background Error:', chrome.runtime.lastError);
      }
    });
    
    // Test getMeetings
    chrome.runtime.sendMessage({ action: 'getMeetings' }, (response) => {
      console.log('Meetings Response:', response);
      if (chrome.runtime.lastError) {
        console.error('Meetings Error:', chrome.runtime.lastError);
      }
    });
  }
  
  // Test active tab communication
  console.log('\n📱 Testing Tab Communication...');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Tab Query Error:', chrome.runtime.lastError);
      return;
    }
    
    const activeTab = tabs[0];
    console.log('Active Tab:', {
      url: activeTab?.url,
      title: activeTab?.title,
      isMeet: activeTab?.url?.includes('meet.google.com')
    });
    
    if (activeTab && activeTab.url && activeTab.url.includes('meet.google.com')) {
      // Test content script communication
      chrome.tabs.sendMessage(activeTab.id, { type: 'get_meeting_state' }, (response) => {
        console.log('Content Script Response:', response);
        if (chrome.runtime.lastError) {
          console.error('Content Script Error:', chrome.runtime.lastError);
        }
      });
    }
  });
  
  // Check participant data handling
  console.log('\n👥 Testing Participant Data Handling...');
  
  // Test different participant formats
  const testParticipants = [
    'John Doe',
    { name: 'Jane Smith', id: '123' },
    { displayName: 'Bob Johnson', participantId: '456' },
    null,
    undefined,
    { id: '789' }, // No name
    ''
  ];
  
  const processedParticipants = testParticipants.map(p => {
    if (typeof p === 'string') {
      return p.trim();
    } else if (p && typeof p === 'object') {
      return p.name || p.displayName || p.id || 'Unknown';
    } else {
      return String(p || 'Unknown');
    }
  }).filter(name => name && name.length > 0);
  
  console.log('Processed Participants:', processedParticipants);
  
  return {
    extensionActive: chrome.runtime?.id ? true : false,
    elementsFound: elements.filter(id => document.getElementById(id)).length,
    totalElements: elements.length,
    timestamp: new Date().toISOString()
  };
};

// Auto-run if this script is loaded
console.log('🔧 Popup debug tools loaded');
console.log('Run debugPopupExtension() to start debugging');

// Monitor for errors
window.addEventListener('error', (event) => {
  console.error('Popup Error Caught:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

// Monitor for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
});
