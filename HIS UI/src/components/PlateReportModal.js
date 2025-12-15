import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import incubatorService from '../services/incubatorService';
import './PlateReportModal.css';

const PlateReportModal = ({ isOpen, onClose, session, module, isSimulated, exportMode, barcode, startDate, endDate }) => {
    const [chartData, setChartData] = useState([]);
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [splitPositions, setSplitPositions] = useState({});
    const [hoveredEvent, setHoveredEvent] = useState(null);
    const isDraggingRef = useRef(null);

    // Load data for the session
    useEffect(() => {
        if (!isOpen) return;
        if (!session && !exportMode) return;

        const loadData = async () => {
            setIsLoading(true);
            try {
                // Determine time range, barcode, and module based on mode
                let startTime, endTime, targetBarcode, targetModule;
                
                if (session) {
                    // Session mode: specific session data
                    startTime = new Date(session.startTime).getTime();
                    endTime = session.endTime ? new Date(session.endTime).getTime() : Date.now();
                    targetBarcode = session.barcode;
                    targetModule = module;
                } else if (exportMode === 'barcode') {
                    // Export by barcode: all data for barcode across all modules
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    startTime = start.getTime();
                    endTime = end.getTime();
                    targetBarcode = barcode;
                    targetModule = null; // All modules
                } else if (exportMode === 'shelf') {
                    // Export by shelf: all data for shelf in date range
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    startTime = start.getTime();
                    endTime = end.getTime();
                    targetBarcode = null; // All barcodes
                    targetModule = module;
                } else {
                    return; // Invalid mode
                }

                // Get CSV files - parse all incubator files regardless of simulation mode
                const allFiles = await incubatorService.listCSVFiles();
                const files = allFiles.filter(file => 
                    file.filename && file.filename.toLowerCase().startsWith('incubator_')
                );

                console.log(`=== PLATE REPORT DATA LOADING ===`);
                console.log(`Mode: ${session ? 'session' : exportMode}`);
                console.log(`Simulation mode: ${isSimulated}`);
                console.log(`Date range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
                console.log(`Target barcode: "${targetBarcode}"`);
                console.log(`Target module: ${targetModule}`);
                console.log(`Total CSV files found: ${allFiles.length}`);
                console.log(`Files to process:`, files.map(f => f.filename));

                let sessionData = [];
                let filesProcessed = 0;
                let rowsProcessed = 0;
                let rowsMatched = 0;

                // Read data from CSV files
                for (const file of files) {
                    try {
                        const fileData = await incubatorService.readCSVFile(file.filename);
                        if (!fileData) continue;

                        const lines = fileData.split('\n').filter(line => line.trim());
                        if (lines.length < 2) continue;

                        // Check if CSV has allowedDeviation column (new format)
                        const header = lines[0].split(',');
                        const hasDeviationColumn = header.includes('allowedDeviation');

                        // Parse CSV (skip header)
                        for (let i = 1; i < lines.length; i++) {
                            rowsProcessed++;
                            
                            // Handle CSV with potential quoted fields (barcodes with commas)
                            const values = lines[i].match(/(?:"([^"]*)"|([^,]+)|(?<=,)(?=,)|(?<=,)$)/g)
                                ?.map(v => v?.replace(/^"|"$/g, '').trim()) || [];
                            
                            // Handle both legacy (8 cols) and new format (9 cols)
                            if (values.length < 8) continue;
                            
                            const shelf = parseInt(values[0]);
                            const timestampStr = values[1];
                            const currentTemp = parseFloat(values[2]);
                            const targetTemp = parseFloat(values[3]);
                            
                            let allowedDeviation, currentRPM, targetRPM, barcode;
                            if (hasDeviationColumn && values.length >= 9) {
                                // New format with deviation column
                                allowedDeviation = values[4] ? parseFloat(values[4]) : 3.0;
                                currentRPM = parseFloat(values[5]);
                                targetRPM = parseFloat(values[6]);
                                barcode = values[8] || null;
                            } else {
                                // Legacy format without deviation column
                                allowedDeviation = 3.0;
                                currentRPM = parseFloat(values[4]);
                                targetRPM = parseFloat(values[5]);
                                barcode = values[7] || null;
                            }

                            // Validate shelf number
                            if (isNaN(shelf) || shelf < 1 || shelf > 4) continue;
                            if (!timestampStr) continue;

                            // Parse timestamp first to check date range
                            const timestamp = new Date(timestampStr);
                            if (isNaN(timestamp.getTime())) continue;

                            const timestampMs = timestamp.getTime();
                            if (timestampMs < startTime || timestampMs > endTime) continue;

                            // Filter by module if specified (session or shelf mode)
                            if (targetModule !== null && shelf !== targetModule) continue;
                            
                            // Filter by barcode if specified (session or barcode mode)
                            if (targetBarcode) {
                                // Skip if no barcode or doesn't match
                                if (!barcode || barcode === 'null' || barcode === '') continue;
                                if (barcode !== targetBarcode) continue;
                            }

                            rowsMatched++;

                            sessionData.push({
                                timestamp: timestampMs,
                                time: timestamp.toLocaleTimeString(),
                                date: timestamp.toLocaleDateString(),
                                temp: !isNaN(currentTemp) ? currentTemp : null,
                                targetTemp: !isNaN(targetTemp) ? targetTemp : null,
                                allowedDeviation: allowedDeviation,
                                rpm: !isNaN(currentRPM) ? currentRPM : null,
                                targetRPM: !isNaN(targetRPM) ? targetRPM : null,
                                shelf: shelf
                            });
                        }
                        
                        filesProcessed++;
                    } catch (err) {
                        console.error(`Error reading file ${file.filename}:`, err);
                    }
                }

                console.log(`Files processed: ${filesProcessed}`);
                console.log(`Total rows processed: ${rowsProcessed}`);
                console.log(`Rows matched: ${rowsMatched}`);
                console.log(`Data points collected: ${sessionData.length}`);
                
                if (sessionData.length > 0) {
                    console.log(`BEFORE SORT - First 3 points:`);
                    sessionData.slice(0, 3).forEach((p, i) => {
                        console.log(`  ${i}: ${new Date(p.timestamp).toLocaleString()}, shelf ${p.shelf}`);
                    });
                    console.log(`BEFORE SORT - Last 3 points:`);
                    sessionData.slice(-3).forEach((p, i) => {
                        console.log(`  ${i}: ${new Date(p.timestamp).toLocaleString()}, shelf ${p.shelf}`);
                    });
                }
                console.log(`=================================`);

                // Sort by timestamp
                sessionData.sort((a, b) => a.timestamp - b.timestamp);
                
                if (sessionData.length > 0) {
                    console.log(`AFTER SORT - First point: ${new Date(sessionData[0].timestamp).toLocaleString()}, shelf ${sessionData[0].shelf}`);
                    console.log(`AFTER SORT - Last point: ${new Date(sessionData[sessionData.length - 1].timestamp).toLocaleString()}, shelf ${sessionData[sessionData.length - 1].shelf}`);
                }

                // For barcode export mode, detect and separate sessions
                if (exportMode === 'barcode' && sessionData.length > 0) {
                    const detectedSessions = [];
                    let currentSession = {
                        data: [sessionData[0]],
                        shelf: sessionData[0].shelf,
                        startTime: sessionData[0].timestamp,
                        endTime: sessionData[0].timestamp
                    };

                    // Detect session breaks (gap > 5 minutes or shelf change)
                    const SESSION_GAP_THRESHOLD = 5 * 60 * 1000; // 5 minutes

                    console.log(`\n=== SESSION DETECTION ===`);
                    console.log(`Total data points to analyze: ${sessionData.length}`);
                    console.log(`Session gap threshold: ${SESSION_GAP_THRESHOLD / 1000 / 60} minutes`);

                    for (let i = 1; i < sessionData.length; i++) {
                        const point = sessionData[i];
                        const prevPoint = sessionData[i - 1];
                        const timeDiff = point.timestamp - prevPoint.timestamp;
                        const timeDiffMinutes = timeDiff / 1000 / 60;

                        // Log large gaps
                        if (timeDiffMinutes > 1) {
                            console.log(`Gap detected at index ${i}: ${timeDiffMinutes.toFixed(2)} min (${new Date(prevPoint.timestamp).toLocaleString()} -> ${new Date(point.timestamp).toLocaleString()}), shelf: ${prevPoint.shelf} -> ${point.shelf}`);
                        }

                        // If gap is too large or shelf changed, start new session
                        if (timeDiff > SESSION_GAP_THRESHOLD || point.shelf !== currentSession.shelf) {
                            console.log(`NEW SESSION at index ${i}: Gap=${timeDiffMinutes.toFixed(2)}min, Shelf change=${prevPoint.shelf}->${point.shelf}`);
                            // Finalize current session
                            currentSession.endTime = prevPoint.timestamp;
                            
                            // Downsample if needed
                            if (currentSession.data.length > 500) {
                                const step = Math.ceil(currentSession.data.length / 500);
                                currentSession.data = currentSession.data.filter((_, index) => index % step === 0);
                            }
                            
                            detectedSessions.push(currentSession);

                            // Start new session
                            currentSession = {
                                data: [point],
                                shelf: point.shelf,
                                startTime: point.timestamp,
                                endTime: point.timestamp
                            };
                        } else {
                            currentSession.data.push(point);
                            currentSession.endTime = point.timestamp;
                        }
                    }

                    // Add final session
                    if (currentSession.data.length > 500) {
                        const step = Math.ceil(currentSession.data.length / 500);
                        currentSession.data = currentSession.data.filter((_, index) => index % step === 0);
                    }
                    detectedSessions.push(currentSession);

                    console.log(`Detected ${detectedSessions.length} separate sessions`);
                    
                    // Fetch events for each session from backend
                    const eventPromises = detectedSessions.map(async (s, i) => {
                        try {
                            const eventData = await incubatorService.fetchEvents(s.startTime, s.endTime, s.shelf);
                            s.events = eventData.events || [];
                            console.log(`Session ${i + 1}: Shelf ${s.shelf}, ${s.data.length} points, ${s.events.length} events, ${new Date(s.startTime).toLocaleString()} to ${new Date(s.endTime).toLocaleString()}`);
                        } catch (err) {
                            console.error(`Failed to fetch events for session ${i + 1}:`, err);
                            s.events = [];
                        }
                    });
                    
                    await Promise.all(eventPromises);

                    setSessions(detectedSessions);
                    setChartData([]); // Clear single chart data
                } else {
                    // Single session mode - downsample if needed
                    if (sessionData.length > 500) {
                        const step = Math.ceil(sessionData.length / 500);
                        sessionData = sessionData.filter((_, index) => index % step === 0);
                    }
                    
                    // Fetch events for single session from backend
                    if (session && targetModule) {
                        try {
                            const eventData = await incubatorService.fetchEvents(startTime, endTime, targetModule);
                            setEvents(eventData.events || []);
                            console.log(`Single session: ${eventData.events?.length || 0} events loaded`);
                        } catch (err) {
                            console.error('Failed to fetch events for single session:', err);
                            setEvents([]);
                        }
                    } else {
                        setEvents([]);
                    }
                    
                    setChartData(sessionData);
                    setSessions([]);
                }
            } catch (error) {
                console.error('Error loading session data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [isOpen, session, module, isSimulated, exportMode, barcode, startDate, endDate]);

    // Draggable divider handlers
    const containerRefs = useRef({});
    
    const handleMouseDown = useCallback((sessionIndex, containerElement) => {
        isDraggingRef.current = sessionIndex;
        containerRefs.current[sessionIndex] = containerElement;
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (isDraggingRef.current === null) return;
        
        const sessionIndex = isDraggingRef.current;
        const container = containerRefs.current[sessionIndex];
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const percentage = (offsetX / rect.width) * 100;
        
        // Constrain between 30% and 70%
        const clampedPercentage = Math.max(30, Math.min(70, percentage));
        
        setSplitPositions(prev => ({
            ...prev,
            [sessionIndex]: clampedPercentage
        }));
    }, []);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = null;
    }, []);

    useEffect(() => {
        if (isDraggingRef.current !== null) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [handleMouseMove, handleMouseUp]);

    // Helper function to format event for display in report
    const formatEventForReport = (event) => {
        // Backend returns: { timestamp, level, eventType, sender, message }
        // Message format: "CommonLogEntryEvent - Sender: 'COM10.Module3', Data: '1166354, 2025-12-08 15:18:27:937, Shaker, 1, 450, 0, 0'"
        
        const message = event.message || '';
        const sender = event.sender || '';
        
        // Extract module number from sender (e.g., "COM10.Module3" -> "Module 3")
        const moduleMatch = sender.match(/Module(\d+)/i);
        const moduleStr = moduleMatch ? `Module ${moduleMatch[1]}` : sender;
        
        // Parse data from message if it's a CommonLogEntryEvent
        if (message.includes('Data:')) {
            const dataMatch = message.match(/Data: '([^']*)'/);
            if (dataMatch) {
                // Data format: "tickCount, timestamp, eventId, data0, data1, data2, data3"
                const dataParts = dataMatch[1].split(',').map(s => s.trim());
                if (dataParts.length >= 3) {
                    const eventId = dataParts[2];
                    const val0 = parseFloat(dataParts[3]) || 0;
                    const val1 = parseFloat(dataParts[4]) || 0;
                    const val2 = parseFloat(dataParts[5]) || 0;
                    const val3 = parseFloat(dataParts[6]) || 0;
                    
                    // Format based on event ID (matching EventLog.js logic)
                    switch (eventId) {
                        case 'TemperatureReached':
                            return `${moduleStr} - Temperature reached: ${val0}°C`;
                        case 'TemperatureOutOfRange':
                            return `${moduleStr} - Out of range: ${val2}°C (range: ${val1}°C - ${val0}°C)`;
                        case 'TemperatureSetting':
                            return `${moduleStr} - Temperature set to ${val0}°C`;
                        case 'DoorOpen':
                            return `${moduleStr} - Door opened`;
                        case 'DoorClose':
                            return `${moduleStr} - Door closed`;
                        case 'PlateAdded':
                            return `${moduleStr} - Plate added`;
                        case 'PlateRemoved':
                            return `${moduleStr} - Plate removed`;
                        case 'Shaker':
                            // val0: statusCode (0=off, 1=on)
                            // val1: RPM
                            // val2: cycle duration (0=continuous, >0=periodic)
                            // val3: active time per cycle
                            if (val0 === 1) {
                                // Shaker is on
                                if (val2 > 0) {
                                    // Periodic shaking
                                    return `${moduleStr} - Shaker started: ${val1} RPM, Periodic (${val2}s cycles, ${val3}s active per cycle)`;
                                } else {
                                    // Continuous shaking
                                    return `${moduleStr} - Shaker started: ${val1} RPM, Continuous`;
                                }
                            } else {
                                return `${moduleStr} - Shaker stopped`;
                            }
                        default:
                            return `${moduleStr} - ${eventId}`;
                    }
                }
            }
        }
        
        // Handle non-CommonLogEntryEvent types
        const eventType = event.eventType || '';
        
        if (eventType.includes('Alarm')) {
            if (eventType.includes('Armed')) return `${moduleStr} - Alarm armed`;
            if (eventType.includes('Disarmed')) return `${moduleStr} - Alarm disarmed`;
        }
        
        if (eventType.includes('UnderTemperature')) return `${moduleStr} - Under temperature`;
        if (eventType.includes('TargetTemperatureReached')) return `${moduleStr} - Target temperature reached`;
        
        if (eventType.includes('Scan')) {
            return `Barcode scanned`;
        }
        
        // Clean up event type name as fallback
        return eventType
            .replace('CommonPlate', '')
            .replace('Common', '')
            .replace(/([A-Z])/g, ' $1')
            .trim();
    };

    // Export functions
    const exportToCSV = () => {
        const dataToExport = sessions.length > 0 ? sessions : (chartData.length > 0 ? [{ data: chartData, shelf: module }] : []);
        
        if (dataToExport.length === 0) return;

        dataToExport.forEach((sessionData, index) => {
            const csvRows = [];
            csvRows.push(['Timestamp', 'Date', 'Time', 'Temperature (°C)', 'Target Temperature (°C)', 'RPM', 'Target RPM', 'Shelf'].join(','));
            
            sessionData.data.forEach(point => {
                const row = [
                    point.timestamp || '',
                    point.date || '',
                    point.time || '',
                    point.temp != null ? point.temp : '',
                    point.targetTemp != null ? point.targetTemp : '',
                    point.rpm != null ? point.rpm : '',
                    point.targetRPM != null ? point.targetRPM : '',
                    point.shelf || sessionData.shelf || ''
                ];
                csvRows.push(row.join(','));
            });

            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const filename = barcode 
                ? `${barcode}_session${index + 1}_data.csv`
                : `shelf${sessionData.shelf}_session${index + 1}_data.csv`;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        });
    };

    const exportToPDF = async () => {
        const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        // Add header
        pdf.setFontSize(16);
        pdf.text('Incubation Session Report', pageWidth / 2, 15, { align: 'center' });
        
        pdf.setFontSize(10);
        let yPos = 25;
        if (barcode) {
            pdf.text(`Barcode: ${barcode}`, 15, yPos);
            yPos += 6;
        }
        if (startDate && endDate) {
            pdf.text(`Date Range: ${startDate} to ${endDate}`, 15, yPos);
            yPos += 6;
        }
        if (sessions.length > 0) {
            pdf.text(`Sessions: ${sessions.length}`, 15, yPos);
        }

        // Capture each session
        const reportSections = document.querySelectorAll('.report-section');
        for (let i = 0; i < reportSections.length; i++) {
            if (i > 0) pdf.addPage();
            
            const section = reportSections[i];
            const canvas = await html2canvas(section, {
                scale: 2,
                backgroundColor: '#1a1a1a',
                logging: false
            });
            
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - 20;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 10, 35, imgWidth, Math.min(imgHeight, pageHeight - 40));
        }

        const filename = barcode 
            ? `${barcode}_incubation_report.pdf`
            : `shelf${module}_incubation_report.pdf`;
        pdf.save(filename);
    };

    // Helper function to calculate axis limits for a dataset
    const calculateAxisLimits = (data) => {
        if (data.length === 0) {
            return { tempMin: 0, tempMax: 50, rpmMin: 0, rpmMax: 600 };
        }

        let tempMin = Infinity, tempMax = -Infinity;
        let rpmMin = Infinity, rpmMax = -Infinity;

        data.forEach(point => {
            if (point.temp != null) {
                tempMin = Math.min(tempMin, point.temp);
                tempMax = Math.max(tempMax, point.temp);
            }
            if (point.rpm != null) {
                rpmMin = Math.min(rpmMin, point.rpm);
                rpmMax = Math.max(rpmMax, point.rpm);
            }
        });

        const tempPadding = (tempMax - tempMin) * 0.1 || 5;
        const rpmPadding = (rpmMax - rpmMin) * 0.1 || 50;

        return {
            tempMin: Math.max(0, Math.floor(tempMin - tempPadding)),
            tempMax: Math.ceil(tempMax + tempPadding),
            rpmMin: Math.max(0, Math.floor(rpmMin - rpmPadding)),
            rpmMax: Math.ceil(rpmMax + rpmPadding)
        };
    };

    // Calculate axis limits for single chart mode
    const axisLimits = useMemo(() => calculateAxisLimits(chartData), [chartData]);

    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const sessionDuration = session && session.endTime 
        ? Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000 / 60) // minutes
        : session 
            ? Math.round((Date.now() - new Date(session.startTime)) / 1000 / 60)
            : 0;

    return (
        <div className="plate-report-modal-backdrop" onClick={handleBackdropClick}>
            <div className="plate-report-modal-content">
                <div className="plate-report-header">
                    <div className="plate-report-title">
                        <h2>Plate Report</h2>
                        <div className="report-actions">
                            <button className="btn-export" onClick={exportToCSV} title="Export data as CSV">
                                📊 Export CSV
                            </button>
                            <button className="btn-export" onClick={exportToPDF} title="Export report as PDF">
                                📄 Export PDF
                            </button>
                            <button className="btn-close" onClick={onClose}>✕</button>
                        </div>
                    </div>
                    
                    <div className="plate-report-info">
                        {session ? (
                            // Session mode
                            <>
                                <div className="info-item">
                                    <label>Shelf:</label>
                                    <span>{module}</span>
                                </div>
                                <div className="info-item">
                                    <label>Barcode:</label>
                                    <span className="barcode-text">{session.barcode || 'Unknown'}</span>
                                </div>
                                <div className="info-item">
                                    <label>Start Time:</label>
                                    <span>{new Date(session.startTime).toLocaleString()}</span>
                                </div>
                                {session.endTime && (
                                    <div className="info-item">
                                        <label>End Time:</label>
                                        <span>{new Date(session.endTime).toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="info-item">
                                    <label>Duration:</label>
                                    <span>{sessionDuration} minutes</span>
                                </div>
                            </>
                        ) : exportMode === 'barcode' ? (
                            // Export by barcode mode
                            <>
                                <div className="info-item">
                                    <label>Barcode:</label>
                                    <span className="barcode-text">{barcode || 'Unknown'}</span>
                                </div>
                                <div className="info-item">
                                    <label>Date Range:</label>
                                    <span>{startDate} to {endDate}</span>
                                </div>
                                {sessions.length > 0 && (
                                    <div className="info-item">
                                        <label>Incubation Sessions:</label>
                                        <span>{sessions.length}</span>
                                    </div>
                                )}
                            </>
                        ) : exportMode === 'shelf' ? (
                            // Export by shelf mode
                            <>
                                <div className="info-item">
                                    <label>Shelf:</label>
                                    <span>{module}</span>
                                </div>
                                <div className="info-item">
                                    <label>Date Range:</label>
                                    <span>{startDate} to {endDate}</span>
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>

                <div className="plate-report-body">
                    {isLoading ? (
                        <div className="loading-state">Loading data...</div>
                    ) : sessions.length > 0 ? (
                        // Multiple sessions - show each separately
                        <>
                        {sessions.map((sessionData, index) => {
                            const sessionAxisLimits = calculateAxisLimits(sessionData.data);
                            const duration = Math.round((sessionData.endTime - sessionData.startTime) / 1000 / 60);
                            
                            return (
                                <div key={index} className="report-section">
                                    <div className="session-header">
                                        <h3>Session {index + 1} - Shelf {sessionData.shelf}</h3>
                                        <div className="session-info">
                                            <span>{new Date(sessionData.startTime).toLocaleString()} - {new Date(sessionData.endTime).toLocaleString()}</span>
                                            <span> • Duration: {duration} min</span>
                                            <span> • {sessionData.data.length} points</span>
                                        </div>
                                    </div>
                                    <div 
                                        className="session-content-split"
                                        ref={(el) => { if (el) containerRefs.current[index] = el; }}
                                        style={{ userSelect: isDraggingRef.current === index ? 'none' : 'auto' }}
                                    >
                                        <div 
                                            className="chart-panel"
                                            style={{ width: `${splitPositions[index] || 60}%` }}
                                        >
                                            <div className="chart-container" style={{ position: 'relative' }}>
                                                {hoveredEvent && hoveredEvent.sessionIndex === index && (() => {
                                                    const dataIndex = sessionData.data.findIndex(d => d.time === hoveredEvent.time);
                                                    if (dataIndex >= 0) {
                                                        // Chart margins: container padding (16px) + chart margin (20px) + Y-axis width (~65px left, ~55px right)
                                                        const totalLeftMargin = 16 + 20 + 65;
                                                        const totalRightMargin = 16 + 20 + 55;
                                                        const xRatio = dataIndex / Math.max(1, sessionData.data.length - 1);
                                                        
                                                        return (
                                                            <>
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    left: `calc(${totalLeftMargin}px + (100% - ${totalLeftMargin + totalRightMargin}px) * ${xRatio})`,
                                                                    top: '1rem',
                                                                    bottom: '1rem',
                                                                    width: '3px',
                                                                    backgroundColor: '#ffffff',
                                                                    zIndex: 10,
                                                                    pointerEvents: 'none'
                                                                }} />
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    left: `calc(${totalLeftMargin}px + (100% - ${totalLeftMargin + totalRightMargin}px) * ${xRatio})`,
                                                                    top: '0.5rem',
                                                                    transform: 'translateX(-50%)',
                                                                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                                                                    color: '#ffffff',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '11px',
                                                                    zIndex: 11,
                                                                    pointerEvents: 'none',
                                                                    whiteSpace: 'nowrap',
                                                                    border: '1px solid #4cc2ee'
                                                                }}>
                                                                    {hoveredEvent.message}
                                                                </div>
                                                            </>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                <ResponsiveContainer width="100%" height={400}>
                                                    <LineChart 
                                                        data={sessionData.data} 
                                                        margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                                                        <XAxis 
                                                            dataKey="time" 
                                                            stroke="#9ca3af"
                                                            tick={{ fill: '#9ca3af', fontSize: 10 }}
                                                        />
                                                        <YAxis 
                                                            yAxisId="temp"
                                                            orientation="right"
                                                            domain={[sessionAxisLimits.tempMin, sessionAxisLimits.tempMax]}
                                                            label={{ value: '°C', angle: 0, position: 'insideTopRight', fill: '#9ca3af', offset: 10 }}
                                                            stroke="#9ca3af"
                                                            tick={{ fill: '#9ca3af', fontSize: 10 }}
                                                        />
                                                        <YAxis 
                                                            yAxisId="rpm"
                                                            orientation="left"
                                                            domain={[sessionAxisLimits.rpmMin, sessionAxisLimits.rpmMax]}
                                                            label={{ value: 'RPM', angle: 0, position: 'insideTopLeft', fill: '#9ca3af', offset: 10 }}
                                                            stroke="#9ca3af"
                                                            tick={{ fill: '#9ca3af', fontSize: 10 }}
                                                        />
                                                        <Tooltip />
                                                        <Line 
                                                            yAxisId="temp"
                                                            type="monotone" 
                                                            dataKey="temp" 
                                                            stroke="#4cc2ee"
                                                            strokeWidth={2}
                                                            dot={false}
                                                            name="Temperature"
                                                            connectNulls
                                                            isAnimationActive={false}
                                                        />
                                                        {/* Upper setpoint line (targetTemp + allowedDeviation) */}
                                                        {sessionData.data.some(d => d.targetTemp != null && d.allowedDeviation != null) && (
                                                            <Line 
                                                                yAxisId="temp"
                                                                type="monotone" 
                                                                dataKey={(data) => {
                                                                    if (data.targetTemp != null && data.targetTemp !== 0 && data.allowedDeviation != null) {
                                                                        return data.targetTemp + data.allowedDeviation;
                                                                    }
                                                                    return null;
                                                                }}
                                                                stroke="#ff9800"
                                                                strokeWidth={1}
                                                                strokeDasharray="3 3"
                                                                dot={false}
                                                                name="Upper Setpoint"
                                                                connectNulls
                                                                isAnimationActive={false}
                                                            />
                                                        )}
                                                        {/* Lower setpoint line (targetTemp - allowedDeviation) */}
                                                        {sessionData.data.some(d => d.targetTemp != null && d.allowedDeviation != null) && (
                                                            <Line 
                                                                yAxisId="temp"
                                                                type="monotone" 
                                                                dataKey={(data) => {
                                                                    if (data.targetTemp != null && data.targetTemp !== 0 && data.allowedDeviation != null) {
                                                                        return data.targetTemp - data.allowedDeviation;
                                                                    }
                                                                    return null;
                                                                }}
                                                                stroke="#ff9800"
                                                                strokeWidth={1}
                                                                strokeDasharray="3 3"
                                                                dot={false}
                                                                name="Lower Setpoint"
                                                                connectNulls
                                                                isAnimationActive={false}
                                                            />
                                                        )}
                                                        <Line 
                                                            yAxisId="rpm"
                                                            type="monotone" 
                                                            dataKey="rpm" 
                                                            stroke="#00f091"
                                                            strokeWidth={2}
                                                            strokeDasharray="5 5"
                                                            dot={false}
                                                            name="RPM"
                                                            connectNulls
                                                            isAnimationActive={false}
                                                        />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                        <div 
                                            className="split-divider"
                                            onMouseDown={(e) => {
                                                const container = e.currentTarget.parentElement;
                                                handleMouseDown(index, container);
                                            }}
                                        />
                                        {sessionData.events && sessionData.events.length > 0 && (
                                            <div 
                                                className="events-panel"
                                                style={{ width: `${100 - (splitPositions[index] || 60)}%` }}
                                            >
                                                <div className="session-events">
                                                    <h4>Events ({sessionData.events.length})</h4>
                                                    <div className="event-list">
                                                        {sessionData.events.map((event, idx) => {
                                                            const eventDate = new Date(event.timestamp);
                                                            const eventTime = eventDate.toLocaleTimeString();
                                                            const eventMessage = formatEventForReport(event);
                                                            const eventTimestamp = eventDate.getTime();
                                                            
                                                            // Find closest data point to this event
                                                            const closestPoint = sessionData.data.reduce((closest, point) => {
                                                                const pointDiff = Math.abs(point.timestamp - eventTimestamp);
                                                                const closestDiff = Math.abs(closest.timestamp - eventTimestamp);
                                                                return pointDiff < closestDiff ? point : closest;
                                                            });
                                                            
                                                            return (
                                                                <div 
                                                                    key={`${event.timestamp}-${idx}`} 
                                                                    className="event-item-report"
                                                                    onMouseEnter={() => {
                                                                        console.log('Event hover:', {
                                                                            sessionIndex: index,
                                                                            time: closestPoint.time,
                                                                            message: eventMessage,
                                                                            eventTimestamp: new Date(eventTimestamp).toLocaleString(),
                                                                            closestPointTimestamp: new Date(closestPoint.timestamp).toLocaleString()
                                                                        });
                                                                        setHoveredEvent({
                                                                            sessionIndex: index,
                                                                            time: closestPoint.time,
                                                                            message: eventMessage
                                                                        });
                                                                    }}
                                                                    onMouseLeave={() => setHoveredEvent(null)}
                                                                >
                                                                    <span className="event-time-report">
                                                                        <span className="event-date">{eventDate.toLocaleDateString()}</span>
                                                                        <span className="event-time">{eventTime}</span>
                                                                    </span>
                                                                    <span className="event-data-report">{eventMessage}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        </>
                    ) : chartData.length === 0 ? (
                        <div className="empty-state">No data available</div>
                    ) : (
                        // Single session mode
                        <div className="report-section">
                            <h3>Session Data</h3>
                            <div 
                                className="session-content-split"
                                ref={(el) => { if (el) containerRefs.current['single'] = el; }}
                                style={{ userSelect: isDraggingRef.current === 'single' ? 'none' : 'auto' }}
                            >
                                <div 
                                    className="chart-panel"
                                    style={{ width: `${splitPositions['single'] || 60}%` }}
                                >
                                    <div className="chart-container" style={{ position: 'relative' }}>
                                        {hoveredEvent && hoveredEvent.sessionIndex === 'single' && (() => {
                                            const dataIndex = chartData.findIndex(d => d.time === hoveredEvent.time);
                                            if (dataIndex >= 0) {
                                                // Chart margins: container padding (16px) + chart margin (20px) + Y-axis width (~65px left, ~55px right)
                                                const totalLeftMargin = 16 + 20 + 65;
                                                const totalRightMargin = 16 + 20 + 55;
                                                const xRatio = dataIndex / Math.max(1, chartData.length - 1);
                                                
                                                return (
                                                    <>
                                                        <div style={{
                                                            position: 'absolute',
                                                            left: `calc(${totalLeftMargin}px + (100% - ${totalLeftMargin + totalRightMargin}px) * ${xRatio})`,
                                                            top: '1rem',
                                                            bottom: '1rem',
                                                            width: '3px',
                                                            backgroundColor: '#ffffff',
                                                            zIndex: 10,
                                                            pointerEvents: 'none'
                                                        }} />
                                                        <div style={{
                                                            position: 'absolute',
                                                            left: `calc(${totalLeftMargin}px + (100% - ${totalLeftMargin + totalRightMargin}px) * ${xRatio})`,
                                                            top: '0.5rem',
                                                            transform: 'translateX(-50%)',
                                                            backgroundColor: 'rgba(26, 26, 26, 0.95)',
                                                            color: '#ffffff',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '11px',
                                                            zIndex: 11,
                                                            pointerEvents: 'none',
                                                            whiteSpace: 'nowrap',
                                                            border: '1px solid #4cc2ee'
                                                        }}>
                                                            {hoveredEvent.message}
                                                        </div>
                                                    </>
                                                );
                                            }
                                            return null;
                                        })()}
                                        <ResponsiveContainer width="100%" height={400}>
                                            <LineChart 
                                                data={chartData} 
                                                margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                                            >
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
                                                <Tooltip />
                                                <Line 
                                                    yAxisId="temp"
                                                    type="monotone" 
                                                    dataKey="temp" 
                                                    stroke="#4cc2ee"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    name="Temperature"
                                                    connectNulls
                                                    isAnimationActive={false}
                                                />
                                                {/* Upper setpoint line (targetTemp + allowedDeviation) */}
                                                {chartData.some(d => d.targetTemp != null && d.allowedDeviation != null) && (
                                                    <Line 
                                                        yAxisId="temp"
                                                        type="monotone" 
                                                        dataKey={(data) => {
                                                            if (data.targetTemp != null && data.targetTemp !== 0 && data.allowedDeviation != null) {
                                                                return data.targetTemp + data.allowedDeviation;
                                                            }
                                                            return null;
                                                        }}
                                                        stroke="#ff9800"
                                                        strokeWidth={1}
                                                        strokeDasharray="3 3"
                                                        dot={false}
                                                        name="Upper Setpoint"
                                                        connectNulls
                                                        isAnimationActive={false}
                                                    />
                                                )}
                                                {/* Lower setpoint line (targetTemp - allowedDeviation) */}
                                                {chartData.some(d => d.targetTemp != null && d.allowedDeviation != null) && (
                                                    <Line 
                                                        yAxisId="temp"
                                                        type="monotone" 
                                                        dataKey={(data) => {
                                                            if (data.targetTemp != null && data.targetTemp !== 0 && data.allowedDeviation != null) {
                                                                return data.targetTemp - data.allowedDeviation;
                                                            }
                                                            return null;
                                                        }}
                                                        stroke="#ff9800"
                                                        strokeWidth={1}
                                                        strokeDasharray="3 3"
                                                        dot={false}
                                                        name="Lower Setpoint"
                                                        connectNulls
                                                        isAnimationActive={false}
                                                    />
                                                )}
                                                <Line 
                                                    yAxisId="rpm"
                                                    type="monotone" 
                                                    dataKey="rpm" 
                                                    stroke="#00f091"
                                                    strokeWidth={2}
                                                    strokeDasharray="5 5"
                                                    dot={false}
                                                    name="RPM"
                                                    connectNulls
                                                    isAnimationActive={false}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                <div 
                                    className="split-divider"
                                    onMouseDown={(e) => {
                                        const container = e.currentTarget.parentElement;
                                        handleMouseDown('single', container);
                                    }}
                                />
                                {events && events.length > 0 && (
                                    <div 
                                        className="events-panel"
                                        style={{ width: `${100 - (splitPositions['single'] || 60)}%` }}
                                    >
                                        <div className="session-events">
                                            <h4>Events ({events.length})</h4>
                                            <div className="event-list">
                                                {events.map((event, idx) => {
                                                    const eventDate = new Date(event.timestamp);
                                                    const eventTime = eventDate.toLocaleTimeString();
                                                    const eventMessage = formatEventForReport(event);
                                                    const eventTimestamp = eventDate.getTime();
                                                    
                                                    // Find closest data point to this event
                                                    const closestPoint = chartData.reduce((closest, point) => {
                                                        const pointDiff = Math.abs(point.timestamp - eventTimestamp);
                                                        const closestDiff = Math.abs(closest.timestamp - eventTimestamp);
                                                        return pointDiff < closestDiff ? point : closest;
                                                    });
                                                    
                                                    return (
                                                        <div 
                                                            key={`${event.timestamp}-${idx}`} 
                                                            className="event-item-report"
                                                            onMouseEnter={() => setHoveredEvent({
                                                                sessionIndex: 'single',
                                                                time: closestPoint.time,
                                                                message: eventMessage
                                                            })}
                                                            onMouseLeave={() => setHoveredEvent(null)}
                                                        >
                                                            <span className="event-time-report">
                                                                <span className="event-date">{eventDate.toLocaleDateString()}</span>
                                                                <span className="event-time">{eventTime}</span>
                                                            </span>
                                                            <span className="event-data-report">{eventMessage}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlateReportModal;
