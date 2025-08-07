// Complete IndexedDB Scanner JavaScript

async function scanAllDatabases() {
    const resultsDiv = document.getElementById('scan-results');
    resultsDiv.innerHTML = '<div class="info">🔍 Scanning all IndexedDB databases...</div>';
    
    try {
        // Get all available databases
        const databases = await indexedDB.databases();
        
        if (databases.length === 0) {
            resultsDiv.innerHTML = '<div class="warning">⚠️ No IndexedDB databases found!</div>';
            return;
        }
        
        let html = `<div class="success">✅ Found ${databases.length} IndexedDB database(s)</div>`;
        
        for (const dbInfo of databases) {
            html += `<div class="db-info">
                <h3>📦 Database: ${dbInfo.name} (v${dbInfo.version})</h3>
            `;
            
            try {
                // Open each database
                const db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbInfo.name);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                    request.onblocked = () => reject(new Error('Database blocked'));
                });
                
                const storeNames = Array.from(db.objectStoreNames);
                html += `<p><strong>Object Stores (${storeNames.length}):</strong> ${storeNames.join(', ') || 'None'}</p>`;
                
                if (storeNames.length > 0) {
                    // Scan each store
                    const transaction = db.transaction(storeNames, 'readonly');
                    
                    for (const storeName of storeNames) {
                        try {
                            const store = transaction.objectStore(storeName);
                            
                            // Get count
                            const count = await new Promise((resolve, reject) => {
                                const countRequest = store.count();
                                countRequest.onsuccess = () => resolve(countRequest.result);
                                countRequest.onerror = () => reject(countRequest.error);
                            });
                            
                            html += `<div class="store-info">
                                <strong>📁 ${storeName}:</strong> ${count} record(s)
                            `;
                            
                            if (count > 0) {
                                // Get sample data
                                try {
                                    const sample = await new Promise((resolve, reject) => {
                                        const getRequest = store.getAll();
                                        getRequest.onsuccess = () => resolve(getRequest.result.slice(0, 2));
                                        getRequest.onerror = () => reject(getRequest.error);
                                    });
                                    
                                    html += '<div class="data-sample">';
                                    html += '<strong>Sample data:</strong><br/>';
                                    sample.forEach((record, index) => {
                                        // Check if this looks like meeting data
                                        const isMeetingData = record && (
                                            record.id || record.meetingId || record.sessionId ||
                                            record.title || record.participants || record.startTime
                                        );
                                        
                                        const highlight = isMeetingData ? ' style="background: #ffffcc; font-weight: bold;"' : '';
                                        html += `<div${highlight}>Record ${index + 1}: `;
                                        
                                        if (isMeetingData) {
                                            html += `🎯 MEETING DATA FOUND! `;
                                            if (record.id) html += `ID: ${record.id} `;
                                            if (record.meetingId) html += `MeetingID: ${record.meetingId} `;
                                            if (record.sessionId) html += `SessionID: ${record.sessionId} `;
                                            if (record.title) html += `Title: "${record.title}" `;
                                            if (record.startTime) {
                                                const duration = record.endTime ? (record.endTime - record.startTime) : 0;
                                                html += `Duration: ${Math.round(duration / 60000)}min `;
                                            }
                                        } else {
                                            // Show first few keys for non-meeting data
                                            const keys = Object.keys(record || {}).slice(0, 3);
                                            html += `Keys: ${keys.join(', ')}`;
                                        }
                                        html += '</div>';
                                    });
                                    html += '</div>';
                                } catch (sampleError) {
                                    html += `<div class="data-sample">Error getting sample: ${sampleError.message}</div>`;
                                }
                            }
                            
                            html += '</div>';
                        } catch (storeError) {
                            html += `<div class="store-info error">❌ Error accessing ${storeName}: ${storeError.message}</div>`;
                        }
                    }
                }
                
                db.close();
                
            } catch (dbError) {
                html += `<div class="error">❌ Error opening database ${dbInfo.name}: ${dbError.message}</div>`;
            }
            
            html += '</div>';
        }
        
        resultsDiv.innerHTML = html;
        
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error">❌ Scan failed: ${error.message}</div>`;
        console.error('Scan error:', error);
    }
}

async function scanSpecificDB() {
    const dbName = prompt('Enter database name:', 'MeetingTracker');
    if (!dbName) return;
    
    const resultsDiv = document.getElementById('scan-results');
    resultsDiv.innerHTML = `<div class="info">🔍 Scanning database: ${dbName}</div>`;
    
    try {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Database blocked'));
        });
        
        let html = `<div class="success">✅ Successfully opened: ${dbName} (v${db.version})</div>`;
        
        const storeNames = Array.from(db.objectStoreNames);
        html += `<div class="db-info">
            <h3>📦 Database Details</h3>
            <p><strong>Name:</strong> ${db.name}</p>
            <p><strong>Version:</strong> ${db.version}</p>
            <p><strong>Object Stores (${storeNames.length}):</strong> ${storeNames.join(', ') || 'None'}</p>
        </div>`;
        
        if (storeNames.length === 0) {
            html += '<div class="warning">⚠️ This database has no object stores!</div>';
        } else {
            const transaction = db.transaction(storeNames, 'readonly');
            
            for (const storeName of storeNames) {
                try {
                    const store = transaction.objectStore(storeName);
                    const count = await new Promise((resolve, reject) => {
                        const countRequest = store.count();
                        countRequest.onsuccess = () => resolve(countRequest.result);
                        countRequest.onerror = () => reject(countRequest.error);
                    });
                    
                    html += `<div class="store-info">
                        <h4>📁 ${storeName} (${count} records)</h4>
                    `;
                    
                    if (count > 0) {
                        const allData = await new Promise((resolve, reject) => {
                            const getRequest = store.getAll();
                            getRequest.onsuccess = () => resolve(getRequest.result);
                            getRequest.onerror = () => reject(getRequest.error);
                        });
                        
                        html += '<pre>' + JSON.stringify(allData, null, 2) + '</pre>';
                    }
                    
                    html += '</div>';
                } catch (storeError) {
                    html += `<div class="store-info error">❌ Error with ${storeName}: ${storeError.message}</div>`;
                }
            }
        }
        
        db.close();
        resultsDiv.innerHTML = html;
        
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error">❌ Failed to open ${dbName}: ${error.message}</div>`;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Set up button event listeners
    const scanAllBtn = document.getElementById('scan-all-btn');
    const scanSpecificBtn = document.getElementById('scan-specific-btn');
    
    if (scanAllBtn) {
        scanAllBtn.addEventListener('click', scanAllDatabases);
    }
    
    if (scanSpecificBtn) {
        scanSpecificBtn.addEventListener('click', scanSpecificDB);
    }
    
    // Auto-scan on load
    setTimeout(scanAllDatabases, 500);
});
