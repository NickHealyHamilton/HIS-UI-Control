import $ from 'jquery';

// Expose jQuery globally for SignalR
window.jQuery = $;
window.$ = $;

class SignalRService {
    constructor() {
        this.connection = null;
        this.hubProxy = null;
        this.listeners = {};
        this.isConnected = false;
        this.signalRLoaded = false;
    }

    async loadSignalR() {
        if (this.signalRLoaded) return;
        
        try {
            // Dynamically import SignalR after jQuery is available
            await import('signalr');
            this.signalRLoaded = true;
            console.log('SignalR library loaded');
        } catch (err) {
            console.error('Failed to load SignalR:', err);
            throw err;
        }
    }

    async connect() {
        if (this.isConnected) {
            console.log('SignalR already connected');
            return;
        }

        try {
            // Load SignalR library first
            await this.loadSignalR();
            
            console.log('Attempting to connect to SignalR at http://localhost:5000/signalr');
            
            // Create connection (legacy SignalR)
            this.connection = $.hubConnection('http://localhost:5000/signalr');
            this.hubProxy = this.connection.createHubProxy('incubatorHub');

            // Set up event handlers from backend
            this.hubProxy.on('logEvent', (data) => {
                console.log('✅ Log event received:', data);
                this.emit('logEvent', data);
            });

            this.hubProxy.on('heaterError', (data) => {
                console.log('✅ Heater error received:', data);
                this.emit('heaterError', data);
            });

            this.hubProxy.on('temperatureEvent', (data) => {
                console.log('✅ Temperature event received:', data);
                this.emit('temperatureEvent', data);
            });

            this.hubProxy.on('shakerError', (data) => {
                console.log('✅ Shaker error received:', data);
                this.emit('shakerError', data);
            });

            this.hubProxy.on('scanEvent', (data) => {
                console.log('✅ Scan event received:', data);
                this.emit('scanEvent', data);
            });

            this.hubProxy.on('scanConnectionEvent', (data) => {
                console.log('✅ Scanner connection event received:', data);
                this.emit('scanConnectionEvent', data);
            });

            this.hubProxy.on('hisConnectionEvent', (data) => {
                console.log('✅ HIS connection event received:', data);
                this.emit('hisConnectionEvent', data);
            });

            // Connection lifecycle handlers
            this.connection.reconnecting(() => {
                console.warn('SignalR reconnecting...');
                this.isConnected = false;
            });

            this.connection.reconnected(() => {
                console.log('SignalR reconnected');
                this.isConnected = true;
            });

            this.connection.disconnected(() => {
                console.log('SignalR connection closed');
                this.isConnected = false;
            });

            this.connection.error((error) => {
                console.error('SignalR error:', error);
            });

            // Start connection
            await this.connection.start();
            this.isConnected = true;
            console.log('✅ SignalR connected successfully! Connection ID:', this.connection.id);
            
            // Subscribe to the IncubatorEvents group
            try {
                await this.hubProxy.invoke('Subscribe');
                console.log('✅ Subscribed to IncubatorEvents group');
            } catch (invokeErr) {
                console.error('❌ Failed to subscribe to group:', invokeErr);
            }
            
            console.log('Listening for events: logEvent, heaterError, temperatureEvent, shakerError, scanEvent, scanConnectionEvent, hisConnectionEvent');
        } catch (err) {
            console.error('❌ SignalR connection failed:', err);
            this.isConnected = false;
            throw err;
        }
    }

    async disconnect() {
        if (this.connection) {
            try {
                // Unsubscribe from group before disconnecting
                await this.hubProxy.invoke('Unsubscribe');
                console.log('✅ Unsubscribed from IncubatorEvents group');
                
                this.connection.stop();
                this.isConnected = false;
                console.log('SignalR disconnected');
            } catch (err) {
                console.error('Error disconnecting SignalR:', err);
            }
        }
    }

    // Event emitter pattern for React components
    on(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(callback);
    }

    off(eventName, callback) {
        if (this.listeners[eventName]) {
            this.listeners[eventName] = this.listeners[eventName].filter(
                cb => cb !== callback
            );
        }
    }

    emit(eventName, data) {
        if (this.listeners[eventName]) {
            this.listeners[eventName].forEach(callback => callback(data));
        }
    }

    getConnectionState() {
        if (!this.connection) return 'Disconnected';
        
        // Legacy SignalR connection states
        const states = {
            0: 'Connecting',
            1: 'Connected',
            2: 'Reconnecting',
            4: 'Disconnected'
        };
        
        return states[this.connection.state] || 'Unknown';
    }
}

// Export singleton instance
const signalRServiceInstance = new SignalRService();
export default signalRServiceInstance;
