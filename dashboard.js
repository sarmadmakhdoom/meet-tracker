// Dashboard JavaScript for Google Meet Tracker - Dark Mode Analytics

let allMeetings = [];
let filteredMeetings = [];
let charts = {};
const a_hours_work_day = 8;

document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        await loadMeetings();
        initializeFilters();
        setupEventListeners();
        applyFilters();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Failed to load dashboard data. Please ensure the extension is running correctly.');
    }
}

function loadMeetings() {
    return new Promise((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'getMeetings' }, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                allMeetings = response || [];
                filteredMeetings = [...allMeetings];
                console.log(`Loaded ${allMeetings.length} meetings.`);
                resolve();
            });
        } else {
            console.warn('Chrome extension APIs not available. Using mock data for development.');
            // Mock data for development outside of the extension environment
            allMeetings = generateMockData();
            filteredMeetings = [...allMeetings];
            resolve();
        }
    });
}

function initializeFilters() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
    document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
    
    populateParticipantFilter();
}

function populateParticipantFilter() {
    const participantSelect = document.getElementById('participant-select');
    const participants = new Set();
    allMeetings.forEach(meeting => {
        meeting.participants.forEach(p => participants.add(p));
    });
    
    const sortedParticipants = Array.from(participants).sort();
    participantSelect.innerHTML = '<option value="">All participants</option>';
    sortedParticipants.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = p;
        participantSelect.appendChild(option);
    });
}

function setupEventListeners() {
    document.querySelectorAll('.quick-filter').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            setDateRange(e.target.getAttribute('data-days'));
        });
    });
    
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('export-data').addEventListener('click', exportData);
    document.getElementById('clear-data').addEventListener('click', clearAllData);
    
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('meeting-modal').addEventListener('click', (e) => {
        if (e.target.id === 'meeting-modal') closeModal();
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
    const selectedParticipant = document.getElementById('participant-select').value;

    filteredMeetings = allMeetings.filter(meeting => {
        const meetingDate = new Date(meeting.startTime).toISOString().split('T')[0];
        if (startDate && meetingDate < startDate) return false;
        if (endDate && meetingDate > endDate) return false;
        if (selectedParticipant && selectedParticipant !== '') {
            return meeting.participants.includes(selectedParticipant);
        }
        return true;
    });
    
    updateDashboard();
}

function clearFilters() {
    document.getElementById('start-date').value = '';
    document.getElementById('end-date').value = '';
    document.getElementById('participant-select').selectedIndex = 0;
    
    document.querySelectorAll('.quick-filter').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.quick-filter[data-days="all"]').classList.add('active');
    
    applyFilters();
}

function updateDashboard() {
    updateSummaryStats();
    updateAllCharts();
    updateParticipantsSummary();
    updateRecentMeetings();
    updateMeetingsTable();
    updateDetailedStats();
}

function updateSummaryStats() {
    const totalMeetings = filteredMeetings.length;
    const totalTime = filteredMeetings.reduce((sum, m) => sum + (m.endTime ? (m.endTime - m.startTime) : 0), 0);
    const uniqueParticipants = new Set(filteredMeetings.flatMap(m => m.participants));

    // Calculate daily averages
    const dailyTime = {};
    filteredMeetings.forEach(m => {
        const date = new Date(m.startTime).toISOString().split('T')[0];
        dailyTime[date] = (dailyTime[date] || 0) + (m.endTime ? (m.endTime - m.startTime) : 0);
    });
    const totalDays = Object.keys(dailyTime).length || 1;
    const avgDailyTime = totalTime / totalDays;
    const workPercentage = (avgDailyTime / (a_hours_work_day * 60 * 60 * 1000)) * 100;

    document.getElementById('total-meetings').textContent = totalMeetings;
    document.getElementById('total-time').textContent = formatDuration(totalTime);
    document.getElementById('unique-participants').textContent = uniqueParticipants.size;
    document.getElementById('avg-daily-time').textContent = formatDuration(avgDailyTime);
    document.getElementById('work-percentage').textContent = `${workPercentage.toFixed(1)}%`;
}

function updateAllCharts() {
    if (typeof ApexCharts === 'undefined') {
        console.error('ApexCharts not loaded');
        return;
    }
    renderDailyTimeChart();
    renderCollaboratorsChart();
    renderActivityChart();
    renderDurationChart();
    renderWeeklyPatternChart();
    renderHourlyDistributionChart();
}

// Chart Rendering Functions (using common options)
const getCommonChartOptions = (theme = 'dark') => ({
    chart: {
        background: 'transparent',
        toolbar: { show: false },
        foreColor: '#e8eaed'
    },
    grid: {
        borderColor: '#444'
    },
    xaxis: {
        labels: {
            style: { colors: '#9aa0a6' }
        },
        axisBorder: { color: '#444' },
        axisTicks: { color: '#444' }
    },
    yaxis: {
        labels: {
            style: { colors: '#9aa0a6' }
        }
    },
    tooltip: {
        theme
    }
});

function renderChart(containerId, options) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (charts[containerId]) {
        charts[containerId].destroy();
    }
    container.innerHTML = '';
    
    const chart = new ApexCharts(container, options);
    charts[containerId] = chart;
    chart.render();
}

function renderDailyTimeChart() {
    const dailyData = {};
    filteredMeetings.forEach(m => {
        const date = new Date(m.startTime).toISOString().split('T')[0];
        dailyData[date] = (dailyData[date] || 0) + (m.endTime ? (m.endTime - m.startTime) / (1000 * 60 * 60) : 0); // hours
    });

    const sortedDates = Object.keys(dailyData).sort();
    const seriesData = sortedDates.map(date => ({
        x: new Date(date).getTime(),
        y: dailyData[date].toFixed(2)
    }));

    const options = {
        ...getCommonChartOptions(),
        series: [
            { name: 'Meeting Time', data: seriesData, color: '#1a73e8' },
            { name: 'Work Day Goal', data: seriesData.map(d => ({ x: d.x, y: a_hours_work_day })), color: '#34a853' }
        ],
        chart: { ...getCommonChartOptions().chart, type: 'area', height: 350 },
        stroke: { curve: 'smooth', width: [3, 2] },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1, stops: [0, 100]
            }
        },
        xaxis: { type: 'datetime', labels: { format: 'MMM dd' } },
        yaxis: { title: { text: 'Hours' } },
        tooltip: {
            x: { format: 'dd MMM yyyy' },
            y: { formatter: (val) => `${val} hours` }
        },
        legend: { position: 'top', horizontalAlign: 'left' }
    };
    renderChart('daily-time-chart', options);
}

function renderCollaboratorsChart() {
    const participantMeetings = {};
    filteredMeetings.forEach(meeting => {
        meeting.participants.forEach(p => {
            participantMeetings[p] = (participantMeetings[p] || 0) + 1;
        });
    });
    
    const sortedParticipants = Object.entries(participantMeetings)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const options = {
        ...getCommonChartOptions(),
        series: sortedParticipants.map(p => p[1]),
        labels: sortedParticipants.map(p => p[0]),
        chart: { type: 'pie', height: 350 },
        plotOptions: {
            pie: {
                expandOnClick: true,
                dataLabels: {
                    offset: -10
                }
            }
        },
        legend: { 
            position: 'bottom',
            horizontalAlign: 'center'
        },
        tooltip: { y: { formatter: (val) => `${val} meetings` } },
        dataLabels: {
            enabled: true,
            formatter: function (val, opts) {
                return opts.w.config.series[opts.seriesIndex] + ' meetings';
            },
            style: {
                fontSize: '12px',
                colors: ['#fff']
            }
        }
    };
    renderChart('collaborators-chart', options);
}

function renderActivityChart() {
    const dailyData = {};
    filteredMeetings.forEach(m => {
        const date = new Date(m.startTime).toISOString().split('T')[0];
        dailyData[date] = (dailyData[date] || 0) + 1;
    });

    const sortedDates = Object.keys(dailyData).sort();
    const chartData = sortedDates.map(date => ({ x: new Date(date).getTime(), y: dailyData[date] }));

    const options = {
        ...getCommonChartOptions(),
        series: [{ name: 'Meetings', data: chartData, color: '#ea4335' }],
        chart: { type: 'bar', height: 350 },
        xaxis: { type: 'datetime', labels: { format: 'MMM dd' } },
        yaxis: { title: { text: 'Number of Meetings' } },
        tooltip: { x: { format: 'dd MMM yyyy' } }
    };
    renderChart('activity-chart', options);
}

function renderDurationChart() {
    const buckets = {
        '0-15 min': 0, '15-30 min': 0, '30-60 min': 0,
        '1-2 hours': 0, '2+ hours': 0
    };
    filteredMeetings.forEach(m => {
        const duration = m.endTime ? (m.endTime - m.startTime) / 60000 : 0;
        if (duration <= 15) buckets['0-15 min']++;
        else if (duration <= 30) buckets['15-30 min']++;
        else if (duration <= 60) buckets['30-60 min']++;
        else if (duration <= 120) buckets['1-2 hours']++;
        else buckets['2+ hours']++;
    });

    const options = {
        ...getCommonChartOptions(),
        series: Object.values(buckets),
        labels: Object.keys(buckets),
        chart: { type: 'pie', height: 350 },
        legend: { position: 'bottom' },
        tooltip: { y: { formatter: (val) => `${val} meetings` } }
    };
    renderChart('duration-chart', options);
}

function renderWeeklyPatternChart() {
    const weeklyData = [0, 0, 0, 0, 0, 0, 0]; // Sun - Sat
    filteredMeetings.forEach(m => {
        const day = new Date(m.startTime).getDay();
        weeklyData[day] += (m.endTime - m.startTime) / (1000 * 60 * 60); // hours
    });

    const options = {
        ...getCommonChartOptions(),
        series: [{ name: 'Total Meeting Time', data: weeklyData.map(d => d.toFixed(2)), color: '#fbbc04' }],
        chart: { type: 'radar', height: 350 },
        xaxis: {
            categories: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        },
        yaxis: { labels: { formatter: (val) => `${val}h` } },
        tooltip: { y: { formatter: (val) => `${val} hours` } }
    };
    renderChart('weekly-pattern-chart', options);
}

function renderHourlyDistributionChart() {
    const hourlyData = Array(24).fill(0);
    filteredMeetings.forEach(m => {
        const hour = new Date(m.startTime).getHours();
        hourlyData[hour]++;
    });

    // Convert to 12-hour format with AM/PM
    const formatHour = (hour) => {
        if (hour === 0) return '12 AM';
        if (hour === 12) return '12 PM';
        if (hour < 12) return `${hour} AM`;
        return `${hour - 12} PM`;
    };

    const options = {
        ...getCommonChartOptions(),
        series: [{ name: 'Number of Meetings', data: hourlyData, color: '#34a853' }],
        chart: { type: 'area', height: 350 },
        xaxis: {
            categories: Array.from({ length: 24 }, (_, i) => formatHour(i)),
            title: { text: 'Hour of the Day' },
            labels: {
                rotate: -45,
                style: { fontSize: '11px' }
            }
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.6, opacityTo: 0.2, stops: [0, 100] } }
    };
    renderChart('hourly-distribution-chart', options);
}

function updateDetailedStats() {
    const dailyTime = {};
    filteredMeetings.forEach(m => {
        const date = new Date(m.startTime).toISOString().split('T')[0];
        dailyTime[date] = (dailyTime[date] || 0) + (m.endTime ? (m.endTime - m.startTime) : 0);
    });

    const busiestDay = Object.keys(dailyTime).length ? 
        Object.entries(dailyTime).sort((a, b) => b[1] - a[1])[0] : ['-', 0];
    
    const avgMeetingLength = filteredMeetings.length ? 
        filteredMeetings.reduce((sum, m) => sum + (m.endTime ? m.endTime - m.startTime : 0), 0) / filteredMeetings.length : 0;

    const totalHoursInMeetings = filteredMeetings.reduce((sum, m) => sum + (m.endTime ? (m.endTime - m.startTime) / 3600000 : 0), 0);

    document.getElementById('busiest-day').textContent = busiestDay[0] !== '-' ? new Date(busiestDay[0]).toLocaleDateString() : '-';
    document.getElementById('avg-meeting-length').textContent = formatDuration(avgMeetingLength);
    document.getElementById('total-hours-saved').textContent = `${totalHoursInMeetings.toFixed(1)}h`;
}

function updateParticipantsSummary() {
    const container = document.getElementById('frequent-participants');
    const participantCounts = {};
    filteredMeetings.forEach(m => {
        m.participants.forEach(p => {
            participantCounts[p] = (participantCounts[p] || 0) + 1;
        });
    });

    const sorted = Object.entries(participantCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    if (sorted.length === 0) {
        container.innerHTML = '<div class="loading">No participants found</div>';
        return;
    }
    container.innerHTML = sorted.map(([name, count]) => `
        <div class="participant-item">
            <span class="participant-name">${escapeHtml(name)}</span>
            <span class="participant-count">${count} meetings</span>
        </div>
    `).join('');
}

function updateRecentMeetings() {
    const container = document.getElementById('recent-meetings-list');
    const recent = [...filteredMeetings].sort((a, b) => b.startTime - a.startTime).slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = '<div class="loading">No meetings found</div>';
        return;
    }
    container.innerHTML = recent.map(m => {
        const duration = m.endTime ? formatDuration(m.endTime - m.startTime) : 'Ongoing';
        return `
            <div class="meeting-item" onclick="showMeetingDetails('${m.id}')">
                <div class="meeting-info">
                    <div>${new Date(m.startTime).toLocaleString()}</div>
                    <div class="meeting-time">${duration} • ${m.participants.length}p</div>
                </div>
            </div>
        `;
    }).join('');
}

function updateMeetingsTable() {
    const tbody = document.getElementById('meetings-table-body');
    const countEl = document.getElementById('filtered-count');
    countEl.textContent = `${filteredMeetings.length} meetings`;

    if (filteredMeetings.length === 0) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="5">No meetings found</td></tr>';
        return;
    }

    const sorted = [...filteredMeetings].sort((a, b) => b.startTime - a.startTime);
    tbody.innerHTML = sorted.map(m => {
        const duration = m.endTime ? formatDuration(m.endTime - m.startTime) : 'Ongoing';
        const efficiency = m.participants.length ? ((m.endTime - m.startTime) / 3600000 / m.participants.length).toFixed(2) : 'N/A';
        const participants = m.participants.slice(0, 3).join(', ') + (m.participants.length > 3 ? ` (+${m.participants.length - 3})` : '');
        return `
            <tr>
                <td>${new Date(m.startTime).toLocaleString()}</td>
                <td>${duration}</td>
                <td class="meeting-participants" title="${escapeHtml(m.participants.join(', '))}">${escapeHtml(participants)}</td>
                <td>${efficiency}</td>
                <td>
                    <button class="view-details" onclick="showMeetingDetails('${m.id}')">Details</button>
                </td>
            </tr>
        `;
    }).join('');
}

function showMeetingDetails(meetingId) {
    const meeting = allMeetings.find(m => m.id === meetingId);
    if (!meeting) return;

    const modalBody = document.getElementById('modal-body');
    const duration = meeting.endTime ? formatDuration(meeting.endTime - meeting.startTime) : 'Ongoing';
    
    modalBody.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <strong>URL:</strong> <a href="${meeting.url}" target="_blank" style="color: #1a73e8;">${meeting.url}</a>
        </div>
        <div style="margin-bottom: 1rem;">
            <strong>Time:</strong> ${new Date(meeting.startTime).toLocaleString()} - ${meeting.endTime ? new Date(meeting.endTime).toLocaleString() : 'Now'}<br>
            <strong>Duration:</strong> ${duration}
        </div>
        <div>
            <strong>Participants (${meeting.participants.length}):</strong><br>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                ${meeting.participants.map(p => `<span style="background: #333; padding: 4px 8px; border-radius: 4px;">${escapeHtml(p)}</span>`).join('')}
            </div>
        </div>
    `;
    
    document.getElementById('meeting-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('meeting-modal').style.display = 'none';
}

function exportData() {
    if (filteredMeetings.length === 0) {
        alert('No data to export');
        return;
    }
    const headers = ['ID', 'URL', 'Start Time', 'End Time', 'Duration (min)', 'Participants'];
    const rows = filteredMeetings.map(m => [
        m.id,
        m.url,
        new Date(m.startTime).toISOString(),
        m.endTime ? new Date(m.endTime).toISOString() : '',
        m.endTime ? Math.round((m.endTime - m.startTime) / 60000) : 0,
        `"${m.participants.join(', ')}"`
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meet-tracker-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearAllData() {
    if (confirm('Are you sure you want to clear ALL meeting data? This is irreversible.')) {
        chrome.runtime.sendMessage({ action: 'clearAllData' }, () => {
            allMeetings = [];
            applyFilters();
            alert('All meeting data has been cleared.');
        });
    }
}

function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ${hrs % 24}h`;
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
}

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showError(message) {
    alert(message);
}

// Mock data for development when not in extension context
function generateMockData() {
    const participants = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Heidi'];
    const data = [];
    for (let i = 0; i < 100; i++) {
        const start = new Date(Date.now() - Math.random() * 90 * 24 * 3600 * 1000);
        const duration = (15 + Math.random() * 90) * 60000;
        const end = new Date(start.getTime() + duration);
        data.push({
            id: `mock-${i}`,
            url: `https://meet.google.com/mock-${i}`,
            startTime: start.getTime(),
            endTime: end.getTime(),
            participants: participants.filter(() => Math.random() > 0.5).slice(0, 5)
        });
    }
    return data;
}
