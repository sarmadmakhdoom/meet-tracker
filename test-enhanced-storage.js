// Test script for Enhanced Storage System
// Run this in the browser console on the dashboard page to test the implementation

console.log('🧪 Testing Enhanced Storage System...');

// Test 1: Storage Manager Class
console.log('\n1. Testing Storage Manager Class...');
try {
    if (typeof MeetingStorageManager !== 'undefined') {
        const storageManager = new MeetingStorageManager();
        console.log('✅ MeetingStorageManager class available');
        console.log('📋 Methods available:', Object.getOwnPropertyNames(MeetingStorageManager.prototype));
    } else {
        console.log('❌ MeetingStorageManager class not available');
    }
} catch (error) {
    console.log('❌ Error testing Storage Manager:', error);
}

// Test 2: Enhanced Dashboard Functions
console.log('\n2. Testing Enhanced Dashboard Functions...');
const enhancedFunctions = ['showStorageStats', 'cleanupOldData', 'exportEnhancedData'];
enhancedFunctions.forEach(funcName => {
    if (typeof window[funcName] === 'function') {
        console.log(`✅ ${funcName} function available`);
    } else {
        console.log(`❌ ${funcName} function not available`);
    }
});

// Test 3: DOM Elements
console.log('\n3. Testing DOM Elements...');
const buttons = ['show-storage-stats', 'cleanup-data', 'export-enhanced-data'];
buttons.forEach(buttonId => {
    const element = document.getElementById(buttonId);
    if (element) {
        console.log(`✅ Button '${buttonId}' found in DOM`);
    } else {
        console.log(`❌ Button '${buttonId}' not found in DOM`);
    }
});

// Test 4: Message Handling
console.log('\n4. Testing Enhanced Message Handling...');
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    // Test storage stats message
    chrome.runtime.sendMessage({ action: 'getStorageStats' }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('❌ Storage stats message failed:', chrome.runtime.lastError.message);
        } else {
            console.log('✅ Storage stats message successful:', response);
        }
    });
    
    // Test enhanced getMeetings message
    chrome.runtime.sendMessage({ 
        action: 'getMeetings',
        options: { limit: 5, sortBy: 'startTime' }
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.log('❌ Enhanced getMeetings failed:', chrome.runtime.lastError.message);
        } else {
            console.log('✅ Enhanced getMeetings successful. Meetings loaded:', response?.length || 0);
        }
    });
} else {
    console.log('❌ Chrome runtime not available');
}

// Test 5: Manifest File
console.log('\n5. Testing Manifest Configuration...');
fetch(chrome.runtime.getURL('manifest.json'))
    .then(response => response.json())
    .then(manifest => {
        console.log('✅ Manifest loaded successfully');
        
        // Check background script
        if (manifest.background?.service_worker === 'background-enhanced.js') {
            console.log('✅ Enhanced background script configured');
        } else {
            console.log('❌ Enhanced background script not configured. Found:', manifest.background?.service_worker);
        }
        
        // Check storage-manager in resources
        const resources = manifest.web_accessible_resources?.[0]?.resources || [];
        if (resources.includes('storage-manager.js')) {
            console.log('✅ Storage manager included in web accessible resources');
        } else {
            console.log('❌ Storage manager not in web accessible resources');
        }
    })
    .catch(error => {
        console.log('❌ Error loading manifest:', error);
    });

console.log('\n🎯 Test Results Summary:');
console.log('Run each test section above to verify the enhanced storage implementation.');
console.log('If all tests pass, your extension is ready for enhanced storage!');

// Helper function to test storage manually
window.testEnhancedStorage = async function() {
    console.log('\n🚀 Manual Storage Test Started...');
    
    try {
        console.log('Testing storage statistics...');
        await showStorageStats();
        console.log('✅ Storage statistics test completed');
    } catch (error) {
        console.log('❌ Storage statistics test failed:', error);
    }
    
    console.log('\nManual test completed. Check the alerts and console output above.');
};

console.log('\n💡 Run testEnhancedStorage() to perform a manual test of the storage functions.');
