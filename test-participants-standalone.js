// Standalone participant detection test - run this in the Google Meet tab console
// This script works independently of the extension and can help diagnose participant detection

console.log('🔍 Standalone Participant Detection Test');
console.log('=======================================');

function testParticipantDetection() {
  console.log('\n1. 🌐 Checking current page...');
  console.log('URL:', window.location.href);
  
  if (!window.location.href.includes('meet.google.com/')) {
    console.log('❌ Not on a Google Meet page');
    return;
  }
  
  console.log('✅ On Google Meet page');
  
  console.log('\n2. 🏗️ Scanning for participant elements...');
  
  // Look for participant elements using different selectors
  const selectors = {
    'data-participant-id': '*[data-participant-id]',
    'data-tab-id': '*[data-tab-id]',
    'data-panel-id': '*[data-panel-id]',
    'possible participants': '[role="listitem"], [aria-label*="participant"], [aria-label*="Participant"]'
  };
  
  let totalFound = 0;
  
  Object.entries(selectors).forEach(([name, selector]) => {
    const elements = document.querySelectorAll(selector);
    console.log(`${name}: ${elements.length} elements`);
    totalFound += elements.length;
    
    if (elements.length > 0 && elements.length <= 5) {
      console.log(`  Sample elements:`, Array.from(elements).slice(0, 3));
    }
  });
  
  console.log(`\nTotal elements found: ${totalFound}`);
  
  console.log('\n3. 👥 Extracting participant data...');
  
  const participantElements = document.querySelectorAll('*[data-participant-id]');
  console.log(`Found ${participantElements.length} participant elements with data-participant-id`);
  
  if (participantElements.length === 0) {
    console.log('\n❌ No participant elements found!');
    console.log('\n💡 Troubleshooting suggestions:');
    console.log('1. Make sure you are in an active Google Meet call');
    console.log('2. Open the participants panel (people icon in the bottom toolbar)');
    console.log('3. Try joining or creating a meeting with multiple participants');
    
    // Check for meeting indicators
    const meetingControls = document.querySelectorAll('[data-is-muted], [data-is-video-on], [aria-label*="mute"], [aria-label*="camera"]');
    console.log(`\nMeeting controls found: ${meetingControls.length}`);
    
    if (meetingControls.length > 0) {
      console.log('✅ You appear to be in a meeting, but participants panel may be closed');
      console.log('🔧 Try clicking the people icon to open the participants list');
    } else {
      console.log('❌ No meeting controls found - you may not be in an active meeting');
    }
    
    return [];
  }
  
  const participants = [];
  
  participantElements.forEach((element, index) => {
    const id = element.dataset.participantId;
    let name = '';
    
    // Try different methods to extract name
    if (element.dataset.sortKey) {
      name = element.dataset.sortKey.replace(id, '').trim();
    }
    
    if (!name) {
      const textContent = element.innerText || element.textContent || '';
      const lines = textContent.split('\n').filter(line => line.trim());
      name = lines[0]?.trim() || '';
    }
    
    // Look for avatar image
    const img = element.querySelector('img');
    const avatarUrl = img?.src || null;
    
    // Log detailed info for first few participants
    if (index < 5) {
      console.log(`\nParticipant ${index + 1}:`);
      console.log('  ID:', id);
      console.log('  Name:', name);
      console.log('  Avatar:', avatarUrl ? '✅ Found' : '❌ None');
      console.log('  Element:', element);
      console.log('  Raw text:', (element.innerText || '').substring(0, 100));
    }
    
    if (name) {
      participants.push({
        id,
        name,
        avatarUrl,
        element
      });
    }
  });
  
  console.log(`\n✅ Successfully extracted ${participants.length} participants:`);
  participants.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} ${p.avatarUrl ? '🖼️' : ''}`);
  });
  
  // Store results globally for inspection
  window.testResults = {
    participants,
    elements: participantElements,
    timestamp: new Date().toISOString()
  };
  
  console.log('\n📊 Results stored in window.testResults for inspection');
  
  return participants;
}

// Test function for manual DOM scanning
window.manualParticipantScan = () => {
  console.log('\n🔄 Manual Participant Scan');
  console.log('=========================');
  
  const participants = testParticipantDetection();
  
  if (participants.length > 0) {
    console.log(`\n🎉 Success! Found ${participants.length} participants`);
    console.log('Names:', participants.map(p => p.name));
  } else {
    console.log('\n🔧 No participants found. Debug info:');
    console.log('- Current URL:', window.location.href);
    console.log('- Page title:', document.title);
    console.log('- Meeting controls:', document.querySelectorAll('[data-is-muted], [data-is-video-on]').length);
    console.log('- All tabs:', document.querySelectorAll('*[data-tab-id]').length);
    console.log('- All panels:', document.querySelectorAll('*[data-panel-id]').length);
  }
  
  return participants;
};

// Test function to continuously monitor for participants
window.startParticipantMonitor = () => {
  console.log('\n📡 Starting continuous participant monitoring...');
  console.log('This will scan every 3 seconds for new participants');
  
  let scanCount = 0;
  let lastParticipantCount = 0;
  
  const monitor = setInterval(() => {
    scanCount++;
    const participants = document.querySelectorAll('*[data-participant-id]');
    
    if (participants.length !== lastParticipantCount) {
      console.log(`\n[Scan ${scanCount}] Participant count changed: ${lastParticipantCount} → ${participants.length}`);
      
      if (participants.length > 0) {
        const names = Array.from(participants).map(el => {
          const id = el.dataset.participantId;
          let name = '';
          
          if (el.dataset.sortKey) {
            name = el.dataset.sortKey.replace(id, '').trim();
          } else {
            name = (el.innerText || '').split('\n')[0]?.trim() || '';
          }
          
          return name || 'Unknown';
        });
        
        console.log('Current participants:', names);
      }
      
      lastParticipantCount = participants.length;
    }
  }, 3000);
  
  console.log('Monitor started. Run stopParticipantMonitor() to stop.');
  window.participantMonitor = monitor;
};

window.stopParticipantMonitor = () => {
  if (window.participantMonitor) {
    clearInterval(window.participantMonitor);
    window.participantMonitor = null;
    console.log('✅ Participant monitor stopped');
  }
};

// Run initial test
console.log('\n🚀 Running initial participant detection test...');
testParticipantDetection();

console.log('\n🛠️  Available functions:');
console.log('- manualParticipantScan() - Run a fresh scan');
console.log('- startParticipantMonitor() - Monitor for changes');
console.log('- stopParticipantMonitor() - Stop monitoring');
console.log('- window.testResults - View latest results');

// Helpful instructions
console.log('\n💡 Instructions:');
console.log('1. Make sure you are in an active Google Meet with other participants');
console.log('2. Open the participants panel (people icon in bottom toolbar)');
console.log('3. Run manualParticipantScan() to test detection');
console.log('4. If no participants found, check the troubleshooting suggestions above');
