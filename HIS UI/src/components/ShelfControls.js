import React, { useState } from 'react';
import incubatorService from '../services/incubatorService';
import signalRService from '../services/signalRService';
import configService from '../services/configService';
import ForkLoadedWarningModal from './ForkLoadedWarningModal';
import LoadPlatePromptModal from './LoadPlatePromptModal';
import ScanResultModal from './ScanResultModal';

const ShelfControls = ({ module, status, onStatusChange, shakeConfig, onShakeConfigChange, barcode, plateSession, onViewReport, isSimulated }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showForkWarning, setShowForkWarning] = useState(false);
    const [showLoadPrompt, setShowLoadPrompt] = useState(false);
    const [showScanModal, setShowScanModal] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState(null);
    const [forkHasPlate, setForkHasPlate] = useState(false);
    
    // Determine if temperature/shaking is active from status
    // Temperature is active if targetTemp is non-zero
    const isTempActive = (status?.targetTemp ?? 0) !== 0;
    
    // Shaking is active based on shakeStatusCode:
    // 0 = inactive, 1 = continuous active, 2 = periodic active
    // For periodic mode (statusCode 2), RPM may be 0 during off cycles
    const isShakingActive = (status?.shakeStatusCode ?? 0) > 0;
    
    // Check if shelf has a plate
    const hasPlate = status?.platePresent ?? false;
    
    // Determine if unload is allowed (only shaking must be inactive)
    const canUnload = hasPlate && !isShakingActive;
    
    // Determine if load is allowed
    const canLoad = !hasPlate && !isShakingActive;
    
    // Temperature Control State
    const [tempParams, setTempParams] = useState({
        targetTemp: 37.0,
        allowedDeviation: 3.0
    });

    // Shaking Control State
    const [indefiniteShake, setIndefiniteShake] = useState(true);
    const [periodicShake, setPeriodicShake] = useState(false);
    const [shakeParams, setShakeParams] = useState({
        rpm: 300,
        shakeTime: 0, // 0 = indefinite
        periodicity: 0,
        periodActive: 0
    });

    const handleStartTemp = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Backend handles all conversions - send values as-is in degrees
            const params = {
                targetTemp: tempParams.targetTemp,
                allowedDeviation: tempParams.allowedDeviation,
                fan: true // Always enable active ventilation
            };
            console.log('Starting temperature control:', {
                module,
                userInput: tempParams,
                sentToBackend: params
            });
            await incubatorService.startTemperature(module, params);
            onStatusChange?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStopTemp = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await incubatorService.stopTemperature(module);
            // Set target temp to 0 to indicate inactive
            setTempParams(prev => ({
                ...prev,
                targetTemp: 0
            }));
            onStatusChange?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartShaking = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Validate periodic settings
            if (periodicShake && shakeParams.periodActive >= shakeParams.periodicity) {
                setError('Period Active time must be less than total Periodicity');
                setIsLoading(false);
                return;
            }
            
            const params = {
                TargetRPM: shakeParams.rpm,
                ShakeTime: indefiniteShake ? 0 : shakeParams.shakeTime,
                Periodicity: periodicShake ? shakeParams.periodicity : 0,
                PeriodActive: periodicShake ? shakeParams.periodActive : 0
            };
            
            // Save the shake configuration
            onShakeConfigChange?.({
                isPeriodic: periodicShake,
                isTimed: !indefiniteShake,
                periodicity: periodicShake ? shakeParams.periodicity : 0,
                periodActive: periodicShake ? shakeParams.periodActive : 0
            });
            
            await incubatorService.startShaking(module, params);
            onStatusChange?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStopShaking = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await incubatorService.stopShaking(module);
            
            // Clear the shake configuration
            onShakeConfigChange?.({
                isPeriodic: false,
                isTimed: false,
                periodicity: 0,
                periodActive: 0
            });
            
            onStatusChange?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnloadPlate = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Check if plate check is disabled
            const config = configService.getConfig();
            
            // In simulation mode or if plate check disabled, skip fork check and proceed directly
            if (isSimulated || config.disablePlateCheck) {
                await incubatorService.removePlate(module);
                onStatusChange?.();
                setIsLoading(false);
                return;
            }
            
            // Live mode with plate check enabled: check if fork has a plate loaded
            const forkStatus = await incubatorService.getForkLoadedStatus();
            
            if (forkStatus.hasPlate) {
                // Fork has plate, show warning
                setForkHasPlate(true);
                setShowForkWarning(true);
                return;
            }
            
            // Fork is clear, proceed with unload
            await incubatorService.removePlate(module);
            onStatusChange?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoadPlate = async () => {
        setIsLoading(true);
        setError(null);
        
        try {
            // Check if plate check is disabled
            const config = configService.getConfig();
            
            // If plate checks are disabled, skip directly to scanning
            if (config.disablePlateCheck) {
                // Present fork if needed (skip in simulation)
                if (!isSimulated) {
                    const forkStatus = await incubatorService.getForkStatus();
                    if (forkStatus.isParked) {
                        await incubatorService.presentFork();
                    }
                }
                // Skip the load prompt and go straight to scanning
                await moveToScanningAndScan();
                return;
            }
            
            // In simulation mode, skip fork checks and proceed directly
            if (isSimulated) {
                // Show prompt for user to acknowledge plate loading in simulation
                setShowLoadPrompt(true);
                return;
            }
            
            // Live mode: check if fork is parked
            const forkStatus = await incubatorService.getForkStatus();
            
            // If fork is parked, present it
            if (forkStatus.isParked) {
                await incubatorService.presentFork();
            }
            
            // Show prompt for user to load plate
            setShowLoadPrompt(true);
        } catch (err) {
            setError(err.message);
            setIsLoading(false);
        }
    };

    const handleLoadPromptClose = async () => {
        setShowLoadPrompt(false);
        try {
            // Check if plate check is disabled
            const config = configService.getConfig();
            
            // Check if fork has plate loaded (skip check in simulation mode or if disabled)
            let forkStatus;
            if (isSimulated || config.disablePlateCheck) {
                // In simulation or with plate check disabled, assume fork has plate after prompt
                forkStatus = { hasPlate: true };
            } else {
                forkStatus = await incubatorService.getForkLoadedStatus();
            }
            
            if (!forkStatus.hasPlate) {
                setError('Plate not detected on fork. Please ensure plate is loaded.');
                setIsLoading(false);
                return;
            }
            
            // Fork has plate, now move to scanning position and scan
            await moveToScanningAndScan();
        } catch (err) {
            setError(err.message);
            setIsLoading(false);
        }
    };

    const moveToScanningAndScan = async () => {
        setScanError(null);
        setScanResult(null);
        
        try {
            // Move fork to scanning position (skip in simulation)
            if (!isSimulated) {
                await incubatorService.moveForkToScanningPosition();
            }
            
            // Show scan modal and start scanning
            setShowScanModal(true);
            performScan();
        } catch (err) {
            setError(err.message);
            setIsLoading(false);
        }
    };

    const performScan = async () => {
        setIsScanning(true);
        setScanError(null);
        
        try {
            // Trigger scan with module number
            const result = await incubatorService.scan(module);
            setScanResult(result);
            
            // If scan has image, fetch the full image data (check both camelCase and PascalCase)
            if (result.hasImage || result.HasImage) {
                try {
                    const imageData = await incubatorService.getScanImage();
                    console.log('Image data received:', typeof imageData, imageData);
                    
                    // Extract the actual base64 string from the response
                    let base64String = imageData;
                    
                    // If response is an object, try to extract the base64 string
                    if (typeof imageData === 'object' && imageData !== null) {
                        base64String = imageData.imageData || imageData.ImageData || imageData.data || imageData;
                    }
                    
                    console.log('Processed base64 string:', typeof base64String, base64String?.substring?.(0, 50));
                    setScanResult(prev => ({ ...prev, imageData: base64String }));
                } catch (imgErr) {
                    console.error('Failed to fetch scan image:', imgErr);
                }
            }
        } catch (err) {
            setScanError(err.message || 'Failed to scan plate');
        } finally {
            setIsScanning(false);
        }
    };

    const handleScanComplete = async (barcodeData) => {
        setShowScanModal(false);
        
        try {
            // Emit scan event with the module number (since backend doesn't know which shelf)
            signalRService.emit('scanEvent', {
                module: module,
                barcode: barcodeData,
                timestamp: new Date().toISOString()
            });
            
            // Proceed with loading plate to shelf with barcode data
            await incubatorService.loadPlate(module);
            
            console.log(`Plate loaded to module ${module} with barcode: ${barcodeData}`);
            
            onStatusChange?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRescan = () => {
        // Reset scan state and trigger new scan
        setScanResult(null);
        setScanError(null);
        performScan();
    };

    const handleScanCancel = () => {
        // User quit the scanning process
        setShowScanModal(false);
        setScanResult(null);
        setIsLoading(false);
    };

    const handleWarningClose = async () => {
        setShowForkWarning(false);
        setForkHasPlate(false);
        // Check again after user closes warning
        try {
            const forkStatus = await incubatorService.getForkLoadedStatus();
            if (!forkStatus.hasPlate) {
                // Fork is now clear, proceed with unload
                await handleUnloadPlate();
            }
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="shelf-controls">
            {error && <div className="error-message">{error}</div>}
            
            {/* Temperature and Shaking Controls Side-by-Side */}
            <div className="control-groups-row">
                <div className="temperature-controls">
                    <h4>
                        Temperature Control
                        <span className={`control-status-badge ${isTempActive ? 'active' : 'inactive'}`}>
                            {isTempActive ? 'Active' : 'Inactive'}
                        </span>
                    </h4>
                <div className="control-inputs">
                    <div className="input-group">
                        <label>Target Temperature (°C)</label>
                        <input
                            type="number"
                            value={tempParams.targetTemp}
                            onChange={(e) => setTempParams({
                                ...tempParams,
                                targetTemp: parseFloat(e.target.value)
                            })}
                            step="0.1"
                            disabled={isTempActive}
                        />
                    </div>
                    <div className="input-group">
                        <label>Allowed Deviation (°C)</label>
                        <input
                            type="number"
                            value={tempParams.allowedDeviation}
                            onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (value >= 0.5 && value <= 10) {
                                    setTempParams({
                                        ...tempParams,
                                        allowedDeviation: value
                                    });
                                }
                            }}
                            step="0.5"
                            min="0.5"
                            max="10"
                            disabled={isTempActive}
                        />
                    </div>
                </div>
                <div className="button-group-horizontal">
                    <button 
                        onClick={handleStartTemp}
                        disabled={isLoading || isTempActive}
                        className="btn btn-primary"
                    >
                        Start Temperature Control
                    </button>
                    <button 
                        onClick={handleStopTemp}
                        disabled={isLoading || !isTempActive}
                        className="btn btn-secondary"
                    >
                        Stop Temperature Control
                    </button>
                </div>
            </div>

                {hasPlate ? (
                <div className="shaking-controls">
                    <h4>
                        Shaking Control
                    <span className={`control-status-badge ${isShakingActive ? 'active' : 'inactive'}`}>
                        {isShakingActive ? 'Active' : 'Inactive'}
                    </span>
                </h4>
                <div className="control-inputs">
                    <div className="input-group">
                        <label>RPM</label>
                        <input
                            type="number"
                            value={shakeParams.rpm}
                            onChange={(e) => setShakeParams({
                                ...shakeParams,
                                rpm: parseInt(e.target.value) || 0
                            })}
                            disabled={isShakingActive}
                        />
                    </div>
                    <div className="input-group checkbox-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={indefiniteShake}
                                onChange={(e) => setIndefiniteShake(e.target.checked)}
                                disabled={isShakingActive}
                            />
                            Shake Indefinitely
                        </label>
                    </div>
                    {!indefiniteShake && (
                        <div className="input-group">
                            <label>Total Duration (seconds)</label>
                            <input
                                type="number"
                                value={shakeParams.shakeTime}
                                onChange={(e) => setShakeParams({
                                    ...shakeParams,
                                    shakeTime: parseInt(e.target.value) || 0
                                })}
                                disabled={isShakingActive}
                            />
                        </div>
                    )}
                    <div className="input-group checkbox-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={periodicShake}
                                onChange={(e) => setPeriodicShake(e.target.checked)}
                                disabled={isShakingActive}
                            />
                            Periodic Shaking
                        </label>
                    </div>
                    {periodicShake && (
                        <div className="periodic-params-group">
                            <div className="input-group">
                                <label>Period Duration (seconds)</label>
                                <input
                                    type="number"
                                    value={shakeParams.periodicity}
                                    onChange={(e) => setShakeParams({
                                        ...shakeParams,
                                        periodicity: parseInt(e.target.value) || 0
                                    })}
                                    disabled={isShakingActive}
                                />
                            </div>
                            <div className="input-group">
                                <label>Active Time per Period (seconds)</label>
                                <input
                                    type="number"
                                    value={shakeParams.periodActive}
                                    onChange={(e) => {
                                        const value = parseInt(e.target.value) || 0;
                                        setShakeParams({
                                            ...shakeParams,
                                            periodActive: value
                                        });
                                    }}
                                    disabled={isShakingActive}
                                />
                            </div>
                            {shakeParams.periodActive >= shakeParams.periodicity && shakeParams.periodicity > 0 && (
                                <div className="validation-warning">
                                    ⚠️ Active time must be less than period duration
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="button-group-horizontal">
                    <button 
                        onClick={handleStartShaking}
                        disabled={isLoading || isShakingActive || (periodicShake && shakeParams.periodActive >= shakeParams.periodicity)}
                        className="btn btn-primary"
                    >
                        Start Shaking
                    </button>
                    <button 
                        onClick={handleStopShaking}
                        disabled={isLoading || !isShakingActive}
                        className="btn btn-secondary"
                    >
                        Stop Shaking
                    </button>
                </div>
                </div>
                ) : (
                <div className="shaking-controls">
                    <h4>Shaking Control</h4>
                    <div className="status-inactive">
                        Shaking control requires a plate to be present on the shelf
                    </div>
                </div>
                )}
            </div>
            
            {/* Plate Management Control - Full Width Below */}
            {(canLoad || canUnload) && (
                <div className="plate-management-wrapper">
                    <div className="plate-management-controls">
                        <h4>Plate Management</h4>
                
                {canLoad && (
                        <div className="plate-action-section">
                            <div className="plate-info-text">
                                <p>ℹ️ Ready to load plate onto shelf</p>
                            </div>
                            <button 
                                onClick={handleLoadPlate}
                                disabled={isLoading}
                                className="btn btn-primary plate-action-btn"
                            >
                                Load Plate to Shelf
                            </button>
                        </div>
                    )}
                    
                    {canUnload && (
                        <div className="plate-action-section">
                            <div className="unload-warning-text">
                                <p>⚠️ Ensure fork is unloaded before removing plate from shelf</p>
                            </div>
                            <button 
                                onClick={handleUnloadPlate}
                                disabled={isLoading}
                                className={`btn plate-action-btn ${forkHasPlate ? 'btn-danger' : 'btn-secondary'}`}
                            >
                                Unload Plate from Shelf
                            </button>
                        </div>
                    )}
                    
                    {plateSession && plateSession.endTime && onViewReport && barcode && !status.platePresent && (
                        <div className="plate-action-section">
                            <div className="plate-info-text">
                                <p>📊 Plate session completed - View report to see data</p>
                            </div>
                            <button 
                                onClick={() => onViewReport(module)}
                                className="btn btn-primary plate-action-btn"
                                title="View plate report"
                            >
                                📊 View Plate Report
                            </button>
                        </div>
                    )}
                    </div>
                </div>
            )}

            {/* Fork Loaded Warning Modal */}
            <ForkLoadedWarningModal
                isOpen={showForkWarning}
                onClose={handleWarningClose}
            />
            
            {/* Scan Result Modal */}
            <ScanResultModal
                isOpen={showScanModal}
                onClose={handleScanCancel}
                onProceed={handleScanComplete}
                onRescan={handleRescan}
                scanResult={scanResult}
                isLoading={isScanning}
                error={scanError}
            />
            
            {/* Load Plate Prompt Modal */}
            <LoadPlatePromptModal
                isOpen={showLoadPrompt}
                onClose={handleLoadPromptClose}
            />
        </div>
    );
};

export default ShelfControls;