# HIS - Hamilton Incubator System

A full-stack application for managing and monitoring Hamilton incubator systems with real-time temperature control, shaking capabilities, and comprehensive data logging.

## Project Structure

```
HIS/
├── HIS Backend/          # .NET Framework Web API backend
│   ├── HIS_API_NETFramework/
│   ├── HIS_Backend/
│   └── HIS Backend and API.sln
├── HIS UI/              # React frontend application
│   ├── src/
│   ├── public/
│   └── package.json
└── ARCHITECTURE.md      # System architecture documentation
```

## Features

### Temperature Control
- Real-time temperature monitoring for 4 shelves
- Configurable target temperature and allowed deviation (0.5-10°C)
- Visual temperature gradient indicators
- Upper/lower deviation threshold tracking

### Shaking Control
- Continuous and periodic shaking modes
- Timed and indefinite shaking options
- Configurable RPM and timing parameters
- Real-time countdown timer for timed operations

### Data Management
- CSV logging with timestamp, temperature, and shaking data
- Historical data visualization with interactive charts
- Plate barcode tracking and session management
- PDF and CSV export for session reports

### Real-time Monitoring
- SignalR integration for live status updates
- Event logging with detailed shaker/temperature events
- Plate presence detection
- Door open/close monitoring

## Prerequisites

### Backend
- .NET Framework 4.7.2 or higher
- Visual Studio 2019 or later (recommended)
- IIS or IIS Express for hosting

### Frontend
- Node.js 14.x or higher
- npm 6.x or higher

## Installation

### Backend Setup

1. Navigate to the backend folder:
   ```bash
   cd "HIS Backend"
   ```

2. Restore NuGet packages:
   ```bash
   nuget restore "HIS Backend and API.sln"
   ```

3. Open the solution in Visual Studio:
   ```bash
   start "HIS Backend and API.sln"
   ```

4. Build the solution (Ctrl+Shift+B)

5. Configure the backend URL in `launchSettings.json` or IIS

### Frontend Setup

1. Navigate to the frontend folder:
   ```bash
   cd "HIS UI"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure the backend URL in `src/services/incubatorService.js`:
   ```javascript
   const BASE_URL = 'http://localhost:5000/api';
   ```

4. Start the development server:
   ```bash
   npm start
   ```

The application will open at `http://localhost:3000`

## Configuration

### Backend Configuration
- API endpoints configured in Web API controllers
- SignalR hub for real-time updates
- NLog configuration for event logging
- CSV output directory configuration

### Frontend Configuration
- Backend API URL in service files
- SignalR connection settings
- Chart visualization parameters
- CSV export settings

## Usage

### Starting a Session
1. Load a plate onto a shelf
2. Scan barcode or manually enter plate ID
3. Configure temperature control (target temp + allowed deviation)
4. Configure shaking parameters (RPM, continuous/periodic, timed/indefinite)
5. Monitor real-time status in the UI

### Viewing Data
- Live charts in **Data Viewer** tab
- Historical session data in **Plate Reports** tab
- Export session data as PDF or CSV

### Event Monitoring
- **Event Log** shows all system events
- Temperature reached/out-of-range alerts
- Shaker start/stop with detailed parameters
- Door and plate events

## Development

### Frontend Development
```bash
cd "HIS UI"
npm start          # Start dev server
npm run build      # Create production build
npm test           # Run tests
```

### Backend Development
- Open solution in Visual Studio
- Set startup project to Web API
- F5 to debug
- Ensure IIS Express or local IIS is configured

## Technologies Used

### Backend
- .NET Framework 4.7.2
- ASP.NET Web API
- SignalR for real-time communication
- NLog for event logging
- Entity Framework (if applicable)

### Frontend
- React 19.2.0
- Recharts for data visualization
- jsPDF + html2canvas for PDF export
- CSS3 with Hamilton design system

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system architecture documentation.

## CSV Data Format

Session CSV files include:
- `shelf` - Shelf number (1-4)
- `timestamp` - ISO 8601 timestamp
- `currentTemp` - Current temperature (°C)
- `targetTemp` - Target temperature (°C)
- `allowedDeviation` - Allowed deviation (°C)
- `currentRPM` - Current shaking speed
- `targetRPM` - Target shaking speed
- `platePresent` - Plate presence (true/false)
- `barcode` - Plate barcode

## Event Log Format

Events are logged with:
- Timestamp
- Event type (Temperature, Shaker, Plate, Door)
- Module/Shelf identifier
- Event details and parameters

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

[Specify your license]

## Support

For issues or questions, contact [your contact info]
