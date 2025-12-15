import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import csvLogger from '../services/csvLogger';
import './DataPlotModal.css';

const DataPlotModal = ({ isOpen, onClose, isSimulated }) => {
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [csvData, setCSVData] = useState([]);
    const [timeSpanMinutes, setTimeSpanMinutes] = useState(60); // Default 1 hour
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadAvailableFiles();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (selectedFile) {
            loadCSVData(selectedFile);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFile]);

    const loadAvailableFiles = async () => {
        try {
            const availableFiles = await csvLogger.getAvailableFiles();
            // Filter by current mode and sort by date (newest first)
            const modeFilter = isSimulated ? 'simulated' : 'live';
            const filteredFiles = availableFiles
                .filter(f => f.filename.includes(modeFilter))
                .sort((a, b) => b.filename.localeCompare(a.filename));
            
            setFiles(filteredFiles);
            
            // Auto-select today's file if available
            if (filteredFiles.length > 0) {
                setSelectedFile(filteredFiles[0].filename);
            }
        } catch (error) {
            console.error('Error loading files:', error);
        }
    };

    const loadCSVData = async (filename) => {
        setLoading(true);
        try {
            const data = await csvLogger.readCSVFile(filename);
            setCSVData(data);
        } catch (error) {
            console.error('Error loading CSV data:', error);
            setCSVData([]);
        } finally {
            setLoading(false);
        }
    };

    // Prepare data for the chart - filter by time span and combine all shelf data by timestamp
    // Must be called before early return to satisfy React hooks rules
    const chartData = useMemo(() => {
        if (!csvData || csvData.length === 0) {
            return [];
        }

        // Filter by time span (from most recent data point, not current time)
        let filteredData = csvData;
        
        if (timeSpanMinutes > 0) {
            // Find the most recent timestamp in the data
            const mostRecentTime = Math.max(...csvData.map(entry => new Date(entry.timestamp).getTime()));
            const timeSpanMs = timeSpanMinutes * 60 * 1000;
            const cutoffTime = mostRecentTime - timeSpanMs;

            filteredData = csvData.filter(entry => {
                const entryTime = new Date(entry.timestamp).getTime();
                return entryTime >= cutoffTime;
            });
        }

        // Group data points by timestamp
        const timeMap = new Map();
        
        filteredData.forEach(entry => {
            const timeKey = new Date(entry.timestamp).getTime();
            if (!timeMap.has(timeKey)) {
                timeMap.set(timeKey, { 
                    time: new Date(entry.timestamp).toLocaleTimeString(),
                    timestamp: timeKey
                });
            }
            const dataPoint = timeMap.get(timeKey);
            dataPoint[`shelf${entry.shelf}_temp`] = entry.currentTemp;
            dataPoint[`shelf${entry.shelf}_rpm`] = entry.currentRPM;
        });

        return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    }, [csvData, timeSpanMinutes]);

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const timeSpanOptions = [
        { value: 5, label: '5 minutes' },
        { value: 15, label: '15 minutes' },
        { value: 30, label: '30 minutes' },
        { value: 60, label: '1 hour' },
        { value: 120, label: '2 hours' },
        { value: 240, label: '4 hours' },
        { value: 480, label: '8 hours' },
        { value: 1440, label: '24 hours' },
        { value: -1, label: 'All data' }
    ];

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="plot-modal-content">
                <div className="modal-header">
                    <h2>Historical Data - Temperature & RPM</h2>
                    <button 
                        className="modal-close-btn" 
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>
                <div className="plot-modal-body">
                    {/* File Selector and Time Span Controls */}
                    <div className="plot-controls">
                        <div className="control-group">
                            <label htmlFor="file-select">Select File:</label>
                            <select 
                                id="file-select"
                                value={selectedFile || ''} 
                                onChange={(e) => setSelectedFile(e.target.value)}
                                className="file-select"
                            >
                                {files.length === 0 && <option value="">No files available</option>}
                                {files.map(file => (
                                    <option key={file.filename} value={file.filename}>
                                        {file.filename} ({file.rowCount.toLocaleString()} rows)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="control-group">
                            <label htmlFor="timespan-select">Time Span:</label>
                            <select 
                                id="timespan-select"
                                value={timeSpanMinutes} 
                                onChange={(e) => setTimeSpanMinutes(parseInt(e.target.value))}
                                className="timespan-select"
                            >
                                {timeSpanOptions.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="control-info">
                            {loading ? (
                                <span>Loading data...</span>
                            ) : (
                                <span>{chartData.length} data points | {csvData.length} total in file</span>
                            )}
                        </div>
                    </div>

                    {chartData.length > 0 ? (
                        <>
                            {/* Temperature Chart */}
                            <div className="chart-container">
                                <h3>Temperature over Time</h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                                        <XAxis 
                                            dataKey="time" 
                                            stroke="#9ca3af"
                                            tick={{ fill: '#9ca3af' }}
                                        />
                                        <YAxis 
                                            stroke="#9ca3af"
                                            tick={{ fill: '#9ca3af' }}
                                            label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a', color: '#fff' }}
                                        />
                                        <Legend wrapperStyle={{ color: '#9ca3af' }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="shelf1_temp" 
                                            stroke="#00a0f0" 
                                            name="Shelf 1 Temp" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            connectNulls 
                                            isAnimationActive={false}
                                            strokeOpacity={0.9}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="shelf2_temp" 
                                            stroke="#00f091" 
                                            name="Shelf 2 Temp" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            connectNulls 
                                            isAnimationActive={false}
                                            strokeOpacity={0.9}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="shelf3_temp" 
                                            stroke="#ffc107" 
                                            name="Shelf 3 Temp" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            connectNulls 
                                            isAnimationActive={false}
                                            strokeOpacity={0.9}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="shelf4_temp" 
                                            stroke="#dc3545" 
                                            name="Shelf 4 Temp" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            connectNulls 
                                            isAnimationActive={false}
                                            strokeOpacity={0.9}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* RPM Chart */}
                            <div className="chart-container">
                                <h3>RPM over Time</h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                                        <XAxis 
                                            dataKey="time" 
                                            stroke="#9ca3af"
                                            tick={{ fill: '#9ca3af' }}
                                        />
                                        <YAxis 
                                            stroke="#9ca3af"
                                            tick={{ fill: '#9ca3af' }}
                                            label={{ value: 'RPM', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #3a3a3a', color: '#fff' }}
                                        />
                                        <Legend wrapperStyle={{ color: '#9ca3af' }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="shelf1_rpm" 
                                            stroke="#00a0f0" 
                                            name="Shelf 1 RPM" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            connectNulls 
                                            isAnimationActive={false}
                                            strokeOpacity={0.9}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="shelf2_rpm" 
                                            stroke="#00f091" 
                                            name="Shelf 2 RPM" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            connectNulls 
                                            isAnimationActive={false}
                                            strokeOpacity={0.9}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="shelf3_rpm" 
                                            stroke="#ffc107" 
                                            name="Shelf 3 RPM" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            connectNulls 
                                            isAnimationActive={false}
                                            strokeOpacity={0.9}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="shelf4_rpm" 
                                            stroke="#dc3545" 
                                            name="Shelf 4 RPM" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            connectNulls 
                                            isAnimationActive={false}
                                            strokeOpacity={0.9}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    ) : (
                        <div className="no-data-message">
                            <p>No historical data available. Data is collected when plates are present on shelves.</p>
                        </div>
                    )}
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

export default DataPlotModal;
