import React, { useState, useEffect, useRef } from 'react';
import incubatorService from '../services/incubatorService';
import configService from '../services/configService';
import './ScannerSettingsModal.css';

const ScannerSettingsModal = ({ isOpen, onClose }) => {
    const [isStreaming, setIsStreaming] = useState(false);
    const [liveImage, setLiveImage] = useState(null);
    const [error, setError] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const intervalRef = useRef(null);
    
    // ROI selection state
    const [roiStart, setRoiStart] = useState(null);
    const [roiEnd, setRoiEnd] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [roi, setRoi] = useState(null); // Final ROI coordinates {x1, y1, x2, y2}
    const imageRef = useRef(null);
    const containerRef = useRef(null);

    // Enable live image mode when modal opens
    useEffect(() => {
        if (isOpen) {
            enableLiveMode();
        }
        
        return () => {
            // Cleanup when modal closes or unmounts
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            if (isOpen) {
                disableLiveMode();
            }
        };
    }, [isOpen]);

    const enableLiveMode = async () => {
        try {
            setError(null);
            
            // First, move fork to scanning position
            try {
                await incubatorService.moveForkToScanningPosition();
            } catch (forkErr) {
                console.error('Error moving fork to scanning position:', forkErr);
                setError('Failed to move fork to scanning position');
                return; // Don't proceed if fork movement fails
            }
            
            // Then enable live image mode
            await incubatorService.setLiveImageMode(true);
            setIsStreaming(true);
            
            // Start polling for images every 100ms
            intervalRef.current = setInterval(async () => {
                try {
                    const response = await incubatorService.getLiveImage();
                    if (response.imageData) {
                        setLiveImage(response.imageData);
                    }
                } catch (err) {
                    console.error('Error fetching live image:', err);
                    // Don't set error for individual frame failures
                }
            }, 100);
        } catch (err) {
            console.error('Error enabling live mode:', err);
            setError('Failed to enable live image mode');
            setIsStreaming(false);
        }
    };

    const disableLiveMode = async () => {
        try {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            
            await incubatorService.setLiveImageMode(false);
            setIsStreaming(false);
            setLiveImage(null);
        } catch (err) {
            console.error('Error disabling live mode:', err);
        }
    };

    const handleScan = async () => {
        try {
            setIsScanning(true);
            setError(null);
            
            // Turn off live view mode
            await disableLiveMode();
            
            // Perform scan
            const scanResponse = await incubatorService.scan(0); // module 0 for fork
            
            // Get the scanned image
            const imageResponse = await incubatorService.getScanImage();
            
            // Store scan results
            setScanResult({
                barcodeData: scanResponse.BarcodeData || scanResponse.barcodeData,
                barcodeType: scanResponse.BarcodeType || scanResponse.barcodeType,
                imageData: imageResponse.imageData,
                timestamp: scanResponse.Timestamp || scanResponse.timestamp
            });
            
            setIsScanning(false);
        } catch (err) {
            console.error('Error during scan:', err);
            setError('Failed to scan barcode: ' + (err.message || 'Unknown error'));
            setIsScanning(false);
        }
    };

    const handleRestartLiveView = async () => {
        setScanResult(null);
        setError(null);
        await enableLiveMode();
    };

    const handleClose = async () => {
        console.log('handleClose called - disabling live mode...');
        try {
            await disableLiveMode();
            console.log('Live mode disabled successfully');
        } catch (error) {
            console.error('Error disabling live mode:', error);
        }
        setScanResult(null);
        setRoi(null);
        setRoiStart(null);
        setRoiEnd(null);
        console.log('Calling onClose()');
        onClose();
    };

    // ROI Selection Handlers
    const roundToMultipleOf8 = (value) => {
        return Math.round(value / 8) * 8;
    };

    const getImageCoordinates = (e) => {
        if (!imageRef.current || !containerRef.current) return null;
        
        const imgRect = imageRef.current.getBoundingClientRect();
        const img = imageRef.current;
        
        // Get click position relative to the actual image, not the container
        const x = e.clientX - imgRect.left;
        const y = e.clientY - imgRect.top;
        
        // Constrain to image boundaries
        const constrainedX = Math.max(0, Math.min(x, imgRect.width));
        const constrainedY = Math.max(0, Math.min(y, imgRect.height));
        
        // Calculate the actual image pixel coordinates
        // Account for image scaling (displayed size vs actual size)
        const scaleX = img.naturalWidth / imgRect.width;
        const scaleY = img.naturalHeight / imgRect.height;
        
        // Apply 2x multiplier for image compression and round to multiple of 8
        const pixelX = roundToMultipleOf8(Math.round(constrainedX * scaleX) * 2);
        const pixelY = roundToMultipleOf8(Math.round(constrainedY * scaleY) * 2);
        
        return {
            displayX: constrainedX,
            displayY: constrainedY,
            pixelX: pixelX,
            pixelY: pixelY
        };
    };

    const handleMouseDown = (e) => {
        if (!isStreaming) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const coords = getImageCoordinates(e);
        if (!coords) return;
        
        setIsDrawing(true);
        setRoiStart(coords);
        setRoiEnd(coords);
    };

    const handleMouseMove = (e) => {
        if (!isDrawing || !roiStart) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const coords = getImageCoordinates(e);
        if (!coords) return;
        
        setRoiEnd(coords);
    };

    const handleMouseUp = (e) => {
        if (!isDrawing || !roiStart) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const coords = getImageCoordinates(e);
        if (!coords) return;
        
        setIsDrawing(false);
        setRoiEnd(coords);
        
        // Calculate final ROI in pixel coordinates
        const x1 = Math.min(roiStart.pixelX, coords.pixelX);
        const y1 = Math.min(roiStart.pixelY, coords.pixelY);
        const x2 = Math.max(roiStart.pixelX, coords.pixelX);
        const y2 = Math.max(roiStart.pixelY, coords.pixelY);
        
        setRoi({ x1, y1, x2, y2 });
        console.log('ROI Selected (pixel coordinates):', { x1, y1, x2, y2 });
    };

    const clearROI = () => {
        setRoi(null);
        setRoiStart(null);
        setRoiEnd(null);
        setIsDrawing(false);
    };

    const handleSaveROI = async () => {
        if (!roi) return;
        
        try {
            // Save to configuration
            configService.updateROI(roi.x1, roi.y1, roi.x2, roi.y2);
            console.log('ROI saved to configuration:', roi);
            
            // Apply to scanner immediately
            await incubatorService.setROI(roi.x1, roi.y1, roi.x2, roi.y2);
            console.log('ROI applied to scanner successfully');
            
            alert('ROI saved and applied successfully!');
        } catch (error) {
            console.error('Failed to save/apply ROI:', error);
            setError('Failed to save ROI: ' + (error.message || 'Unknown error'));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={(e) => {
            if (e.target === e.currentTarget) {
                handleClose();
            }
        }}>
            <div className="modal-container scanner-settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Scanner Configuration</h2>
                    <button className="btn-close" onClick={handleClose}>×</button>
                </div>
                
                <div className="modal-content scanner-settings-content">
                    <div className="scanner-status">
                        <div className="status-indicator">
                            <span className={`status-dot ${isStreaming ? 'active' : 'inactive'}`}></span>
                            <span className="status-text">
                                {isStreaming ? 'Live feed active' : scanResult ? 'Scan complete' : 'Live feed inactive'}
                            </span>
                        </div>
                        {error && (
                            <div className="error-message">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Show scan result if available */}
                    {scanResult ? (
                        <div className="scan-result-view">
                            <div className="scan-image-container">
                                <img 
                                    src={`data:image/jpeg;base64,${scanResult.imageData}`}
                                    alt="Scanned barcode"
                                    className="scanned-image"
                                />
                            </div>
                            <div className="scan-details">
                                <div className="scan-detail-item">
                                    <strong>Barcode:</strong>
                                    <span className="barcode-value">{scanResult.barcodeData || 'No barcode detected'}</span>
                                </div>
                                {scanResult.barcodeType && (
                                    <div className="scan-detail-item">
                                        <strong>Type:</strong>
                                        <span>{scanResult.barcodeType}</span>
                                    </div>
                                )}
                                <div className="scan-detail-item">
                                    <strong>Timestamp:</strong>
                                    <span>{new Date(scanResult.timestamp).toLocaleString()}</span>
                                </div>
                            </div>
                            <div className="scan-actions">
                                <button 
                                    className="btn btn-primary"
                                    onClick={handleRestartLiveView}
                                >
                                    Restart Live View
                                </button>
                                <button 
                                    className="btn btn-secondary"
                                    onClick={handleClose}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Live feed view */}
                            <div 
                                className="live-image-container" 
                                ref={containerRef}
                            >
                                {liveImage ? (
                                    <div 
                                        style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair' }}
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        onMouseLeave={handleMouseUp}
                                    >
                                        <img 
                                            ref={imageRef}
                                            src={`data:image/jpeg;base64,${liveImage}`}
                                            alt="Live scanner feed"
                                            className="live-image"
                                        />
                                        {/* ROI Overlay */}
                                        {(roiStart && roiEnd) && (
                                            <div 
                                                className="roi-overlay"
                                                style={{
                                                    left: `${Math.min(roiStart.displayX, roiEnd.displayX)}px`,
                                                    top: `${Math.min(roiStart.displayY, roiEnd.displayY)}px`,
                                                    width: `${Math.abs(roiEnd.displayX - roiStart.displayX)}px`,
                                                    height: `${Math.abs(roiEnd.displayY - roiStart.displayY)}px`,
                                                }}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <div className="no-image-placeholder">
                                        <p>Waiting for live feed...</p>
                                    </div>
                                )}
                            </div>

                            <div className="scanner-info">
                                <p className="info-text">
                                    <strong>Note:</strong> Click and drag on the live image to define a Region of Interest (ROI) for barcode scanning.
                                </p>
                                
                                {roi && (
                                    <div className="roi-info">
                                        <h4>Region of Interest (Pixel Coordinates)</h4>
                                        <div className="roi-coords">
                                            <span>Top-Left: ({roi.x1}, {roi.y1})</span>
                                            <span>Bottom-Right: ({roi.x2}, {roi.y2})</span>
                                            <span>Size: {roi.x2 - roi.x1} × {roi.y2 - roi.y1}</span>
                                        </div>
                                        <div className="roi-actions">
                                            <button className="btn btn-secondary btn-sm" onClick={clearROI}>
                                                Clear ROI
                                            </button>
                                            <button className="btn btn-success btn-sm" onClick={handleSaveROI}>
                                                Save ROI
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="modal-footer">
                    {!scanResult && isStreaming && (
                        <button 
                            className="btn btn-primary"
                            onClick={handleScan}
                            disabled={isScanning}
                        >
                            {isScanning ? 'Scanning...' : 'Perform Scan'}
                        </button>
                    )}
                    {!scanResult && (
                        <button className="btn btn-secondary" onClick={handleClose}>
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ScannerSettingsModal;
