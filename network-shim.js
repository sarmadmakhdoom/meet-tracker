// Enhanced network interception shims based on working Google Meet Attendance List extension
// This file is injected as a separate script to avoid CSP issues

(function() {
  'use strict';
  
  console.log('[MeetTracker] Initializing proven network shims...');
  
  // Store original functions
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  
  // Flag to track if shims are active
  window.meetTrackerShimsActive = true;
  
  // Proven fetch interception for SyncMeetingSpaceCollections (from working extension)
  if (typeof window.fetch === 'function') {
    window.fetch = async function(url, options) {
      const response = await originalFetch.apply(this, arguments);
      
      // Process the response in a wrapper function
      const wrapperFn = async (response) => {
        if (!response.ok) return response;
        
        try {
          const responseClone = response.clone();
          const base64String = await responseClone.text();
          
          // Dispatch event using the exact format from working extension
          window.dispatchEvent(new CustomEvent('gmal-message', {
            detail: {
              eventName: 'meetings.decode_sync',
              b64: base64String
            }
          }));
          
          console.debug('[MeetTracker] Intercepted SyncMeetingSpaceCollections');
        } catch (e) {
          console.debug('[MeetTracker] Error processing sync response:', e);
        }
        
        return response;
      };
      
      // Only process SyncMeetingSpaceCollections calls (proven to work)
      if (url && url.indexOf('SyncMeetingSpaceCollections') > -1) {
        response.then(wrapperFn);
      }
      
      return response;
    };
  }
  
  // Proven XMLHttpRequest interception for calendar events (from working extension)
  const xhrOpenDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'open');
  const origXhrOpen = xhrOpenDesc.value;
  
  const xhrOpenProxy = new Proxy(origXhrOpen, {
    apply: function(target, thisArg, argumentsList) {
      const [method, url] = argumentsList;
      
      // Calendar API pattern from working extension
      const regex = /\/calendar\/v[^\/]+\/calendars\/([^\/]+)\/events/;
      const match = regex.exec(url);
      
      if (match && match[1]) {
        const calendarId = decodeURIComponent(match[1]);
        thisArg.addEventListener('load', function() {
          try {
            const eventDetails = JSON.parse(this.responseText);
            
            // Send calendar event details using exact format from working extension
            window.dispatchEvent(new CustomEvent('gmal-message', {
              detail: {
                eventName: 'meetings.event_details',
                eventDetails: eventDetails,
                calendarId: calendarId
              }
            }));
            
            console.debug('[MeetTracker] Intercepted calendar event');
          } catch (e) {
            console.debug('[MeetTracker] Error processing calendar response:', e);
          }
        });
      }
      
      return Reflect.apply(target, thisArg, argumentsList);
    }
  });
  
  Object.defineProperty(XMLHttpRequest.prototype, 'open', {
    ...xhrOpenDesc,
    value: xhrOpenProxy
  });
  
  // Debug function to check if shims are working
  window.debugMeetTrackerShims = () => {
    return {
      active: window.meetTrackerShimsActive,
      fetchIntercepted: window.fetch !== originalFetch,
      xhrIntercepted: XMLHttpRequest.prototype.open !== origXhrOpen
    };
  };
  
  console.log('[MeetTracker] Proven network shims injected successfully');
});
