// Quick script to add test data to extension storage for dashboard testing
// Run this in the background service worker console (chrome-extension://[id]/_generated_background_page.html)

console.log('🧪 Adding test meeting data to storage...');

const testMeetings = [
  {
    id: 'test-meeting-1',
    title: 'Team Standup',
    startTime: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
    endTime: Date.now() - (1.5 * 60 * 60 * 1000), // 1.5 hours ago
    participants: [
      { id: 'user1', name: 'John Doe', joinTime: Date.now() - (2 * 60 * 60 * 1000) },
      { id: 'user2', name: 'Jane Smith', joinTime: Date.now() - (2 * 60 * 60 * 1000) },
      { id: 'user3', name: 'Bob Wilson', joinTime: Date.now() - (1.8 * 60 * 60 * 1000) }
    ],
    url: 'https://meet.google.com/test-meeting-1'
  },
  {
    id: 'test-meeting-2', 
    title: 'Project Review',
    startTime: Date.now() - (24 * 60 * 60 * 1000), // 1 day ago
    endTime: Date.now() - (23.5 * 60 * 60 * 1000), // 23.5 hours ago
    participants: [
      { id: 'user1', name: 'John Doe', joinTime: Date.now() - (24 * 60 * 60 * 1000) },
      { id: 'user4', name: 'Alice Johnson', joinTime: Date.now() - (24 * 60 * 60 * 1000) },
      { id: 'user5', name: 'Charlie Brown', joinTime: Date.now() - (23.8 * 60 * 60 * 1000) },
      { id: 'user6', name: 'Diana Prince', joinTime: Date.now() - (23.7 * 60 * 60 * 1000) }
    ],
    url: 'https://meet.google.com/test-meeting-2'
  },
  {
    id: 'test-meeting-3',
    title: 'Client Call',
    startTime: Date.now() - (3 * 24 * 60 * 60 * 1000), // 3 days ago
    endTime: Date.now() - (3 * 24 * 60 * 60 * 1000) + (45 * 60 * 1000), // 3 days ago + 45 min
    participants: [
      { id: 'user1', name: 'John Doe', joinTime: Date.now() - (3 * 24 * 60 * 60 * 1000) },
      { id: 'user7', name: 'Client Representative', joinTime: Date.now() - (3 * 24 * 60 * 60 * 1000) + (5 * 60 * 1000) }
    ],
    url: 'https://meet.google.com/test-meeting-3'
  }
];

// Add test data to storage
chrome.storage.local.set({ meetings: testMeetings }, () => {
  if (chrome.runtime.lastError) {
    console.error('❌ Error adding test data:', chrome.runtime.lastError.message);
  } else {
    console.log(`✅ Added ${testMeetings.length} test meetings to storage`);
    console.log('🔍 Test data:', testMeetings);
    
    // Verify data was stored
    chrome.storage.local.get(['meetings'], (result) => {
      if (result.meetings) {
        console.log(`📊 Storage now contains ${result.meetings.length} meetings`);
      }
    });
  }
});

// Function to clear test data
window.clearTestData = () => {
  chrome.storage.local.set({ meetings: [] }, () => {
    console.log('🗑️ Test data cleared');
  });
};

console.log('💡 Run clearTestData() to remove test data');
