import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import incubatorService from '../services/incubatorService';
import './DataViewer.css';

const DataViewer = ({ isFullscreen = false, isSimulated = false, onToggleFullscreen, onOpenExport }) => {
    const [timespan, setTimespan] = useState('1h'); // 1h, 6h, 24h, 7d, 30d, all
    const [chartData, setChartData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [shelfVisibility, setShelfVisibility] = useState({
        1: true,
        2: true,
        3: true,
        4: true
    });

    // Hamilton color palette (memoized to prevent recreation)
    const shelfColors = useMemo(() => ({
        1: '#4cc2ee', // Hamilton enabling green
        2: '#00f091', // Hamilton trusted blue
        3: '#1c2d57', // Hamilton orange
        4: '#00858f'  // Hamilton purple
    }), []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Get all CSV files
            const allFiles = await incubatorService.listCSVFiles();
            console.log('===== CSV FILE DEBUG =====');
            console.log('Total files returned:', allFiles?.length || 0);
            console.log('All files:', JSON.stringify(allFiles, null, 2));
            console.log('isSimulated:', isSimulated);
            
            // Filter files based on simulation mode
            const modePrefix = isSimulated ? 'incubator_simulated' : 'incubator_live';
            console.log('Looking for files with prefix:', modePrefix);
            
            // Log each file and whether it matches
            allFiles?.forEach(file => {
                const matches = file.filename && file.filename.toLowerCase().startsWith(modePrefix);
                console.log(`File: "${file.filename}" - Matches: ${matches}`);
            });
            
            const files = allFiles.filter(file => 
                file.filename && file.filename.toLowerCase().startsWith(modePrefix)
            );
            
            console.log('Filtered files count:', files.length);
            console.log('Filtered files:', files);
            console.log('========================');
            
            if (files.length === 0) {
                console.log('No matching files found for mode:', modePrefix);
                setChartData([]);
                setIsLoading(false);
                return;
            }
            
            // Calculate time threshold based on timespan
            const now = new Date();
            let startTime;
            
            switch (timespan) {
                case '1h':
                    startTime = new Date(now - 60 * 60 * 1000);
                    break;
                case '6h':
                    startTime = new Date(now - 6 * 60 * 60 * 1000);
                    break;
                case '24h':
                    startTime = new Date(now - 24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    startTime = new Date(now - 30 * 24 * 60 * 60 * 1000);
                    break;
                case 'all':
                default:
                    startTime = new Date(0); // Beginning of time
                    break;
            }

            // Read and combine data from all relevant files
            let allData = [];
            const dataByTimestamp = {}; // Group by timestamp
            
            for (const file of files) {
                try {
                    const fileData = await incubatorService.readCSVFile(file.filename);
                    
                    if (!fileData) continue;
                    
                    const lines = fileData.split('\n').filter(line => line.trim());
                    if (lines.length < 2) continue; // Need at least header + 1 data row
                    
                    // Check if CSV has allowedDeviation column (new format)
                    const header = lines[0].split(',');
                    const hasDeviationColumn = header.includes('allowedDeviation');
                    
                    // Skip header row (index 0)
                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].split(',').map(v => v.trim());
                        
                        const shelf = parseInt(values[0]);
                        const timestampStr = values[1];
                        
                        if (!timestampStr || isNaN(shelf) || shelf < 1 || shelf > 4) continue;
                        
                        const timestamp = new Date(timestampStr);
                        
                        if (isNaN(timestamp.getTime())) continue;
                        if (timestamp < startTime) continue;
                        
                        const timestampKey = timestamp.getTime();
                        
                        // Initialize timestamp entry if needed
                        if (!dataByTimestamp[timestampKey]) {
                            dataByTimestamp[timestampKey] = {
                                timestamp: timestampKey,
                                time: timestamp.toLocaleTimeString(),
                            };
                        }
                        
                        // Parse shelf data - handle both legacy and new formats
                        const currentTemp = parseFloat(values[2]);
                        const targetTemp = parseFloat(values[3]);
                        
                        let allowedDeviation, currentRPM;
                        if (hasDeviationColumn && values.length >= 9) {
                            // New format: shelf,timestamp,currentTemp,targetTemp,allowedDeviation,currentRPM,targetRPM,platePresent,barcode
                            allowedDeviation = values[4] ? parseFloat(values[4]) : 3.0;
                            currentRPM = parseFloat(values[5]);
                        } else {
                            // Legacy format: shelf,timestamp,currentTemp,targetTemp,currentRPM,targetRPM,platePresent,barcode
                            allowedDeviation = 3.0;
                            currentRPM = parseFloat(values[4]);
                        }
                        
                        if (!isNaN(currentTemp)) {
                            dataByTimestamp[timestampKey][`shelf${shelf}Temp`] = currentTemp;
                        }
                        if (!isNaN(targetTemp)) {
                            dataByTimestamp[timestampKey][`shelf${shelf}TargetTemp`] = targetTemp;
                        }
                        if (allowedDeviation !== null) {
                            dataByTimestamp[timestampKey][`shelf${shelf}AllowedDeviation`] = allowedDeviation;
                        }
                        if (!isNaN(currentRPM)) {
                            dataByTimestamp[timestampKey][`shelf${shelf}RPM`] = currentRPM;
                        }
                    }
                } catch (err) {
                    console.error(`Error reading file ${file.filename}:`, err);
                }
            }
            
            // Convert to array
            allData = Object.values(dataByTimestamp);
            
            // Sort by timestamp
            allData.sort((a, b) => a.timestamp - b.timestamp);
            
            // Downsample if too many points (keep max 500 points)
            if (allData.length > 500) {
                const step = Math.ceil(allData.length / 500);
                allData = allData.filter((_, index) => index % step === 0);
            }
            
            console.log(`Loaded ${allData.length} data points`);
            setChartData(allData);
        } catch (error) {
            console.error('Error loading data:', error);
            setChartData([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        
        // Refresh data every 30 seconds
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timespan, isSimulated]);

    const toggleShelfVisibility = useCallback((shelf) => {
        setShelfVisibility(prev => ({
            ...prev,
            [shelf]: !prev[shelf]
        }));
    }, []);

    const CustomTooltip = useCallback(({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip">
                    <p className="tooltip-time">{payload[0].payload.time}</p>
                    {payload.map((entry, index) => (
                        <p key={index} style={{ color: entry.color }}>
                            {entry.name}: {entry.value?.toFixed(1)}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    }, []);

    // Calculate dynamic axis limits
    const axisLimits = useMemo(() => {
        if (chartData.length === 0) {
            return { tempMin: 0, tempMax: 50, rpmMin: 0, rpmMax: 600 };
        }

        let tempMin = Infinity, tempMax = -Infinity;
        let rpmMin = Infinity, rpmMax = -Infinity;

        chartData.forEach(dataPoint => {
            for (let shelf = 1; shelf <= 4; shelf++) {
                if (shelfVisibility[shelf]) {
                    const temp = dataPoint[`shelf${shelf}Temp`];
                    const rpm = dataPoint[`shelf${shelf}RPM`];
                    
                    if (temp != null && !isNaN(temp)) {
                        tempMin = Math.min(tempMin, temp);
                        tempMax = Math.max(tempMax, temp);
                    }
                    if (rpm != null && !isNaN(rpm)) {
                        rpmMin = Math.min(rpmMin, rpm);
                        rpmMax = Math.max(rpmMax, rpm);
                    }
                }
            }
        });

        // Add 10% padding to the ranges
        const tempPadding = (tempMax - tempMin) * 0.1 || 5;
        const rpmPadding = (rpmMax - rpmMin) * 0.1 || 50;

        return {
            tempMin: Math.max(0, Math.floor(tempMin - tempPadding)),
            tempMax: Math.ceil(tempMax + tempPadding),
            rpmMin: Math.max(0, Math.floor(rpmMin - rpmPadding)),
            rpmMax: Math.ceil(rpmMax + rpmPadding)
        };
    }, [chartData, shelfVisibility]);

    // Memoize the chart component to prevent re-renders from ResponsiveContainer
    const chartComponent = useMemo(() => {
        if (isLoading) {
            return <div className="loading-state">Loading data...</div>;
        }
        
        if (chartData.length === 0) {
            return <div className="empty-state">No data available</div>;
        }

        return (
            <ResponsiveContainer width="100%" height="100%" key={isFullscreen ? 'fullscreen' : 'compact'}>
                <LineChart data={chartData} margin={{ top: 5, right: 50, left: 50, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                    <XAxis 
                        dataKey="time" 
                        stroke="#9ca3af"
                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                    />
                    <YAxis 
                        yAxisId="temp"
                        orientation="right"
                        domain={[axisLimits.tempMin, axisLimits.tempMax]}
                        label={{ value: '°C', angle: 0, position: 'insideTopRight', fill: '#9ca3af', offset: 10 }}
                        stroke="#9ca3af"
                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                    />
                    <YAxis 
                        yAxisId="rpm"
                        orientation="left"
                        domain={[axisLimits.rpmMin, axisLimits.rpmMax]}
                        label={{ value: 'RPM', angle: 0, position: 'insideTopLeft', fill: '#9ca3af', offset: 10 }}
                        stroke="#9ca3af"
                        tick={{ fill: '#9ca3af', fontSize: 10 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    
                    {/* Temperature Lines */}
                    {shelfVisibility[1] && (
                        <Line 
                            yAxisId="temp"
                            type="monotone" 
                            dataKey="shelf1Temp" 
                            stroke={shelfColors[1]}
                            strokeWidth={2}
                            dot={false}
                            name="S1 Temp"
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                    {shelfVisibility[2] && (
                        <Line 
                            yAxisId="temp"
                            type="monotone" 
                            dataKey="shelf2Temp" 
                            stroke={shelfColors[2]}
                            strokeWidth={2}
                            dot={false}
                            name="S2 Temp"
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                    {shelfVisibility[3] && (
                        <Line 
                            yAxisId="temp"
                            type="monotone" 
                            dataKey="shelf3Temp" 
                            stroke={shelfColors[3]}
                            strokeWidth={2}
                            dot={false}
                            name="S3 Temp"
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                    {shelfVisibility[4] && (
                        <Line 
                            yAxisId="temp"
                            type="monotone" 
                            dataKey="shelf4Temp" 
                            stroke={shelfColors[4]}
                            strokeWidth={2}
                            dot={false}
                            name="S4 Temp"
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                    
                    {/* Temperature Deviation Range Lines (upper and lower setpoints) */}
                    {[1, 2, 3, 4].map(shelf => {
                        if (!shelfVisibility[shelf]) return null;
                        const hasDeviation = chartData.some(d => 
                            d[`shelf${shelf}TargetTemp`] != null && d[`shelf${shelf}AllowedDeviation`] != null
                        );
                        if (!hasDeviation) return null;
                        
                        return (
                            <React.Fragment key={`deviation-${shelf}`}>
                                <Line 
                                    yAxisId="temp"
                                    type="monotone" 
                                    dataKey={(data) => {
                                        const target = data[`shelf${shelf}TargetTemp`];
                                        const deviation = data[`shelf${shelf}AllowedDeviation`];
                                        if (target != null && target !== 0 && deviation != null) {
                                            return target + deviation;
                                        }
                                        return null;
                                    }}
                                    stroke="#ff9800"
                                    strokeWidth={1}
                                    strokeDasharray="3 3"
                                    dot={false}
                                    name={`S${shelf} Upper`}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                                <Line 
                                    yAxisId="temp"
                                    type="monotone" 
                                    dataKey={(data) => {
                                        const target = data[`shelf${shelf}TargetTemp`];
                                        const deviation = data[`shelf${shelf}AllowedDeviation`];
                                        if (target != null && target !== 0 && deviation != null) {
                                            return target - deviation;
                                        }
                                        return null;
                                    }}
                                    stroke="#ff9800"
                                    strokeWidth={1}
                                    strokeDasharray="3 3"
                                    dot={false}
                                    name={`S${shelf} Lower`}
                                    connectNulls
                                    isAnimationActive={false}
                                />
                            </React.Fragment>
                        );
                    })}
                    
                    {/* RPM Lines (dashed) */}
                    {shelfVisibility[1] && (
                        <Line 
                            yAxisId="rpm"
                            type="monotone" 
                            dataKey="shelf1RPM" 
                            stroke={shelfColors[1]}
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="S1 RPM"
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                    {shelfVisibility[2] && (
                        <Line 
                            yAxisId="rpm"
                            type="monotone" 
                            dataKey="shelf2RPM" 
                            stroke={shelfColors[2]}
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="S2 RPM"
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                    {shelfVisibility[3] && (
                        <Line 
                            yAxisId="rpm"
                            type="monotone" 
                            dataKey="shelf3RPM" 
                            stroke={shelfColors[3]}
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="S3 RPM"
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                    {shelfVisibility[4] && (
                        <Line 
                            yAxisId="rpm"
                            type="monotone" 
                            dataKey="shelf4RPM" 
                            stroke={shelfColors[4]}
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="S4 RPM"
                            connectNulls
                            isAnimationActive={false}
                        />
                    )}
                </LineChart>
            </ResponsiveContainer>
        );
    }, [chartData, shelfVisibility, axisLimits, shelfColors, isLoading, isFullscreen]);

    return (
        <div className={`data-viewer ${isFullscreen ? 'fullscreen' : 'compact'}`}>
            {/* Combined Header with Controls */}
            <div className="data-viewer-header">
                <h3>Incubator Data</h3>
                
                {/* Timespan Selector */}
                <select 
                    className="timespan-select"
                    value={timespan} 
                    onChange={(e) => setTimespan(e.target.value)}
                >
                    <option value="1h">1h</option>
                    <option value="6h">6h</option>
                    <option value="24h">24h</option>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="all">All</option>
                </select>

                {/* Export Data Button */}
                {onOpenExport && (
                    <button 
                        className="btn btn-primary export-btn"
                        onClick={onOpenExport}
                        title="Export data reports"
                    >
                        📊 Export
                    </button>
                )}

                {/* Shelf Visibility Toggles (serving as legend) */}
                <div className="shelf-toggles-legend">
                    {[1, 2, 3, 4].map(shelf => (
                        <label key={shelf} className="shelf-toggle-legend">
                            <input
                                type="checkbox"
                                checked={shelfVisibility[shelf]}
                                onChange={() => toggleShelfVisibility(shelf)}
                            />
                            <span 
                                className="shelf-indicator-legend"
                                style={{ 
                                    backgroundColor: shelfVisibility[shelf] ? shelfColors[shelf] : '#666',
                                }}
                            >
                                S{shelf}
                            </span>
                        </label>
                    ))}
                    <span className="legend-markers">
                        <span className="legend-item">
                            <span className="line-solid"></span>
                            <span className="legend-label">Temp</span>
                        </span>
                        <span className="legend-item">
                            <span className="line-dashed"></span>
                            <span className="legend-label">RPM</span>
                        </span>
                    </span>
                </div>

                {onToggleFullscreen && (
                    <button 
                        className="btn btn-icon"
                        onClick={onToggleFullscreen}
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? '⤓' : '⤢'}
                    </button>
                )}
            </div>

            <div className="data-viewer-chart">
                {chartComponent}
            </div>
        </div>
    );
};

// Memoize the component with custom comparison function
export default React.memo(DataViewer, (prevProps, nextProps) => {
    // Return true if props are equal (prevent re-render)
    // Return false if props changed (allow re-render)
    return prevProps.isFullscreen === nextProps.isFullscreen &&
           prevProps.isSimulated === nextProps.isSimulated &&
           prevProps.onToggleFullscreen === nextProps.onToggleFullscreen;
});
