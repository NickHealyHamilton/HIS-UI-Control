import React, { useState, useEffect } from 'react';
import csvLogger from '../services/csvLogger';
import './CSVManagerModal.css';

const CSVManagerModal = ({ isOpen, onClose }) => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            refreshFiles();
        }
    }, [isOpen]);

    const refreshFiles = async () => {
        setLoading(true);
        try {
            const availableFiles = await csvLogger.getAvailableFiles();
            setFiles(availableFiles);
        } catch (error) {
            console.error('Error refreshing files:', error);
            setFiles([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (filename) => {
        try {
            const data = await csvLogger.readCSVFile(filename);
            // Convert data array back to CSV format
            const header = 'shelf,timestamp,currentTemp,targetTemp,currentRPM,targetRPM,platePresent';
            const rows = data.map(d => 
                `${d.shelf},${d.timestamp},${d.currentTemp},${d.targetTemp},${d.currentRPM},${d.targetRPM},${d.platePresent}`
            );
            const csvContent = [header, ...rows].join('\n');
            
            // Create blob and download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error downloading file:', error);
            alert('Failed to download file. Check console for details.');
        }
    };

    const handleClearOld = async (days) => {
        if (window.confirm(`Are you sure you want to delete CSV files older than ${days} days?`)) {
            try {
                await csvLogger.clearOldData(days);
                await refreshFiles();
            } catch (error) {
                console.error('Error clearing old files:', error);
                alert('Failed to clear old files. Check console for details.');
            }
        }
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="csv-modal-content">
                <div className="modal-header">
                    <h2>CSV File Manager</h2>
                    <button 
                        className="modal-close-btn" 
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>
                <div className="csv-modal-body">
                    <div className="csv-actions">
                        <button 
                            className="btn btn-secondary" 
                            onClick={refreshFiles}
                            disabled={loading}
                        >
                            🔄 {loading ? 'Loading...' : 'Refresh'}
                        </button>
                        <button 
                            className="btn btn-secondary" 
                            onClick={() => handleClearOld(7)}
                            disabled={loading}
                        >
                            🗑️ Clear Old (7+ days)
                        </button>
                    </div>

                    {loading ? (
                        <div className="no-data-message">
                            <p>Loading files...</p>
                        </div>
                    ) : files.length > 0 ? (
                        <div className="csv-files-list">
                            <table className="csv-table">
                                <thead>
                                    <tr>
                                        <th>Filename</th>
                                        <th>Mode</th>
                                        <th>Date</th>
                                        <th>Rows</th>
                                        <th>Size</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {files.map(file => {
                                        const isSimulated = file.filename.includes('simulated');
                                        const dateMatch = file.filename.match(/\d{4}-\d{2}-\d{2}/);
                                        const date = dateMatch ? dateMatch[0] : 'Unknown';
                                        
                                        return (
                                            <tr key={file.filename}>
                                                <td className="filename">{file.filename}</td>
                                                <td>
                                                    <span className={`mode-badge ${isSimulated ? 'simulated' : 'live'}`}>
                                                        {isSimulated ? 'Simulated' : 'Live'}
                                                    </span>
                                                </td>
                                                <td>{date}</td>
                                                <td>{file.rowCount.toLocaleString()}</td>
                                                <td>{formatBytes(file.size)}</td>
                                                <td>
                                                    <button 
                                                        className="btn btn-small btn-primary"
                                                        onClick={() => handleDownload(file.filename)}
                                                    >
                                                        💾 Download
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="no-data-message">
                            <p>No CSV files available yet. Data will be logged when connected to the incubator.</p>
                        </div>
                    )}

                    <div className="csv-info">
                        <h3>📋 About CSV Logging</h3>
                        <ul>
                            <li>Data is automatically logged every second when plates are present</li>
                            <li>Separate files are created for <strong>Live</strong> and <strong>Simulated</strong> runs</li>
                            <li>A new file is created each day at midnight</li>
                            <li>Data is buffered and written in batches for performance</li>
                            <li>Files are stored in browser localStorage (survives page refresh)</li>
                            <li>Estimated size: ~20-25 MB per 24-hour run (all 4 shelves)</li>
                        </ul>
                    </div>
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

export default CSVManagerModal;
