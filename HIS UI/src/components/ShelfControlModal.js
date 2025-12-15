import React from 'react';
import ShelfControls from './ShelfControls';
import './ShelfControlModal.css';

const ShelfControlModal = ({ isOpen, onClose, module, status, onStatusChange, shakeConfig, onShakeConfigChange, barcode, plateSession, onViewReport, isSimulated }) => {
    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Shelf {module} Control Panel</h2>
                    <button 
                        className="modal-close-btn" 
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>
                <div className="modal-body">
                    <ShelfControls 
                        module={module}
                        status={status}
                        onStatusChange={onStatusChange}
                        shakeConfig={shakeConfig}
                        onShakeConfigChange={onShakeConfigChange}
                        barcode={barcode}
                        plateSession={plateSession}
                        onViewReport={onViewReport}
                        isSimulated={isSimulated}
                    />
                </div>
                <div className="modal-footer">
                    <button 
                        className="btn btn-secondary" 
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShelfControlModal;
