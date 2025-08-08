# Google Meet Tracker - New Architecture (v2.0)

## 🎯 Problem Statement

The current Google Meet Tracker has several issues:
- **Timing Inconsistencies**: Sessions are missed during reconnections, causing 40-minute meetings to show only 8 minutes
- **Monolithic Code**: Large files (1500+ lines) mixing multiple concerns
- **Complex Session Logic**: Overly complicated session management leading to bugs
- **No Clear Meeting-Session Relationship**: Confusing data model

## 🏗️ New Architecture Overview

The redesigned architecture follows clean separation of concerns with a proper **Meeting → Sessions** relationship:

```
Meeting (fdq-ptco-fdj)
├── Session 1: 9:00-9:15 (15 minutes)
├── Session 2: 9:20-9:35 (15 minutes) 
└── Session 3: 9:40-9:50 (10 minutes)
Total Duration: 40 minutes
```

### Key Benefits:
✅ **Robust Timing**: Meeting duration = sum of all session durations  
✅ **Modular Code**: Small, focused components  
✅ **Clear Data Model**: Meetings contain sessions, participants belong to meetings  
✅ **Professional Structure**: Easy to debug and maintain  
✅ **Session Resilience**: Reconnections create new sessions automatically  

## 📁 New File Structure

```
src/
├── models/
│   ├── Meeting.js          # Meeting entity with session aggregation
│   └── Session.js          # Individual session entity
├── storage/
│   └── StorageManager.js   # Clean database operations
├── managers/
│   └── MeetingManager.js   # Meeting lifecycle management
├── background/
│   └── BackgroundService.js # Streamlined background service
├── content/
│   └── ContentScript.js    # Simplified participant detection
├── dashboard/
│   └── DashboardService.js # Meeting/session display logic
└── manifest.json           # Updated manifest

# Entry Points (for Chrome Extension compatibility)
├── background-entry.js     # Loads background service
├── content-entry.js        # Loads content script
└── dashboard-entry.js      # Loads dashboard service
```

## 🧩 Component Breakdown

### 1. Meeting Model (`Meeting.js`)
- **Purpose**: Represents a complete meeting (collection of sessions)
- **Key Features**:
  - Aggregates duration from all sessions
  - Manages unique participants across sessions
  - Automatically calculates start/end times
  - Tracks session count

```javascript
const meeting = new Meeting('fdq-ptco-fdj', 'Team Standup', 'https://meet.google.com/fdq-ptco-fdj');
meeting.updateFromSessions(sessions); // Auto-calculates totals
```

### 2. Session Model (`Session.js`)
- **Purpose**: Represents a single join/leave cycle
- **Key Features**:
  - Precise timing (start/end/duration)
  - Participant tracking for this specific session
  - Minute-by-minute data storage
  - End reason tracking

```javascript
const session = new Session('fdq-ptco-fdj', 'Team Standup', url);
session.updateParticipants(participants);
session.end('user_left');
```

### 3. Storage Manager (`StorageManager.js`)
- **Purpose**: Clean database operations with proper relationships
- **Key Features**:
  - Separate tables: meetings, sessions, sessionMinutes, participants
  - Foreign key relationships (meetingId links sessions to meetings)
  - Efficient queries with proper indexing
  - Automatic data aggregation

### 4. Meeting Manager (`MeetingManager.js`)
- **Purpose**: Handles meeting lifecycle and session management
- **Key Features**:
  - Creates/retrieves meetings
  - Manages active sessions
  - Handles session transitions
  - Updates meeting totals automatically

### 5. Background Service (`BackgroundService.js`)
- **Purpose**: Streamlined background service worker
- **Key Features**:
  - Simple message handling
  - State management
  - Icon updates
  - Extension lifecycle management

### 6. Content Script (`ContentScript.js`)
- **Purpose**: Focused on participant detection only
- **Key Features**:
  - Meeting detection
  - Participant extraction
  - Communication with background
  - Navigation handling

### 7. Dashboard Service (`DashboardService.js`)
- **Purpose**: Display meetings with session details
- **Key Features**:
  - Meeting cards showing session breakdown
  - Statistics aggregation
  - Filtering and sorting
  - Session drill-down views

## 🗄️ New Database Schema

```sql
-- Meetings (primary entities)
meetings {
  meetingId: string (PK)
  title: string
  url: string
  startTime: timestamp
  endTime: timestamp
  status: 'active' | 'completed'
  totalDuration: number
  sessionCount: number
  participants: array
  createdAt: timestamp
  updatedAt: timestamp
}

-- Sessions (linked to meetings)
sessions {
  sessionId: string (PK)
  meetingId: string (FK -> meetings.meetingId)
  startTime: timestamp
  endTime: timestamp
  duration: number
  participants: array
  endReason: string
  dataSource: string
  createdAt: timestamp
}

-- Session Minutes (detailed tracking)
sessionMinutes {
  sessionId: string (FK -> sessions.sessionId)
  minute: number
  timestamp: timestamp
  participants: array
  participantCount: number
}
```

## 🔄 Data Flow

### Meeting Start:
1. Content Script detects active meeting
2. Sends participant update to Background Service
3. Background Service creates/finds Meeting
4. Creates new Session for the meeting
5. Updates icon and state

### Participant Changes:
1. Content Script scans for participants
2. Sends updates to Background Service
3. Background Service updates current Session
4. Meeting totals updated automatically

### Meeting End:
1. Content Script detects meeting end
2. Sends end signal to Background Service
3. Background Service ends current Session
4. Saves Session to storage
5. Updates Meeting totals from all Sessions

### Dashboard Display:
1. Dashboard requests meeting data
2. Background Service aggregates Meeting + Sessions
3. Dashboard shows meetings with session breakdown
4. Users can drill down to see individual sessions

## 🚀 Implementation Plan

### Phase 1: Core Models and Storage
1. Create Meeting and Session models
2. Implement new StorageManager
3. Set up database schema
4. Write unit tests for models

### Phase 2: Background Service
1. Create MeetingManager
2. Implement BackgroundService
3. Set up message handling
4. Test session lifecycle

### Phase 3: Content Script
1. Simplify ContentScript to focus on participant detection
2. Remove complex timing logic (let background handle it)
3. Test meeting detection and participant extraction

### Phase 4: Dashboard
1. Create DashboardService
2. Implement meeting-session views
3. Add filtering and statistics
4. Test UI interactions

### Phase 5: Migration and Testing
1. Create data migration script from old to new schema
2. Comprehensive testing across all components
3. Performance optimization
4. Documentation updates

## 🔧 Usage Example

```javascript
// Background Service automatically handles the lifecycle
// Content Script just sends participant updates:

// Content Script
tracker.sendParticipantUpdate({
  meetingId: 'fdq-ptco-fdj',
  title: 'Team Standup',
  participants: [
    { id: 'user1', name: 'John Doe' },
    { id: 'user2', name: 'Jane Smith' }
  ]
});

// Background Service creates meeting and session automatically
// When user reconnects, a new session is created
// Meeting duration = sum of all session durations
// Dashboard shows both meeting totals and individual sessions
```

## 💡 Benefits of New Architecture

1. **Accurate Timing**: No more lost session time during reconnections
2. **Modular Design**: Easy to debug, test, and maintain individual components
3. **Clear Data Model**: Meetings and sessions have well-defined relationships
4. **Professional Structure**: Follows software engineering best practices
5. **Extensible**: Easy to add new features without affecting existing code
6. **Debuggable**: Small, focused functions that are easy to trace
7. **Testable**: Each component can be unit tested independently

## 🧪 Testing Strategy

- **Unit Tests**: Each model and service component
- **Integration Tests**: Component interactions
- **End-to-End Tests**: Complete user workflows
- **Performance Tests**: Storage operations and memory usage
- **Migration Tests**: Old data to new schema conversion

## 📊 Expected Improvements

- **Timing Accuracy**: 99.9% accurate meeting durations
- **Code Maintainability**: 80% reduction in debugging time
- **Performance**: Faster dashboard loading with optimized queries
- **User Experience**: Clear session breakdown and statistics
- **Reliability**: Robust handling of network issues and reconnections

This new architecture transforms the Google Meet Tracker from a complex, monolithic extension into a clean, professional, and maintainable application that accurately tracks meeting durations regardless of connection issues.
