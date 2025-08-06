// Dashboard JavaScript for Google Meet Tracker

let allMeetings = [];
let filteredMeetings = [];
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        // Load meetings data
        await loadMeetings();
        
        // Initialize filters
        initializeFilters();
        
        // Setup event listeners
        setupEventListeners();
        
        // Initial data display
        applyFilters();
        
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Failed to load dashboard data');
    }
}

function loadMeetings() {
    return new Promise((resolve, reject) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ action: 'getMeetings' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Chrome runtime error:', chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    allMeetings = response || [];
                    filteredMeetings = [...allMeetings];
                    console.log('Loaded meetings:', allMeetings.length);
                    resolve();
                });
            } else {
                console.error('Chrome extension APIs not available');
                reject(new Error('Chrome extension APIs not available'));
            }
        } catch (error) {
            console.error('Error in loadMeetings:', error);
            reject(error);
        }
    });
}

function initializeFilters() {
    // Set default date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
    document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
    
    // Populate participant filter
    populateParticipantFilter();
}

function populateParticipantFilter() {
    const participantSelect = document.getElementById('participant-select');
    const participantSearch = document.getElementById('participant-search');
    
    // Get all unique participants
    const participants = new Set();
    allMeetings.forEach(meeting => {
        meeting.participants.forEach(participant => {
            participants.add(participant);
        });
    });
    
    const sortedParticipants = Array.from(participants).sort();
    
    // Clear existing options except the first one
    participantSelect.innerHTML = '<option value="">All participants</option>';
    
    // Add participant options
    sortedParticipants.forEach(participant => {
        const option = document.createElement('option');
        option.value = participant;
        option.textContent = participant;
        participantSelect.appendChild(option);
    });
    
    // Setup search functionality
    participantSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const options = participantSelect.querySelectorAll('option');
        
        options.forEach(option => {
            if (option.value === '') return; // Skip "All participants" option
            
            const matches = option.textContent.toLowerCase().includes(searchTerm);
            option.style.display = matches ? 'block' : 'none';
        });
    });
}

function setupEventListeners() {
    // Quick filter buttons
    document.querySelectorAll('.quick-filter').forEach(button => {
        button.addEventListener('click', (e) => {
            // Remove active class from all buttons
            document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            e.target.classList.add('active');
            
            // Set date range based on button
            const days = e.target.getAttribute('data-days');
            setDateRange(days);
        });
    });
    
    // Apply filters button
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    
    // Clear filters button
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    
    // Export data button
    document.getElementById('export-data').addEventListener('click', exportData);
    
    // Clear data button
    document.getElementById('clear-data').addEventListener('click', clearAllData);
    
    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('meeting-modal').addEventListener('click', (e) => {
        if (e.target.id === 'meeting-modal') {
            closeModal();
        }
    });
}

function setDateRange(days) {
    const endDate = new Date();
    const startDate = new Date();
    
    if (days !== 'all') {
        startDate.setDate(startDate.getDate() - parseInt(days));
        document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
    } else {
        document.getElementById('start-date').value = '';
    }
    
    document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
}

function applyFilters() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const selectedParticipants = Array.from(document.getElementById('participant-select').selectedOptions)
        .map(option => option.value)
        .filter(value => value !== '');
    
    // Filter meetings
    filteredMeetings = allMeetings.filter(meeting => {
        const meetingDate = new Date(meeting.startTime);
        const meetingDateStr = meetingDate.toISOString().split('T')[0];
        
        // Date filter
        if (startDate && meetingDateStr < startDate) return false;
        if (endDate && meetingDateStr > endDate) return false;
        
        // Participant filter
        if (selectedParticipants.length > 0) {
            const hasSelectedParticipant = selectedParticipants.some(participant =>
                meeting.participants.includes(participant)
            );
            if (!hasSelectedParticipant) return false;
        }
        
        return true;
    });
    
    // Update displays
    updateSummaryStats();
    updateCharts();
    updateParticipantsSummary();
    updateRecentMeetings();
    updateMeetingsTable();
}

function clearFilters() {
    document.getElementById('start-date').value = '';
    document.getElementById('end-date').value = '';
    document.getElementById('participant-search').value = '';
    document.getElementById('participant-select').selectedIndex = 0;
    
    // Reset quick filter buttons
    document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.quick-filter[data-days="all"]').classList.add('active');
    
    applyFilters();
}

function updateSummaryStats() {
    const totalMeetings = filteredMeetings.length;
    const totalTime = filteredMeetings.reduce((sum, meeting) => {
        const duration = meeting.endTime ? (meeting.endTime - meeting.startTime) : 0;
        return sum + duration;
    }, 0);
    
    const uniqueParticipants = new Set();
    filteredMeetings.forEach(meeting => {
        meeting.participants.forEach(participant => {
            uniqueParticipants.add(participant);
        });
    });
    
    document.getElementById('total-meetings').textContent = totalMeetings;
    document.getElementById('total-time').textContent = formatDuration(totalTime);
    document.getElementById('unique-participants').textContent = uniqueParticipants.size;
}

function updateCharts() {
    // Check if ApexCharts is available
    if (typeof ApexCharts === 'undefined') {
        console.error('ApexCharts not available, hiding chart sections');
        document.getElementById('activity-chart').innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">Charts unavailable - ApexCharts library not loaded</p>';
        document.getElementById('duration-chart').innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">Charts unavailable - ApexCharts library not loaded</p>';
        return;
    }
    
    updateActivityChart();
    updateDurationChart();
}

function updateActivityChart() {
    const chartContainer = document.getElementById('activity-chart');
    
    // Destroy existing chart
    if (charts.activity) {
        charts.activity.destroy();
    }
    
    // Clear container and create new div for chart
    chartContainer.innerHTML = '<div id="activity-chart-apex"></div>';
    
    // Prepare data - meetings per day
    const dailyData = {};
    filteredMeetings.forEach(meeting => {
        const date = new Date(meeting.startTime).toISOString().split('T')[0];
        dailyData[date] = (dailyData[date] || 0) + 1;
    });
    
    const sortedDates = Object.keys(dailyData).sort();
    const chartData = sortedDates.map(date => ({
        x: new Date(date).getTime(),
        y: dailyData[date]
    }));
    
    const options = {
        series: [{
            name: 'Meetings',
            data: chartData,
            color: '#4285f4'
        }],
        chart: {
            type: 'area',
            height: 350,
            toolbar: {
                show: false
            },
            background: '#fff'
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'smooth',
            width: 3
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.1,
                stops: [0, 100]
            }
        },
        xaxis: {
            type: 'datetime',
            labels: {
                format: 'MMM dd'
            }
        },
        yaxis: {
            min: 0,
            labels: {
                formatter: function (val) {
                    return Math.floor(val);
                }
            }
        },
        tooltip: {
            x: {
                format: 'dd MMM yyyy'
            }
        },
        grid: {
            borderColor: '#e7e7e7',
            row: {
                colors: ['#f3f3f3', 'transparent'],
                opacity: 0.5
            }
        }
    };
    
    charts.activity = new ApexCharts(document.querySelector('#activity-chart-apex'), options);
    charts.activity.render();
}

function updateDurationChart() {
    const chartContainer = document.getElementById('duration-chart');
    
    // Destroy existing chart
    if (charts.duration) {
        charts.duration.destroy();
    }
    
    // Clear container and create new div for chart
    chartContainer.innerHTML = '<div id="duration-chart-apex"></div>';
    
    // Prepare duration data
    const durations = filteredMeetings.map(meeting => {
        const duration = meeting.endTime ? (meeting.endTime - meeting.startTime) : 0;
        return Math.round(duration / (1000 * 60)); // Convert to minutes
    });
    
    // Create duration buckets
    const buckets = {
        '0-15 min': 0,
        '15-30 min': 0,
        '30-60 min': 0,
        '1-2 hours': 0,
        '2+ hours': 0
    };
    
    durations.forEach(duration => {
        if (duration <= 15) buckets['0-15 min']++;
        else if (duration <= 30) buckets['15-30 min']++;
        else if (duration <= 60) buckets['30-60 min']++;
        else if (duration <= 120) buckets['1-2 hours']++;
        else buckets['2+ hours']++;
    });
    
    const options = {
        series: Object.values(buckets),
        chart: {
            type: 'donut',
            height: 350
        },
        labels: Object.keys(buckets),
        colors: ['#34a853', '#4285f4', '#fbbc04', '#ea4335', '#9aa0a6'],
        plotOptions: {
            pie: {
                donut: {
                    size: '60%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total Meetings',
                            formatter: function () {
                                return filteredMeetings.length;
                            }
                        }
                    }
                }
            }
        },
        dataLabels: {
            enabled: true,
            formatter: function (val, opts) {
                return opts.w.config.series[opts.seriesIndex] + ' meetings';
            }
        },
        legend: {
            position: 'bottom',
            horizontalAlign: 'center'
        },
        responsive: [{
            breakpoint: 480,
            options: {
                chart: {
                    height: 300
                },
                legend: {
                    position: 'bottom'
                }
            }
        }]
    };
    
    charts.duration = new ApexCharts(document.querySelector('#duration-chart-apex'), options);
    charts.duration.render();
}

function updateParticipantsSummary() {
    const participantCounts = {};
    
    filteredMeetings.forEach(meeting => {
        meeting.participants.forEach(participant => {
            participantCounts[participant] = (participantCounts[participant] || 0) + 1;
        });
    });
    
    const sortedParticipants = Object.entries(participantCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Top 10
    
    const container = document.getElementById('frequent-participants');
    
    if (sortedParticipants.length === 0) {
        container.innerHTML = '<div class="loading">No participants found</div>';
        return;
    }
    
    container.innerHTML = sortedParticipants
        .map(([participant, count]) => `
            <div class="participant-item">
                <span class="participant-name">${escapeHtml(participant)}</span>
                <span class="participant-count">${count} meetings</span>
            </div>
        `).join('');
}

function updateRecentMeetings() {
    const recentMeetings = [...filteredMeetings]
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, 10);
    
    const container = document.getElementById('recent-meetings-list');
    
    if (recentMeetings.length === 0) {
        container.innerHTML = '<div class="loading">No meetings found</div>';
        return;
    }
    
    container.innerHTML = recentMeetings
        .map(meeting => {
            const duration = meeting.endTime ? 
                formatDuration(meeting.endTime - meeting.startTime) : 
                'Ongoing';
            const participantCount = meeting.participants.length;
            
            return `
                <div class="meeting-item">
                    <div class="meeting-info">
                        <div>${new Date(meeting.startTime).toLocaleString()}</div>
                        <div class="meeting-time">${duration} • ${participantCount} participants</div>
                    </div>
                    <button class="view-details" onclick="showMeetingDetails('${meeting.id}')">
                        Details
                    </button>
                </div>
            `;
        }).join('');
}

function updateMeetingsTable() {
    const tbody = document.getElementById('meetings-table-body');
    
    if (filteredMeetings.length === 0) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="4">No meetings found</td></tr>';
        return;
    }
    
    const sortedMeetings = [...filteredMeetings].sort((a, b) => b.startTime - a.startTime);
    
    tbody.innerHTML = sortedMeetings
        .map(meeting => {
            const startTime = new Date(meeting.startTime).toLocaleString();
            const duration = meeting.endTime ? 
                formatDuration(meeting.endTime - meeting.startTime) : 
                'Ongoing';
            const participantsList = meeting.participants.slice(0, 3).join(', ') + 
                (meeting.participants.length > 3 ? ` (+${meeting.participants.length - 3})` : '');
            
            return `
                <tr>
                    <td>${startTime}</td>
                    <td>${duration}</td>
                    <td class="meeting-participants" title="${escapeHtml(meeting.participants.join(', '))}">
                        ${escapeHtml(participantsList)}
                    </td>
                    <td>
                        <button class="view-details" onclick="showMeetingDetails('${meeting.id}')">
                            View Details
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
}

function showMeetingDetails(meetingId) {
    const meeting = allMeetings.find(m => m.id === meetingId);
    if (!meeting) return;
    
    const startTime = new Date(meeting.startTime);
    const endTime = meeting.endTime ? new Date(meeting.endTime) : null;
    const duration = meeting.endTime ? 
        formatDuration(meeting.endTime - meeting.startTime) : 
        'Ongoing';
    
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <strong>Meeting URL:</strong><br>
            <a href="${meeting.url}" target="_blank" style="color: #4285f4;">${meeting.url}</a>
        </div>
        
        <div style="margin-bottom: 1rem;">
            <strong>Start Time:</strong> ${startTime.toLocaleString()}<br>
            ${endTime ? `<strong>End Time:</strong> ${endTime.toLocaleString()}<br>` : ''}
            <strong>Duration:</strong> ${duration}
        </div>
        
        <div style="margin-bottom: 1rem;">
            <strong>Participants (${meeting.participants.length}):</strong><br>
            ${meeting.participants.map(p => `<span style="display: inline-block; background: #f1f3f4; padding: 4px 8px; margin: 2px; border-radius: 4px; font-size: 0.9rem;">${escapeHtml(p)}</span>`).join('')}
        </div>
        
        ${meeting.minutes.length > 0 ? `
            <div>
                <strong>Meeting Timeline:</strong><br>
                <div style="max-height: 200px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 4px; padding: 1rem; margin-top: 0.5rem;">
                    ${meeting.minutes.map(minute => `
                        <div style="margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f0f0f0;">
                            <div style="font-size: 0.9rem; color: #666;">
                                ${new Date(minute.timestamp).toLocaleTimeString()}
                            </div>
                            <div style="font-size: 0.8rem;">
                                Participants: ${minute.participants.join(', ') || 'None detected'}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
    
    document.getElementById('meeting-modal').style.display = 'block';
}

function closeModal() {
    document.getElementById('meeting-modal').style.display = 'none';
}

function exportData() {
    if (filteredMeetings.length === 0) {
        alert('No data to export');
        return;
    }
    
    // Prepare CSV data
    const headers = ['Date', 'Start Time', 'End Time', 'Duration (minutes)', 'Participants', 'Participant Count'];
    const rows = filteredMeetings.map(meeting => {
        const startTime = new Date(meeting.startTime);
        const endTime = meeting.endTime ? new Date(meeting.endTime) : null;
        const duration = meeting.endTime ? Math.round((meeting.endTime - meeting.startTime) / (1000 * 60)) : 0;
        
        return [
            startTime.toLocaleDateString(),
            startTime.toLocaleTimeString(),
            endTime ? endTime.toLocaleTimeString() : 'Ongoing',
            duration,
            `"${meeting.participants.join(', ')}"`,
            meeting.participants.length
        ];
    });
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `google-meet-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearAllData() {
    if (confirm('Are you sure you want to clear all meeting data? This cannot be undone.')) {
        chrome.storage.local.set({ meetings: [] }, () => {
            allMeetings = [];
            filteredMeetings = [];
            updateSummaryStats();
            updateCharts();
            updateParticipantsSummary();
            updateRecentMeetings();
            updateMeetingsTable();
            populateParticipantFilter();
            alert('All data has been cleared.');
        });
    }
}

function formatDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${remainingMinutes}m`;
    } else {
        return `${remainingMinutes}m`;
    }
}

function showError(message) {
    // You could implement a toast notification here
    console.error(message);
    alert(message);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
