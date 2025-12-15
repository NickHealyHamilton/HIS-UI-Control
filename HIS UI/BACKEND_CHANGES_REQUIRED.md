# Allowed Deviation Feature Implementation

## Summary
The frontend has been fully updated to support the "allowed deviation" parameter for temperature control. Since the backend status endpoint is locked by device firmware and cannot be modified, the frontend tracks the deviation value locally in App.js state.

## Changes Made to Frontend

### 1. ShelfControls.js
- ✅ Added input field for "Allowed Deviation (°C)" with range 0.5-10, default 3.0
- ✅ Updated `handleStartTemp` to send deviation in hundredths (multiplied by 100)
  ```javascript
  const params = {
      targetTemp: Math.round(tempParams.targetTemp * 100),
      allowedDeviation: Math.round(tempParams.allowedDeviation * 100),
      fan: tempParams.fan
  };
  ```

### 2. CSV Logging (csvLogger.js & App.js)
- ✅ Updated CSV header: `shelf,timestamp,currentTemp,targetTemp,allowedDeviation,currentRPM,targetRPM,platePresent,barcode`
- ✅ Added allowedDeviation field to data points (converted from hundredths to decimal)
- ✅ Updated CSV parser to read allowedDeviation from column 4

### 3. PlateReportModal.js
- ✅ Updated CSV parsing to extract allowedDeviation from column 4
- ✅ Added orange dashed lines showing upper and lower setpoint ranges (targetTemp ± allowedDeviation)
- ✅ Applied to both multi-session and single-session chart views

### 4. DataViewer.js
- ✅ Updated CSV parsing to read targetTemp and allowedDeviation
- ✅ Added deviation range lines for all 4 shelves in live data viewer
- ✅ Orange dashed lines (#ff9800) show acceptable temperature range

## Architecture - Frontend State Tracking

Since the backend GetShelfStatus endpoint is locked by device firmware, the frontend tracks `allowedDeviation` locally:

### App.js State Management
```javascript
const [shelfDeviations, setShelfDeviations] = useState({
  1: null,
  2: null,
  3: null,
  4: null
});
```

### Data Flow
1. **User sets temperature** → ShelfControls component
2. **Deviation value stored** → `onDeviationChange` callback updates App.js state
3. **CSV logging** → Deviation included from tracked state (not backend status)
4. **Temperature stopped** → Deviation cleared from state (set to null)

### Value Format
- Backend expects values in **hundredths of degrees** (e.g., 300 = 3.0°C)
- Frontend sends to backend in hundredths when starting temp control
- Frontend stores in state as decimal (3.0)
- CSV logging writes decimal value (3.0)

## Testing Checklist

1. ✅ Start temperature control with custom deviation (e.g., 5.0°C)
2. ✅ Verify deviation is tracked in App.js state
3. ✅ Check CSV file includes deviation column with correct value (5.0)
4. ✅ View live data in DataViewer - should see orange deviation lines when data available
5. ✅ Stop temperature control - verify deviation clears from state (no more lines in new data)
6. ✅ Generate plate report - should see deviation lines in historical charts
7. ✅ Export CSV from report - verify deviation column is present
8. ✅ Export PDF from report - verify deviation lines visible in chart images

## Default Values
- **Frontend default:** 3.0°C (user-configurable in UI, range 0.5-10°C)
- **Backend default:** 250 hundredths (2.5°C) when null
- **State tracking:** null when temp control inactive, decimal value when active

## Color Scheme
- **Temperature line:** #4cc2ee (Hamilton blue)
- **RPM line:** #00f091 (green, dashed)
- **Deviation lines:** #ff9800 (orange, thin dashed)
