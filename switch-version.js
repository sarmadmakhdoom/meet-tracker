#!/usr/bin/env node

/**
 * Extension Version Switcher
 * Switches between different versions of the Google Meet Tracker extension
 */

const fs = require('fs');
const path = require('path');

const versions = {
    'basic': {
        manifest: 'manifest-basic.json',
        background: 'background.js',
        content: 'content.js',
        description: 'Basic DOM-based participant detection'
    },
    'enhanced': {
        manifest: 'manifest-enhanced.json',
        background: 'background-enhanced.js', 
        content: 'content.js',
        description: 'Enhanced storage with IndexedDB'
    },
    'network': {
        manifest: 'manifest-network.json',
        background: 'background-network.js',
        content: 'content-network.js',
        description: 'Network-based participant detection (most reliable)'
    }
};

const ACTIVE_MANIFEST = 'manifest.json';
const ACTIVE_BACKGROUND = 'background.js';
const ACTIVE_CONTENT = 'content.js';

function switchToVersion(versionName) {
    const version = versions[versionName];
    if (!version) {
        console.error(`❌ Unknown version: ${versionName}`);
        console.log('Available versions:', Object.keys(versions).join(', '));
        process.exit(1);
    }

    console.log(`🔄 Switching to ${versionName} version...`);
    console.log(`📝 ${version.description}`);

    try {
        // Backup current active files if they exist
        backupCurrentFiles();

        // Copy version files to active names
        if (fs.existsSync(version.manifest)) {
            fs.copyFileSync(version.manifest, ACTIVE_MANIFEST);
            console.log(`✅ Copied ${version.manifest} -> ${ACTIVE_MANIFEST}`);
        }

        if (fs.existsSync(version.background)) {
            fs.copyFileSync(version.background, ACTIVE_BACKGROUND);
            console.log(`✅ Copied ${version.background} -> ${ACTIVE_BACKGROUND}`);
        }

        if (fs.existsSync(version.content)) {
            fs.copyFileSync(version.content, ACTIVE_CONTENT);
            console.log(`✅ Copied ${version.content} -> ${ACTIVE_CONTENT}`);
        }

        console.log(`\n🎉 Successfully switched to ${versionName} version!`);
        console.log('📌 Next steps:');
        console.log('   1. Reload the extension in Chrome');
        console.log('   2. Navigate to a Google Meet meeting');
        console.log('   3. Check console logs for debugging');

    } catch (error) {
        console.error('❌ Error switching versions:', error.message);
        process.exit(1);
    }
}

function backupCurrentFiles() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `backup-${timestamp}`;

    if (fs.existsSync(ACTIVE_MANIFEST) || fs.existsSync(ACTIVE_BACKGROUND) || fs.existsSync(ACTIVE_CONTENT)) {
        fs.mkdirSync(backupDir, { recursive: true });
        console.log(`📦 Creating backup in ${backupDir}/`);

        [ACTIVE_MANIFEST, ACTIVE_BACKGROUND, ACTIVE_CONTENT].forEach(file => {
            if (fs.existsSync(file)) {
                fs.copyFileSync(file, path.join(backupDir, file));
                console.log(`📦 Backed up ${file}`);
            }
        });
    }
}

function showStatus() {
    console.log('📊 Extension Version Status\n');
    
    Object.entries(versions).forEach(([name, config]) => {
        const exists = fs.existsSync(config.manifest);
        const isActive = exists && fs.existsSync(ACTIVE_MANIFEST) && 
            fs.readFileSync(config.manifest, 'utf8') === fs.readFileSync(ACTIVE_MANIFEST, 'utf8');
        
        const status = isActive ? '🟢 ACTIVE' : exists ? '⚪ Available' : '🔴 Missing';
        console.log(`${status} ${name}: ${config.description}`);
    });

    console.log('\n📁 Available files:');
    Object.values(versions).forEach(config => {
        [config.manifest, config.background, config.content].forEach(file => {
            if (fs.existsSync(file)) {
                console.log(`   ✅ ${file}`);
            }
        });
    });
}

function showHelp() {
    console.log('🚀 Google Meet Tracker - Version Switcher\n');
    console.log('Usage: node switch-version.js [command]\n');
    console.log('Commands:');
    console.log('  basic     - Switch to basic DOM-based version');
    console.log('  enhanced  - Switch to enhanced IndexedDB version');
    console.log('  network   - Switch to network-based version (recommended)');
    console.log('  status    - Show current version status');
    console.log('  help      - Show this help message\n');
    console.log('Examples:');
    console.log('  node switch-version.js network');
    console.log('  node switch-version.js status');
}

// Main execution
const command = process.argv[2];

if (!command || command === 'help') {
    showHelp();
} else if (command === 'status') {
    showStatus();
} else if (versions[command]) {
    switchToVersion(command);
} else {
    console.error(`❌ Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
