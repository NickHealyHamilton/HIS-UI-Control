/**
 * Configuration Service
 * Manages device configuration storage in localStorage
 */

const CONFIG_KEY = 'his_device_config';

const configService = {
    /**
     * Get the current configuration
     */
    getConfig: () => {
        try {
            const config = localStorage.getItem(CONFIG_KEY);
            if (!config) {
                return {
                    discoveryCompleted: false,
                    lastDiscovery: null,
                    scannerMode: true, // Default: scanner enabled
                    devices: {
                        scanner: null,
                        his: null
                    },
                    roi: {
                        x0: 0,
                        y0: 0,
                        x1: 1280,
                        y1: 960
                    }
                };
            }
            return JSON.parse(config);
        } catch (error) {
            console.error('Failed to load configuration:', error);
            return {
                discoveryCompleted: false,
                lastDiscovery: null,
                scannerMode: true, // Default: scanner enabled
                disablePlateCheck: false, // Default: plate check enabled
                devices: {
                    scanner: null,
                    his: null
                },
                roi: {
                    x0: 0,
                    y0: 0,
                    x1: 1280,
                    y1: 960
                }
            };
        }
    },

    /**
     * Save discovery results to configuration
     */
    saveDiscoveryResults: (discoveryData) => {
        try {
            const config = configService.getConfig();
            
            // Find scanner and HIS devices from discovery
            const scannerDevice = discoveryData.devices.find(d => d.DeviceType === 'Scanner');
            const hisDevice = discoveryData.devices.find(d => d.DeviceType === 'HIS');
            
            const updatedConfig = {
                ...config,
                discoveryCompleted: true,
                lastDiscovery: discoveryData.timestamp,
                scannerMode: !!scannerDevice, // Enable scanner mode only if scanner found
                discoveryData: discoveryData, // Store full discovery data for dropdown population
                devices: {
                    scanner: scannerDevice ? {
                        port: scannerDevice.Port,
                        description: scannerDevice.Description
                    } : null,
                    his: hisDevice ? {
                        port: hisDevice.Port,
                        description: hisDevice.Description
                    } : null
                }
            };
            
            localStorage.setItem(CONFIG_KEY, JSON.stringify(updatedConfig));
            return updatedConfig;
        } catch (error) {
            console.error('Failed to save configuration:', error);
            throw error;
        }
    },

    /**
     * Update device configuration manually
     */
    updateDeviceConfig: (deviceType, port, description) => {
        try {
            const config = configService.getConfig();
            config.devices[deviceType] = port ? { port, description } : null;
            
            // Update scanner mode based on scanner presence
            if (deviceType === 'scanner') {
                config.scannerMode = !!port;
            }
            
            localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            return config;
        } catch (error) {
            console.error('Failed to update device configuration:', error);
            throw error;
        }
    },

    /**
     * Check if initial discovery is required
     */
    isDiscoveryRequired: () => {
        const config = configService.getConfig();
        return !config.discoveryCompleted || !config.devices.his;
    },

    /**
     * Clear all configuration (reset to defaults)
     */
    clearConfig: () => {
        localStorage.removeItem(CONFIG_KEY);
    },

    /**
     * Get configured COM port for a device
     */
    getDevicePort: (deviceType) => {
        const config = configService.getConfig();
        return config.devices[deviceType]?.port || null;
    },

    /**
     * Check if scanner mode is enabled
     */
    isScannerModeEnabled: () => {
        const config = configService.getConfig();
        return config.scannerMode;
    },

    /**
     * Update ROI configuration
     */
    updateROI: (x0, y0, x1, y1) => {
        try {
            const config = configService.getConfig();
            const updatedConfig = {
                ...config,
                roi: { x0, y0, x1, y1 }
            };
            localStorage.setItem(CONFIG_KEY, JSON.stringify(updatedConfig));
            return updatedConfig;
        } catch (error) {
            console.error('Failed to update ROI configuration:', error);
            throw error;
        }
    },

    /**
     * Get the ROI configuration
     */
    getROI: () => {
        const config = configService.getConfig();
        return config.roi || { x0: 0, y0: 0, x1: 1280, y1: 960 };
    },

    /**
     * Update plate check setting
     */
    setDisablePlateCheck: (disabled) => {
        try {
            const config = configService.getConfig();
            config.disablePlateCheck = disabled;
            localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            return config;
        } catch (error) {
            console.error('Failed to update plate check setting:', error);
            throw error;
        }
    }
};

export default configService;
