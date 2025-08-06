// Debug utility for Google Meet Tracker Extension
// Run this in the browser console on a Google Meet page to diagnose issues

window.debugMeetExtension = () => {
  console.log('🔍 Google Meet Tracker Extension Debug Info');
  console.log('================================================');
  
  // Check extension presence
  const extensionPresent = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  console.log('Extension Context:', extensionPresent ? '✅ Available' : '❌ Not available');
  
  // Check network tracker
  const networkTracker = window.debugNetworkMeetTracker;
  console.log('Network Tracker:', networkTracker ? '✅ Available' : '❌ Not available');
  
  if (networkTracker) {
    const trackerData = networkTracker();
    console.log('Network Tracker Data:', trackerData);
  }
  
  // Check network shims
  const networkShims = window.debugMeetTrackerShims;
  console.log('Network Shims:', networkShims ? '✅ Available' : '❌ Not available');
  
  if (networkShims) {
    const shimData = networkShims();
    console.log('Network Shims Data:', shimData);
  }
  
  // Check page context
  console.log('\n📍 Page Context:');
  console.log('URL:', window.location.href);
  console.log('Title:', document.title);
  console.log('Ready State:', document.readyState);
  
  // Check Google Meet elements
  console.log('\n🎯 Google Meet Elements:');
  const participantElements = document.querySelectorAll('[data-participant-id]');
  console.log('Participants (DOM):', participantElements.length);
  
  const meetingControls = document.querySelectorAll('[data-is-muted]');
  console.log('Meeting Controls:', meetingControls.length);
  
  const meetingTitle = document.querySelector('[data-meeting-title]');
  console.log('Meeting Title Element:', meetingTitle ? '✅ Found' : '❌ Not found');
  
  if (meetingTitle) {
    console.log('Meeting Title:', meetingTitle.dataset.meetingTitle);
  }
  
  // Network activity monitoring
  console.log('\n🌐 Network Monitoring:');
  
  // Monitor fetch calls
  let fetchCount = 0;
  const originalFetch = window.fetch;
  
  const monitorFetch = () => {
    window.fetch = async function(...args) {
      fetchCount++;
      const [url] = args;
      
      if (typeof url === 'string' && (
        url.includes('SyncMeetingSpaceCollections') ||
        url.includes('BatchExecute') ||
        url.includes('_/MeetCastleService')
      )) {
        console.log('📡 Intercepted Google Meet API call:', url.substring(0, 100) + '...');
      }
      
      return originalFetch.apply(this, args);
    };
    
    console.log('🔄 Fetch monitoring enabled');
    
    setTimeout(() => {
      console.log(`📊 Total fetch calls in last 10 seconds: ${fetchCount}`);
      window.fetch = originalFetch; // Restore original
    }, 10000);
  };
  
  // Check console errors
  console.log('\n🚨 Checking for console errors...');
  
  const originalError = console.error;
  let errorCount = 0;
  
  console.error = function(...args) {
    errorCount++;
    originalError.apply(console, ['[CAPTURED ERROR]', ...args]);
  };
  
  setTimeout(() => {
    console.log(`📊 Console errors captured: ${errorCount}`);
    console.error = originalError; // Restore original
  }, 10000);
  
  // Run fetch monitoring
  monitorFetch();
  
  // Return summary
  return {
    extensionPresent,
    networkTrackerAvailable: !!networkTracker,
    networkShimsAvailable: !!networkShims,
    participantCount: participantElements.length,
    meetingControlsFound: meetingControls.length,
    meetingTitleFound: !!meetingTitle,
    url: window.location.href,
    timestamp: new Date().toISOString()
  };
};

// Auto-run if in Google Meet
if (window.location.href.includes('meet.google.com')) {
  console.log('🎯 Google Meet detected - Debug tools loaded');
  console.log('Run debugMeetExtension() to start debugging');
} else {
  console.log('ℹ️  Debug tools loaded - Run on Google Meet page for full functionality');
}
