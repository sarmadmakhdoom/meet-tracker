#!/usr/bin/env node

// Script to switch between basic and enhanced storage modes
// Usage: node switch-storage-mode.js [basic|enhanced]

const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'manifest.json');

function switchToEnhanced() {
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.background.service_worker = 'background-enhanced.js';
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log('✅ Switched to enhanced storage mode (background-enhanced.js)');
        console.log('📝 Please reload the extension in Chrome to apply changes');
        return true;
    } catch (error) {
        console.error('❌ Failed to switch to enhanced mode:', error.message);
        return false;
    }
}

function switchToBasic() {
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.background.service_worker = 'background.js';
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log('✅ Switched to basic storage mode (background.js)');
        console.log('📝 Please reload the extension in Chrome to apply changes');
        return true;
    } catch (error) {
        console.error('❌ Failed to switch to basic mode:', error.message);
        return false;
    }
}

function getCurrentMode() {
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const serviceWorker = manifest.background.service_worker;
        
        if (serviceWorker === 'background-enhanced.js') {
            return 'enhanced';
        } else if (serviceWorker === 'background.js') {
            return 'basic';
        } else {
            return 'unknown';
        }
    } catch (error) {
        console.error('❌ Failed to read manifest:', error.message);
        return 'error';
    }
}

// Main execution
const mode = process.argv[2];
const currentMode = getCurrentMode();

console.log('🔧 Storage Mode Switcher for Google Meet Tracker');
console.log(`📋 Current mode: ${currentMode}`);
console.log('');

if (!mode) {
    console.log('Usage: node switch-storage-mode.js [basic|enhanced]');
    console.log('');
    console.log('Modes:');
    console.log('  basic    - Use basic Chrome storage.local (background.js)');
    console.log('  enhanced - Use enhanced IndexedDB storage (background-enhanced.js)');
    console.log('');
    console.log('Example:');
    console.log('  node switch-storage-mode.js enhanced');
    process.exit(0);
}

switch (mode.toLowerCase()) {
    case 'enhanced':
        if (currentMode === 'enhanced') {
            console.log('ℹ️  Already in enhanced storage mode');
        } else {
            switchToEnhanced();
        }
        break;
    
    case 'basic':
        if (currentMode === 'basic') {
            console.log('ℹ️  Already in basic storage mode');
        } else {
            switchToBasic();
        }
        break;
    
    default:
        console.error('❌ Invalid mode. Use "basic" or "enhanced"');
        process.exit(1);
}
