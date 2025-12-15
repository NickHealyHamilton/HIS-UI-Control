/**
 * CSV Logger Service
 * Handles writing historical data to CSV files on filesystem via backend API
 * Separate files for live and simulated runs, one per day
 * Files saved to: C:\ProgramData\Hamilton\HIS API\Data logs
 */

import incubatorService from './incubatorService';

class CSVLogger {
    constructor() {
        this.currentDate = null;
        this.currentMode = null; // 'live' or 'simulated'
        this.buffer = [];
        this.bufferSize = 10; // Write to file every 10 data points
        this.isWriting = false;
    }

    /**
     * Generate filename based on date and mode
     */
    generateFilename(date, isSimulated) {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const mode = isSimulated ? 'simulated' : 'live';
        return `incubator_${mode}_${dateStr}.csv`;
    }

    /**
     * Get CSV header row
     */
    getHeader() {
        return 'shelf,timestamp,currentTemp,targetTemp,allowedDeviation,currentRPM,targetRPM,platePresent,barcode';
    }

    /**
     * Escape CSV value - wrap in quotes if it contains comma, quote, or newline
     */
    escapeCSVValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        
        const stringValue = String(value);
        
        // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
            // Escape double quotes by doubling them
            const escaped = stringValue.replace(/"/g, '""');
            return `"${escaped}"`;
        }
        
        return stringValue;
    }

    /**
     * Convert data point to CSV row
     */
    dataPointToCSV(dataPoint) {
        return `${dataPoint.shelf},${this.escapeCSVValue(dataPoint.timestamp)},${dataPoint.currentTemp},${dataPoint.targetTemp},${dataPoint.allowedDeviation || ''},${dataPoint.currentRPM},${dataPoint.targetRPM},${dataPoint.platePresent},${this.escapeCSVValue(dataPoint.barcode || '')}`;
    }

    /**
     * Check if we need a new file (date changed or mode changed)
     */
    shouldCreateNewFile(isSimulated) {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const currentDateStr = this.currentDate ? this.currentDate.toISOString().split('T')[0] : null;
        const mode = isSimulated ? 'simulated' : 'live';

        return (
            this.currentDate === null ||
            todayStr !== currentDateStr ||
            this.currentMode !== mode
        );
    }

    /**
     * Initialize a new CSV file with headers via backend API
     */
    async initializeFile(isSimulated) {
        const today = new Date();
        const filename = this.generateFilename(today, isSimulated);
        const mode = isSimulated ? 'simulated' : 'live';

        this.currentDate = today;
        this.currentMode = mode;

        try {
            // Call backend API to initialize file
            await incubatorService.initializeCSVFile(filename, this.getHeader());
        } catch (error) {
            console.error('Error initializing CSV file:', error);
        }

        return filename;
    }

    /**
     * Write data to CSV file via backend API
     */
    async writeToFile(filename, csvRows) {
        try {
            await incubatorService.appendToCSVFile(filename, csvRows);
        } catch (error) {
            console.error('Error writing to CSV file:', error);
        }
    }

    /**
     * Add data point to buffer and flush if needed
     */
    async logDataPoint(dataPoint, isSimulated) {
        try {
            // Check if we need a new file
            if (this.shouldCreateNewFile(isSimulated)) {
                // Flush existing buffer first
                if (this.buffer.length > 0) {
                    await this.flushBuffer(isSimulated);
                }
                await this.initializeFile(isSimulated);
            }

            // Add to buffer
            this.buffer.push(dataPoint);

            // Flush if buffer is full
            if (this.buffer.length >= this.bufferSize) {
                await this.flushBuffer(isSimulated);
            }
        } catch (error) {
            console.error('Error logging data point:', error);
        }
    }

    /**
     * Flush buffer to file via backend API
     */
    async flushBuffer(isSimulated) {
        if (this.buffer.length === 0 || this.isWriting) {
            return;
        }

        this.isWriting = true;

        try {
            const filename = this.generateFilename(this.currentDate || new Date(), isSimulated);
            const csvRows = this.buffer.map(dp => this.dataPointToCSV(dp));
            
            await this.writeToFile(filename, csvRows);
            this.buffer = [];
        } catch (error) {
            console.error('Error flushing buffer:', error);
        } finally {
            this.isWriting = false;
        }
    }

    /**
     * Get all available CSV files from backend
     */
    async getAvailableFiles() {
        try {
            const files = await incubatorService.listCSVFiles();
            return files;
        } catch (error) {
            console.error('Error getting available files:', error);
            return [];
        }
    }

    /**
     * Read CSV file content from backend
     */
    async readCSVFile(filename) {
        try {
            const content = await incubatorService.readCSVFile(filename);
            return this.parseCSV(content);
        } catch (error) {
            console.error('Error reading CSV file:', error);
            return [];
        }
    }

    /**
     * Parse CSV content into data array
     */
    parseCSV(csvContent) {
        if (!csvContent || csvContent.trim().length === 0) {
            console.warn('Empty CSV content received');
            return [];
        }

        // Handle both \r\n (Windows) and \n (Unix) line endings
        const lines = csvContent.trim().split(/\r?\n/);
        
        if (lines.length <= 1) {
            console.warn('No data rows in CSV, only header or empty');
            return [];
        }

        const header = lines[0].split(',');
        const data = [];
        const hasDeviationColumn = header.includes('allowedDeviation');

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue; // Skip empty lines
            
            const values = line.split(',');
            
            // Handle both legacy format (without deviation) and new format (with deviation)
            if (hasDeviationColumn && values.length === header.length) {
                data.push({
                    shelf: parseInt(values[0]),
                    timestamp: values[1],
                    currentTemp: parseFloat(values[2]),
                    targetTemp: parseFloat(values[3]),
                    allowedDeviation: values[4] ? parseFloat(values[4]) : 3.0,
                    currentRPM: parseInt(values[5]),
                    targetRPM: parseInt(values[6]),
                    platePresent: values[7] === 'true',
                    barcode: values[8] || null
                });
            } else if (!hasDeviationColumn && values.length === 8) {
                // Legacy format: shelf,timestamp,currentTemp,targetTemp,currentRPM,targetRPM,platePresent,barcode
                data.push({
                    shelf: parseInt(values[0]),
                    timestamp: values[1],
                    currentTemp: parseFloat(values[2]),
                    targetTemp: parseFloat(values[3]),
                    allowedDeviation: 3.0, // Default for legacy data
                    currentRPM: parseInt(values[4]),
                    targetRPM: parseInt(values[5]),
                    platePresent: values[6] === 'true',
                    barcode: values[7] || null
                });
            } else {
                console.warn(`Line ${i} has ${values.length} values, expected ${header.length}`);
            }
        }

        console.log(`Parsed ${data.length} data points from CSV`);
        return data;
    }

    /**
     * Delete old CSV files via backend
     */
    async clearOldData(daysToKeep = 7) {
        try {
            await incubatorService.deleteOldCSVFiles(daysToKeep);
        } catch (error) {
            console.error('Error clearing old data:', error);
        }
    }

    /**
     * Delete specific CSV file via backend
     */
    async deleteFile(filename) {
        try {
            await incubatorService.deleteCSVFile(filename);
        } catch (error) {
            console.error('Error deleting file:', error);
        }
    }
}

// Export singleton instance
const csvLogger = new CSVLogger();
export default csvLogger;
