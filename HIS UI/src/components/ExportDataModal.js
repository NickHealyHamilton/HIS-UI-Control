import React, { useState, useEffect } from 'react';
import incubatorService from '../services/incubatorService';
import PlateReportModal from './PlateReportModal';
import './ExportDataModal.css';

const ExportDataModal = ({ isOpen, onClose, isSimulated }) => {
    const [exportMode, setExportMode] = useState('barcode'); // 'barcode' or 'shelf'
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedBarcode, setSelectedBarcode] = useState('');
    const [selectedShelf, setSelectedShelf] = useState(1);
    const [availableBarcodes, setAvailableBarcodes] = useState([]);
    const [loadingBarcodes, setLoadingBarcodes] = useState(false);
    const [showReport, setShowReport] = useState(false);
    const [reportConfig, setReportConfig] = useState(null);

    // Initialize date range when modal opens
    useEffect(() => {
        if (isOpen) {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 7); // Default to last 7 days
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(end.toISOString().split('T')[0]);
        }
    }, [isOpen]);

    // Load available barcodes when date range changes (barcode mode only)
    useEffect(() => {
        if (!isOpen || exportMode !== 'barcode') return;
        if (!startDate || !endDate) return;

        const loadBarcodes = async () => {
            setLoadingBarcodes(true);
            try {
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                const startTime = start.getTime();
                const endTime = end.getTime();

                // Get CSV files - parse all incubator files regardless of simulation mode
                const allFiles = await incubatorService.listCSVFiles();
                const files = allFiles.filter(file =>
                    file.filename && file.filename.toLowerCase().startsWith('incubator_')
                );

                const barcodesSet = new Set();

                // Parse each CSV file to extract unique barcodes
                for (const file of files) {
                    try {
                        const fileData = await incubatorService.readCSVFile(file.filename);
                        if (!fileData) continue;

                        const lines = fileData.split('\n').filter(line => line.trim());
                        if (lines.length < 2) continue;

                        // Parse CSV rows (skip header)
                        for (let i = 1; i < lines.length; i++) {
                            // Handle CSV with potential quoted fields
                            const values = lines[i].match(/(?:"([^"]*)"|([^,]+)|(?<=,)(?=,)|(?<=,)$)/g)
                                ?.map(v => v?.replace(/^"|"$/g, '').trim()) || [];

                            if (values.length < 8) continue;

                            const timestampStr = values[1];
                            const barcode = values[7];

                            // Skip if no barcode
                            if (!barcode || barcode === 'null' || barcode === '') continue;

                            // Check if timestamp is within range
                            const timestamp = new Date(timestampStr);
                            if (isNaN(timestamp.getTime())) continue;

                            const timestampMs = timestamp.getTime();
                            if (timestampMs >= startTime && timestampMs <= endTime) {
                                barcodesSet.add(barcode);
                            }
                        }
                    } catch (err) {
                        console.error(`Error parsing file ${file.filename}:`, err);
                    }
                }

                // Convert to sorted array
                const barcodes = Array.from(barcodesSet).sort();
                setAvailableBarcodes(barcodes);

                if (barcodes.length > 0 && !selectedBarcode) {
                    setSelectedBarcode(barcodes[0]);
                }
            } catch (error) {
                console.error('Error loading barcodes:', error);
                setAvailableBarcodes([]);
            } finally {
                setLoadingBarcodes(false);
            }
        };

        loadBarcodes();
    }, [isOpen, exportMode, startDate, endDate, isSimulated, selectedBarcode]);

    const handleExport = () => {
        if (exportMode === 'barcode') {
            if (!selectedBarcode) {
                alert('Please select a barcode');
                return;
            }
            // Show report for barcode
            setReportConfig({
                mode: 'barcode',
                barcode: selectedBarcode,
                startDate,
                endDate
            });
        } else {
            // Show report for shelf
            setReportConfig({
                mode: 'shelf',
                module: selectedShelf,
                startDate,
                endDate
            });
        }
        setShowReport(true);
    };

    const handleCloseReport = () => {
        setShowReport(false);
        setReportConfig(null);
    };

    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <>
            <div className="export-modal-backdrop" onClick={handleBackdropClick}>
                <div className="export-modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="export-modal-header">
                        <h2>Export Data</h2>
                        <button className="btn-close" onClick={onClose}>×</button>
                    </div>

                    <div className="export-modal-body">
                        {/* Export Mode Selection */}
                        <div className="export-mode-selector">
                            <label className="mode-option">
                                <input
                                    type="radio"
                                    value="barcode"
                                    checked={exportMode === 'barcode'}
                                    onChange={(e) => setExportMode(e.target.value)}
                                />
                                <span>Export by Barcode</span>
                            </label>
                            <label className="mode-option">
                                <input
                                    type="radio"
                                    value="shelf"
                                    checked={exportMode === 'shelf'}
                                    onChange={(e) => setExportMode(e.target.value)}
                                />
                                <span>Export by Shelf</span>
                            </label>
                        </div>

                        {/* Date Range Selection */}
                        <div className="date-range-section">
                            <h3>Date Range</h3>
                            <div className="date-inputs">
                                <div className="input-group">
                                    <label>Start Date:</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </div>
                                <div className="input-group">
                                    <label>End Date:</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Barcode Mode */}
                        {exportMode === 'barcode' && (
                            <div className="selection-section">
                                <h3>Select Barcode</h3>
                                {loadingBarcodes ? (
                                    <div className="loading-text">Loading barcodes...</div>
                                ) : availableBarcodes.length === 0 ? (
                                    <div className="empty-text">No barcodes found in selected date range</div>
                                ) : (
                                    <select
                                        value={selectedBarcode}
                                        onChange={(e) => setSelectedBarcode(e.target.value)}
                                        className="barcode-select"
                                    >
                                        {availableBarcodes.map(bc => (
                                            <option key={bc} value={bc}>{bc}</option>
                                        ))}
                                    </select>
                                )}
                                <p className="info-text">
                                    Export all data for the selected barcode across all shelves
                                </p>
                            </div>
                        )}

                        {/* Shelf Mode */}
                        {exportMode === 'shelf' && (
                            <div className="selection-section">
                                <h3>Select Shelf</h3>
                                <select
                                    value={selectedShelf}
                                    onChange={(e) => setSelectedShelf(parseInt(e.target.value))}
                                    className="shelf-select"
                                >
                                    <option value={1}>Shelf 1</option>
                                    <option value={2}>Shelf 2</option>
                                    <option value={3}>Shelf 3</option>
                                    <option value={4}>Shelf 4</option>
                                </select>
                                <p className="info-text">
                                    Export all data for the selected shelf within the date range
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="export-modal-footer">
                        <button className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleExport}
                            disabled={exportMode === 'barcode' && (!selectedBarcode || loadingBarcodes)}
                        >
                            Generate Report
                        </button>
                    </div>
                </div>
            </div>

            {/* Report Modal */}
            {showReport && reportConfig && (
                <PlateReportModal
                    isOpen={showReport}
                    onClose={handleCloseReport}
                    session={null}
                    module={reportConfig.mode === 'shelf' ? reportConfig.module : null}
                    isSimulated={isSimulated}
                    exportMode={reportConfig.mode}
                    barcode={reportConfig.mode === 'barcode' ? reportConfig.barcode : null}
                    startDate={reportConfig.startDate}
                    endDate={reportConfig.endDate}
                />
            )}
        </>
    );
};

export default ExportDataModal;
