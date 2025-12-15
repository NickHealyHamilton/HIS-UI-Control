import React, { useState, useEffect } from 'react';
import signalRService from '../services/signalRService';
import './EventLog.css';

const EventLog = () => {
    const [events, setEvents] = useState([]);
    const [maxEvents] = useState(50); // Keep last 50 events

    const addEvent = (type, data) => {
        console.log(`🔔 EventLog: Adding event type="${type}"`, data);
        
        const newEvent = {
            id: Date.now() + Math.random(),
            type,
            data,
            timestamp: new Date().toLocaleTimeString()
        };

        setEvents(prev => {
            const updated = [newEvent, ...prev];
            return updated.slice(0, maxEvents); // Keep only last N events
        });
    };

    useEffect(() => {
        // Subscribe to all event types
        const handleLogEvent = (data) => {
            addEvent('log', data);
        };

        const handleHeaterError = (data) => {
            addEvent('heaterError', data);
        };

        const handleTemperatureEvent = (data) => {
            addEvent('temperature', data);
        };

        const handleShakerError = (data) => {
            addEvent('shakerError', data);
        };

        const handleScanEvent = (data) => {
            addEvent('scan', data);
        };

        const handleScanConnectionEvent = (data) => {
            addEvent('scanConnection', data);
        };

        const handleHisConnectionEvent = (data) => {
            addEvent('hisConnection', data);
        };

        signalRService.on('logEvent', handleLogEvent);
        signalRService.on('heaterError', handleHeaterError);
        signalRService.on('temperatureEvent', handleTemperatureEvent);
        signalRService.on('shakerError', handleShakerError);
        signalRService.on('scanEvent', handleScanEvent);
        signalRService.on('scanConnectionEvent', handleScanConnectionEvent);
        signalRService.on('hisConnectionEvent', handleHisConnectionEvent);

        // Cleanup
        return () => {
            signalRService.off('logEvent', handleLogEvent);
            signalRService.off('heaterError', handleHeaterError);
            signalRService.off('temperatureEvent', handleTemperatureEvent);
            signalRService.off('shakerError', handleShakerError);
            signalRService.off('scanEvent', handleScanEvent);
            signalRService.off('scanConnectionEvent', handleScanConnectionEvent);
            signalRService.off('hisConnectionEvent', handleHisConnectionEvent);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clearEvents = () => {
        setEvents([]);
    };

    const getEventIcon = (type) => {
        switch (type) {
            case 'heaterError':
                return '🔥';
            case 'shakerError':
                return '⚠️';
            case 'temperature':
                return '🌡️';
            case 'scan':
                return '📷';
            case 'scanConnection':
                return '🔌';
            case 'hisConnection':
                return '🔗';
            case 'log':
                return '📝';
            default:
                return '•';
        }
    };

    const getEventClass = (type) => {
        switch (type) {
            case 'heaterError':
            case 'shakerError':
                return 'event-error';
            case 'temperature':
                return 'event-warning';
            case 'scan':
            case 'scanConnection':
            case 'hisConnection':
                return 'event-success';
            default:
                return 'event-info';
        }
    };

    const formatEventData = (type, data) => {
        switch (type) {
            case 'log':
                return formatLogEvent(data);
            case 'heaterError':
            case 'shakerError':
                return `${data.module} - ${data.error}`;
            case 'temperature':
                return formatTemperatureEvent(data);
            case 'scan':
                return `Shelf ${data.module} - Barcode: ${data.barcode}`;
            case 'scanConnection':
                return `Scanner: ${data.connectionEventData}`;
            case 'hisConnection':
                return `HIS: ${data.connectionEventData}`;
            default:
                return JSON.stringify(data);
        }
    };

    const formatLogEvent = (data) => {
        const module = data.module;
        const eventId = data.eventId;
        const val0 = data.data0;
        const val1 = data.data1;
        const val2 = data.data2;

        // Check if this is a temperature-related log event
        switch (eventId) {
            case 'TemperatureReached':
                return `${module} - Temperature reached: ${val0}°C`;
            case 'TemperatureOutOfRange':
                return `${module} - Out of range: ${val2}°C (range: ${val1}°C - ${val0}°C)`;
            case 'TemperatureSetting':
                return `${module} - Temperature set to ${val0}°C`;
            default:
                // Default log event format
                return `${module} - ${eventId}`;
        }
    };

    const formatTemperatureEvent = (data) => {
        const module = data.module;
        const eventType = data.eventType;
        const val1 = data.data1;
        const val2 = data.data2;
        const val3 = data.data3;

        switch (eventType) {
            case 'TemperatureReached':
                return `${module} - Temperature reached: ${val1}°C`;
            case 'TemperatureOutOfRange':
                return `${module} - Out of range: ${val3}°C (range: ${val1}°C - ${val2}°C)`;
            case 'TemperatureSetting':
                return `${module} - Temperature set to ${val1}°C`;
            default:
                return `${module} - ${eventType}`;
        }
    };

    return (
        <div className="event-log">
            <div className="event-log-header">
                <h3>Event Log</h3>
                <div className="event-log-controls">
                    <span className="event-count">{events.length} events</span>
                    <button onClick={clearEvents} className="btn-clear">Clear</button>
                </div>
            </div>
            <div className="event-log-body">
                {events.length === 0 ? (
                    <div className="event-empty">No events yet</div>
                ) : (
                    events.map(event => (
                        <div key={event.id} className={`event-item ${getEventClass(event.type)}`}>
                            <span className="event-icon">{getEventIcon(event.type)}</span>
                            <span className="event-time">{event.timestamp}</span>
                            <span className="event-message">
                                {formatEventData(event.type, event.data)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default EventLog;
