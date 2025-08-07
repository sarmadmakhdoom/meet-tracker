// Diagnostic tool JavaScript

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('MeetingTrackerDB', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

async function diagnoseData() {
    const resultsDiv = document.getElementById('diagnosis-results');
    resultsDiv.innerHTML = '<div class="info">🔍 Running diagnosis...</div>';
    
    try {
        const db = await openDB();
        
        // Check which stores exist
        const storeNames = Array.from(db.objectStoreNames);
        console.log('Available stores:', storeNames);
        
        let html = '<div class="section success">✅ Database Connection Successful</div>';
        html += `<div class="section info">
            <h3>📦 Database Info</h3>
            <p><strong>Database Name:</strong> ${db.name}</p>
            <p><strong>Version:</strong> ${db.version}</p>
            <p><strong>Object Stores:</strong> ${storeNames.join(', ')}</p>
        </div>`;
        
        // Determine which stores to access
        const hasMetings = storeNames.includes('meetings');
        const hasSessions = storeNames.includes('meetingSessions');
        
        if (!hasMetings && !hasSessions) {
            html += '<div class="section error">❌ No meeting or session stores found!</div>';
            resultsDiv.innerHTML = html;
            return;
        }
        
        const storesToAccess = [];
        if (hasMetings) storesToAccess.push('meetings');
        if (hasSessions) storesToAccess.push('meetingSessions');
        
        const transaction = db.transaction(storesToAccess, 'readonly');
        
        // Get meetings if store exists
        let meetings = [];
        if (hasMetings) {
            meetings = await new Promise((resolve, reject) => {
                const request = transaction.objectStore('meetings').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        
        // Get sessions if store exists  
        let sessions = [];
        if (hasSessions) {
            sessions = await new Promise((resolve, reject) => {
                const request = transaction.objectStore('meetingSessions').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        
        // Continue with data analysis
        html += '<div class="section success">✅ Data Analysis Complete</div>';
        
        html += `<div class="section">
            <h2>📊 Data Summary</h2>
            <p><strong>Meetings Store:</strong> ${meetings.length} records</p>
            <p><strong>Sessions Store:</strong> ${sessions.length} records</p>
        </div>`;
        
        // Compare by meeting ID
        const meetingMap = {};
        meetings.forEach(meeting => {
            meetingMap[meeting.id] = meeting;
        });
        
        const sessionMap = {};
        sessions.forEach(session => {
            if (!sessionMap[session.meetingId]) {
                sessionMap[session.meetingId] = [];
            }
            sessionMap[session.meetingId].push(session);
        });
        
        html += '<div class="section"><h2>📋 Meeting vs Session Comparison</h2>';
        html += '<table><tr><th>Meeting ID</th><th>Meeting Duration</th><th>Session Duration</th><th>Status</th><th>Details</th></tr>';
        
        const allMeetingIds = new Set([...Object.keys(meetingMap), ...Object.keys(sessionMap)]);
        
        for (const meetingId of allMeetingIds) {
            const meeting = meetingMap[meetingId];
            const meetingSessions = sessionMap[meetingId] || [];
            
            let meetingDuration = 0;
            let sessionDuration = 0;
            let status = '';
            let details = '';
            let rowClass = '';
            
            if (meeting) {
                meetingDuration = meeting.endTime ? (meeting.endTime - meeting.startTime) : 0;
            }
            
            if (meetingSessions.length > 0) {
                sessionDuration = meetingSessions.reduce((sum, session) => {
                    return sum + (session.endTime ? (session.endTime - session.startTime) : 0);
                }, 0);
            }
            
            // Determine status
            if (!meeting && meetingSessions.length > 0) {
                status = '⚠️ Session Only';
                details = `${meetingSessions.length} session(s), no meeting record`;
                rowClass = 'duration-mismatch';
            } else if (meeting && meetingSessions.length === 0) {
                status = '⚠️ Meeting Only';
                details = 'Meeting record exists, no sessions';
                rowClass = 'duration-mismatch';
            } else if (Math.abs(meetingDuration - sessionDuration) > 5000) { // 5 second tolerance
                status = '❌ Duration Mismatch';
                details = `Difference: ${Math.round((meetingDuration - sessionDuration) / 60000)}m`;
                rowClass = 'duration-mismatch';
            } else {
                status = '✅ Match';
                details = 'Data consistent';
                rowClass = 'duration-correct';
            }
            
            const meetingDurationMin = Math.round(meetingDuration / 60000);
            const sessionDurationMin = Math.round(sessionDuration / 60000);
            
            html += `<tr class="${rowClass}">
                <td>${meetingId}</td>
                <td>${meetingDurationMin}m (${Math.round(meetingDuration / 1000)}s)</td>
                <td>${sessionDurationMin}m (${Math.round(sessionDuration / 1000)}s)</td>
                <td>${status}</td>
                <td>${details}</td>
            </tr>`;
        }
        
        html += '</table></div>';
        
        // Detailed breakdown for your specific meeting
        const targetMeetingId = 'fdq-ptco-fdj';
        const targetMeeting = meetingMap[targetMeetingId];
        const targetSessions = sessionMap[targetMeetingId] || [];
        
        if (targetMeeting || targetSessions.length > 0) {
            html += `<div class="section warning">
                <h2>🎯 Detailed Analysis: ${targetMeetingId}</h2>
            `;
            
            if (targetMeeting) {
                const duration = targetMeeting.endTime ? (targetMeeting.endTime - targetMeeting.startTime) : 0;
                html += `<h3>Meeting Record:</h3>
                <ul>
                    <li><strong>Title:</strong> ${targetMeeting.title}</li>
                    <li><strong>Start:</strong> ${new Date(targetMeeting.startTime).toLocaleString()}</li>
                    <li><strong>End:</strong> ${targetMeeting.endTime ? new Date(targetMeeting.endTime).toLocaleString() : 'Still active'}</li>
                    <li><strong>Duration:</strong> ${Math.round(duration / 60000)} minutes (${Math.round(duration / 1000)} seconds)</li>
                    <li><strong>Participants:</strong> ${targetMeeting.participants ? targetMeeting.participants.length : 0}</li>
                </ul>`;
            }
            
            if (targetSessions.length > 0) {
                html += `<h3>Session Records (${targetSessions.length}):</h3>`;
                targetSessions.forEach((session, index) => {
                    const duration = session.endTime ? (session.endTime - session.startTime) : 0;
                    html += `<ul>
                        <li><strong>Session ${index + 1}:</strong> ${session.sessionId}</li>
                        <li><strong>Start:</strong> ${new Date(session.startTime).toLocaleString()}</li>
                        <li><strong>End:</strong> ${session.endTime ? new Date(session.endTime).toLocaleString() : 'Still active'}</li>
                        <li><strong>Duration:</strong> ${Math.round(duration / 60000)} minutes (${Math.round(duration / 1000)} seconds)</li>
                        <li><strong>End Reason:</strong> ${session.endReason || 'Unknown'}</li>
                        <li><strong>Data Source:</strong> ${session.dataSource || 'Unknown'}</li>
                    </ul>`;
                });
            }
            
            html += '</div>';
        }
        
        resultsDiv.innerHTML = html;
        
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error">❌ Diagnosis failed: ${error.message}</div>`;
        console.error('Diagnosis error:', error);
    }
}

async function fixDataMismatch() {
    const resultsDiv = document.getElementById('fix-results');
    resultsDiv.innerHTML = '<div class="info">🔧 Fixing data mismatch...</div>';
    
    try {
        const db = await openDB();
        const transaction = db.transaction(['meetings', 'meetingSessions'], 'readwrite');
        
        // Get all meetings
        const meetings = await new Promise((resolve, reject) => {
            const request = transaction.objectStore('meetings').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        // Get all sessions
        const sessions = await new Promise((resolve, reject) => {
            const request = transaction.objectStore('meetingSessions').getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        
        let fixLog = [];
        let fixed = 0;
        
        // For each meeting, check if it has proper session representation
        for (const meeting of meetings) {
            const meetingDuration = meeting.endTime ? (meeting.endTime - meeting.startTime) : 0;
            const relatedSessions = sessions.filter(s => s.meetingId === meeting.id);
            
            if (relatedSessions.length === 0) {
                fixLog.push(`No sessions found for meeting ${meeting.id}, creating one...`);
                
                // Create a proper session from the meeting
                const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const session = {
                    sessionId: sessionId,
                    meetingId: meeting.id,
                    title: meeting.title || meeting.id,
                    startTime: meeting.startTime,
                    endTime: meeting.endTime,
                    isActive: !meeting.endTime,
                    participants: meeting.participants || [],
                    minuteLogs: meeting.minuteLogs || [],
                    url: meeting.url,
                    dataSource: 'migrated_from_meeting',
                    endReason: meeting.endReason || 'meeting_ended',
                    migrated: true,
                    migratedAt: Date.now(),
                    originalMeetingData: meeting
                };
                
                await new Promise((resolve, reject) => {
                    const request = transaction.objectStore('meetingSessions').add(session);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                
                fixLog.push(`✅ Created session ${sessionId} with ${Math.round(meetingDuration / 60000)} minutes duration`);
                fixed++;
                
            } else {
                // Check if session duration matches meeting duration
                const totalSessionDuration = relatedSessions.reduce((sum, session) => {
                    return sum + (session.endTime ? (session.endTime - session.startTime) : 0);
                }, 0);
                
                if (Math.abs(meetingDuration - totalSessionDuration) > 5000) { // 5 second tolerance
                    fixLog.push(`Duration mismatch for ${meeting.id}: Meeting=${Math.round(meetingDuration/60000)}m, Sessions=${Math.round(totalSessionDuration/60000)}m`);
                    
                    // Option 1: Delete existing short sessions and create a proper one
                    if (relatedSessions.length === 1 && totalSessionDuration < meetingDuration / 2) {
                        fixLog.push(`Replacing short session with proper meeting data...`);
                        
                        // Delete the short session
                        for (const session of relatedSessions) {
                            await new Promise((resolve, reject) => {
                                const request = transaction.objectStore('meetingSessions').delete(session.sessionId);
                                request.onsuccess = () => resolve(request.result);
                                request.onerror = () => reject(request.error);
                            });
                        }
                        
                        // Create proper session
                        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const session = {
                            sessionId: sessionId,
                            meetingId: meeting.id,
                            title: meeting.title || meeting.id,
                            startTime: meeting.startTime,
                            endTime: meeting.endTime,
                            isActive: !meeting.endTime,
                            participants: meeting.participants || [],
                            minuteLogs: meeting.minuteLogs || [],
                            url: meeting.url,
                            dataSource: 'fixed_from_meeting',
                            endReason: meeting.endReason || 'meeting_ended',
                            fixed: true,
                            fixedAt: Date.now(),
                            originalMeetingData: meeting,
                            replacedSessions: relatedSessions.map(s => s.sessionId)
                        };
                        
                        await new Promise((resolve, reject) => {
                            const request = transaction.objectStore('meetingSessions').add(session);
                            request.onsuccess = () => resolve(request.result);
                            request.onerror = () => reject(request.error);
                        });
                        
                        fixLog.push(`✅ Replaced with fixed session ${sessionId} (${Math.round(meetingDuration / 60000)}m)`);
                        fixed++;
                    }
                } else {
                    fixLog.push(`✅ ${meeting.id} data is consistent (${Math.round(meetingDuration/60000)}m)`);
                }
            }
        }
        
        let html = `<div class="success">✅ Fix complete: ${fixed} records fixed</div>`;
        html += '<div class="section"><h3>Fix Log:</h3><pre>' + fixLog.join('\n') + '</pre></div>';
        
        resultsDiv.innerHTML = html;
        
        // Suggest re-running diagnosis
        setTimeout(() => {
            resultsDiv.innerHTML += '<div class="info">💡 Run diagnosis again to verify the fix worked!</div>';
        }, 1000);
        
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error">❌ Fix failed: ${error.message}</div>`;
        console.error('Fix error:', error);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Set up button event listeners
    const diagnoseBtn = document.getElementById('diagnose-btn');
    const fixBtn = document.getElementById('fix-btn');
    
    if (diagnoseBtn) {
        diagnoseBtn.addEventListener('click', diagnoseData);
    }
    
    if (fixBtn) {
        fixBtn.addEventListener('click', fixDataMismatch);
    }
    
    // Auto-run diagnosis on load
    setTimeout(diagnoseData, 500);
});
