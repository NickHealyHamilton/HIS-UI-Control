import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import './styles/hamilton-theme.css';
import './App.css';
import DevTools from './components/dev/DevTools';
import './components/dev/DevTools.css';
import { useIncubatorConnection, useIncubatorStatus, useForkControl } from './hooks/useIncubator';
import ShelfStatus from './components/ShelfStatus';
import ShelfControlModal from './components/ShelfControlModal';
import CSVManagerModal from './components/CSVManagerModal';
import EventLog from './components/EventLog';
import DataViewer from './components/DataViewer';
import DataViewerModal from './components/DataViewerModal';
import SettingsModal from './components/SettingsModal';
import ScannerSettingsModal from './components/ScannerSettingsModal';
import PlateReportModal from './components/PlateReportModal';
import ExportDataModal from './components/ExportDataModal';
import csvLogger from './services/csvLogger';
import incubatorService from './services/incubatorService';
import signalRService from './services/signalRService';
import configService from './services/configService';

function App() {
  const [openModalModule, setOpenModalModule] = useState(null);
  const [showDataViewerModal, setShowDataViewerModal] = useState(false);
  const [showCSVManager, setShowCSVManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showScannerSettings, setShowScannerSettings] = useState(false);
  const [showPlateReport, setShowPlateReport] = useState(false);
  const [plateReportData, setPlateReportData] = useState(null);
  const [showExportData, setShowExportData] = useState(false);
  const [scannerConnected, setScannerConnected] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const [scannerMode, setScannerMode] = useState(true);
  const [deviceConfig, setDeviceConfig] = useState(null);
  const lastCollectionTimeRef = useRef(0);
  const dataPointsCollectedRef = useRef(0);
  
  // Resizable panel widths (in pixels)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(450);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(400);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  
  // Track shaking configuration for each shelf
  const [shelfShakeConfig, setShelfShakeConfig] = useState({
    1: { isPeriodic: false, isTimed: false, periodicity: 0, periodActive: 0 },
    2: { isPeriodic: false, isTimed: false, periodicity: 0, periodActive: 0 },
    3: { isPeriodic: false, isTimed: false, periodicity: 0, periodActive: 0 },
    4: { isPeriodic: false, isTimed: false, periodicity: 0, periodActive: 0 }
  });
  
  // Track barcodes for each shelf
  const [shelfBarcodes, setShelfBarcodes] = useState({
    1: null,
    2: null,
    3: null,
    4: null
  });
  
  // Track plate sessions (for reports)
  const [plateSessions, setPlateSessions] = useState({
    1: null,
    2: null,
    3: null,
    4: null
  });
  
  const { 
    isConnected, 
    isInitialized,
    isLoading: connectionLoading, 
    error: connectionError, 
    isSimulated,
    connect, 
    disconnect, 
    initialize,
    setSimulationMode
  } = useIncubatorConnection();

  // Memoized callback to prevent DataViewer re-renders
  const handleToggleDataViewerFullscreen = useCallback(() => {
    setShowDataViewerModal(true);
  }, []);

  // Handle viewing plate report
  const handleViewPlateReport = useCallback((module) => {
    const session = plateSessions[module];
    if (session && session.endTime) {
      setPlateReportData({ session, module });
      setShowPlateReport(true);
    }
  }, [plateSessions]);

  // Handle opening export data modal
  const handleOpenExportData = useCallback(() => {
    setShowExportData(true);
  }, []);

  // Load device configuration on mount
  useEffect(() => {
    const config = configService.getConfig();
    setDeviceConfig(config);
    setScannerMode(config.scannerMode);
    
    // Force user to settings if discovery hasn't been completed
    if (configService.isDiscoveryRequired()) {
      setShowSettings(true);
    }
  }, []);

  // Reconnect SignalR if backend shows already connected (e.g., after page refresh)
  useEffect(() => {
    if (isConnected && !signalRService.isConnected) {
      signalRService.connect().catch(err => {
        console.error('Failed to reconnect SignalR:', err);
      });
    }
  }, [isConnected]);

  // Combined connect and initialize function
  const handleConnectAndInitialize = async () => {
    try {
      // Check if discovery has been completed
      if (configService.isDiscoveryRequired()) {
        alert('Please run device discovery in Settings before connecting');
        setShowSettings(true);
        return;
      }

      const config = configService.getConfig();
      const hisPort = config.devices.his?.port;
      
      if (!hisPort) {
        alert('HIS device not configured. Please run discovery in Settings.');
        setShowSettings(true);
        return;
      }

      // Connect to SignalR FIRST so we don't miss any events
      try {
        await signalRService.connect();
        console.log('SignalR connected');
      } catch (signalRError) {
        console.error('SignalR connection failed:', signalRError);
      }
      
      // Connect incubator and scanner (if scanner mode enabled) in parallel
      const connectionPromises = [connect(hisPort)];
      
      if (scannerMode && config.devices.scanner?.port) {
        connectionPromises.push(handleConnectScanner(config.devices.scanner.port));
      }
      
      const [incubatorResult] = await Promise.allSettled(connectionPromises);
      
      if (incubatorResult.status === 'rejected') {
        throw incubatorResult.reason;
      }
      
      // Wait a moment for connection to establish, then initialize
      setTimeout(async () => {
        await initialize();
      }, 500);
    } catch (error) {
      console.error('Error during connect and initialize:', error);
    }
  };

  const handleDisconnect = async () => {
    try {
      // Disconnect scanner, SignalR, and incubator
      await Promise.allSettled([
        handleDisconnectScanner(),
        signalRService.disconnect(),
        disconnect()
      ]);
    } catch (error) {
      console.error('Error during disconnect:', error);
    }
  };

  // Scanner connection functions
  const handleConnectScanner = async (comPort) => {
    if (!scannerMode) {
      console.log('Scanner mode disabled - skipping scanner connection');
      return;
    }

    setScannerLoading(true);
    setScannerError(null);
    try {
      await incubatorService.connectScanner(comPort);
      setScannerConnected(true);
      
      // Apply configured ROI immediately after scanner connection
      const roi = configService.getROI();
      console.log('Applying configured ROI:', roi);
      try {
        await incubatorService.setROI(roi.x0, roi.y0, roi.x1, roi.y1);
        console.log('ROI applied successfully');
      } catch (roiError) {
        console.error('Failed to apply ROI:', roiError);
        // Don't fail scanner connection if ROI application fails
      }
    } catch (error) {
      setScannerError(error.message || 'Failed to connect scanner');
      console.error('Scanner connection error:', error);
    } finally {
      setScannerLoading(false);
    }
  };

  const handleDisconnectScanner = async () => {
    setScannerLoading(true);
    setScannerError(null);
    try {
      await incubatorService.disconnectScanner();
      setScannerConnected(false);
    } catch (error) {
      setScannerError(error.message || 'Failed to disconnect scanner');
      console.error('Scanner disconnect error:', error);
    } finally {
      setScannerLoading(false);
    }
  };

  // Poll scanner status when incubator is connected
  useEffect(() => {
    if (!isConnected) {
      setScannerConnected(false);
      return;
    }

    const checkScannerStatus = async () => {
      try {
        const status = await incubatorService.getScannerStatus();
        setScannerConnected(status.isConnected || false);
      } catch (error) {
        // Silently fail - scanner might not be available
        setScannerConnected(false);
      }
    };

    checkScannerStatus();
    const interval = setInterval(checkScannerStatus, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [isConnected]);

  const {
    shelvesStatus,
    isLoading: statusLoading,
    error: statusError,
    refreshStatus
  } = useIncubatorStatus(1000, isConnected); // Poll every 1 second

  // Fork controls
  const {
    forkStatus,
    isLoading: forkLoading,
    error: forkError,
    presentFork,
    parkFork,
    checkLoadedStatus
  } = useForkControl(isConnected, 1000); // Poll every 1 second

  // Use a ref to track the last message content to prevent flashing
  const lastMessagesRef = useRef([]);
  
  const systemMessages = useMemo(() => {
    const messages = [];
    
    // HTTP Errors
    if (connectionError) messages.push({ key: 'conn-err', type: 'error', text: `⚠️ Connection: ${connectionError}` });
    if (statusError) messages.push({ key: 'status-err', type: 'error', text: `⚠️ Status: ${statusError}` });
    // Fork errors disabled - fork controls are hidden
    
    // Shelf Errors & Alarms
    if (isConnected) {
      shelvesStatus.forEach((shelf) => {
        shelf.errors?.forEach((error, idx) => {
          messages.push({ key: `temp-${shelf.module}-${idx}`, type: 'error', text: `⚠️ Shelf ${shelf.module} Temp: ${error}` });
        });
        shelf.shakeErrors?.forEach((error, idx) => {
          messages.push({ key: `shake-${shelf.module}-${idx}`, type: 'error', text: `⚠️ Shelf ${shelf.module} Shake: ${error}` });
        });
      });
    }
    
    // All Clear Message
    if (messages.length === 0 && !statusLoading && !connectionLoading) {
      messages.push({ key: 'all-clear', type: 'info', text: '✓ All systems operational' });
    }
    
    // Only update if the message content has actually changed
    const messageSignature = JSON.stringify(messages.map(m => m.text).sort());
    const lastSignature = JSON.stringify(lastMessagesRef.current.map(m => m.text).sort());
    
    if (messageSignature !== lastSignature) {
      lastMessagesRef.current = messages;
      return messages;
    }
    
    return lastMessagesRef.current;
  }, [connectionError, statusError, shelvesStatus, isConnected, statusLoading, connectionLoading]);

  // Log data points to CSV file every second
  useEffect(() => {
    if (!isConnected || !shelvesStatus || shelvesStatus.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLastCollection = now - lastCollectionTimeRef.current;
    
    // Only collect data if at least 900ms has passed since last collection
    if (timeSinceLastCollection < 900) {
      return;
    }
    
    lastCollectionTimeRef.current = now;
    const timestamp = new Date().toISOString();
    const newDataPoints = shelvesStatus
      .filter(shelf => shelf.platePresent || (shelf.targetTemp !== 0 && shelf.targetTemp != null))
      .map(shelf => ({
        shelf: shelf.module,
        timestamp,
        currentTemp: shelf.currentTemp,
        targetTemp: shelf.targetTemp,
        allowedDeviation: shelf.allowedDeviation,
        currentRPM: shelf.currentRPM,
        targetRPM: shelf.targetRPM,
        platePresent: shelf.platePresent,
        barcode: shelf.platePresent ? (shelfBarcodes[shelf.module] || null) : 'no plate'
      }));
    
    if (newDataPoints.length > 0) {
      // Log each data point to CSV file
      newDataPoints.forEach(dataPoint => {
        csvLogger.logDataPoint(dataPoint, isSimulated);
        dataPointsCollectedRef.current += 1;
      });
    }
  }, [shelvesStatus, isConnected, isSimulated, shelfBarcodes]);

  // Flush CSV buffer when disconnecting or component unmounts
  useEffect(() => {
    return () => {
      // Cleanup: flush any remaining buffered data
      if (csvLogger.buffer.length > 0) {
        csvLogger.flushBuffer(isSimulated);
      }
    };
  }, [isSimulated]);

  // Flush buffer when disconnecting
  useEffect(() => {
    if (!isConnected && csvLogger.buffer.length > 0) {
      csvLogger.flushBuffer(isSimulated);
    }
  }, [isConnected, isSimulated]);

  // Subscribe to scan events to track barcodes
  useEffect(() => {
    const handleScanEvent = (data) => {
      console.log('📷 Scan event received in App.js:', data);
      const { module, barcode } = data;
      if (module >= 1 && module <= 4) {
        console.log(`Setting barcode for shelf ${module}:`, barcode);
        setShelfBarcodes(prev => ({
          ...prev,
          [module]: barcode
        }));
      }
    };

    signalRService.on('scanEvent', handleScanEvent);

    return () => {
      signalRService.off('scanEvent', handleScanEvent);
    };
  }, []);

  // Track plate sessions (when plates are loaded/unloaded)
  useEffect(() => {
    if (!shelvesStatus || shelvesStatus.length === 0) return;

    shelvesStatus.forEach(shelf => {
      const module = shelf.module;
      const currentSession = plateSessions[module];
      
      // Plate just loaded (wasn't present before, now is)
      if (shelf.platePresent && !currentSession) {
        setPlateSessions(prev => ({
          ...prev,
          [module]: {
            barcode: shelfBarcodes[module] || 'Unknown',
            startTime: new Date(),
            endTime: null
          }
        }));
      }
      
      // Plate just unloaded (was present before, now isn't)
      if (!shelf.platePresent && currentSession && !currentSession.endTime) {
        setPlateSessions(prev => ({
          ...prev,
          [module]: {
            ...currentSession,
            endTime: new Date()
          }
        }));
      }
    });
  }, [shelvesStatus, shelfBarcodes, plateSessions]);

  // Handle resize functionality
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingLeft) {
        const newWidth = Math.max(250, Math.min(600, e.clientX));
        setLeftSidebarWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.max(300, Math.min(800, window.innerWidth - e.clientX));
        setRightSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);

  return (
    <div className="App">
      <DevTools />
      
      {/* Settings Gear Icon */}
      <button 
        className="settings-gear-button"
        onClick={() => setShowSettings(true)}
        title="Settings"
      >
        ⚙️
      </button>
      
      {/* Left Sidebar - Consolidated Connection Controls */}
      <div className="left-sidebar" style={{ width: `${leftSidebarWidth}px` }}>
        <section className={`control-card ${isConnected ? 'connected' : 'disconnected'}`}>
          <h2>System Connection</h2>
          
          {/* Status Badges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <div className={`connection-status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '● HIS Connected' : '○ HIS Disconnected'}
            </div>
            {isConnected && (
              <div className={`initialization-status-badge ${isInitialized ? 'initialized' : 'not-initialized'}`}>
                {isInitialized ? '✓ HIS Initialized' : '○ HIS Not Initialized'}
              </div>
            )}
            <div className={`connection-status-badge ${scannerConnected ? 'connected' : 'disconnected'}`}>
              {scannerConnected ? '● Scanner Connected' : '○ Scanner Disconnected'}
            </div>
          </div>

          {/* Device Info */}
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '1rem' }}>
            {deviceConfig && deviceConfig.discoveryCompleted ? (
              <>
                <div>HIS: {deviceConfig.devices.his?.port || 'Not configured'} | {deviceConfig.devices.his?.description || 'Hamilton Incubator'}</div>
                {scannerMode ? (
                  <div>Scanner: {deviceConfig.devices.scanner?.port || 'Not configured'} | {deviceConfig.devices.scanner?.description || 'Cognex DM72'}</div>
                ) : (
                  <div style={{ color: '#ff8800', fontWeight: 600 }}>Scanner: Manual Entry Mode</div>
                )}
              </>
            ) : (
              <div style={{ color: '#dc3545', fontWeight: 600 }}>⚠️ Device discovery required</div>
            )}
          </div>
          
          {/* Simulation Mode Toggle */}
          <div className="simulation-toggle">
            <label>
              <input
                type="checkbox"
                checked={isSimulated}
                onChange={e => setSimulationMode(e.target.checked)}
              />
              Simulation Mode
            </label>
          </div>

          {/* Connection Buttons */}
          <div className="button-group">
            <button 
              onClick={handleConnectAndInitialize} 
              disabled={isInitialized || connectionLoading || scannerLoading}
              className="btn btn-primary"
            >
              {(connectionLoading || scannerLoading) ? 'Connecting...' : 'Connect & Initialize'}
            </button>
            <button 
              onClick={handleDisconnect} 
              disabled={!isConnected || connectionLoading}
              className="btn btn-secondary"
            >
              Disconnect
            </button>
          </div>

          {/* Fork Control Buttons */}
          {isConnected && (
            <div className="button-group" style={{ marginTop: '1rem' }}>
              <button 
                onClick={() => forkStatus.isParked ? presentFork() : parkFork()}
                disabled={forkLoading || !isInitialized}
                className="btn btn-secondary"
              >
                {forkLoading ? 'Moving...' : (forkStatus.isParked ? 'Present Fork' : 'Park Fork')}
              </button>
              <button 
                onClick={checkLoadedStatus}
                disabled={forkLoading || !isInitialized}
                className="btn btn-secondary"
              >
                {forkLoading ? 'Checking...' : 'Check if Plate Loaded'}
              </button>
            </div>
          )}

          {/* Fork Status Display */}
          {isConnected && (
            <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
              Fork: {forkStatus.isParked ? 'Parked' : 'Presented'} | 
              Plate: {forkStatus.hasPlate ? 'Loaded' : 'Empty'}
            </div>
          )}

          {/* Error Messages */}
          {connectionError && (
            <div className="error-message" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {connectionError}
            </div>
          )}
          {scannerError && (
            <div className="error-message" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Scanner: {scannerError}
            </div>
          )}
          {forkError && (
            <div className="error-message" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Fork: {forkError}
            </div>
          )}
        </section>

        {/* Real-time Event Log - Removed from left sidebar, moved to right */}

        {/* System Messages & Status Card - Disabled */}
        {false && (
          <section className={`control-card messages-card ${
            systemMessages.some(m => m.type === 'error') ? 'has-errors' : ''
          }`}>
            <h2>System Status & Messages</h2>
            <div className="messages-content">
              {systemMessages.map(message => (
                <div key={message.key} className={`message-item ${message.type}-message`}>
                  {message.text}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Data Viewer - Permanent Component */}
        {isConnected && (
          <DataViewer 
            isSimulated={isSimulated}
            onToggleFullscreen={handleToggleDataViewerFullscreen}
            onOpenExport={handleOpenExportData}
          />
        )}
      </div>

      {/* Left Resize Handle */}
      <div 
        className="resize-handle resize-handle-left"
        style={{ left: `${leftSidebarWidth}px` }}
        onMouseDown={() => setIsResizingLeft(true)}
      />

      {/* Main Content Area */}
      {isConnected && (
        <div className="main-content" style={{ 
          left: `${leftSidebarWidth + 6}px`,
          right: `${rightSidebarWidth + 6}px`
        }}>
          <section className="shelves-section">
            {/* Status Display Section - Single Vertical Column */}
            <div className="shelves-grid">
              {/* Reverse order so shelf 4 is at top, shelf 1 at bottom */}
              {[...shelvesStatus].reverse().map((shelfStatus) => (
                <div 
                  key={`status-${shelfStatus.module}`} 
                  className={`shelf-status-card ${shelfStatus.platePresent ? 'has-plate' : 'no-plate'}`}
                >
                  <ShelfStatus 
                    status={shelfStatus}
                    shakeConfig={shelfShakeConfig[shelfStatus.module]}
                    barcode={shelfBarcodes[shelfStatus.module]}
                    onOpenControls={() => setOpenModalModule(shelfStatus.module)}
                  />
                </div>
              ))}
            </div>
          </section>
          
          {/* Modal for Shelf Controls */}
          <ShelfControlModal
            isOpen={openModalModule !== null}
            onClose={() => setOpenModalModule(null)}
            module={openModalModule}
            status={shelvesStatus.find(s => s.module === openModalModule)}
            onStatusChange={refreshStatus}
            shakeConfig={shelfShakeConfig[openModalModule]}
            onShakeConfigChange={(config) => setShelfShakeConfig(prev => ({
              ...prev,
              [openModalModule]: config
            }))}
            barcode={shelfBarcodes[openModalModule]}
            plateSession={plateSessions[openModalModule]}
            onViewReport={handleViewPlateReport}
            isSimulated={isSimulated}
          />
        </div>
      )}

      {/* Right Resize Handle */}
      <div 
        className="resize-handle resize-handle-right"
        style={{ right: `${rightSidebarWidth}px` }}
        onMouseDown={() => setIsResizingRight(true)}
      />

      {/* Right Sidebar - Event Log */}
      <div className="right-sidebar" style={{ width: `${rightSidebarWidth}px` }}>
        <section className="control-card event-log-card">
          <EventLog />
        </section>
      </div>

      {/* Data Viewer Fullscreen Modal */}
      <DataViewerModal 
        isOpen={showDataViewerModal}
        isSimulated={isSimulated}
        onClose={() => setShowDataViewerModal(false)}
        onOpenExport={handleOpenExportData}
      />

      {/* Export Data Modal */}
      <ExportDataModal
        isOpen={showExportData}
        onClose={() => setShowExportData(false)}
        isSimulated={isSimulated}
      />

      {/* CSV Manager Modal */}
      <CSVManagerModal 
        isOpen={showCSVManager}
        onClose={() => setShowCSVManager(false)}
      />

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onOpenScannerSettings={() => {
          setShowSettings(false);
          setShowScannerSettings(true);
        }}
      />

      {/* Scanner Settings Modal */}
      <ScannerSettingsModal 
        isOpen={showScannerSettings}
        onClose={() => setShowScannerSettings(false)}
      />

      {/* Plate Report Modal */}
      {plateReportData && (
        <PlateReportModal 
          isOpen={showPlateReport}
          onClose={() => {
            setShowPlateReport(false);
            setPlateReportData(null);
          }}
          session={plateReportData.session}
          module={plateReportData.module}
          isSimulated={isSimulated}
        />
      )}
    </div>
  );
}

export default App;