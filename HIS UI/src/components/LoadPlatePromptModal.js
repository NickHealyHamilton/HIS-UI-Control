import React from 'react';
import './LoadPlatePromptModal.css';

const LoadPlatePromptModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="prompt-modal-backdrop" onClick={handleBackdropClick}>
            <div className="prompt-modal-content">
                <div className="prompt-modal-header">
                    <h2>📋 Load Plate onto Fork</h2>
                </div>
                <div className="prompt-modal-body">
                    <p className="prompt-instruction">
                        Please place a plate onto the presented fork.
                    </p>
                    <p className="prompt-details">
                        Once the plate is securely loaded onto the fork, click <strong>"Done"</strong> below.
                        The system will verify the plate is loaded before proceeding.
                    </p>
                </div>
                <div className="prompt-modal-footer">
                    <button 
                        className="btn btn-primary" 
                        onClick={onClose}
                    >
                        Done - Plate is Loaded
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoadPlatePromptModal;
