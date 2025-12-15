/**
 * Event Store Service
 * Persists events to localStorage for historical querying
 */

class EventStore {
    constructor() {
        this.maxEvents = 1000; // Keep last 1000 events
        this.storageKey = 'his_event_log';
    }

    /**
     * Add an event to the store
     */
    addEvent(type, data) {
        const event = {
            id: Date.now() + Math.random(), // Ensure uniqueness
            type,
            data,
            timestamp: new Date().toISOString()
        };

        const events = this.getAllEvents();
        events.unshift(event);
        
        // Keep only the most recent events
        const trimmed = events.slice(0, this.maxEvents);
        
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
        } catch (err) {
            console.error('Failed to save event to localStorage:', err);
        }

        return event;
    }

    /**
     * Get all events from storage
     */
    getAllEvents() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (err) {
            console.error('Failed to load events from localStorage:', err);
            return [];
        }
    }

    /**
     * Query events by time range and module
     */
    queryEvents(startTime, endTime, module) {
        const events = this.getAllEvents();
        
        return events.filter(event => {
            const eventTime = new Date(event.timestamp).getTime();
            
            // Check time range
            if (eventTime < startTime || eventTime > endTime) {
                return false;
            }
            
            // Check module - look for 'Module#' or 'Shelf #' in the data
            if (module) {
                const moduleStr = `Module${module}`;
                const shelfStr = `Shelf ${module}`;
                const dataStr = JSON.stringify(event.data).toLowerCase();
                
                if (!dataStr.includes(moduleStr.toLowerCase()) && !dataStr.includes(shelfStr.toLowerCase())) {
                    return false;
                }
            }
            
            return true;
        });
    }

    /**
     * Clear all events
     */
    clearAll() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (err) {
            console.error('Failed to clear events from localStorage:', err);
        }
    }

    /**
     * Clear old events (older than X days)
     */
    clearOldEvents(daysToKeep = 30) {
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        const events = this.getAllEvents();
        
        const filtered = events.filter(event => {
            const eventTime = new Date(event.timestamp).getTime();
            return eventTime >= cutoffTime;
        });
        
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(filtered));
        } catch (err) {
            console.error('Failed to clear old events:', err);
        }
    }
}

const eventStore = new EventStore();
export default eventStore;
