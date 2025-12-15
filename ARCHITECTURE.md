# Hamilton Incubator System - Architecture & Communication Flow

**Last Updated:** December 15, 2025

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React 19.2.0)                         │
│                         http://localhost:3000                                │
│                                                                               │
│  • Real-time Status Monitoring (5s polling + SignalR)                        │
│  • Temperature & Shaking Control                                             │
│  • CSV Data Logging & Export                                                 │
│  • PDF Report Generation (client-side)                                       │
│  • Interactive Charts (Recharts)                                             │
│  • Plate Session Management                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP/REST API + SignalR WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WEB API (.NET Framework)                            │
│                         http://localhost:5000/api                            │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      IncubatorController.cs                             │ │
│  │                                                                          │ │
│  │  • HTTP REST Endpoints                                                  │ │
│  │  • SignalR Hub (real-time updates)                                      │ │
│  │  • CSV File API (read/write/list)                                       │ │
│  │  • Event Log API (NLog parsing)                                         │ │
│  │  • Simulation Mode Logic                                                │ │
│  │  • Temperature Conversion (device units → °C)                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Direct Method Calls
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (HIS Controller)                             │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         HISController.cs                                │ │
│  │                                                                          │ │
│  │  • Business Logic Layer                                                 │ │
│  │  • Device State Management                                              │ │
│  │  • Command Orchestration                                                │ │
│  │  • NLog Event Logging                                                   │ │
│  │  • Error Handling & Validation                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Hamilton DeviceDriver API
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DRIVER WRAPPER (Hamilton DLL)                             │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                   Hamilton.Incubator.DeviceDriver                       │ │
│  │                                                                          │ │
│  │  • Low-level hardware communication                                     │ │
│  │  • Serial/USB protocol handling                                         │ │
│  │  • Device status monitoring (FIRMWARE-LOCKED)                           │ │
│  │  • Command execution                                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Serial/USB Communication
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHYSICAL HAMILTON INCUBATOR                             │
│                                                                               │
│  • 4 Shelves with Temperature Control & Deviation Monitoring                 │
│  • Shaking/Agitation System (Continuous/Periodic, Timed/Indefinite)         │
│  • Fork Mechanism for Plate Handling                                         │
│  • Barcode Scanner Integration                                               │
│  • Sensors & Status Reporting                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Communication Flow

### 1. Frontend Layer (React 19.2.0 - Port 3000)

#### Key Components:
- **App.js** - Main application container with tab navigation
  - Home tab: Shelf grid with real-time status
  - Data Viewer tab: Live charts for all shelves
  - Plate Reports tab: Historical session analysis
  - Event Log tab: System event history
  
- **Custom Hooks:**
  - `useIncubator()` - Unified hook for status, connection, and control
    - Fetches status every 5s
    - Calculates `allowedDeviation` from `maxAlarmTemp - targetTemp`
    - Temperature values used directly (backend converts to °C)
  
- **Status Display Components:**
  - `ShelfStatus` - Displays shelf status with:
    - Dynamic temperature gradient border
    - Shaking status badges (Timed/Indefinite, Continuous/Periodic)
    - Countdown timer for timed shaking operations
    - Completion indicator when shake finishes
    - Plate presence and barcode display
  - `ShelfControls` - Temperature/shaking controls in modal
    - Temperature control with allowed deviation (0.5-10°C, default 3.0)
    - Shaking modes: Continuous/Periodic, Timed/Indefinite
    - Fan control (hardcoded to true, hidden from UI)
    
- **Data Visualization Components:**
  - `DataViewer` - Live multi-shelf temperature/RPM charts
    - Dual Y-axis (temperature + RPM)
    - Orange dashed deviation lines (targetTemp ± allowedDeviation)
    - Auto-updates from CSV data
    - Legacy CSV format support (defaults deviation to 3.0)
  - `PlateReportModal` - Session analysis and export
    - Interactive charts with event markers
    - Detailed event log with enhanced shaker formatting
    - Client-side PDF export (jsPDF + html2canvas)
    - Client-side CSV export (Blob API)
    - Event tooltip on chart hover
  - `EventLog` - System event viewer with filtering
  
- **Modal Components:**
  - `ShelfControlModal` - Control panel container
  - `ForkLoadedWarningModal` - Fork safety warning
  - `LoadPlatePromptModal` - Plate loading instructions
  - `ScanResultModal` - Barcode scan confirmation
  - `CSVManagerModal` - CSV file management
  - `ExportDataModal` - Export options
  
- **Services:**
  - `incubatorService.js` - HTTP client for API calls
  - `signalRService.js` - Real-time updates via SignalR
  - `csvLogger.js` - CSV data logging coordination
  - `eventStore.js` - Event log management
  - `configService.js` - Application configuration

#### Web Server Activity:
```
┌─────────────────────────────────────────────────────────────────────┐
│                       FRONTEND WEB SERVER                            │
│                    (React Development Server)                        │
│                                                                       │
│  npm start / webpack-dev-server                                      │
│  Serves: http://localhost:3000                                       │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Static Assets Served:                                         │  │
│  │  • index.html                                                  │  │
│  │  • bundle.js (compiled React code)                             │  │
│  │  • CSS files                                                   │  │
│  │  • manifest.json                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Client-Side Routing:                                          │  │
│  │  • Single Page Application (SPA)                               │  │
│  │  • All routes handled by React Router (if used)                │  │
│  │  • No server-side rendering                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  WebSocket/Hot Reload (Development Only):                      │  │
│  │  • Live code changes reflected instantly                       │  │
│  │  • Browser auto-refresh on file save                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 2. API Layer (.NET Framework Web API - Port 5000)

#### Key Controllers:
- **IncubatorController.cs** - Main API controller
- **IncubatorService.cs** (possibly) - Service endpoint controller

#### Web Server Activity:
```
┌─────────────────────────────────────────────────────────────────────┐
│                         API WEB SERVER                               │
│                    (IIS Express / Kestrel)                           │
│                                                                       │
│  Serves: http://localhost:5000                                       │
│  Swagger UI: http://localhost:5000/swagger                           │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  HTTP Endpoints Exposed:                                       │  │
│  │                                                                 │  │
│  │  CONNECTION & INITIALIZATION:                                  │  │
│  │  • POST /api/incubator/simulate                                │  │
│  │  • POST /api/incubator/connect                                 │  │
│  │  • POST /api/incubator/disconnect                              │  │
│  │  • POST /api/incubator/init                                    │  │
│  │  • GET  /api/incubator/status                                  │  │
│  │                                                                 │  │
│  │  FORK OPERATIONS:                                              │  │
│  │  • POST /api/incubator/fork/present                            │  │
│  │  • POST /api/incubator/fork/park                               │  │
│  │  • GET  /api/incubator/fork/status/park                        │  │
│  │  • GET  /api/incubator/fork/status/loaded                      │  │
│  │                                                                 │  │
│  │  SHELF OPERATIONS:                                             │  │
│  │  • POST /api/incubator/shelf/load/{module}                     │  │
│  │  • POST /api/incubator/shelf/remove/{module}                   │  │
│  │  • GET  /api/incubator/shelves/status                          │  │
│  │                                                                 │  │
│  │  TEMPERATURE CONTROL:                                          │  │
│  │  • POST /api/incubator/shelf/{module}/temp/start               │  │
│  │  • POST /api/incubator/shelf/{module}/temp/stop                │  │
│  │                                                                 │  │
│  │  SHAKING CONTROL:                                              │  │
│  │  • POST /api/incubator/shelf/{module}/shake/start              │  │
│  │  • POST /api/incubator/shelf/{module}/shake/stop               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Middleware Pipeline:                                          │  │
│  │  1. CORS Handler (allows localhost:3000)                       │  │
│  │  2. Authentication/Authorization (if implemented)              │  │
│  │  3. Request Logging                                            │  │
│  │  4. Route Handler                                              │  │
│  │  5. Exception Handler                                          │  │
│  │  6. Response Formatter (JSON)                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Simulation State Management:                                  │  │
│  │  • _isSimulationMode (static flag)                             │  │
│  │  • _simulationState (SimulationState class)                    │  │
│  │    - IsConnected                                               │  │
│  │    - IsForkParked                                              │  │
│  │    - IsForkLoaded                                              │  │
│  │    - Shelf status for each module (1-4)                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Complete Request Flow Examples

### Example 1: Connect to Incubator

```
┌──────────┐  1. User clicks     ┌─────────────────┐
│  User    │─────"Connect"──────▶│  React UI       │
└──────────┘                      │  (localhost:    │
                                  │   3000)         │
                                  └─────────────────┘
                                           │
                                           │ 2. onClick handler calls
                                           │    connect() from hook
                                           ▼
                                  ┌─────────────────┐
                                  │ useIncubator    │
                                  │ Connection()    │
                                  └─────────────────┘
                                           │
                                           │ 3. Calls service method
                                           ▼
                                  ┌─────────────────┐
                                  │ incubator       │
                                  │ Service.js      │
                                  └─────────────────┘
                                           │
                                           │ 4. HTTP POST Request
                                           │    axios.post('/api/incubator/connect')
                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WEB API SERVER (Port 5000)                    │
│                                                                   │
│  5. IIS/Kestrel receives HTTP POST                               │
│  6. Routes to IncubatorController.Connect()                      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  [HttpPost]                                                │  │
│  │  [Route("connect")]                                        │  │
│  │  public IHttpActionResult Connect()                        │  │
│  │  {                                                         │  │
│  │      if (_isSimulationMode)                                │  │
│  │      {                                                     │  │
│  │          _simulationState.IsConnected = true;              │  │
│  │          return Ok();                                      │  │
│  │      }                                                     │  │
│  │      else                                                  │  │
│  │      {                                                     │  │
│  │          _towerController.Connect();  ◄─────┐             │  │
│  │          _isConnected = true;               │             │  │
│  │          return Ok();                       │             │  │
│  │      }                                      │             │  │
│  │  }                                          │             │  │
│  └──────────────────────────────────────────┬──┘             │  │
└───────────────────────────────────────────────────────────────┘  │
                                              │                    │
                                              │ 7. Method call     │
                                              ▼                    │
                                  ┌─────────────────┐              │
                                  │ HISController   │              │
                                  │ .cs             │              │
                                  │ (Backend)       │              │
                                  └─────────────────┘              │
                                              │                    │
                                              │ 8. Calls driver    │
                                              ▼                    │
                                  ┌─────────────────┐              │
                                  │ Hamilton        │              │
                                  │ DeviceDriver    │              │
                                  │ DLL             │              │
                                  └─────────────────┘              │
                                              │                    │
                                              │ 9. Serial/USB      │
                                              │    communication   │
                                              ▼                    │
                                  ┌─────────────────┐              │
                                  │ Physical        │              │
                                  │ Incubator       │              │
                                  │ Hardware        │              │
                                  └─────────────────┘              │
                                              │                    │
                                              │ 10. Status response│
                                              ▼                    │
                      11. Returns OK/Error ◄──────────────────────┘
                          HTTP 200 with JSON
                                  │
                                  │ 12. axios resolves promise
                                  ▼
                          ┌─────────────────┐
                          │ React updates   │
                          │ state:          │
                          │ isConnected =   │
                          │ true            │
                          └─────────────────┘
                                  │
                                  │ 13. UI re-renders
                                  ▼
                          ┌─────────────────┐
                          │ Green badge     │
                          │ shows           │
                          │ "Connected"     │
                          └─────────────────┘
```

---

### Example 2: Start Temperature Control (with Polling)

```
┌──────────┐                                           
│  User    │  1. Opens control modal for Shelf 1      
└──────────┘  2. Sets target temp to 37°C             
     │        3. Clicks "Start Temperature Control"   
     │                                                  
     ▼                                                  
┌─────────────────┐                                    
│  ShelfControls  │  4. handleStartTemp()              
│  Component      │                                    
└─────────────────┘                                    
     │                                                  
     │ 5. Calls service                                
     ▼                                                  
┌─────────────────┐                                    
│ incubator       │  6. HTTP POST                      
│ Service.js      │  /api/incubator/shelf/1/temp/start 
└─────────────────┘  Body: {targetTemp: 37, fan: true}
     │                                                  
     │ 7. Request sent                                 
     ▼                                                  
┌──────────────────────────────────────────────────┐  
│        WEB API (IncubatorController)              │  
│                                                    │  
│  8. Receives POST request                         │  
│  9. Validates parameters                          │  
│  10. If simulation: Updates _simulationState      │  
│  11. If real: Calls _towerController              │  
└──────────────────────────────────────────────────┘  
     │                                                  
     │ 12. Backend call (if not simulation)           
     ▼                                                  
┌─────────────────┐                                    
│ HISController   │  13. StartTemperature()            
└─────────────────┘                                    
     │                                                  
     │ 14. Driver command                              
     ▼                                                  
┌─────────────────┐                                    
│ Hamilton Driver │  15. Sends command to hardware    
└─────────────────┘                                    
     │                                                  
     │ 16. Success/Error response                      
     ▼                                                  
     Returns HTTP 200 OK                               
     │                                                  
     ▼                                                  
┌─────────────────┐                                    
│ React updates   │  17. onStatusChange() called       
│ triggers        │  18. refreshStatus() triggered     
│ polling         │                                    
└─────────────────┘                                    
                                                        
┌─────────────────────────────────────────────────┐   
│  CONTINUOUS POLLING (useIncubatorStatus hook)    │   
│                                                   │   
│  Every 5 seconds while connected:                │   
│                                                   │   
│  1. HTTP GET /api/incubator/shelves/status       │   
│  2. Web API queries device status                │   
│  3. Returns JSON with all shelves:               │   
│     {                                             │   
│       shelves: [                                  │   
│         {                                         │   
│           module: 1,                              │   
│           platePresent: true,                     │   
│           currentTemp: 36.8,                      │   
│           targetTemp: 37.0,  ◄── Non-zero = ON   │   
│           status: "Active ventilation",           │   
│           currentRPM: 0,     ◄── Zero = OFF       │   
│           errors: [],                             │   
│           ...                                     │   
│         },                                        │   
│         ...                                       │   
│       ]                                           │   
│     }                                             │   
│  4. React updates state                           │   
│  5. UI reflects current values                    │   
│  6. Status badge shows "Active" (green)           │   
│  7. Start button disabled, Stop button enabled    │   
└─────────────────────────────────────────────────┘   
```

---

### Example 3: Load Plate Workflow

```
┌──────────┐                                                    
│  User    │  1. Opens Shelf 2 control modal                   
└──────────┘  2. Shelf shows no plate present                  
     │        3. "Load Plate to Shelf" button visible          
     ▼                                                           
┌─────────────────┐                                             
│ ShelfControls   │  4. User clicks "Load Plate"               
└─────────────────┘  5. handleLoadPlate() executes             
     │                                                           
     │ 6. Check fork status                                     
     ▼                                                           
┌─────────────────┐                                             
│ GET /api/       │  7. Is fork parked?                         
│ incubator/fork/ │                                             
│ status/park     │                                             
└─────────────────┘                                             
     │                                                           
     │ 8. Response: { isParked: true }                          
     ▼                                                           
┌─────────────────┐                                             
│ POST /api/      │  9. Present fork automatically             
│ incubator/fork/ │                                             
│ present         │                                             
└─────────────────┘                                             
     │                                                           
     │ 10. Fork moves to presented position                     
     │                                                           
     ▼                                                           
┌─────────────────────────────────────────────────┐            
│  LoadPlatePromptModal appears                    │            
│                                                   │            
│  "Please place a plate onto the presented fork"  │            
│                                                   │            
│  [Done - Plate is Loaded]                        │            
└─────────────────────────────────────────────────┘            
     │                                                           
     │ 11. User physically loads plate                          
     │ 12. User clicks "Done"                                   
     │                                                           
     ▼                                                           
┌─────────────────┐                                             
│ GET /api/       │  13. Verify plate on fork                   
│ incubator/fork/ │                                             
│ status/loaded   │                                             
└─────────────────┘                                             
     │                                                           
     │ 14. Response: { hasPlate: true } ✓                       
     │                                                           
     ▼                                                           
┌─────────────────┐                                             
│ POST /api/      │  15. Load plate to shelf                    
│ incubator/shelf/│                                             
│ load/2          │                                             
└─────────────────┘                                             
     │                                                           
     │ 16. Backend executes load                                
     │ 17. Fork moves plate to shelf 2                          
     │ 18. Fork returns to parked                               
     │                                                           
     ▼                                                           
┌─────────────────┐                                             
│ Success!        │  19. Modal closes                           
│ Polling shows   │  20. Status updates via polling             
│ platePresent:   │  21. UI shows "Plate Present" badge         
│ true            │  22. Load button disappears                 
└─────────────────┘  23. Unload button appears (if inactive)    
```

---

## Polling Mechanism Details

### Status Polling (useIncubatorStatus)
```javascript
// Runs every 5 seconds when connected
setInterval(() => {
    fetch('http://localhost:5000/api/incubator/shelves/status')
        .then(response => response.json())
        .then(data => {
            // Update all 4 shelf status cards
            // Temperature, shaking, plate presence, errors
        });
}, 5000);
```

### Fork Polling (useForkControl)
```javascript
// Runs every 5 seconds when connected
setInterval(() => {
    fetch('http://localhost:5000/api/incubator/fork/status/park')
        .then(response => response.json())
        .then(data => {
            // Update fork parked status
            // Enable/disable Present/Park buttons
        });
}, 5000);
```

---

## Error Handling Flow

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend Error Handling                                      │
│                                                                │
│  try {                                                         │
│      await incubatorService.startTemperature(...)             │
│  } catch (err) {                                              │
│      setError(err.message)  // Display in UI                  │
│  }                                                             │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP errors propagated up
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  API Layer Error Handling                                     │
│                                                                │
│  try {                                                         │
│      _towerController.StartTemperature(...)                   │
│      return Ok();                                             │
│  } catch (Exception ex) {                                     │
│      return InternalServerError(ex);  // HTTP 500             │
│  }                                                             │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ Exception caught
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend/Driver Error Handling                                │
│                                                                │
│  • Communication timeouts                                      │
│  • Device not responding                                       │
│  • Invalid parameter ranges                                    │
│  • Hardware faults                                             │
│                                                                │
│  Throws exceptions back up the stack                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Summary: Web Server Responsibilities

### Frontend Web Server (React Dev Server - Port 3000)
- **Serves:** Static HTML, JavaScript bundles, CSS
- **Handles:** Client-side routing (SPA)
- **Provides:** Hot module replacement during development
- **CORS:** Makes cross-origin requests to Port 5000
- **Does NOT:** Process business logic, access hardware, store data

### API Web Server (.NET Web API - Port 5000)
- **Serves:** RESTful API endpoints
- **Handles:** HTTP request routing, authentication, CORS
- **Processes:** Business logic validation
- **Manages:** Simulation state (when in simulation mode)
- **Coordinates:** Backend controller calls
- **Returns:** JSON responses
- **Exposes:** Swagger UI for API documentation
- **Does NOT:** Directly communicate with hardware (delegates to backend)

### Backend Layer (HISController - In-Process)
- **Not a web server** - runs in same process as Web API
- **Handles:** Business logic and device orchestration
- **Manages:** Device state and command sequencing
- **Abstracts:** Driver complexity from API layer
- **Calls:** Hamilton DeviceDriver DLL methods

### Driver Layer (Hamilton DLL - In-Process)
- **Not a web server** - native DLL loaded by backend
- **Handles:** Low-level serial/USB communication
- **Translates:** High-level commands to device protocol
- **Manages:** Hardware connection and status
- **Communicates:** Directly with physical incubator

---

## Key Takeaways

1. **Two Web Servers:** 
   - React (3000): Serves UI
   - .NET API (5000): Serves REST API

2. **Request Flow:** 
   User → React UI → HTTP Request → Web API → Backend → Driver → Hardware

3. **Polling:** 
   React continuously polls API every 5s for status updates

4. **Simulation:** 
   API layer can bypass hardware and return mock data

5. **State Management:** 
   React (UI state) ← HTTP ← API (simulation state) ← Backend (device state)

