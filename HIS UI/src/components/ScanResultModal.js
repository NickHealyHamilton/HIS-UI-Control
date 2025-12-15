import React, { useState } from 'react';
import './ScanResultModal.css';

const ScanResultModal = ({ isOpen, onClose, onProceed, onRescan, scanResult, isLoading, error }) => {
    const [manualBarcode, setManualBarcode] = useState('');
    const [showManualEntry, setShowManualEntry] = useState(false);

    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleProceedWithManual = () => {
        if (manualBarcode.trim()) {
            onProceed(manualBarcode.trim());
        }
    };

    const handleShowManualEntry = () => {
        setShowManualEntry(true);
    };

    const handleCancelManualEntry = () => {
        setShowManualEntry(false);
        setManualBarcode('');
    };

    const formatImageData = (imageData) => {
        if (!imageData || imageData.length === 0) return null;
        
        // If already a data URI, return as-is
        if (typeof imageData === 'string' && imageData.startsWith('data:')) {
            return imageData;
        }
        
        // If it's a base64 string without the data URI prefix, add it
        if (typeof imageData === 'string') {
            return `data:image/jpeg;base64,${imageData}`;
        }
        
        // Convert byte array to base64 if needed (legacy support)
        if (imageData instanceof ArrayBuffer || imageData instanceof Uint8Array) {
            const bytes = new Uint8Array(imageData);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return `data:image/jpeg;base64,${btoa(binary)}`;
        }
        
        return imageData;
    };

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="scan-result-modal-content">
                <div className="modal-header">
                    <h2>Scan Result</h2>
                    <button 
                        className="modal-close-btn" 
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>
                
                <div className="scan-result-modal-body">
                    {isLoading ? (
                        <div className="scan-loading">
                            <div className="spinner"></div>
                            <p>Scanning plate barcode...</p>
                        </div>
                    ) : error ? (
                        <div className="scan-error">
                            <div className="error-icon">⚠️</div>
                            <h3>Scan Failed</h3>
                            <p>{error}</p>
                            
                            {/* Show image even on error if available */}
                            {scanResult && (scanResult.hasImage || scanResult.HasImage) && (scanResult.imageSize || scanResult.ImageSize) && (
                                <div className="scan-image-container">
                                    <h4>Scan Image</h4>
                                    <div className="image-info">
                                        Size: {((scanResult.imageSize || scanResult.ImageSize) / 1024).toFixed(2)} KB
                                    </div>
                                    {scanResult.imageData ? (
                                        <img 
                                            src={formatImageData(scanResult.imageData)} 
                                            alt="Scanned plate" 
                                            className="scan-image"
                                            onError={(e) => {
                                                console.error('Image failed to load', e);
                                                console.log('Image data type:', typeof scanResult.imageData);
                                                console.log('Image data length:', scanResult.imageData?.length);
                                            }}
                                            onLoad={() => console.log('Image loaded successfully')}
                                        />
                                    ) : (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                                            Loading image...
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {!showManualEntry ? (
                                <div className="error-actions">
                                    <button 
                                        className="btn btn-secondary"
                                        onClick={handleShowManualEntry}
                                    >
                                        📝 Enter Barcode Manually
                                    </button>
                                </div>
                            ) : (
                                <div className="manual-entry-section">
                                    <h4>Enter Barcode Manually</h4>
                                    <input
                                        type="text"
                                        className="manual-barcode-input"
                                        placeholder="Enter barcode..."
                                        value={manualBarcode}
                                        onChange={(e) => setManualBarcode(e.target.value)}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' && manualBarcode.trim()) {
                                                handleProceedWithManual();
                                            }
                                        }}
                                        autoFocus
                                    />
                                    <div className="manual-entry-buttons">
                                        <button 
                                            className="btn btn-secondary"
                                            onClick={handleCancelManualEntry}
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            className="btn btn-primary"
                                            onClick={handleProceedWithManual}
                                            disabled={!manualBarcode.trim()}
                                        >
                                            Confirm
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : scanResult ? (
                        <div className="scan-success">
                            <div className="scan-info">
                                <div className="info-row">
                                    <span className="info-label">Status:</span>
                                    <span className={`info-value ${(scanResult.success || scanResult.Success) ? 'success' : 'failed'}`}>
                                        {(scanResult.success || scanResult.Success) ? '✓ Success' : '✗ Failed'}
                                    </span>
                                </div>
                                {(scanResult.barcodeData || scanResult.BarcodeData) && (
                                    <div className="info-row">
                                        <span className="info-label">Barcode:</span>
                                        <span className="info-value barcode-data">{scanResult.barcodeData || scanResult.BarcodeData}</span>
                                    </div>
                                )}
                                {(scanResult.barcodeType || scanResult.BarcodeType) && (
                                    <div className="info-row">
                                        <span className="info-label">Type:</span>
                                        <span className="info-value">{scanResult.barcodeType || scanResult.BarcodeType}</span>
                                    </div>
                                )}
                                {(scanResult.module !== undefined || scanResult.Module !== undefined) && (
                                    <div className="info-row">
                                        <span className="info-label">Target Shelf:</span>
                                        <span className="info-value">Module {scanResult.module ?? scanResult.Module}</span>
                                    </div>
                                )}
                                {(scanResult.timestamp || scanResult.Timestamp) && (
                                    <div className="info-row">
                                        <span className="info-label">Timestamp:</span>
                                        <span className="info-value">
                                            {new Date(scanResult.timestamp || scanResult.Timestamp).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                {(scanResult.isSimulation || scanResult.IsSimulation) && (
                                    <div className="info-row">
                                        <span className="info-label">Mode:</span>
                                        <span className="info-value simulation-badge">⚠️ Simulated</span>
                                    </div>
                                )}
                            </div>

                            {(scanResult.hasImage || scanResult.HasImage) && (scanResult.imageSize || scanResult.ImageSize) && (
                                <div className="scan-image-container">
                                    <h4>Scan Image</h4>
                                    <div className="image-info">
                                        Size: {((scanResult.imageSize || scanResult.ImageSize) / 1024).toFixed(2)} KB
                                    </div>
                                    {scanResult.imageData ? (
                                        <img 
                                            src={formatImageData(scanResult.imageData)} 
                                            alt="Scanned plate" 
                                            className="scan-image"
                                            onError={(e) => {
                                                console.error('Image failed to load', e);
                                                console.log('Image data type:', typeof scanResult.imageData);
                                                console.log('Image data length:', scanResult.imageData?.length);
                                                if (typeof scanResult.imageData === 'string') {
                                                    console.log('Image data preview:', scanResult.imageData.substring(0, 100));
                                                } else {
                                                    console.log('Image data:', scanResult.imageData);
                                                }
                                            }}
                                            onLoad={() => console.log('Image loaded successfully')}
                                        />
                                    ) : (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                                            Loading image...
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className="modal-footer">
                    <button 
                        className="btn btn-secondary" 
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        {error ? 'Quit' : 'Cancel'}
                    </button>
                    {scanResult && (scanResult.success || scanResult.Success) && (
                        <button 
                            className="btn btn-primary" 
                            onClick={() => onProceed(scanResult.barcodeData || scanResult.BarcodeData)}
                            disabled={isLoading}
                        >
                            Confirm & Load Plate
                        </button>
                    )}
                    {(error || (scanResult && !(scanResult.success || scanResult.Success))) && !showManualEntry && (
                        <button 
                            className="btn btn-primary" 
                            onClick={onRescan}
                            disabled={isLoading}
                        >
                            🔄 Rescan
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ScanResultModal;
