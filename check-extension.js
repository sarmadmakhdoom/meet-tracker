#!/usr/bin/env node

/**
 * Extension Status Checker
 * Quick check to see if all files are in place and syntactically valid
 */

const fs = require('fs');
const { execSync } = require('child_process');

const requiredFiles = [
    'manifest.json',
    'background.js', 
    'content.js',
    'popup.html',
    'popup.js'
];

const optionalFiles = [
    'dashboard.html',
    'dashboard.js',
    'storage-manager.js',
    'icons/icon16.png',
    'icons/icon48.png',
    'icons/icon128.png'
];

console.log('🔍 Checking Extension Files...\n');

// Check required files
console.log('📋 Required Files:');
let allRequiredPresent = true;
requiredFiles.forEach(file => {
    const exists = fs.existsSync(file);
    const status = exists ? '✅' : '❌';
    console.log(`${status} ${file}`);
    if (!exists) allRequiredPresent = false;
});

// Check optional files
console.log('\n📋 Optional Files:');
optionalFiles.forEach(file => {
    const exists = fs.existsSync(file);
    const status = exists ? '✅' : '⚪';
    console.log(`${status} ${file}`);
});

console.log('\n🔧 File Analysis:');

// Check manifest.json
if (fs.existsSync('manifest.json')) {
    try {
        const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
        console.log(`✅ manifest.json: Valid JSON`);
        console.log(`   📝 Name: ${manifest.name}`);
        console.log(`   📝 Version: ${manifest.version}`);
        console.log(`   📝 Background: ${manifest.background?.service_worker}`);
        console.log(`   📝 Content Scripts: ${manifest.content_scripts?.length || 0}`);
        console.log(`   📝 Permissions: ${manifest.permissions?.length || 0}`);
        
        // Check if this is the network version
        const isNetworkVersion = manifest.permissions?.includes('declarativeNetRequest');
        console.log(`   🌐 Network Version: ${isNetworkVersion ? 'Yes' : 'No'}`);
        
    } catch (error) {
        console.log(`❌ manifest.json: Invalid JSON - ${error.message}`);
    }
} else {
    console.log(`❌ manifest.json: Not found`);
}

// Check JavaScript files for basic syntax
const jsFiles = ['background.js', 'content.js', 'popup.js'];
jsFiles.forEach(file => {
    if (fs.existsSync(file)) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            
            // Basic syntax check - look for common issues
            const issues = [];
            
            // Check for mismatched brackets/parentheses (basic check)
            let openBrackets = 0;
            let openParens = 0;
            for (const char of content) {
                if (char === '{') openBrackets++;
                else if (char === '}') openBrackets--;
                else if (char === '(') openParens++;
                else if (char === ')') openParens--;
            }
            
            if (openBrackets !== 0) issues.push(`${openBrackets > 0 ? 'Missing' : 'Extra'} closing braces`);
            if (openParens !== 0) issues.push(`${openParens > 0 ? 'Missing' : 'Extra'} closing parentheses`);
            
            // Check for common Chrome extension patterns
            const hasRuntimeAPI = content.includes('chrome.runtime');
            const hasProperWrapping = content.includes('(function()') || content.includes('(() =>');
            
            if (issues.length === 0) {
                console.log(`✅ ${file}: Syntax looks good`);
                if (hasRuntimeAPI) console.log(`   📱 Chrome APIs: Found`);
                if (hasProperWrapping) console.log(`   🔒 Wrapped in IIFE: Yes`);
            } else {
                console.log(`⚠️ ${file}: Potential issues - ${issues.join(', ')}`);
            }
            
        } catch (error) {
            console.log(`❌ ${file}: Error reading - ${error.message}`);
        }
    }
});

console.log('\n📊 Summary:');
if (allRequiredPresent) {
    console.log('✅ All required files are present');
    console.log('\n🚀 Extension is ready for testing!');
    console.log('\n📌 Next steps:');
    console.log('1. Open Chrome and go to chrome://extensions/');
    console.log('2. Enable "Developer mode" (top right)');
    console.log('3. Click "Load unpacked" and select this directory');
    console.log('4. Navigate to a Google Meet meeting to test');
    console.log('5. Check browser console for debug messages');
} else {
    console.log('❌ Missing required files');
    console.log('Please ensure all required files are present before loading the extension.');
}

console.log('\n🔧 Debug Commands:');
console.log('- Check current version: node switch-version.js status');
console.log('- Switch to network version: node switch-version.js network');
console.log('- In Google Meet console: debugNetworkMeetTracker()');
