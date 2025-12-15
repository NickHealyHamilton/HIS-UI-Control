import React from 'react';
import './ForkLoadedWarningModal.css';

const ForkLoadedWarningModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="warning-modal-backdrop" onClick={handleBackdropClick}>
            <div className="warning-modal-content">
                <div className="warning-modal-header">
                    <h2>⚠️ Fork Has Plate Loaded</h2>
                </div>
                <div className="warning-modal-body">
                    <p>
                        The fork currently has a plate loaded. You must unload the plate from the fork 
                        before removing a plate from the shelf.
                    </p>
                    <p className="warning-instruction">
                        Please use the <strong>Fork Controls</strong> to unload the plate, then try again.
                    </p>
                </div>
                <div className="warning-modal-footer">
                    <button 
                        className="btn btn-primary" 
                        onClick={onClose}
                    >
                        OK, I'll Unload the Fork
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ForkLoadedWarningModal;
