import React from 'react';
import DataViewer from './DataViewer';
import './DataViewerModal.css';

const DataViewerModal = ({ isOpen, onClose, isSimulated, onOpenExport }) => {
    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="data-viewer-modal-backdrop" onClick={handleBackdropClick}>
            <div className="data-viewer-modal-content" style={{ position: 'relative' }}>
                <button 
                    className="btn btn-primary"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                        onOpenExport();
                    }}
                    style={{
                        position: 'absolute',
                        top: '1.5rem',
                        right: '5rem',
                        zIndex: 1000,
                        padding: '0.5rem 1rem',
                        fontSize: '0.9rem'
                    }}
                >
                    📊 Export Data
                </button>
                <DataViewer 
                    isFullscreen={true} 
                    isSimulated={isSimulated}
                    onToggleFullscreen={onClose} 
                />
            </div>
        </div>
    );
};

export default DataViewerModal;
