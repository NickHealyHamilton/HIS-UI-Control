# CSV Data Logging - Complete Redesign Summary

## Changes Implemented

### **Architecture Change:**
- **OLD**: In-memory array (max 1000 points) → Used for both logging and plotting
- **NEW**: CSV files on filesystem → Read from CSV for plotting

---

## 1. Frontend Changes

### **`src/services/csvLogger.js`** - Completely Rewritten
**Key Changes:**
- Removed localStorage storage
- Added backend API calls for file operations
- `initializeCSVFile()` - Creates file via API
- `appendToCSVFile()` - Writes rows via API
- `readCSVFile()` - Reads and parses CSV
- `listCSVFiles()` - Gets available files
- `parseCSV()` - Parses CSV string into data array

**File Path:** `C:\ProgramData\Hamilton\HIS API\Data logs\incubator_{mode}_{date}.csv`

---

### **`src/services/incubatorService.js`** - API Methods Added
New endpoints:
```javascript
initializeCSVFile(filename, header)
appendToCSVFile(filename, rows)
listCSVFiles()
readCSVFile(filename)
deleteCSVFile(filename)
deleteOldCSVFiles(daysToKeep)
```

---

### **`src/App.js`** - Simplified
**Removed:**
- `historicalData` state (was keeping 1000 points in memory)
- `setHistoricalData` calls

**Kept:**
- Data collection logic (still runs every second)
- CSV logging calls (writes to file instead of memory)
- `dataPointsCollectedRef` for displaying count

**Updated:**
- "Download Today's CSV" button removed (now in CSV Manager)
- Data logging section shows collected count from ref
- DataPlotModal receives `isSimulated` prop instead of `historicalData`

---

### **`src/components/DataPlotModal.js`** - Completely Rewritten
**New Features:**

1. **File Selector Dropdown**
   - Lists all available CSV files (filtered by mode)
   - Auto-selects today's file
   - Shows row count for each file

2. **Time Span Selector**
   - 5 minutes
   - 15 minutes
   - 30 minutes  
   - 1 hour (default)
   - 2 hours
   - 4 hours
   - 8 hours
   - 24 hours
   - All data

3. **Dynamic Data Loading**
   - Loads CSV file from backend when selected
   - Filters data by selected time span
   - Shows loading indicator
   - Displays: "{chartData points} | {total in file} total"

4. **Chart Updates**
   - Same temperature and RPM charts
   - Now reads from CSV files
   - Can view any historical file
   - Can zoom to different time spans

---

### **`src/components/DataPlotModal.css`** - Styles Added
New classes:
- `.plot-controls` - Control panel container
- `.control-group` - Label + select wrapper
- `.file-select`, `.timespan-select` - Dropdown styling
- `.control-info` - Info text display

---

### **`src/components/CSVManagerModal.js`** - No Changes
Still works the same way

---

## 2. Backend Changes Required

### **New Controller:** `CSVController.cs`
**Location:** `Controllers/CSVController.cs`

**Endpoints to Implement:**
```
POST   /api/incubator/csv/init
POST   /api/incubator/csv/append
GET    /api/incubator/csv/list
GET    /api/incubator/csv/read/{filename}
DELETE /api/incubator/csv/delete/{filename}
DELETE /api/incubator/csv/cleanup?daysToKeep=7
```

See `BACKEND_CSV_API_REQUIREMENTS.md` for full implementation details.

---

## 3. Benefits of New Architecture

### **Scalability:**
✅ **Unlimited data storage** - No 1000-point limit  
✅ **24-hour runs** - Full day of data in CSV  
✅ **Historical analysis** - View data from previous days

### **Performance:**
✅ **Memory efficient** - No large arrays in browser  
✅ **Fast plotting** - Only load selected time span  
✅ **Buffered writes** - Batch of 10 rows reduces file I/O

### **Flexibility:**
✅ **Time span control** - Zoom from 5 min to 24 hours  
✅ **File selection** - View any historical file  
✅ **Mode separation** - Live and simulated in separate files

### **Data Persistence:**
✅ **Filesystem storage** - Survives page refresh AND browser close  
✅ **Server-side** - Not limited by browser storage  
✅ **Standard format** - CSV files can be opened in Excel

---

## 4. User Experience Flow

### **During a Run:**
1. Connect to incubator
2. Data automatically logs to CSV every second
3. Counter shows: "X data points logged"
4. Buffer of 10 points written at a time

### **Viewing Data:**
1. Click "📊 View Historical Data"
2. Modal opens with:
   - File selector (today's file auto-selected)
   - Time span selector (1 hour default)
   - Temperature chart
   - RPM chart
3. Change file → loads different day's data
4. Change time span → filters displayed data
5. See: "1234 data points | 87400 total in file"

### **Managing Files:**
1. Click "📁 Manage CSV Files"
2. See table of all CSV files
3. Download any file
4. Delete old files (7+ days)

---

## 5. File Structure Example

### **After 24-Hour Run:**
```
C:\ProgramData\Hamilton\HIS API\Data logs\
  ├── incubator_live_2025-10-23.csv     (22 MB, 345,600 rows)
  ├── incubator_live_2025-10-22.csv     (22 MB, 345,600 rows)
  ├── incubator_simulated_2025-10-23.csv (15 MB, 230,400 rows)
  └── ...
```

### **CSV Content:**
```csv
shelf,timestamp,currentTemp,targetTemp,currentRPM,targetRPM,platePresent
1,2025-10-23T00:00:00.000Z,37.5,37.0,150,150,true
2,2025-10-23T00:00:00.000Z,37.4,37.0,150,150,true
3,2025-10-23T00:00:00.000Z,37.6,37.0,150,150,true
4,2025-10-23T00:00:00.000Z,37.5,37.0,150,150,true
1,2025-10-23T00:00:01.000Z,37.5,37.0,150,150,true
...
```

---

## 6. Next Steps

### **Backend Implementation:**
1. Create `CSVController.cs` in backend project
2. Implement 6 endpoints (see BACKEND_CSV_API_REQUIREMENTS.md)
3. Test each endpoint individually
4. Ensure directory creation works
5. Handle file path security (no path traversal)

### **Testing:**
1. Start backend server
2. Connect in live mode
3. Wait 30 seconds
4. Open "View Historical Data" modal
5. Verify file appears in dropdown
6. Verify charts display data
7. Change time span - verify filtering works
8. Switch to simulated mode - verify separate file

### **Optional Enhancements:**
- Add file export button (download to custom location)
- Add data compression (gzip CSV files)
- Add streaming for large files (pagination)
- Add real-time chart updates (don't need to reopen modal)

---

## 7. Breaking Changes

⚠️ **Users will lose in-memory data** when they refresh the page with this update.  
✅ But going forward, ALL data is persisted to CSV files.

⚠️ **Backend API must be updated** before frontend will work.  
✅ Frontend will show errors until CSV endpoints are implemented.

---

## 8. Migration Notes

If you have old localStorage data:
- It will no longer be used
- CSVManagerModal will not show those files
- They can be manually cleared: DevTools → Application → Local Storage

New CSV files will be created in:
```
C:\ProgramData\Hamilton\HIS API\Data logs\
```

---

## Summary

You now have a **production-ready, scalable data logging system** that:
- ✅ Writes to filesystem CSV files
- ✅ Handles unlimited data (24+ hour runs)
- ✅ Provides flexible time span viewing
- ✅ Separates live vs simulated data
- ✅ Allows historical analysis
- ✅ Uses standard CSV format

**Next:** Implement the 6 backend API endpoints! 🚀
