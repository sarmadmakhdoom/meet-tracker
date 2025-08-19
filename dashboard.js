// Dashboard JavaScript for Google Meet Tracker - Dark Mode Analytics

let allMeetings = []; // Now contains aggregated meetings (combined sessions)
let filteredMeetings = [];
let charts = {};
const a_hours_work_day = 8;

// Pagination state
let currentPage = 1;
let pageSize = 20;
let totalPages = 1;

// Auto-refresh timer for active sessions
let refreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
    setupTooltipPositioning();
    
    // Start periodic refresh if we have active sessions
    startPeriodicRefresh();
});

// Periodic refresh for live data updates
function startPeriodicRefresh() {
    // Clear any existing timer
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    
    // Check if we have active sessions (aggregated meetings can have active sessions)
    const hasActiveSessions = allMeetings.some(m => m.isActive === true);
    
    if (hasActiveSessions) {
        console.log('🔄 Starting periodic refresh for active sessions');
        // Refresh every 30 seconds when there are active sessions
        refreshTimer = setInterval(async () => {
            try {
                await loadMeetings();
                applyFilters();
                console.log('🔄 Refreshed dashboard data');
            } catch (error) {
                console.error('❌ Error during periodic refresh:', error);
            }
        }, 30000); // 30 seconds
    } else {
        console.log('⏸️ No active sessions, stopping periodic refresh');
    }
}

function stopPeriodicRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
        console.log('⏹️ Stopped periodic refresh');
    }
}

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
                chrome.runtime.sendMessage({ action: 'getMeetingsAggregated' }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });
            
            console.log('📥 Dashboard: Received response:', response);
            console.log('📥 Dashboard: Response type:', typeof response, 'isArray:', Array.isArray(response));
            
            // Check if response is valid
            if (!response) {
                console.warn('⚠️ No response received, using empty array');
                allMeetings = [];
                filteredMeetings = [];
            } else if (response.error && response.error.includes('Storage not initialized')) {
                console.warn('⚠️ Storage not initialized, using empty array');
                allMeetings = [];
                filteredMeetings = [];
            } else if (response.error) {
                console.error('❌ Storage error:', response.error);
                console.warn('⚠️ Using empty array due to storage error');
                allMeetings = [];
                filteredMeetings = [];
            } else if (!Array.isArray(response)) {
                console.warn('⚠️ Invalid response from storage, expected array but got:', typeof response, response);
                allMeetings = [];
                filteredMeetings = [];
            } else {
                allMeetings = response;
                filteredMeetings = [...allMeetings];
                console.log(`✅ Successfully loaded ${allMeetings.length} aggregated meetings from storage.`);
            }
            
        } catch (error) {
            const errorMsg = error.message || JSON.stringify(error);
            console.error('❌ Dashboard: Error loading meetings:', errorMsg);
            console.error('❌ Dashboard: Error stack:', error.stack);
            console.warn('⚠️ Using empty array due to communication error');
            
            // Use empty array instead of mock data to see real problems
            allMeetings = [];
            filteredMeetings = [];
            console.log('📝 Loaded 0 meetings due to error.');
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
    initializeHourlyStartTime();
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

function initializeHourlyStartTime() {
    const startTimeSelect = document.getElementById('hourly-start-time');
    if (!startTimeSelect) {
        console.warn('Hourly start time select element not found');
        return;
    }
    
    // Get saved preference from localStorage, default to 0 (12:00 AM)
    const savedStartTime = localStorage.getItem('meetTracker_hourlyStartTime');
    const defaultStartTime = savedStartTime ? parseInt(savedStartTime) : 0;
    
    // Set the dropdown to the saved/default value
    startTimeSelect.value = defaultStartTime.toString();
    
    console.log(`Initialized hourly start time to: ${defaultStartTime}:00 (${formatHour(defaultStartTime)})`);
}

// Helper function to format hour for display
function formatHour(hour) {
    if (hour === 0) return '12:00 AM';
    if (hour === 12) return '12:00 PM';
    if (hour < 12) return `${hour}:00 AM`;
    return `${hour - 12}:00 PM`;
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
    document.getElementById('cleanup-zombie-btn').addEventListener('click', cleanupZombieMeetings);
    
    // Hourly start time dropdown event listener
    document.getElementById('hourly-start-time').addEventListener('change', (e) => {
        const startHour = parseInt(e.target.value);
        localStorage.setItem('meetTracker_hourlyStartTime', startHour.toString());
        renderHourlyDistributionChart(); // Re-render the chart with new start time
    });
    
    // Manual cleanup button handlers
    document.getElementById('cleanup-30-days').addEventListener('click', () => manualCleanup(30));
    document.getElementById('cleanup-90-days').addEventListener('click', () => manualCleanup(90));
    document.getElementById('cleanup-1-year').addEventListener('click', () => manualCleanup(365));
    
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('meeting-modal').addEventListener('click', (e) => {
        if (e.target.id === 'meeting-modal') closeModal();
    });
    
    // Side overlay event listeners
    document.getElementById('side-overlay-close').addEventListener('click', closeSideOverlay);
    document.getElementById('side-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'side-overlay') closeSideOverlay();
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
    
    // Pagination event listeners
    setupPaginationEventListeners();
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
        // Validate meeting has valid startTime
        if (!meeting.startTime || !isValidDate(meeting.startTime)) {
            console.warn('Invalid startTime for meeting:', meeting);
            return false;
        }
        
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
    
    // Restart periodic refresh if needed
    startPeriodicRefresh();
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
    // Group meetings by day of week (0 = Sunday, 1 = Monday, etc.)
    const weeklyData = [0, 0, 0, 0, 0, 0, 0]; // Sun, Mon, Tue, Wed, Thu, Fri, Sat
    const weeklyCount = [0, 0, 0, 0, 0, 0, 0]; // Count of days with data for averaging
    
    // Group meetings by date first, then by day of week
    const dailyTotals = {};
    filteredMeetings.forEach(m => {
        const date = new Date(m.startTime).toISOString().split('T')[0];
        dailyTotals[date] = (dailyTotals[date] || 0) + (m.endTime ? (m.endTime - m.startTime) / (1000 * 60 * 60) : 0); // hours
    });
    
    // Now average by day of week
    Object.entries(dailyTotals).forEach(([date, hours]) => {
        const dayOfWeek = new Date(date).getDay();
        weeklyData[dayOfWeek] += hours;
        weeklyCount[dayOfWeek]++;
    });
    
    // Calculate averages (avoid division by zero)
    const averagedWeeklyData = weeklyData.map((total, index) => 
        weeklyCount[index] > 0 ? total / weeklyCount[index] : 0
    );
    
    // Reorder to start with Monday (1) and end with Sunday (0)
    const mondayFirstData = [
        averagedWeeklyData[1], // Monday
        averagedWeeklyData[2], // Tuesday  
        averagedWeeklyData[3], // Wednesday
        averagedWeeklyData[4], // Thursday
        averagedWeeklyData[5], // Friday
        averagedWeeklyData[6], // Saturday
        averagedWeeklyData[0]  // Sunday
    ];
    
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    const seriesData = mondayFirstData.map((hours, index) => ({
        x: weekdays[index],
        y: parseFloat(hours.toFixed(2))
    }));
    
    const goalData = weekdays.map(day => ({
        x: day,
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
            type: 'category',
            categories: weekdays,
            labels: {
                style: { colors: '#b8bcc3', fontSize: '12px' }
            }
        },
        yaxis: { 
            title: { text: 'Hours', style: { color: '#9aa0a6' } },
            min: 0,
            forceNiceScale: true
        },
        tooltip: {
            shared: true,
            intersect: false,
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
    
    // Calculate detailed meeting data for each participant
    filteredMeetings.forEach(meeting => {
        if (meeting.participants && Array.isArray(meeting.participants)) {
            const meetingSize = meeting.participants.length;
            const duration = meeting.endTime ? (meeting.endTime - meeting.startTime) : 0;
            
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
                        participantData[participantName] = { 
                            meetings: 0, 
                            totalDuration: 0,
                            oneOnOne: { count: 0, duration: 0 },
                            smallGroup: { count: 0, duration: 0 }, // 3-5 people
                            mediumGroup: { count: 0, duration: 0 }, // 6-10 people
                            largeGroup: { count: 0, duration: 0 }, // 11+ people
                            meetingDetails: []
                        };
                    }
                    
                    participantData[participantName].meetings += 1;
                    participantData[participantName].totalDuration += duration;
                    
                    // Categorize by meeting size
                    if (meetingSize === 2) {
                        participantData[participantName].oneOnOne.count += 1;
                        participantData[participantName].oneOnOne.duration += duration;
                    } else if (meetingSize <= 5) {
                        participantData[participantName].smallGroup.count += 1;
                        participantData[participantName].smallGroup.duration += duration;
                    } else if (meetingSize <= 10) {
                        participantData[participantName].mediumGroup.count += 1;
                        participantData[participantName].mediumGroup.duration += duration;
                    } else {
                        participantData[participantName].largeGroup.count += 1;
                        participantData[participantName].largeGroup.duration += duration;
                    }
                    
                    // Store meeting details for drill-down
                    participantData[participantName].meetingDetails.push({
                        id: meeting.id,
                        title: meeting.title || `Meeting ${meeting.id}`,
                        startTime: meeting.startTime,
                        endTime: meeting.endTime,
                        duration: duration,
                        participantCount: meetingSize,
                        url: meeting.url
                    });
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
    
    const chartData = collaborators.map((collab, index) => {
        const data = collab[1];
        // Calculate collaboration quality score
        const qualityScore = (
            data.oneOnOne.duration * 1.0 +
            data.smallGroup.duration * 0.75 +
            data.mediumGroup.duration * 0.5 +
            data.largeGroup.duration * 0.25
        ) / (1000 * 60 * 60); // Convert to hours
        
        return {
            name: collab[0],
            meetings: data.meetings,
            duration: data.totalDuration,
            durationInHours: data.totalDuration / (1000 * 60 * 60),
            qualityScore: qualityScore,
            oneOnOne: data.oneOnOne,
            smallGroup: data.smallGroup,
            mediumGroup: data.mediumGroup,
            largeGroup: data.largeGroup,
            meetingDetails: data.meetingDetails,
            color: baseColors[index % baseColors.length]
        };
    });

    // Calculate intimacy color for each collaborator based on their primary meeting type
    const getIntimacyColor = (data) => {
        const total = data.durationInHours;
        const oneOnOnePercent = (data.oneOnOne.duration / (1000 * 60 * 60)) / total;
        const smallGroupPercent = (data.smallGroup.duration / (1000 * 60 * 60)) / total;
        const mediumGroupPercent = (data.mediumGroup.duration / (1000 * 60 * 60)) / total;
        
        // Determine primary meeting type by percentage
        if (oneOnOnePercent >= 0.5) return '#4285f4'; // Blue for 1-on-1 heavy
        if (oneOnOnePercent + smallGroupPercent >= 0.6) return '#34a853'; // Green for small group heavy  
        if (mediumGroupPercent >= 0.4) return '#fbbc04'; // Yellow for medium group heavy
        return '#ea4335'; // Red for large group heavy
    };

    const options = {
        ...getCommonChartOptions(),
        series: [{
            name: 'Time Spent (Hours)',
            data: chartData.map((c, index) => ({
                x: c.name,
                y: parseFloat(c.durationInHours.toFixed(2)),
                fillColor: c.color, // Use individual color for each person
                collaboratorData: c
            }))
        }],
        chart: { 
            type: 'bar', 
            height: chartHeight,
            events: {
                dataPointSelection: function(event, chartContext, config) {
                    const dataIndex = config.dataPointIndex;
                    const collaboratorData = chartData[dataIndex];
                    showCollaboratorDrillDown(collaboratorData);
                }
            }
        },
        plotOptions: {
            bar: {
                horizontal: true,
                borderRadius: 4,
                distributed: true, // This enables different colors for each bar
                dataLabels: {
                    position: 'top'
                }
            }
        },
        colors: chartData.map(c => c.color),
        dataLabels: {
            enabled: true,
            offsetX: 10,
            style: {
                fontSize: '11px',
                colors: ['#e8eaed'],
                fontWeight: 'bold'
            },
            formatter: function(val, opts) {
                const dataIndex = opts.dataPointIndex;
                const data = chartData[dataIndex];
                return `${data.meetings} meetings • ${formatDuration(data.duration)}`;
            }
        },
        xaxis: {
            type: 'category',
            categories: chartData.map(c => c.name),
            labels: {
                style: {
                    colors: '#b8bcc3',
                    fontSize: '11px'
                },
                formatter: (val) => `${val}h`
            },
            title: {
                text: 'Time Spent (Hours) - Click bars for details',
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
                    <div style="padding: 12px; background: #1f1f1f; border: 1px solid #333; border-radius: 6px; min-width: 250px;">
                        <div style="color: #e8eaed; font-weight: bold; margin-bottom: 8px; font-size: 14px;">${data.name}</div>
                        <div style="color: #b8bcc3; font-size: 12px; margin-bottom: 2px;">📊 Total time: ${formattedDuration}</div>
                        <div style="color: #b8bcc3; font-size: 12px; margin-bottom: 2px;">🤝 ${data.meetings} meetings</div>
                        <div style="color: #b8bcc3; font-size: 12px; margin-bottom: 8px;">⏱️ Avg per meeting: ${avgDuration}</div>
                        
                        <div style="border-top: 1px solid #444; padding-top: 8px; margin-top: 8px;">
                            <div style="color: #9aa0a6; font-size: 11px; margin-bottom: 4px;">Meeting Size Breakdown:</div>
                            ${data.oneOnOne.count > 0 ? `<div style="color: #4285f4; font-size: 11px;">👥 1-on-1: ${data.oneOnOne.count} meetings (${formatDuration(data.oneOnOne.duration)})</div>` : ''}
                            ${data.smallGroup.count > 0 ? `<div style="color: #34a853; font-size: 11px;">👤👤👤 Small group: ${data.smallGroup.count} meetings (${formatDuration(data.smallGroup.duration)})</div>` : ''}
                            ${data.mediumGroup.count > 0 ? `<div style="color: #fbbc04; font-size: 11px;">👥👥 Medium group: ${data.mediumGroup.count} meetings (${formatDuration(data.mediumGroup.duration)})</div>` : ''}
                            ${data.largeGroup.count > 0 ? `<div style="color: #ea4335; font-size: 11px;">👥👥👥 Large group: ${data.largeGroup.count} meetings (${formatDuration(data.largeGroup.duration)})</div>` : ''}
                        </div>
                        
                        <div style="color: #1a73e8; font-size: 11px; margin-top: 8px; font-style: italic;">💡 Click for detailed breakdown</div>
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
        '0-15 min': { count: 0, meetings: [] },
        '15-30 min': { count: 0, meetings: [] },
        '30-60 min': { count: 0, meetings: [] },
        '1-2 hours': { count: 0, meetings: [] },
        '2+ hours': { count: 0, meetings: [] }
    };
    
    filteredMeetings.forEach(m => {
        const duration = m.endTime ? (m.endTime - m.startTime) / 60000 : 0;
        if (duration <= 15) {
            buckets['0-15 min'].count++;
            buckets['0-15 min'].meetings.push(m);
        } else if (duration <= 30) {
            buckets['15-30 min'].count++;
            buckets['15-30 min'].meetings.push(m);
        } else if (duration <= 60) {
            buckets['30-60 min'].count++;
            buckets['30-60 min'].meetings.push(m);
        } else if (duration <= 120) {
            buckets['1-2 hours'].count++;
            buckets['1-2 hours'].meetings.push(m);
        } else {
            buckets['2+ hours'].count++;
            buckets['2+ hours'].meetings.push(m);
        }
    });

    const durationColors = ['#5f7fbf', '#6ba368', '#b8a347', '#c4645a', '#7a7a7a'];
    const bucketLabels = Object.keys(buckets);

    const options = {
        ...getCommonChartOptions(),
        series: Object.values(buckets).map(b => b.count),
        labels: bucketLabels,
        colors: durationColors,
        chart: { 
            type: 'pie', 
            height: 350,
            events: {
                dataPointSelection: function(event, chartContext, config) {
                    const selectedLabel = bucketLabels[config.dataPointIndex];
                    const selectedData = buckets[selectedLabel];
                    showDurationDrillDown(selectedLabel, selectedData.meetings);
                }
            }
        },
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
            y: { formatter: (val) => `${val} meetings - Click to see details` },
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
    
    // Get user's preferred start time (default to 0 = midnight)
    const savedStartTime = localStorage.getItem('meetTracker_hourlyStartTime');
    const startHour = savedStartTime ? parseInt(savedStartTime) : 0;
    
    // Reorder data and labels to start from user's preferred hour
    const reorderedData = [];
    const reorderedLabels = [];
    
    for (let i = 0; i < 24; i++) {
        const actualHour = (startHour + i) % 24;
        reorderedData.push(hourlyDataInHours[actualHour]);
        reorderedLabels.push(formatHour(actualHour));
    }

    // Convert to 12-hour format with AM/PM
    const formatHourLocal = (hour) => {
        if (hour === 0) return '12 AM';
        if (hour === 12) return '12 PM';
        if (hour < 12) return `${hour} AM`;
        return `${hour - 12} PM`;
    };

    const options = {
        ...getCommonChartOptions(),
        series: [{ name: 'Meeting Time', data: reorderedData, color: '#34a853' }],
        chart: { type: 'area', height: 350 },
        xaxis: {
            categories: reorderedLabels,
            title: { 
                text: `Hour of the Day (Starting at ${formatHourLocal(startHour)})`,
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
    const paginationContainer = document.getElementById('pagination-container');
    
    if (filteredMeetings.length === 0) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="6">No meetings found</td></tr>';
        countEl.textContent = '0 meetings';
        paginationContainer.style.display = 'none';
        return;
    }
    
    // Calculate pagination
    totalPages = Math.ceil(filteredMeetings.length / pageSize);
    
    // Ensure current page is valid
    if (currentPage > totalPages) {
        currentPage = 1;
    }
    
    // Count active vs completed meetings
    const activeMeetings = filteredMeetings.filter(m => m.isActive === true).length;
    const completedMeetings = filteredMeetings.length - activeMeetings;
    
    countEl.textContent = `${filteredMeetings.length} meetings (${activeMeetings} active, ${completedMeetings} completed)`;
    
    // Get sorted meetings for current page - active meetings first
    const sorted = [...filteredMeetings].sort((a, b) => {
        // Active meetings first
        if (a.isActive !== b.isActive) {
            return b.isActive - a.isActive;
        }
        // Then by start time (newest first)
        return b.startTime - a.startTime;
    });
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedMeetings = sorted.slice(startIndex, endIndex);
    
    // Render meetings table
    tbody.innerHTML = paginatedMeetings.map((m, index) => {
        // Calculate real-time duration for ongoing meetings in table
        let duration;
        let statusIndicator = '';
        
        if (m.isActive) {
            // Active meeting - show current duration
            if (m.duration > 0) {
                // Use accumulated duration from completed sessions + current session time
                const currentSessionTime = Date.now() - m.startTime;
                duration = formatDuration(m.duration + currentSessionTime) + ' (ongoing)';
            } else {
                // Fallback: calculate from start time
                duration = formatDuration(Date.now() - m.startTime) + ' (ongoing)';
            }
            statusIndicator = '<span class="status-active" title="Meeting in progress">🔴 LIVE</span> ';
        } else if (m.endTime) {
            duration = formatDuration(m.duration || (m.endTime - m.startTime));
            statusIndicator = '<span class="status-completed" title="Meeting completed">✅</span> ';
        } else {
            // Fallback: calculate from start time
            duration = formatDuration(Date.now() - m.startTime) + ' (ongoing)';
            statusIndicator = '<span class="status-active" title="Meeting in progress">🔴 LIVE</span> ';
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
        const title = m.title || `Meeting ${m.meetingId || m.id}`;
        const shortTitle = title.length > 30 ? title.substring(0, 27) + '...' : title;
        
        // Add session count for aggregated meetings
        const sessionInfo = m.sessionCount > 1 ? ` (${m.sessionCount} sessions)` : '';
        const displayTitle = shortTitle + sessionInfo;
        
        return `
            <tr class="${m.isActive ? 'active-session' : 'completed-session'}">
                <td>${statusIndicator}${new Date(m.startTime).toLocaleString()}</td>
                <td class="meeting-title" title="${escapeHtml(title + sessionInfo)}">${escapeHtml(displayTitle)}</td>
                <td>${duration}</td>
                <td class="meeting-participants" title="${escapeHtml(participantNames.join(', '))}">${escapeHtml(participants)}</td>
                <td>${efficiency}</td>
                <td>
                    <button class="view-details" data-meeting-id="${m.id}">Details</button>
                    ${!m.isActive ? `<button class="delete-meeting" data-meeting-id="${m.id}" title="Delete this meeting">🗑️</button>` : ''}
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
    
    // Add event listeners for delete buttons (CSP-compliant)
    tbody.querySelectorAll('.delete-meeting').forEach(button => {
        button.addEventListener('click', (e) => {
            const meetingId = e.target.getAttribute('data-meeting-id');
            deleteMeetingEntry(meetingId);
        });
    });
    
    // Update pagination controls
    updatePaginationControls();
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
    const duration = meeting.endTime ? formatDuration(meeting.duration || (meeting.endTime - meeting.startTime)) : 'Ongoing';
    const efficiency = calculateEfficiencyScore(meeting);
    
    // Check if this is an aggregated meeting with sessions
    const isAggregated = meeting.sessions && meeting.sessions.length > 0;
    
    let sessionsHtml = '';
    if (isAggregated) {
        sessionsHtml = `
        <div style="margin: 1.5rem 0; padding: 1rem; background: #2a2a2a; border-radius: 8px;">
            <h4 style="margin: 0 0 1rem 0; color: #e8eaed;">📋 Individual Sessions (${meeting.sessions.length})</h4>
            <div class="sessions-list">
                ${meeting.sessions.map((session, index) => {
                    const sessionDuration = session.endTime ? 
                        formatDuration(session.endTime - session.startTime) : 
                        'Ongoing';
                    const sessionParticipants = session.participants || [];
                    const participantNames = sessionParticipants.map(p => {
                        if (typeof p === 'string') return p;
                        return p?.name || p?.displayName || p?.id || 'Unknown';
                    }).filter(name => name !== 'Unknown');
                    
                    return `
                    <div class="session-item" style="background: #1a1a1a; margin: 0.5rem 0; padding: 1rem; border-radius: 6px; border-left: 3px solid #4285f4;">
                        <div style="display: flex; justify-content: between; align-items: flex-start; margin-bottom: 0.5rem;">
                            <div style="flex: 1;">
                                <strong>Session ${index + 1}</strong>
                                <span style="color: #9aa0a6; margin-left: 0.5rem;">${session.endTime ? '✅ Completed' : '🔴 Active'}</span>
                            </div>
                            <button class="delete-session-btn" data-session-id="${session.sessionId}" style="background: #ea4335; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                        </div>
                        <div style="font-size: 0.9em; color: #b8bcc3;">
                            <div><strong>Time:</strong> ${new Date(session.startTime).toLocaleString()} - ${session.endTime ? new Date(session.endTime).toLocaleString() : 'Now'}</div>
                            <div><strong>Duration:</strong> ${sessionDuration}</div>
                            <div><strong>Participants:</strong> ${participantNames.length > 0 ? participantNames.join(', ') : 'None recorded'}</div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
    }
    
    modalBody.innerHTML = `
        ${meeting.title ? `<div style="margin-bottom: 1rem;"><strong>Title:</strong> ${escapeHtml(meeting.title)}</div>` : ''}
        <div style="margin-bottom: 1rem;">
            <strong>URL:</strong> <a href="${meeting.url}" target="_blank" style="color: #1a73e8;">${meeting.url}</a>
        </div>
        <div style="margin-bottom: 1rem;">
            <strong>Overall Time:</strong> ${new Date(meeting.startTime).toLocaleString()} - ${meeting.endTime ? new Date(meeting.endTime).toLocaleString() : 'Now'}<br>
            <strong>Total Duration:</strong> ${duration}<br>
            ${isAggregated ? `<strong>Sessions:</strong> ${meeting.sessionCount} join/leave cycles<br>` : ''}
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
            <strong>All Participants (${meeting.participants.length}):</strong><br>
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
        ${sessionsHtml}
    `;
    
    // Add event listeners for delete session buttons
    modalBody.querySelectorAll('.delete-session-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const sessionId = e.target.getAttribute('data-session-id');
            deleteSession(sessionId, meetingId);
        });
    });
    
    document.getElementById('meeting-modal').style.display = 'flex';
}

// Delete individual session function
async function deleteSession(sessionId, meetingId) {
    try {
        // Confirm deletion
        const confirmed = confirm(
            `🗑️ Delete Session?\n\n` +
            `Session ID: ${sessionId}\n\n` +
            `This will permanently delete this individual session.\n` +
            `The aggregated meeting will be updated to reflect the remaining sessions.\n\n` +
            `This action cannot be undone. Continue?`
        );
        
        if (!confirmed) {
            return;
        }
        
        // Send delete request to background script
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ 
                action: 'deleteSession', 
                sessionId: sessionId 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        
        if (response.success) {
            // Refresh the meetings data to get updated aggregated meetings
            await loadMeetings();
            applyFilters();
            
            // Close and reopen the modal with updated data
            closeModal();
            
            // Show success notification
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #34a853;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                font-size: 14px;
                font-weight: 500;
            `;
            notification.textContent = `✅ Session deleted successfully`;
            document.body.appendChild(notification);
            
            // Remove notification after 3 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
            
            // Reopen the modal if the meeting still exists (has remaining sessions)
            const updatedMeeting = allMeetings.find(m => m.id === meetingId);
            if (updatedMeeting) {
                setTimeout(() => showMeetingDetails(meetingId), 500);
            }
            
        } else {
            alert(`Failed to delete session: ${response.message || 'Unknown error'}`);
        }
        
    } catch (error) {
        console.error('Error deleting session:', error);
        alert(`❌ Error deleting session: ${error.message}`);
    }
}

function closeModal() {
    document.getElementById('meeting-modal').style.display = 'none';
}

// Side overlay functions
function showSideOverlay(title, content) {
    const sideOverlay = document.getElementById('side-overlay');
    const overlayTitle = document.getElementById('side-overlay-title');
    const overlayContent = document.getElementById('side-overlay-body');
    
    if (!overlayTitle || !overlayContent) {
        console.error('Side overlay elements not found:', {
            overlayTitle: !!overlayTitle,
            overlayContent: !!overlayContent
        });
        return;
    }
    
    overlayTitle.textContent = title;
    overlayContent.innerHTML = content;
    sideOverlay.style.display = 'block';
    sideOverlay.classList.add('active');
}

function closeSideOverlay() {
    const sideOverlay = document.getElementById('side-overlay');
    sideOverlay.classList.remove('active');
    // Hide after animation completes
    setTimeout(() => {
        if (!sideOverlay.classList.contains('active')) {
            sideOverlay.style.display = 'none';
        }
    }, 300);
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

// Helper function to validate dates
function isValidDate(value) {
    if (!value) return false;
    const date = new Date(value);
    return date instanceof Date && !isNaN(date.getTime()) && date.getTime() > 0;
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

// Manual cleanup function for different time periods
async function manualCleanup(days) {
    const timeLabels = {
        30: '30 days',
        90: '90 days', 
        365: '1 year'
    };
    
    const timeLabel = timeLabels[days] || `${days} days`;
    
    const confirmed = confirm(
        `🧹 Manual Cleanup (${timeLabel})\n\n` +
        `This will permanently delete all meetings older than ${timeLabel}.\n\n` +
        `This action cannot be undone.\n\n` +
        `Continue with cleanup?`
    );
    
    if (!confirmed) return;
    
    const button = document.getElementById(`cleanup-${days === 365 ? '1-year' : days + '-days'}`);
    const originalText = button?.textContent;
    
    try {
        // Show loading state
        if (button) {
            button.textContent = '🔄';
            button.disabled = true;
        }
        
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ 
                type: 'manualCleanup',
                days: days
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
        
        if (response && response.success) {
            const message = `✅ Cleanup Complete!\n\n` +
                `• ${response.deletedCount || 0} meetings deleted\n` +
                `• Meetings older than ${timeLabel} have been removed\n\n` +
                `Storage has been optimized.`;
            alert(message);
            
            // Refresh the dashboard data
            await loadMeetings();
            applyFilters();
        } else {
            alert(response?.message || `❌ Cleanup failed. Please try again.`);
        }
        
    } catch (error) {
        console.error('Error during manual cleanup:', error);
        alert(`❌ Error during cleanup: ${error.message}`);
    } finally {
        // Reset button after 2 seconds
        setTimeout(() => {
            if (button) {
                button.textContent = originalText;
                button.disabled = false;
            }
        }, 2000);
    }
}

// Force end zombie meetings (similar to popup)
async function cleanupZombieMeetings() {
    const cleanupBtn = document.getElementById('cleanup-zombie-btn');
    const originalText = cleanupBtn.textContent;
    
    // Show loading state
    cleanupBtn.textContent = '🔄 Cleaning...';
    cleanupBtn.disabled = true;
    
    try {
        if (!chrome.runtime || !chrome.runtime.id) {
            alert('Extension context invalidated. Please refresh the page.');
            return;
        }
        
        // Send force end message to background script
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'forceEndMeeting' }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
        
        if (response && response.success) {
            // Show success message
            alert(`✅ Success: ${response.message || 'Zombie meetings ended successfully'}`);
            
            // Refresh the dashboard data
            setTimeout(async () => {
                try {
                    await loadMeetings();
                    applyFilters();
                } catch (error) {
                    console.error('Error refreshing after zombie cleanup:', error);
                }
            }, 1000);
        } else {
            alert(response?.message || '⚠️ No zombie meetings found to end');
        }
        
    } catch (error) {
        console.error('Error during zombie cleanup:', error);
        alert('❌ Error ending zombie meetings: ' + error.message);
    } finally {
        // Reset button after 2 seconds
        setTimeout(() => {
            cleanupBtn.textContent = originalText;
            cleanupBtn.disabled = false;
        }, 2000);
    }
}

// Delete individual meeting entry
async function deleteMeetingEntry(meetingId) {
    // Find the meeting to get its details for confirmation
    const meeting = allMeetings.find(m => m.id === meetingId);
    if (!meeting) {
        alert('Meeting not found!');
        return;
    }
    
    const meetingTitle = meeting.title || `Meeting ${meetingId}`;
    const meetingDate = new Date(meeting.startTime).toLocaleString();
    
    // Confirm deletion
    const sessionCount = meeting.sessionCount || 1;
    const confirmed = confirm(
        `🗑️ Delete Entire Meeting?\n\n` +
        `Title: ${meetingTitle}\n` +
        `Date: ${meetingDate}\n` +
        `Sessions: ${sessionCount}\n` +
        `Participants: ${meeting.participants.length}\n\n` +
        `⚠️ WARNING: This will delete ALL ${sessionCount} session(s) for this meeting.\n` +
        `To delete individual sessions, use the "Details" button instead.\n\n` +
        `This action cannot be undone. Continue?`
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Send delete request to background script
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ 
                action: 'deleteMeeting', 
                meetingId: meetingId 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
        
        if (response.success) {
            // Remove from local arrays
            allMeetings = allMeetings.filter(m => m.id !== meetingId);
            filteredMeetings = filteredMeetings.filter(m => m.id !== meetingId);
            
            // Update the dashboard
            updateDashboard();
            
            // Show success message
            console.log(`✅ Successfully deleted meeting: ${meetingId}`);
            
            // Optional: Show a temporary success notification
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #34a853;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                font-size: 14px;
                font-weight: 500;
            `;
            notification.textContent = `✅ Deleted: ${meetingTitle}`;
            document.body.appendChild(notification);
            
            // Remove notification after 3 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
            
        } else {
            alert(`Failed to delete meeting: ${response.message || 'Unknown error'}`);
        }
        
    } catch (error) {
        console.error('Error deleting meeting:', error);
        alert(`❌ Error deleting meeting: ${error.message}`);
    }
}

// Pagination control functions
function setupPaginationEventListeners() {
    // Navigation buttons
    document.getElementById('first-page')?.addEventListener('click', () => goToPage(1));
    document.getElementById('prev-page')?.addEventListener('click', () => goToPage(currentPage - 1));
    document.getElementById('next-page')?.addEventListener('click', () => goToPage(currentPage + 1));
    document.getElementById('last-page')?.addEventListener('click', () => goToPage(totalPages));
    
    // Page size selector
    document.getElementById('page-size-select')?.addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1; // Reset to first page when changing page size
        updateMeetingsTable();
    });
}

function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    updateMeetingsTable();
}

function updatePaginationControls() {
    const paginationContainer = document.getElementById('pagination-container');
    const paginationInfo = document.getElementById('pagination-info');
    const pageNumbers = document.getElementById('page-numbers');
    const firstPageBtn = document.getElementById('first-page');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const lastPageBtn = document.getElementById('last-page');
    
    if (!paginationContainer) return;
    
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // Update info text
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, filteredMeetings.length);
    paginationInfo.textContent = `Showing ${startIndex}-${endIndex} of ${filteredMeetings.length} meetings`;
    
    // Update navigation buttons
    firstPageBtn.disabled = currentPage === 1;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    lastPageBtn.disabled = currentPage === totalPages;
    
    // Generate page numbers
    generatePageNumbers();
}

function generatePageNumbers() {
    const pageNumbers = document.getElementById('page-numbers');
    if (!pageNumbers) return;
    
    pageNumbers.innerHTML = '';
    
    // Calculate which page numbers to show
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start page if we're at the end
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Add first page and ellipsis if needed
    if (startPage > 1) {
        addPageButton(1);
        if (startPage > 2) {
            addEllipsis();
        }
    }
    
    // Add visible page numbers
    for (let page = startPage; page <= endPage; page++) {
        addPageButton(page);
    }
    
    // Add ellipsis and last page if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            addEllipsis();
        }
        addPageButton(totalPages);
    }
}

function addPageButton(page) {
    const pageNumbers = document.getElementById('page-numbers');
    const button = document.createElement('button');
    button.className = `page-number ${page === currentPage ? 'active' : ''}`;
    button.textContent = page;
    button.addEventListener('click', () => goToPage(page));
    pageNumbers.appendChild(button);
}

function addEllipsis() {
    const pageNumbers = document.getElementById('page-numbers');
    const ellipsis = document.createElement('span');
    ellipsis.className = 'page-ellipsis';
    ellipsis.textContent = '…';
    pageNumbers.appendChild(ellipsis);
}

// Drill-down functions using side overlay
function showCollaboratorDrillDown(collaboratorData) {
    // Calculate additional insights
    const avgMeetingDuration = collaboratorData.meetings > 0 ? 
        collaboratorData.duration / collaboratorData.meetings : 0;
    
    // Sort meetings by date (newest first)
    const sortedMeetings = collaboratorData.meetingDetails.sort((a, b) => b.startTime - a.startTime);
    
    // Calculate meeting frequency (meetings per week)
    const dateRange = sortedMeetings.length > 1 ? 
        (sortedMeetings[0].startTime - sortedMeetings[sortedMeetings.length - 1].startTime) / (1000 * 60 * 60 * 24 * 7) : 0;
    const meetingsPerWeek = dateRange > 0 ? (collaboratorData.meetings / dateRange).toFixed(1) : '0';
    
    const content = `
        <div style="margin-bottom: 1.5rem;">
            <h3 style="color: #e8eaed; margin: 0 0 1rem 0; display: flex; align-items: center; gap: 10px;">
                <span style="background: ${collaboratorData.color}; width: 20px; height: 20px; border-radius: 50%; display: inline-block;"></span>
                🤝 Collaboration Analysis: ${escapeHtml(collaboratorData.name)}
            </h3>
        </div>
        
        <!-- Summary Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="color: #4285f4; font-size: 24px; font-weight: bold;">${collaboratorData.meetings}</div>
                <div style="color: #9aa0a6; font-size: 12px;">Total Meetings</div>
            </div>
            <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="color: #34a853; font-size: 24px; font-weight: bold;">${formatDuration(collaboratorData.duration)}</div>
                <div style="color: #9aa0a6; font-size: 12px;">Total Time</div>
            </div>
            <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="color: #fbbc04; font-size: 24px; font-weight: bold;">${formatDuration(avgMeetingDuration)}</div>
                <div style="color: #9aa0a6; font-size: 12px;">Avg Duration</div>
            </div>
            <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="color: #ea4335; font-size: 24px; font-weight: bold;">${meetingsPerWeek}</div>
                <div style="color: #9aa0a6; font-size: 12px;">Meetings/Week</div>
            </div>
        </div>
        
        <!-- Meeting Size Breakdown -->
        <div style="background: #2a2a2a; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
            <h4 style="color: #e8eaed; margin: 0 0 1rem 0;">📊 Meeting Size Distribution</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                ${collaboratorData.oneOnOne.count > 0 ? `
                <div style="text-align: center; padding: 1rem; background: #1a1a1a; border-radius: 6px; border-left: 4px solid #4285f4;">
                    <div style="font-size: 18px; font-weight: bold; color: #4285f4;">👥 ${collaboratorData.oneOnOne.count}</div>
                    <div style="color: #9aa0a6; font-size: 11px; margin: 4px 0;">1-on-1 Meetings</div>
                    <div style="color: #b8bcc3; font-size: 12px;">${formatDuration(collaboratorData.oneOnOne.duration)}</div>
                </div>` : ''}
                ${collaboratorData.smallGroup.count > 0 ? `
                <div style="text-align: center; padding: 1rem; background: #1a1a1a; border-radius: 6px; border-left: 4px solid #34a853;">
                    <div style="font-size: 18px; font-weight: bold; color: #34a853;">👤👤👤 ${collaboratorData.smallGroup.count}</div>
                    <div style="color: #9aa0a6; font-size: 11px; margin: 4px 0;">Small Groups (3-5)</div>
                    <div style="color: #b8bcc3; font-size: 12px;">${formatDuration(collaboratorData.smallGroup.duration)}</div>
                </div>` : ''}
                ${collaboratorData.mediumGroup.count > 0 ? `
                <div style="text-align: center; padding: 1rem; background: #1a1a1a; border-radius: 6px; border-left: 4px solid #fbbc04;">
                    <div style="font-size: 18px; font-weight: bold; color: #fbbc04;">👥👥 ${collaboratorData.mediumGroup.count}</div>
                    <div style="color: #9aa0a6; font-size: 11px; margin: 4px 0;">Medium Groups (6-10)</div>
                    <div style="color: #b8bcc3; font-size: 12px;">${formatDuration(collaboratorData.mediumGroup.duration)}</div>
                </div>` : ''}
                ${collaboratorData.largeGroup.count > 0 ? `
                <div style="text-align: center; padding: 1rem; background: #1a1a1a; border-radius: 6px; border-left: 4px solid #ea4335;">
                    <div style="font-size: 18px; font-weight: bold; color: #ea4335;">👥👥👥 ${collaboratorData.largeGroup.count}</div>
                    <div style="color: #9aa0a6; font-size: 11px; margin: 4px 0;">Large Groups (11+)</div>
                    <div style="color: #b8bcc3; font-size: 12px;">${formatDuration(collaboratorData.largeGroup.duration)}</div>
                </div>` : ''}
            </div>
            
            <div style="margin-top: 1rem; padding: 1rem; background: #1a1a1a; border-radius: 6px;">
                <div style="color: #9aa0a6; font-size: 12px; margin-bottom: 4px;">💡 Collaboration Quality Score</div>
                <div style="color: #e8eaed; font-size: 16px; font-weight: bold;">${collaboratorData.qualityScore.toFixed(1)} hours</div>
                <div style="color: #b8bcc3; font-size: 11px;">Weighted by meeting intimacy (1-on-1 = 100%, small = 75%, medium = 50%, large = 25%)</div>
            </div>
        </div>
        
        <!-- Recent Meetings -->
        <div style="background: #2a2a2a; padding: 1.5rem; border-radius: 8px;">
            <h4 style="color: #e8eaed; margin: 0 0 1rem 0;">📅 Recent Meetings (Last 10)</h4>
            <div>
                ${sortedMeetings.slice(0, 10).map(meeting => {
                    const duration = meeting.endTime ? 
                        formatDuration(meeting.endTime - meeting.startTime) : 'Ongoing';
                    const participantIcon = meeting.participantCount === 2 ? '👥' : 
                        meeting.participantCount <= 5 ? '👤👤👤' : 
                        meeting.participantCount <= 10 ? '👥👥' : '👥👥👥';
                    const sizeColor = meeting.participantCount === 2 ? '#4285f4' : 
                        meeting.participantCount <= 5 ? '#34a853' : 
                        meeting.participantCount <= 10 ? '#fbbc04' : '#ea4335';
                    
                    return `
                    <div class="meeting-drill-item" data-meeting-id="${meeting.id}" style="
                        background: #1a1a1a; 
                        margin: 0.5rem 0; 
                        padding: 1rem; 
                        border-radius: 6px; 
                        border-left: 3px solid ${sizeColor};
                        cursor: pointer;
                        transition: background 0.2s ease;
                    " onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1a1a1a'">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                            <div style="flex: 1;">
                                <div style="color: #e8eaed; font-weight: bold; font-size: 14px;">${escapeHtml(meeting.title)}</div>
                                <div style="color: #9aa0a6; font-size: 12px; margin-top: 2px;">${new Date(meeting.startTime).toLocaleDateString()} • ${new Date(meeting.startTime).toLocaleTimeString()}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="color: ${sizeColor}; font-size: 12px; font-weight: bold;">${participantIcon} ${meeting.participantCount}</div>
                                <div style="color: #b8bcc3; font-size: 11px;">${duration}</div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    // Show the content in the side overlay
    showSideOverlay(`🤝 ${collaboratorData.name}`, content);
    
    // Add click event listeners for meeting drill items after the overlay is shown
    setTimeout(() => {
        document.querySelectorAll('#side-overlay .meeting-drill-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const meetingId = e.currentTarget.getAttribute('data-meeting-id');
                closeSideOverlay();
                showMeetingDetails(meetingId);
            });
        });
    }, 100);
}

function showDurationDrillDown(durationLabel, meetings) {
    // Calculate insights for this duration bucket
    const totalTime = meetings.reduce((sum, m) => sum + (m.endTime ? (m.endTime - m.startTime) : 0), 0);
    const avgParticipants = meetings.length > 0 ? 
        meetings.reduce((sum, m) => sum + m.participants.length, 0) / meetings.length : 0;
    
    // Group by participant count
    const participantGroups = {
        '1-2 people': meetings.filter(m => m.participants.length <= 2),
        '3-5 people': meetings.filter(m => m.participants.length >= 3 && m.participants.length <= 5),
        '6-10 people': meetings.filter(m => m.participants.length >= 6 && m.participants.length <= 10),
        '11+ people': meetings.filter(m => m.participants.length >= 11)
    };
    
    // Sort meetings by date (newest first)
    const sortedMeetings = meetings.sort((a, b) => b.startTime - a.startTime);
    
    // Calculate efficiency insights
    let efficiencyBreakdown = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    meetings.forEach(m => {
        const score = calculateEfficiencyScore(m);
        if (score !== 'N/A') {
            const grade = score.split('(')[1]?.split(')')[0];
            if (grade && efficiencyBreakdown[grade] !== undefined) {
                efficiencyBreakdown[grade]++;
            }
        }
    });
    
    const content = `
        <div style="margin-bottom: 1.5rem;">
            <h3 style="color: #e8eaed; margin: 0 0 1rem 0;">⏱️ Duration Analysis: ${durationLabel}</h3>
        </div>
        
        <!-- Summary Stats -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="color: #4285f4; font-size: 24px; font-weight: bold;">${meetings.length}</div>
                <div style="color: #9aa0a6; font-size: 12px;">Total Meetings</div>
            </div>
            <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="color: #34a853; font-size: 24px; font-weight: bold;">${formatDuration(totalTime)}</div>
                <div style="color: #9aa0a6; font-size: 12px;">Total Time</div>
            </div>
            <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; text-align: center;">
                <div style="color: #fbbc04; font-size: 24px; font-weight: bold;">${avgParticipants.toFixed(1)}</div>
                <div style="color: #9aa0a6; font-size: 12px;">Avg Participants</div>
            </div>
        </div>
        
        <!-- Participant Size Breakdown -->
        <div style="background: #2a2a2a; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
            <h4 style="color: #e8eaed; margin: 0 0 1rem 0;">👥 Participant Size Distribution</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                ${Object.entries(participantGroups).map(([size, groupMeetings], index) => {
                    const colors = ['#4285f4', '#34a853', '#fbbc04', '#ea4335'];
                    const color = colors[index % colors.length];
                    const percentage = meetings.length > 0 ? ((groupMeetings.length / meetings.length) * 100).toFixed(1) : '0';
                    
                    return groupMeetings.length > 0 ? `
                    <div style="text-align: center; padding: 1rem; background: #1a1a1a; border-radius: 6px; border-left: 4px solid ${color};">
                        <div style="font-size: 18px; font-weight: bold; color: ${color};">${groupMeetings.length}</div>
                        <div style="color: #9aa0a6; font-size: 11px; margin: 4px 0;">${size}</div>
                        <div style="color: #b8bcc3; font-size: 12px;">${percentage}%</div>
                    </div>` : '';
                }).join('')}
            </div>
        </div>
        
        <!-- Efficiency Breakdown -->
        <div style="background: #2a2a2a; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
            <h4 style="color: #e8eaed; margin: 0 0 1rem 0;">🎯 Efficiency Grade Distribution</h4>
            <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                ${Object.entries(efficiencyBreakdown).map(([grade, count]) => {
                    const gradeColors = { A: '#34a853', B: '#4285f4', C: '#fbbc04', D: '#ff9800', F: '#ea4335' };
                    const color = gradeColors[grade];
                    const percentage = meetings.length > 0 ? ((count / meetings.length) * 100).toFixed(1) : '0';
                    
                    return count > 0 ? `
                    <div style="text-align: center; padding: 0.75rem; background: #1a1a1a; border-radius: 6px; border: 2px solid ${color}; min-width: 60px;">
                        <div style="font-size: 18px; font-weight: bold; color: ${color};">${grade}</div>
                        <div style="color: #e8eaed; font-size: 14px; margin: 2px 0;">${count}</div>
                        <div style="color: #9aa0a6; font-size: 10px;">${percentage}%</div>
                    </div>` : '';
                }).join('')}
            </div>
        </div>
        
        <!-- Recent Meetings -->
        <div style="background: #2a2a2a; padding: 1.5rem; border-radius: 8px;">
            <h4 style="color: #e8eaed; margin: 0 0 1rem 0;">📅 Meetings in this Duration Range (Last 15)</h4>
            <div style="max-height: 350px; overflow-y: auto;">
                ${sortedMeetings.slice(0, 15).map(meeting => {
                    const duration = meeting.endTime ? 
                        formatDuration(meeting.endTime - meeting.startTime) : 'Ongoing';
                    const efficiency = calculateEfficiencyScore(meeting);
                    const efficiencyGrade = efficiency !== 'N/A' ? efficiency.split('(')[1]?.split(')')[0] : 'N/A';
                    const gradeColors = { A: '#34a853', B: '#4285f4', C: '#fbbc04', D: '#ff9800', F: '#ea4335' };
                    const gradeColor = gradeColors[efficiencyGrade] || '#9aa0a6';
                    
                    return `
                    <div class="meeting-drill-item" data-meeting-id="${meeting.id}" style="
                        background: #1a1a1a; 
                        margin: 0.5rem 0; 
                        padding: 1rem; 
                        border-radius: 6px; 
                        border-left: 3px solid ${gradeColor};
                        cursor: pointer;
                        transition: background 0.2s ease;
                    " onmouseover="this.style.background='#333'" onmouseout="this.style.background='#1a1a1a'">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                            <div style="flex: 1;">
                                <div style="color: #e8eaed; font-weight: bold; font-size: 14px;">${escapeHtml(meeting.title || `Meeting ${meeting.id}`)}</div>
                                <div style="color: #9aa0a6; font-size: 12px; margin-top: 2px;">${new Date(meeting.startTime).toLocaleDateString()} • ${new Date(meeting.startTime).toLocaleTimeString()}</div>
                                <div style="color: #b8bcc3; font-size: 11px; margin-top: 4px;">👥 ${meeting.participants.length} participants</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="color: #e8eaed; font-size: 12px; font-weight: bold;">${duration}</div>
                                <div style="color: ${gradeColor}; font-size: 11px; font-weight: bold; margin-top: 2px;">Grade: ${efficiencyGrade}</div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    // Show the content in the side overlay
    showSideOverlay(`⏱️ ${durationLabel}`, content);
    
    // Add click event listeners for meeting drill items after the overlay is shown
    setTimeout(() => {
        document.querySelectorAll('#side-overlay .meeting-drill-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const meetingId = e.currentTarget.getAttribute('data-meeting-id');
                closeSideOverlay();
                showMeetingDetails(meetingId);
            });
        });
    }, 100);
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
