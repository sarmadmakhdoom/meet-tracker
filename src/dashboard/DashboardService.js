// Dashboard Service - Handles dashboard data and UI
class DashboardService {
    constructor() {
        this.meetings = [];
        this.currentFilter = 'all';
        this.dateRange = null;
        this.sortBy = 'startTime';
        this.sortDirection = 'desc';
        this.initialized = false;
    }
    
    async init() {
        try {
            console.log('📊 Initializing Dashboard Service...');
            
            // Load initial data
            await this.loadMeetings();
            
            // Setup UI event handlers
            this.setupEventHandlers();
            
            // Initial render
            this.render();
            
            this.initialized = true;
            console.log('✅ Dashboard Service initialized');
            
        } catch (error) {
            console.error('❌ Dashboard initialization failed:', error);
            this.showError('Failed to initialize dashboard');
        }
    }
    
    async loadMeetings() {
        try {
            console.log('🔄 Loading meetings from background...');
            
            const response = await this.sendMessage({
                type: 'get_dashboard_data',
                data: {
                    options: {
                        limit: 100,
                        dateRange: this.dateRange
                    }
                }
            });
            
            if (response.error) {
                throw new Error(response.error);
            }
            
            this.meetings = response || [];
            console.log(`📋 Loaded ${this.meetings.length} meetings`);
            
        } catch (error) {
            console.error('❌ Error loading meetings:', error);
            this.meetings = [];
            throw error;
        }
    }
    
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            if (!chrome?.runtime?.id) {
                reject(new Error('Extension context not available'));
                return;
            }
            
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    setupEventHandlers() {
        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }
        
        // Filter buttons
        const filterBtns = document.querySelectorAll('[data-filter]');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.filter);
            });
        });
        
        // Sort selector
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.setSortBy(e.target.value);
            });
        }
        
        // Date range picker (if implemented)
        const dateRangeBtn = document.getElementById('date-range-btn');
        if (dateRangeBtn) {
            dateRangeBtn.addEventListener('click', () => this.showDateRangePicker());
        }
        
        // Force end meetings button
        const forceEndBtn = document.getElementById('force-end-btn');
        if (forceEndBtn) {
            forceEndBtn.addEventListener('click', () => this.forceEndMeetings());
        }
    }
    
    async refresh() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 Refreshing...';
        }
        
        try {
            await this.loadMeetings();
            this.render();
            this.showMessage('Dashboard refreshed', 'success');
        } catch (error) {
            this.showError('Failed to refresh dashboard');
        } finally {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Refresh';
            }
        }
    }
    
    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update active filter button
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        
        this.render();
    }
    
    setSortBy(sortBy) {
        this.sortBy = sortBy;
        this.render();
    }
    
    getFilteredMeetings() {
        let filtered = [...this.meetings];
        
        // Apply status filter
        switch (this.currentFilter) {
            case 'active':
                filtered = filtered.filter(m => m.isActive);
                break;
            case 'completed':
                filtered = filtered.filter(m => !m.isActive);
                break;
            case 'today':
                const today = new Date().toISOString().split('T')[0];
                filtered = filtered.filter(m => {
                    const meetingDate = new Date(m.meeting.startTime).toISOString().split('T')[0];
                    return meetingDate === today;
                });
                break;
            // 'all' shows everything
        }
        
        // Apply date range filter
        if (this.dateRange) {
            filtered = filtered.filter(m => {
                const meetingDate = new Date(m.meeting.startTime);
                return meetingDate >= this.dateRange.start && meetingDate <= this.dateRange.end;
            });
        }
        
        // Apply sorting
        filtered.sort((a, b) => {
            let aValue, bValue;
            
            switch (this.sortBy) {
                case 'duration':
                    aValue = a.totalDuration || 0;
                    bValue = b.totalDuration || 0;
                    break;
                case 'sessions':
                    aValue = a.sessionCount || 0;
                    bValue = b.sessionCount || 0;
                    break;
                case 'participants':
                    aValue = a.meeting.participants?.length || 0;
                    bValue = b.meeting.participants?.length || 0;
                    break;
                case 'title':
                    aValue = a.meeting.title || '';
                    bValue = b.meeting.title || '';
                    return aValue.localeCompare(bValue);
                default: // startTime
                    aValue = a.meeting.startTime || 0;
                    bValue = b.meeting.startTime || 0;
            }
            
            return this.sortDirection === 'desc' ? bValue - aValue : aValue - bValue;
        });
        
        return filtered;
    }
    
    render() {
        const container = document.getElementById('meetings-container');
        if (!container) {
            console.error('Meetings container not found');
            return;
        }
        
        const filteredMeetings = this.getFilteredMeetings();
        
        if (filteredMeetings.length === 0) {
            container.innerHTML = this.renderEmptyState();
            return;
        }
        
        // Render statistics
        this.renderStats(filteredMeetings);
        
        // Render meetings
        container.innerHTML = filteredMeetings.map(meetingData => 
            this.renderMeeting(meetingData)
        ).join('');
        
        // Setup meeting-specific event handlers
        this.setupMeetingEventHandlers();
    }
    
    renderStats(meetings) {
        const statsContainer = document.getElementById('stats-container');
        if (!statsContainer) return;
        
        const totalMeetings = meetings.length;
        const activeMeetings = meetings.filter(m => m.isActive).length;
        const totalDuration = meetings.reduce((sum, m) => sum + (m.totalDuration || 0), 0);
        const totalSessions = meetings.reduce((sum, m) => sum + (m.sessionCount || 0), 0);
        const averageDuration = totalMeetings > 0 ? totalDuration / totalMeetings : 0;
        
        statsContainer.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${totalMeetings}</div>
                    <div class="stat-label">Total Meetings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${activeMeetings}</div>
                    <div class="stat-label">Active Now</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${totalSessions}</div>
                    <div class="stat-label">Total Sessions</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.formatDuration(totalDuration)}</div>
                    <div class="stat-label">Total Time</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.formatDuration(averageDuration)}</div>
                    <div class="stat-label">Average Meeting</div>
                </div>
            </div>
        `;
    }
    
    renderMeeting(meetingData) {
        const { meeting, sessions, sessionCount, totalDuration, isActive } = meetingData;
        
        const statusClass = isActive ? 'active' : 'completed';
        const statusIcon = isActive ? '🔴' : '✅';
        const statusText = isActive ? 'Active' : 'Completed';
        
        const participantCount = meeting.participants?.length || 0;
        const startTime = meeting.startTime ? new Date(meeting.startTime) : null;
        const endTime = meeting.endTime ? new Date(meeting.endTime) : null;
        
        return `
            <div class="meeting-card ${statusClass}" data-meeting-id="${meeting.meetingId}">
                <div class="meeting-header">
                    <div class="meeting-title-section">
                        <h3 class="meeting-title">${this.escapeHtml(meeting.title)}</h3>
                        <div class="meeting-id">${meeting.meetingId}</div>
                    </div>
                    <div class="meeting-status">
                        <span class="status-badge ${statusClass}">
                            ${statusIcon} ${statusText}
                        </span>
                    </div>
                </div>
                
                <div class="meeting-stats">
                    <div class="stat">
                        <span class="stat-label">Duration:</span>
                        <span class="stat-value">${this.formatDuration(totalDuration)}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Sessions:</span>
                        <span class="stat-value">${sessionCount}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Participants:</span>
                        <span class="stat-value">${participantCount}</span>
                    </div>
                    ${startTime ? `
                    <div class="stat">
                        <span class="stat-label">Started:</span>
                        <span class="stat-value">${startTime.toLocaleString()}</span>
                    </div>
                    ` : ''}
                    ${endTime ? `
                    <div class="stat">
                        <span class="stat-label">Ended:</span>
                        <span class="stat-value">${endTime.toLocaleString()}</span>
                    </div>
                    ` : ''}
                </div>
                
                ${participantCount > 0 ? `
                <div class="participants-section">
                    <div class="participants-label">Participants:</div>
                    <div class="participants-list">
                        ${meeting.participants.map(p => 
                            `<span class="participant-chip">${this.escapeHtml(p.name)}</span>`
                        ).join('')}
                    </div>
                </div>
                ` : ''}
                
                ${sessionCount > 1 ? `
                <div class="sessions-section">
                    <div class="sessions-toggle" data-meeting-id="${meeting.meetingId}">
                        📁 View ${sessionCount} Sessions
                    </div>
                    <div class="sessions-list" id="sessions-${meeting.meetingId}" style="display: none;">
                        ${sessions.map(session => this.renderSession(session)).join('')}
                    </div>
                </div>
                ` : ''}
                
                <div class="meeting-actions">
                    <button class="btn-secondary" onclick="dashboardService.viewMeetingDetails('${meeting.meetingId}')">
                        📊 View Details
                    </button>
                    ${isActive ? `
                    <button class="btn-warning" onclick="dashboardService.endMeeting('${meeting.meetingId}')">
                        🚪 End Meeting
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    renderSession(session) {
        const duration = this.formatDuration(session.duration || 0);
        const startTime = new Date(session.startTime).toLocaleString();
        const endTime = session.endTime ? new Date(session.endTime).toLocaleString() : 'Ongoing';
        const statusIcon = session.isActive ? '🔴' : '✅';
        
        return `
            <div class="session-item ${session.isActive ? 'active' : 'completed'}">
                <div class="session-header">
                    <span class="session-status">${statusIcon}</span>
                    <span class="session-duration">${duration}</span>
                    <span class="session-participants">${session.participantCount} participants</span>
                </div>
                <div class="session-times">
                    <div class="session-start">Started: ${startTime}</div>
                    <div class="session-end">Ended: ${endTime}</div>
                    ${session.endReason ? `<div class="session-reason">Reason: ${session.endReason}</div>` : ''}
                </div>
            </div>
        `;
    }
    
    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-icon">📡</div>
                <h3>No meetings found</h3>
                <p>No meetings match your current filters.</p>
                <button class="btn-primary" onclick="dashboardService.refresh()">
                    🔄 Refresh
                </button>
            </div>
        `;
    }
    
    setupMeetingEventHandlers() {
        // Sessions toggle
        document.querySelectorAll('.sessions-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const meetingId = e.target.dataset.meetingId;
                const sessionsList = document.getElementById(`sessions-${meetingId}`);
                if (sessionsList) {
                    const isVisible = sessionsList.style.display !== 'none';
                    sessionsList.style.display = isVisible ? 'none' : 'block';
                    e.target.textContent = isVisible ? 
                        `📁 View Sessions` : 
                        `📂 Hide Sessions`;
                }
            });
        });
    }
    
    async viewMeetingDetails(meetingId) {
        // Implementation for viewing detailed meeting information
        // Could open a modal or navigate to a detailed view
        console.log('View details for meeting:', meetingId);
        this.showMessage('Meeting details view not implemented yet', 'info');
    }
    
    async endMeeting(meetingId) {
        if (!confirm(`Are you sure you want to end the meeting "${meetingId}"?`)) {
            return;
        }
        
        try {
            const response = await this.sendMessage({
                type: 'session_end',
                data: {
                    meetingId: meetingId,
                    reason: 'manual_dashboard_end'
                }
            });
            
            if (response.error) {
                throw new Error(response.error);
            }
            
            this.showMessage('Meeting ended successfully', 'success');
            await this.refresh();
            
        } catch (error) {
            console.error('Error ending meeting:', error);
            this.showError('Failed to end meeting');
        }
    }
    
    async forceEndMeetings() {
        if (!confirm('Are you sure you want to end ALL active meetings? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await this.sendMessage({
                type: 'force_end_meetings'
            });
            
            if (response.error) {
                throw new Error(response.error);
            }
            
            this.showMessage(response.message || 'All meetings ended', 'success');
            await this.refresh();
            
        } catch (error) {
            console.error('Error force ending meetings:', error);
            this.showError('Failed to end meetings');
        }
    }
    
    formatDuration(ms) {
        if (!ms || ms < 0) return '0m';
        
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
    }
    
    showMessage(message, type = 'info') {
        // Show a temporary message to user
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.textContent = message;
        
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            messageEl.remove();
        }, 3000);
    }
    
    showError(message) {
        this.showMessage(message, 'error');
    }
    
    showDateRangePicker() {
        // Implementation for date range picker
        this.showMessage('Date range picker not implemented yet', 'info');
    }
}

// Export for global usage
window.DashboardService = DashboardService;

// Create global instance
const dashboardService = new DashboardService();
window.dashboardService = dashboardService;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => dashboardService.init());
} else {
    dashboardService.init();
}
