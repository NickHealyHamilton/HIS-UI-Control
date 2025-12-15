# CSV Data Logging System - Implementation Summary

## Overview
Automatic CSV logging system for incubator data with separate files for live and simulated runs.

## Features Implemented

### 1. **Automatic Data Logging**
- Data is automatically logged to CSV every second when plates are present
- Buffered writes (batch of 10 data points) for performance
- Separate files for **Live** and **Simulated** modes
- New file created each day at midnight

### 2. **File Naming Convention**
```
incubator_live_2025-10-23.csv
incubator_simulated_2025-10-23.csv
```
Format: `incubator_{mode}_{YYYY-MM-DD}.csv`

### 3. **CSV Structure**
```csv
shelf,timestamp,currentTemp,targetTemp,currentRPM,targetRPM,platePresent
1,2025-10-23T14:30:00.000Z,37.5,37.0,150,150,true
2,2025-10-23T14:30:00.000Z,25.0,25.0,100,100,true
...
```

### 4. **Storage**
- Data stored in browser **localStorage**
- Survives page refresh
- Can be cleared manually or automatically (7+ days old)

### 5. **User Interface**

#### **Left Sidebar Section: "Data Logging"**
- **📊 View Historical Data** - Opens chart modal (existing feature)
- **💾 Download Today's CSV** - Quick download current day's file
- **📁 Manage CSV Files** - Opens CSV Manager modal
- Shows: data points in memory and current logging mode

#### **CSV Manager Modal**
- View all available CSV files
- Shows: filename, mode, date, row count, file size
- Download any file individually
- Clear old files (7+ days)
- Information about CSV logging system

### 6. **Data Collection Flow**
```
Poll (every 1s) → Filter (plates present) → Buffer (10 points) → Write to localStorage
```

## File Size Estimates

### 24-Hour Run (All 4 Shelves):
- **Data points**: 86,400 seconds × 4 shelves = 345,600 rows
- **File size**: ~65 bytes per row = **~22.5 MB**
- **Realistic estimate**: 20-25 MB per day

### Storage Capacity:
- Browser localStorage typical limit: **5-10 MB** per domain
- **Solution**: Data is stored but can be downloaded and cleared
- Old files (7+ days) can be automatically removed

## Usage Instructions

### 1. **Start Logging**
- Simply connect to incubator
- Data logging starts automatically when plates are present
- Check "Data Logging" card to see data point counter

### 2. **Download Data**
- **Quick Download**: Click "💾 Download Today's CSV"
- **Browse All Files**: Click "📁 Manage CSV Files"
  - View list of all files
  - Download specific dates
  - Clear old data

### 3. **File Management**
- Files remain in browser localStorage until:
  - You manually download and clear them
  - You use "Clear Old (7+ days)" button
  - You clear browser data

### 4. **Best Practices**
- Download files regularly to free up browser storage
- Keep downloaded files backed up externally
- Clear old files weekly to prevent storage issues

## Technical Details

### Files Created:
1. **`src/services/csvLogger.js`** - CSV logging service (singleton)
2. **`src/components/CSVManagerModal.js`** - CSV file manager UI
3. **`src/components/CSVManagerModal.css`** - Modal styling

### Files Modified:
1. **`src/App.js`** - Integration and UI updates

### Key Functions:
- `csvLogger.logDataPoint(dataPoint, isSimulated)` - Log single data point
- `csvLogger.flushBuffer(isSimulated)` - Force write buffered data
- `csvLogger.downloadCSV(isSimulated)` - Download current file
- `csvLogger.getAvailableFiles()` - List all files
- `csvLogger.clearOldData(days)` - Remove old files

## Automatic Behaviors

### Buffer Flush Triggers:
1. Buffer reaches 10 data points
2. Component unmounts (page close)
3. Disconnecting from incubator
4. Date changes (midnight)
5. Mode changes (live ↔ simulated)

### New File Creation Triggers:
1. First data point of the day
2. Mode switch (live ↔ simulated)
3. First connection after date change

## Limitations

### Browser Storage:
- localStorage has 5-10 MB limit per domain
- Long runs may exceed storage
- **Solution**: Regular downloads and cleanup

### Data Persistence:
- Data survives page refresh
- Data cleared if:
  - Browser cache cleared
  - Private/Incognito mode ends
  - localStorage manually cleared

### Not Implemented:
- Server-side storage
- Database integration
- Automatic cloud backup
- Real-time sync across devices

## Future Enhancements (Optional)

1. **Backend Integration**:
   - Send data to server via API
   - PostgreSQL/MongoDB storage
   - Long-term archival

2. **Advanced Features**:
   - Export to Excel format
   - Data compression
   - Email reports
   - Scheduled downloads

3. **Analytics**:
   - Summary statistics
   - Anomaly detection
   - Trend analysis

## Testing Checklist

- [ ] Connect in live mode - verify file created
- [ ] Connect in simulated mode - verify separate file
- [ ] Let run for 1 minute - verify ~240 data points (4 shelves)
- [ ] Download CSV - verify correct format
- [ ] Check CSV Manager - verify file appears
- [ ] Switch modes - verify new file created
- [ ] Disconnect/reconnect - verify buffer flushed
- [ ] Wait until midnight - verify new daily file created
- [ ] Clear old data - verify files removed

## Support

For issues or questions about the CSV logging system, check:
1. Browser console for errors
2. localStorage inspector (DevTools → Application → Local Storage)
3. CSV Manager modal for file status
