// Dashboard JavaScript for Google Meet Tracker - Dark Mode Analytics

let allMeetings = [];
let filteredMeetings = [];
let charts = {};
const a_hours_work_day = 8;

document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
    setupTooltipPositioning();
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

async function loadMeetings() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
            console.log('📡 Dashboard: Requesting meetings from background script...');
            
            // Use async/await with Promise wrapper for proper error handling
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'getMeetings' }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });
            
            console.log('📥 Dashboard: Received response:', response);
            
            // Check if response is valid
            if (!response || (response.error && response.error.includes('Storage not initialized'))) {
                console.warn('⚠️ Storage not initialized, using mock data');
                allMeetings = generateMockData();
                filteredMeetings = [...allMeetings];
            } else if (response.error) {
                console.error('❌ Storage error:', response.error);
                console.warn('⚠️ Falling back to mock data due to storage error');
                allMeetings = generateMockData();
                filteredMeetings = [...allMeetings];
            } else if (!Array.isArray(response)) {
                console.warn('⚠️ Invalid response from storage, using empty array:', response);
                allMeetings = [];
                filteredMeetings = [];
            } else {
                allMeetings = response;
                filteredMeetings = [...allMeetings];
                console.log(`✅ Successfully loaded ${allMeetings.length} meetings from storage.`);
            }
            
        } catch (error) {
            const errorMsg = error.message || JSON.stringify(error);
            console.error('❌ Dashboard: Error loading meetings:', errorMsg);
            console.warn('⚠️ Falling back to mock data due to communication error');
            
            // Use mock data as fallback
            allMeetings = generateMockData();
            filteredMeetings = [...allMeetings];
            console.log(`📝 Loaded ${allMeetings.length} mock meetings due to error.`);
        }
    } else {
        console.warn('⚠️ Chrome extension APIs not available. Using mock data for development.');
        // Mock data for development outside of the extension environment
        allMeetings = generateMockData();
        filteredMeetings = [...allMeetings];
    }
}

function initializeFilters() {
    console.log('Initializing filters...');
    console.log('jQuery available:', typeof $ !== 'undefined');
    console.log('moment available:', typeof moment !== 'undefined');
    console.log('daterangepicker available:', typeof $ !== 'undefined' && $.fn.daterangepicker);
    
    // Wait for DOM to be fully ready and libraries to load
    setTimeout(() => {
        const dateRangeInput = document.getElementById('daterange');
        if (!dateRangeInput) {
            console.error('daterange input element not found!');
            return;
        }
        
        // Initialize the date range picker with presets
        if (typeof $ !== 'undefined' && typeof moment !== 'undefined' && $.fn.daterangepicker) {
            console.log('Initializing daterangepicker...');
            
            try {
                $('#daterange').daterangepicker({
                    opens: 'left',
                    drops: 'down',
                    showDropdowns: true,
                    ranges: {
                        'Today': [moment(), moment()],
                        'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                        'Last 7 Days': [moment().subtract(6, 'days'), moment()],
                        'Last 30 Days': [moment().subtract(29, 'days'), moment()],
                        'Last 90 Days': [moment().subtract(89, 'days'), moment()],
                        'This Month': [moment().startOf('month'), moment().endOf('month')],
                        'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')],
                        'All Time': [moment().subtract(1, 'years'), moment()]
                    },
                    startDate: moment().subtract(29, 'days'),
                    endDate: moment(),
                    locale: {
                        format: 'MMM DD, YYYY'
                    },
                    alwaysShowCalendars: true
                }, function(start, end, label) {
                    console.log('Date range selected:', start.format('YYYY-MM-DD'), 'to', end.format('YYYY-MM-DD'), '(' + label + ')');
                    // Auto-apply filters when date changes
                    applyFilters();
                });
                
                console.log('Daterangepicker initialized successfully');
                
                // Set initial display text
                const picker = $('#daterange').data('daterangepicker');
                if (picker) {
                    $('#daterange').val(picker.startDate.format('MMM DD, YYYY') + ' - ' + picker.endDate.format('MMM DD, YYYY'));
                }
                
            } catch (error) {
                console.error('Error initializing daterangepicker:', error);
                setupFallbackDateInputs();
            }
        } else {
            console.warn('jQuery, moment, or daterangepicker not loaded. Available:', {
                jquery: typeof $ !== 'undefined',
                moment: typeof moment !== 'undefined', 
                daterangepicker: typeof $ !== 'undefined' && $.fn.daterangepicker
            });
            setupFallbackDateInputs();
        }
    }, 100); // Small delay to ensure everything is loaded
    
    populateParticipantFilter();
}

function setupFallbackDateInputs() {
    console.log('Setting up fallback date inputs');
    const dateRangeInput = document.getElementById('daterange');
    if (dateRangeInput) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        dateRangeInput.type = 'text';
        dateRangeInput.value = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        dateRangeInput.readOnly = false;
        dateRangeInput.placeholder = 'Click to select date range';
        
        // Make it clickable for manual entry
        dateRangeInput.addEventListener('click', () => {
            const newRange = prompt('Enter date range (format: MM/DD/YYYY - MM/DD/YYYY):', dateRangeInput.value);
            if (newRange) {
                dateRangeInput.value = newRange;
                applyFilters();
            }
        });
    }
}

function populateParticipantFilter() {
    const participantSelect = document.getElementById('participant-select');
    const participants = new Set();
    
    allMeetings.forEach(meeting => {
        if (meeting.participants && Array.isArray(meeting.participants)) {
            meeting.participants.forEach(p => {
                // Handle different participant data formats
                let participantName = '';
                if (typeof p === 'string') {
                    participantName = p;
                } else if (p && typeof p === 'object') {
                    participantName = p.name || p.displayName || p.id || 'Unknown';
                }
                
                if (participantName && participantName !== 'Unknown') {
                    participants.add(participantName);
                }
            });
        }
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
    document.getElementById('export-data').addEventListener('click', exportData);
    document.getElementById('clear-data').addEventListener('click', clearAllData);
    
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('meeting-modal').addEventListener('click', (e) => {
        if (e.target.id === 'meeting-modal') closeModal();
    });

    // Storage management event listeners (with error handling)
    const storageStatsBtn = document.getElementById('show-storage-stats');
    const cleanupBtn = document.getElementById('cleanup-data');
    const enhancedExportBtn = document.getElementById('export-enhanced-data');
    
    if (storageStatsBtn) {
        storageStatsBtn.addEventListener('click', showStorageStats);
    }
    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', cleanupOldData);
    }
    if (enhancedExportBtn) {
        enhancedExportBtn.addEventListener('click', exportEnhancedData);
    }
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
    let startDate, endDate;
    
    // Get date range from daterangepicker if available
    if (typeof $ !== 'undefined' && $('#daterange').data('daterangepicker')) {
        const picker = $('#daterange').data('daterangepicker');
        startDate = picker.startDate.format('YYYY-MM-DD');
        endDate = picker.endDate.format('YYYY-MM-DD');
    } else {
        // Fallback to basic date inputs
        startDate = document.getElementById('start-date')?.value;
        endDate = document.getElementById('end-date')?.value;
    }
    
    const selectedParticipant = document.getElementById('participant-select').value;

    filteredMeetings = allMeetings.filter(meeting => {
        const meetingDate = new Date(meeting.startTime).toISOString().split('T')[0];
        if (startDate && meetingDate < startDate) return false;
        if (endDate && meetingDate > endDate) return false;
        if (selectedParticipant && selectedParticipant !== '') {
            // Handle both string and object participant formats
            if (meeting.participants && Array.isArray(meeting.participants)) {
                return meeting.participants.some(p => {
                    let participantName = '';
                    if (typeof p === 'string') {
                        participantName = p;
                    } else if (p && typeof p === 'object') {
                        participantName = p.name || p.displayName || p.id || 'Unknown';
                    }
                    return participantName === selectedParticipant;
                });
            }
            return false;
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
    
    // Handle participant uniqueness with both string and object formats
    const uniqueParticipants = new Set();
    filteredMeetings.forEach(m => {
        if (m.participants && Array.isArray(m.participants)) {
            m.participants.forEach(p => {
                let participantName = '';
                if (typeof p === 'string') {
                    participantName = p;
                } else if (p && typeof p === 'object') {
                    participantName = p.name || p.displayName || p.id || 'Unknown';
                }
                if (participantName && participantName !== 'Unknown') {
                    uniqueParticipants.add(participantName);
                }
            });
        }
    });

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
        borderColor: '#555',
        strokeDashArray: 3,
        xaxis: {
            lines: { show: true }
        },
        yaxis: {
            lines: { show: true }
        }
    },
    xaxis: {
        labels: {
            style: { colors: '#b8bcc3', fontSize: '12px' }
        },
        axisBorder: { color: '#666', show: true },
        axisTicks: { color: '#666', show: true }
    },
    yaxis: {
        labels: {
            style: { colors: '#b8bcc3', fontSize: '12px' }
        }
    },
    tooltip: {
        theme: 'dark',
        style: {
            fontSize: '12px'
        },
        fillSeriesColor: false
    },
    legend: {
        labels: {
            colors: '#e8eaed'
        }
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
    
    // Fill in missing dates with 0 values to create proper area chart
    const filledData = {};
    if (sortedDates.length > 0) {
        const startDate = new Date(sortedDates[0]);
        const endDate = new Date(sortedDates[sortedDates.length - 1]);
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            filledData[dateStr] = dailyData[dateStr] || 0;
        }
    }
    
    const allDates = Object.keys(filledData).sort();
    const seriesData = allDates.map(date => ({
        x: new Date(date).getTime(),
        y: parseFloat(filledData[date].toFixed(2))
    }));
    
    const goalData = allDates.map(date => ({
        x: new Date(date).getTime(),
        y: a_hours_work_day
    }));

    const options = {
        ...getCommonChartOptions(),
        series: [
            { 
                name: 'Meeting Time', 
                data: seriesData, 
                color: '#4285f4'
            },
            { 
                name: 'Work Day Goal', 
                data: goalData, 
                color: '#34a853'
            }
        ],
        chart: { 
            ...getCommonChartOptions().chart, 
            type: 'area', 
            height: 350,
            stacked: false,
            zoom: {
                enabled: false
            },
            toolbar: {
                show: false
            }
        },
        stroke: { 
            curve: 'smooth', 
            width: [2, 2],
            dashArray: [0, 5]
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1, 
                opacityFrom: [0.4, 0.1], 
                opacityTo: [0.1, 0.05], 
                stops: [0, 100]
            }
        },
        markers: {
            size: [4, 0],
            colors: ['#4285f4', '#34a853'],
            strokeColors: '#fff',
            strokeWidth: 2,
            hover: {
                size: 6
            }
        },
        dataLabels: {
            enabled: false  // Hide data labels on chart points
        },
        xaxis: { 
            type: 'datetime', 
            labels: { format: 'MMM dd' }
        },
        yaxis: { 
            title: { text: 'Hours', style: { color: '#9aa0a6' } },
            min: 0,
            forceNiceScale: true
        },
        tooltip: {
            shared: true,
            intersect: false,
            x: { format: 'dd MMM yyyy' },
            y: { formatter: (val) => `${val} hours` }
        },
        legend: { 
            position: 'top', 
            horizontalAlign: 'left',
            labels: { colors: '#e8eaed' }
        }
    };
    renderChart('daily-time-chart', options);
}

function renderCollaboratorsChart() {
    const participantData = {};
    
    // Calculate meetings and total duration for each participant
    filteredMeetings.forEach(meeting => {
        if (meeting.participants && Array.isArray(meeting.participants)) {
            meeting.participants.forEach(p => {
                // Handle different participant data formats
                let participantName = '';
                if (typeof p === 'string') {
                    participantName = p;
                } else if (p && typeof p === 'object') {
                    participantName = p.name || p.displayName || p.id || 'Unknown';
                }
                
                if (participantName && participantName !== 'Unknown') {
                    if (!participantData[participantName]) {
                        participantData[participantName] = { meetings: 0, totalDuration: 0 };
                    }
                    participantData[participantName].meetings += 1;
                    participantData[participantName].totalDuration += (meeting.endTime ? (meeting.endTime - meeting.startTime) : 0);
                }
            });
        }
    });
    
    // Sort by meeting count to find the user (top participant), then sort collaborators by TIME
    const allParticipantsByMeetings = Object.entries(participantData)
        .sort((a, b) => b[1].meetings - a[1].meetings);
    
    // Exclude the top participant (the user) and sort remaining by total duration
    const collaborators = allParticipantsByMeetings
        .slice(1) // Remove the user (first participant)
        .sort((a, b) => b[1].totalDuration - a[1].totalDuration); // Sort by time spent
    
    if (collaborators.length === 0) {
        const container = document.getElementById('collaborators-chart');
        if (container) {
            container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 350px; color: #9aa0a6;">No collaborators found</div>';
        }
        return;
    }
    
    // Define different muted colors for each person - generate more colors if needed
    const baseColors = [
        '#5f7fbf', '#6ba368', '#b8a347', '#c4645a', '#7a7a7a', 
        '#8b7cc8', '#d4916e', '#6bbdd4', '#a67ba6', '#7cb87c',
        '#9f8f5f', '#5f9f7f', '#7f5f9f', '#9f7f5f', '#5f7f9f',
        '#8f9f5f', '#9f5f7f', '#7f9f5f', '#5f9f8f', '#9f8f7f'
    ];
    
    // Calculate chart height based on number of collaborators (minimum 350px, max 800px)
    const chartHeight = Math.min(Math.max(350, collaborators.length * 35 + 50), 800);
    
    const chartData = collaborators.map((collab, index) => ({
        name: collab[0],
        meetings: collab[1].meetings,
        duration: collab[1].totalDuration,
        durationInHours: collab[1].totalDuration / (1000 * 60 * 60), // Convert to hours for chart display
        color: baseColors[index % baseColors.length]
    }));

    const options = {
        ...getCommonChartOptions(),
        series: [{
            name: 'Time Spent',
            data: chartData.map(c => ({
                x: c.name,
                y: parseFloat(c.durationInHours.toFixed(2)),
                fillColor: c.color,
                meetings: c.meetings,
                totalDuration: c.duration
            }))
        }],
        chart: { 
            type: 'bar', 
            height: chartHeight
        },
        plotOptions: {
            bar: {
                horizontal: true,
                borderRadius: 4,
                dataLabels: {
                    position: 'top'
                },
                distributed: true  // This enables different colors for each bar
            }
        },
        colors: chartData.map(c => c.color),
        dataLabels: {
            enabled: true,
            offsetX: 10,
            style: {
                fontSize: '11px',
                colors: ['#e8eaed'],
                fontWeight: 'normal'
            },
            formatter: function(val, opts) {
                const dataIndex = opts.dataPointIndex;
                const data = chartData[dataIndex];
                const formattedDuration = formatDuration(data.duration);
                return `${data.meetings} meetings • ${formattedDuration}`;
            }
        },
        xaxis: {
            categories: chartData.map(c => c.name),
            labels: {
                style: {
                    colors: '#b8bcc3',
                    fontSize: '11px'
                }
            },
            title: {
                text: 'Time Spent (Hours)',
                style: { color: '#9aa0a6' }
            }
        },
        yaxis: {
            labels: {
                style: {
                    colors: '#b8bcc3',
                    fontSize: '11px'
                },
                maxWidth: 150
            }
        },
        tooltip: {
            custom: function({series, seriesIndex, dataPointIndex, w}) {
                const data = chartData[dataPointIndex];
                const formattedDuration = formatDuration(data.duration);
                const avgDuration = data.meetings > 0 ? formatDuration(data.duration / data.meetings) : '0m';
                return `
                    <div style="padding: 8px 12px; background: #1f1f1f; border: 1px solid #333; border-radius: 4px;">
                        <div style="color: #e8eaed; font-weight: bold; margin-bottom: 4px;">${data.name}</div>
                        <div style="color: #b8bcc3; font-size: 12px;">Total time: ${formattedDuration}</div>
                        <div style="color: #b8bcc3; font-size: 12px;">${data.meetings} meetings</div>
                        <div style="color: #b8bcc3; font-size: 12px;">Avg per meeting: ${avgDuration}</div>
                    </div>
                `;
            }
        },
        grid: {
            borderColor: '#444'
        },
        legend: {
            show: false  // Hide legend since we have different colors
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
        xaxis: { 
            type: 'datetime', 
            labels: { 
                format: 'MMM dd',
                style: { colors: '#b8bcc3', fontSize: '12px' }
            }
        },
        yaxis: { 
            title: { 
                text: 'Number of Meetings',
                style: { color: '#9aa0a6' }
            },
            labels: {
                style: { colors: '#b8bcc3', fontSize: '12px' }
            }
        },
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

    const durationColors = ['#5f7fbf', '#6ba368', '#b8a347', '#c4645a', '#7a7a7a'];

    const options = {
        ...getCommonChartOptions(),
        series: Object.values(buckets),
        labels: Object.keys(buckets),
        colors: durationColors,
        chart: { type: 'pie', height: 350 },
        stroke: {
            show: false
        },
        legend: { 
            position: 'bottom',
            labels: {
                colors: '#e8eaed'
            }
        },
        tooltip: { 
            y: { formatter: (val) => `${val} meetings` },
            theme: 'dark'
        },
        dataLabels: {
            enabled: true,
            style: {
                fontSize: '12px',
                colors: ['#ffffff'],
                fontWeight: 'bold'
            }
        }
    };
    renderChart('duration-chart', options);
}

function renderWeeklyPatternChart() {
    const weeklyData = [0, 0, 0, 0, 0, 0, 0]; // Sun - Sat
    filteredMeetings.forEach(m => {
        if (m.endTime && m.startTime) { // Only include meetings with both start and end times
            const day = new Date(m.startTime).getDay();
            const duration = (m.endTime - m.startTime) / (1000 * 60 * 60); // hours
            if (duration > 0) { // Only add positive durations
                weeklyData[day] += duration;
            }
        }
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
    
    // Calculate time spent (in minutes) for each hour
    filteredMeetings.forEach(m => {
        if (m.endTime && m.startTime) {
            const startHour = new Date(m.startTime).getHours();
            const endHour = new Date(m.endTime).getHours();
            const duration = (m.endTime - m.startTime) / (1000 * 60); // minutes
            
            if (startHour === endHour) {
                // Meeting is within the same hour
                hourlyData[startHour] += duration;
            } else {
                // Meeting spans multiple hours - distribute the time
                const startTime = new Date(m.startTime);
                const endTime = new Date(m.endTime);
                
                for (let hour = startHour; hour <= endHour; hour++) {
                    const hourStart = new Date(startTime);
                    hourStart.setHours(hour, 0, 0, 0);
                    
                    const hourEnd = new Date(startTime);
                    hourEnd.setHours(hour, 59, 59, 999);
                    
                    const actualStart = hour === startHour ? startTime : hourStart;
                    const actualEnd = hour === endHour ? endTime : hourEnd;
                    
                    const timeInThisHour = (actualEnd - actualStart) / (1000 * 60); // minutes
                    if (timeInThisHour > 0) {
                        hourlyData[hour] += timeInThisHour;
                    }
                }
            }
        }
    });
    
    // Convert minutes to hours for display
    const hourlyDataInHours = hourlyData.map(minutes => parseFloat((minutes / 60).toFixed(2)));

    // Convert to 12-hour format with AM/PM
    const formatHour = (hour) => {
        if (hour === 0) return '12 AM';
        if (hour === 12) return '12 PM';
        if (hour < 12) return `${hour} AM`;
        return `${hour - 12} PM`;
    };

    const options = {
        ...getCommonChartOptions(),
        series: [{ name: 'Meeting Time', data: hourlyDataInHours, color: '#34a853' }],
        chart: { type: 'area', height: 350 },
        xaxis: {
            categories: Array.from({ length: 24 }, (_, i) => formatHour(i)),
            title: { 
                text: 'Hour of the Day',
                style: { color: '#9aa0a6', fontSize: '14px' }
            },
            labels: {
                rotate: -45,
                style: { 
                    colors: '#b8bcc3', // Use consistent dim white like other charts
                    fontSize: '12px'
                }
            }
        },
        yaxis: {
            title: { 
                text: 'Hours Spent in Meetings',
                style: { color: '#9aa0a6', fontSize: '14px' }
            },
            labels: {
                style: {
                    colors: '#b8bcc3',
                    fontSize: '12px'
                },
                formatter: (val) => `${val}h`
            }
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.6, opacityTo: 0.2, stops: [0, 100] } },
        tooltip: {
            y: { formatter: (val) => `${val} hours` },
            theme: 'dark'
        }
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
        if (m.participants && Array.isArray(m.participants)) {
            m.participants.forEach(p => {
                // Handle different participant data formats
                let participantName = '';
                if (typeof p === 'string') {
                    participantName = p;
                } else if (p && typeof p === 'object') {
                    participantName = p.name || p.displayName || p.id || 'Unknown';
                }
                
                if (participantName && participantName !== 'Unknown') {
                    participantCounts[participantName] = (participantCounts[participantName] || 0) + 1;
                }
            });
        }
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
        // Calculate real-time duration for ongoing meetings
        let duration;
        if (m.endTime) {
            duration = formatDuration(m.endTime - m.startTime);
        } else if (m.currentDuration) {
            // Use currentDuration from minute logs
            duration = formatDuration(m.currentDuration) + ' (ongoing)';
        } else {
            // Fallback: calculate from start time
            duration = formatDuration(Date.now() - m.startTime) + ' (ongoing)';
        }
        return `
            <div class="meeting-item" data-meeting-id="${m.id}">
                <div class="meeting-info">
                    <div>${new Date(m.startTime).toLocaleString()}</div>
                    <div class="meeting-time">${duration} • ${m.participants.length}p</div>
                </div>
            </div>
        `;
    }).join('');
    
    // Add event listeners for meeting items (CSP-compliant)
    container.querySelectorAll('.meeting-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const meetingId = e.currentTarget.getAttribute('data-meeting-id');
            showMeetingDetails(meetingId);
        });
    });
}

function updateMeetingsTable() {
    const tbody = document.getElementById('meetings-table-body');
    const countEl = document.getElementById('filtered-count');
    countEl.textContent = `${filteredMeetings.length} meetings`;

    if (filteredMeetings.length === 0) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="6">No meetings found</td></tr>';
        return;
    }

    const sorted = [...filteredMeetings].sort((a, b) => b.startTime - a.startTime);
    tbody.innerHTML = sorted.map((m, index) => {
        // Calculate real-time duration for ongoing meetings in table
        let duration;
        if (m.endTime) {
            duration = formatDuration(m.endTime - m.startTime);
        } else if (m.currentDuration) {
            // Use currentDuration from minute logs
            duration = formatDuration(m.currentDuration) + ' (ongoing)';
        } else {
            // Fallback: calculate from start time
            duration = formatDuration(Date.now() - m.startTime) + ' (ongoing)';
        }
        const efficiency = calculateEfficiencyScore(m);
        
        // Handle participant display with proper name extraction
        const participantNames = [];
        if (m.participants && Array.isArray(m.participants)) {
            m.participants.forEach(p => {
                let participantName = '';
                if (typeof p === 'string') {
                    participantName = p;
                } else if (p && typeof p === 'object') {
                    participantName = p.name || p.displayName || p.id || 'Unknown';
                }
                if (participantName && participantName !== 'Unknown') {
                    participantNames.push(participantName);
                }
            });
        }
        
        const participants = participantNames.slice(0, 3).join(', ') + (participantNames.length > 3 ? ` (+${participantNames.length - 3})` : '');
        const title = m.title || `Meeting ${m.id}`;
        const shortTitle = title.length > 30 ? title.substring(0, 27) + '...' : title;
        
        return `
            <tr>
                <td>${new Date(m.startTime).toLocaleString()}</td>
                <td class="meeting-title" title="${escapeHtml(title)}">${escapeHtml(shortTitle)}</td>
                <td>${duration}</td>
                <td class="meeting-participants" title="${escapeHtml(participantNames.join(', '))}">${escapeHtml(participants)}</td>
                <td>${efficiency}</td>
                <td>
                    <button class="view-details" data-meeting-id="${m.id}">Details</button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Add event listeners for detail buttons (CSP-compliant)
    tbody.querySelectorAll('.view-details').forEach(button => {
        button.addEventListener('click', (e) => {
            const meetingId = e.target.getAttribute('data-meeting-id');
            showMeetingDetails(meetingId);
        });
    });
}

// Calculate a more intuitive efficiency score for typical 15-60 minute meetings
function calculateEfficiencyScore(meeting) {
    if (!meeting.endTime || !meeting.participants.length) {
        return 'N/A';
    }
    
    const durationMinutes = (meeting.endTime - meeting.startTime) / 60000;
    const participantCount = meeting.participants.length;
    const totalPersonMinutes = durationMinutes * participantCount;
    
    // Score based on total person-minutes invested
    // Lower scores = more efficient
    let score, grade;
    
    if (totalPersonMinutes <= 60) { // <= 1 hour total investment
        score = totalPersonMinutes;
        grade = 'A';
    } else if (totalPersonMinutes <= 120) { // <= 2 hours total investment
        score = totalPersonMinutes;
        grade = 'B';
    } else if (totalPersonMinutes <= 240) { // <= 4 hours total investment
        score = totalPersonMinutes;
        grade = 'C';
    } else if (totalPersonMinutes <= 480) { // <= 8 hours total investment
        score = totalPersonMinutes;
        grade = 'D';
    } else {
        score = totalPersonMinutes;
        grade = 'F';
    }
    
    return `${Math.round(score)} (${grade})`;
}

function showMeetingDetails(meetingId) {
    const meeting = allMeetings.find(m => m.id === meetingId);
    if (!meeting) {
        console.error('Meeting not found:', meetingId);
        return;
    }

    const modalBody = document.getElementById('modal-body');
    const duration = meeting.endTime ? formatDuration(meeting.endTime - meeting.startTime) : 'Ongoing';
    const efficiency = calculateEfficiencyScore(meeting);
    
    modalBody.innerHTML = `
        ${meeting.title ? `<div style="margin-bottom: 1rem;"><strong>Title:</strong> ${escapeHtml(meeting.title)}</div>` : ''}
        <div style="margin-bottom: 1rem;">
            <strong>URL:</strong> <a href="${meeting.url}" target="_blank" style="color: #1a73e8;">${meeting.url}</a>
        </div>
        <div style="margin-bottom: 1rem;">
            <strong>Time:</strong> ${new Date(meeting.startTime).toLocaleString()} - ${meeting.endTime ? new Date(meeting.endTime).toLocaleString() : 'Now'}<br>
            <strong>Duration:</strong> ${duration}<br>
            <strong>Efficiency Score:</strong> ${efficiency} 
            <span class="efficiency-help">?
                <div class="tooltip">
                    <strong>Efficiency Score</strong><br><br>
                    Measures total person-minutes invested in the meeting.<br>
                    <em>Lower scores are more efficient.</em><br><br>
                    <strong>Calculation:</strong> Duration × Participants<br><br>
                    <strong>Grades:</strong><br>
                    <span class="tooltip-grade">A:</span> ≤60 person-minutes <span class="tooltip-example">(e.g., 30 min × 2 people)</span><br>
                    <span class="tooltip-grade">B:</span> 61-120 person-minutes <span class="tooltip-example">(e.g., 60 min × 2 people)</span><br>
                    <span class="tooltip-grade">C:</span> 121-240 person-minutes <span class="tooltip-example">(e.g., 30 min × 8 people)</span><br>
                    <span class="tooltip-grade">D:</span> 241-480 person-minutes <span class="tooltip-example">(e.g., 60 min × 8 people)</span><br>
                    <span class="tooltip-grade">F:</span> >480 person-minutes
                </div>
            </span>
        </div>
        <div>
            <strong>Participants (${meeting.participants.length}):</strong><br>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                ${meeting.participants.map(p => {
                    let participantName = '';
                    if (typeof p === 'string') {
                        participantName = p;
                    } else if (p && typeof p === 'object') {
                        participantName = p.name || p.displayName || p.id || 'Unknown';
                    }
                    return `<span style="background: #333; padding: 4px 8px; border-radius: 4px;">${escapeHtml(participantName)}</span>`;
                }).join('')}
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
    const headers = ['ID', 'Title', 'URL', 'Start Time', 'End Time', 'Duration (min)', 'Participants'];
    const rows = filteredMeetings.map(m => [
        m.id,
        `"${(m.title || `Meeting ${m.id}`).replace(/"/g, '""')}"`, // Escape quotes in title
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

async function clearAllData() {
    if (confirm('Are you sure you want to clear ALL meeting data? This is irreversible.')) {
        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'clearAllData' }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });
            
            if (response.error) {
                alert('Failed to clear data: ' + response.error);
            } else {
                allMeetings = [];
                applyFilters();
                alert('All meeting data has been cleared.');
            }
        } catch (error) {
            console.error('Error clearing data:', error);
            alert('Failed to clear data. Please try again.');
        }
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
// Setup dynamic tooltip positioning
function setupTooltipPositioning() {
    document.addEventListener('mouseover', function(e) {
        if (e.target.closest('.efficiency-help')) {
            const helpElement = e.target.closest('.efficiency-help');
            const tooltip = helpElement.querySelector('.tooltip');
            if (tooltip) {
                const rect = helpElement.getBoundingClientRect();
                const tooltipRect = tooltip.getBoundingClientRect();
                
                // Position tooltip above the help icon
                let left = rect.left + (rect.width / 2) - (350 / 2); // Center horizontally
                let top = rect.top - tooltipRect.height - 10; // Position above with margin
                
                // Ensure tooltip doesn't go off-screen horizontally
                if (left < 10) left = 10;
                if (left + 350 > window.innerWidth - 10) left = window.innerWidth - 350 - 10;
                
                // If tooltip would go above viewport, position it below instead
                if (top < 10) {
                    top = rect.bottom + 10;
                }
                
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
                tooltip.style.transform = 'none'; // Remove transform since we're using absolute positioning
            }
        }
    });
}

// Enhanced storage management functions
async function showStorageStats() {
    try {
        const stats = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getStorageStats' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
        
        if (stats.error) {
            alert('Storage statistics not available: ' + stats.error);
            return;
        }
        
        const message = `📊 Storage Statistics:\n\n` +
            `• Total Meetings: ${stats.totalMeetings}\n` +
            `• Total Duration: ${formatDuration(stats.totalDuration)}\n` +
            `• Average Duration: ${formatDuration(stats.averageDuration)}\n` +
            `• Data Range: ${stats.oldestMeeting ? new Date(stats.oldestMeeting).toLocaleDateString() : 'N/A'} to ${stats.newestMeeting ? new Date(stats.newestMeeting).toLocaleDateString() : 'N/A'}\n\n` +
            `✨ Enhanced storage provides virtually unlimited capacity compared to the previous ~10MB limit!`;
            
        alert(message);
        
        console.log('📈 Enhanced Storage Statistics:', {
            totalMeetings: stats.totalMeetings,
            totalDuration: formatDuration(stats.totalDuration),
            averageDuration: formatDuration(stats.averageDuration),
            dataRange: `${stats.oldestMeeting ? new Date(stats.oldestMeeting).toLocaleDateString() : 'N/A'} to ${stats.newestMeeting ? new Date(stats.newestMeeting).toLocaleDateString() : 'N/A'}`
        });
        
    } catch (error) {
        console.error('Error getting storage stats:', error);
        alert('Failed to get storage statistics. The enhanced storage might not be initialized yet.');
    }
}

async function cleanupOldData() {
    const confirmed = confirm(
        '🧹 Storage Cleanup\n\n' +
        'This will:\n' +
        '• Delete meetings older than 90 days\n' +
        '• Keep maximum 1000 most recent meetings\n' +
        '• Compress meetings older than 30 days\n\n' +
        'Continue with cleanup?'
    );
    
    if (!confirmed) return;
    
    try {
        const result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'cleanupOldData',
                options: {
                    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
                    maxMeetings: 1000,
                    compressOld: true
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
        
        if (result.error) {
            alert('Cleanup failed: ' + result.error);
            return;
        }
        
        const message = `✅ Cleanup Complete!\n\n` +
            `• ${result.deleted} meetings deleted\n` +
            `• ${result.compressed} meetings compressed\n\n` +
            `Your storage is now optimized for better performance.`;
            
        alert(message);
        
        // Reload meetings to reflect changes
        await loadMeetings();
        applyFilters();
        
    } catch (error) {
        console.error('Error during cleanup:', error);
        alert('Cleanup failed. Please try again.');
    }
}

async function exportEnhancedData() {
    const includeMinutes = confirm(
        '📤 Enhanced Data Export\n\n' +
        'Include detailed participant tracking data?\n\n' +
        '• Yes: Full export with minute-by-minute participant data\n' +
        '• No: Basic export with meeting summaries only\n\n' +
        'Note: Full export may be large for extensive meeting history.'
    );
    
    try {
        const exportData = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'exportData',
                options: {
                    includeMinutes: includeMinutes
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
        
        if (exportData.error) {
            alert('Export failed: ' + exportData.error);
            return;
        }
        
        // Create and download the export file
        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `meet-tracker-enhanced-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        const message = `✅ Export Complete!\n\n` +
            `• ${exportData.meetings.length} meetings exported\n` +
            `• ${exportData.participants.length} participants exported\n` +
            `• Export date: ${exportData.exportDate}\n\n` +
            `File saved with enhanced format for better data analysis.`;
            
        alert(message);
        
    } catch (error) {
        console.error('Error during export:', error);
        alert('Export failed. Please try again.');
    }
}

function generateMockData() {
    const participants = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Heidi'];
    const meetingTitles = [
        'Weekly Team Standup', 'Project Planning Session', 'Client Presentation', 'Sprint Review',
        'Design Review', 'Code Review Meeting', 'Marketing Strategy', 'Sales Update',
        'Product Demo', 'Brainstorming Session', 'One-on-One Meeting', 'Board Meeting',
        'Training Session', 'Architecture Discussion', 'Bug Triage', 'Release Planning'
    ];
    const data = [];
    for (let i = 0; i < 100; i++) {
        const start = new Date(Date.now() - Math.random() * 90 * 24 * 3600 * 1000);
        const duration = (15 + Math.random() * 90) * 60000;
        const end = new Date(start.getTime() + duration);
        data.push({
            id: `mock-${i}`,
            title: meetingTitles[Math.floor(Math.random() * meetingTitles.length)],
            url: `https://meet.google.com/mock-${i}`,
            startTime: start.getTime(),
            endTime: end.getTime(),
            participants: participants.filter(() => Math.random() > 0.5).slice(0, 5)
        });
    }
    return data;
}
