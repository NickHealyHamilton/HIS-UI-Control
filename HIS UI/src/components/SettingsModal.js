import React, { useState, useEffect } from 'react';
import incubatorService from '../services/incubatorService';
import configService from '../services/configService';
import './SettingsModal.css';

const SettingsModal = ({ isOpen, onClose, onOpenScannerSettings }) => {
    const [config, setConfig] = useState(null);
    const [discoveryData, setDiscoveryData] = useState(null);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [discoveryError, setDiscoveryError] = useState(null);
    const [selectedHisPort, setSelectedHisPort] = useState('');
    const [selectedScannerPort, setSelectedScannerPort] = useState('');
    const [disablePlateCheck, setDisablePlateCheck] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadConfig();
        }
    }, [isOpen]);

    const loadConfig = () => {
        const currentConfig = configService.getConfig();
        setConfig(currentConfig);
        setSelectedHisPort(currentConfig.devices.his?.port || '');
        setSelectedScannerPort(currentConfig.devices.scanner?.port || '');
        setDisablePlateCheck(currentConfig.disablePlateCheck || false);
        
        // Load discovery data from localStorage if it exists
        if (currentConfig.discoveryData) {
            setDiscoveryData(currentConfig.discoveryData);
        }
    };

    const handleDiscoverDevices = async () => {
        setIsDiscovering(true);
        setDiscoveryError(null);
        try {
            const data = await incubatorService.discoverDevices();
            setDiscoveryData(data);
            
            // Save discovery results
            const updatedConfig = configService.saveDiscoveryResults(data);
            setConfig(updatedConfig);
            
            // Auto-populate selections
            setSelectedHisPort(updatedConfig.devices.his?.port || '');
            setSelectedScannerPort(updatedConfig.devices.scanner?.port || '');
        } catch (error) {
            setDiscoveryError(error.message || 'Discovery failed');
            console.error('Device discovery failed:', error);
        } finally {
            setIsDiscovering(false);
        }
    };

    const handleSaveConfig = () => {
        // Update HIS configuration
        const hisDevice = discoveryData?.devices.find(d => d.Port === selectedHisPort);
        configService.updateDeviceConfig(
            'his',
            selectedHisPort,
            hisDevice?.Description || 'HIS Incubator'
        );

        // Update Scanner configuration
        const scannerDevice = discoveryData?.devices.find(d => d.Port === selectedScannerPort);
        configService.updateDeviceConfig(
            'scanner',
            selectedScannerPort,
            scannerDevice?.Description || 'Scanner'
        );

        loadConfig();
        alert('Configuration saved successfully!');
    };

    const getAvailableHisPorts = () => {
        if (!discoveryData) return [];
        return discoveryData.devices.filter(d => d.DeviceType === 'HIS');
    };

    const getAvailableScannerPorts = () => {
        if (!discoveryData) return [];
        return discoveryData.devices.filter(d => d.DeviceType === 'Scanner');
    };

    if (!isOpen) return null;

    const discoveryRequired = configService.isDiscoveryRequired();

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-container settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>
                
                <div className="modal-content settings-content">
                    {/* Consolidated Device Configuration Section */}
                    <section className="settings-section">
                        <h3>⚙️ Device Configuration</h3>
                        <p className="settings-description">
                            {discoveryRequired 
                                ? 'Run device discovery to detect connected devices' 
                                : 'Update COM port assignments for HIS and Scanner devices'}
                        </p>
                        
                        {discoveryRequired && (
                            <div className="warning-banner">
                                ⚠️ Initial device discovery is required before connecting
                            </div>
                        )}

                        <button 
                            className="btn btn-primary"
                            onClick={handleDiscoverDevices}
                            disabled={isDiscovering}
                            style={{ marginBottom: '1rem' }}
                        >
                            {isDiscovering ? 'Discovering Devices...' : 'Run Device Discovery'}
                        </button>

                        {discoveryError && (
                            <div className="error-message">
                                Error: {discoveryError}
                            </div>
                        )}

                        {config && config.discoveryCompleted && (
                            <>
                                <div className="config-group">
                                    <label htmlFor="his-port">HIS Incubator Port:</label>
                                    <select 
                                        id="his-port"
                                        value={selectedHisPort}
                                        onChange={(e) => setSelectedHisPort(e.target.value)}
                                        disabled={!discoveryData}
                                    >
                                        <option value="">Select COM Port</option>
                                        {getAvailableHisPorts().map(device => (
                                            <option key={device.Port} value={device.Port}>
                                                {device.Port} - {device.Description}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="config-group">
                                    <label htmlFor="scanner-port">Scanner Port:</label>
                                    <select 
                                        id="scanner-port"
                                        value={selectedScannerPort}
                                        onChange={(e) => setSelectedScannerPort(e.target.value)}
                                        disabled={!discoveryData}
                                    >
                                        <option value="">Select COM Port (Optional)</option>
                                        {getAvailableScannerPorts().map(device => (
                                            <option key={device.Port} value={device.Port}>
                                                {device.Port} - {device.Description}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="config-status">
                                    <div className="config-item">
                                        <strong>Scanner Mode:</strong>
                                        <span className={config.scannerMode ? 'enabled' : 'disabled'}>
                                            {config.scannerMode ? '✓ Enabled' : '○ Disabled (Manual Entry)'}
                                        </span>
                                    </div>
                                    {config.lastDiscovery && (
                                        <div className="config-item">
                                            <strong>Last Discovery:</strong>
                                            <span>{new Date(config.lastDiscovery).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>

                                {!selectedScannerPort && discoveryData && (
                                    <div className="info-banner">
                                        ℹ️ Scanner mode disabled - Manual barcode entry will be used
                                    </div>
                                )}

                                <button 
                                    className="btn btn-success"
                                    onClick={handleSaveConfig}
                                    disabled={!selectedHisPort || !discoveryData}
                                >
                                    Save Configuration
                                </button>
                            </>
                        )}
                    </section>

                    {/* Scanner Configuration (only if scanner mode enabled) */}
                    {config && config.scannerMode && (
                        <section className="settings-section">
                            <h3>📷 Scanner Configuration</h3>
                            <p className="settings-description">
                                Configure scanner settings and view live camera feed
                            </p>
                            <button 
                                className="btn btn-primary"
                                onClick={onOpenScannerSettings}
                            >
                                Configure Scan Settings
                            </button>
                        </section>
                    )}

                    {/* Plate Check Setting */}
                    <section className="settings-section">
                        <h3>🔧 Advanced Settings</h3>
                        <div className="config-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={disablePlateCheck}
                                    onChange={(e) => {
                                        const newValue = e.target.checked;
                                        setDisablePlateCheck(newValue);
                                        configService.setDisablePlateCheck(newValue);
                                        loadConfig();
                                    }}
                                />
                                <span>Disable plate check</span>
                            </label>
                            <p className="settings-description" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                                Skip fork plate presence verification during load/unload operations
                            </p>
                        </div>
                    </section>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
