import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/incubator'; // Update with your actual API port

const incubatorService = {
    // Device Discovery
    discoverDevices: async () => {
        const response = await axios.post(`${API_BASE_URL}/discover`);
        return response.data;
    },

    // Simulation Control
    setSimulationMode: async (simulate) => {
        const response = await axios.post(`${API_BASE_URL}/simulate`, JSON.stringify(simulate), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    },

    // Connection Management
    connect: async (comPort) => {
        const response = await axios.post(`${API_BASE_URL}/connect`, `"${comPort}"`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    },

    disconnect: async () => {
        const response = await axios.post(`${API_BASE_URL}/disconnect`);
        return response.data;
    },

    initialize: async () => {
        const response = await axios.post(`${API_BASE_URL}/init`);
        return response.data;
    },

    // Fork Operations
    presentFork: async () => {
        const response = await axios.post(`${API_BASE_URL}/fork/present`);
        return response.data;
    },

    moveForkToScanningPosition: async () => {
        const response = await axios.post(`${API_BASE_URL}/fork/moveToScanningPosition`);
        return response.data;
    },

    parkFork: async () => {
        const response = await axios.post(`${API_BASE_URL}/fork/park`);
        return response.data;
    },

    getForkStatus: async () => {
        const response = await axios.get(`${API_BASE_URL}/fork/status/park`);
        return {
            isParked: response.data.isParked,
            timestamp: response.data.timestamp
        };
    },

    getForkLoadedStatus: async () => {
        const response = await axios.get(`${API_BASE_URL}/fork/status/loaded`);
        return {
            hasPlate: response.data.hasPlate,
            timestamp: response.data.timestamp
        };
    },

    // Shelf Operations
    loadPlate: async (module) => {
        const response = await axios.post(`${API_BASE_URL}/shelf/load/${module}`);
        return response.data;
    },

    removePlate: async (module) => {
        const response = await axios.post(`${API_BASE_URL}/shelf/remove/${module}`);
        return response.data;
    },

    // Shaking Operations
    startShaking: async (module, parameters) => {
        const response = await axios.post(`${API_BASE_URL}/shelf/${module}/shake/start`, parameters);
        return response.data;
    },

    stopShaking: async (module) => {
        const response = await axios.post(`${API_BASE_URL}/shelf/${module}/shake/stop`);
        return response.data;
    },

    // Temperature Control
    startTemperature: async (module, parameters) => {
        const response = await axios.post(`${API_BASE_URL}/shelf/${module}/temp/start`, parameters);
        return response.data;
    },

    stopTemperature: async (module) => {
        const response = await axios.post(`${API_BASE_URL}/shelf/${module}/temp/stop`);
        return response.data;
    },

    // Status
    getConnectionStatus: async () => {
        const response = await axios.get(`${API_BASE_URL}/status`);
        return response.data;
    },

    getAllShelvesStatus: async (reset = false) => {
        const response = await axios.get(`${API_BASE_URL}/shelves/status`, {
            params: { reset }
        });
        return response.data;
    },

    // CSV File Management
    initializeCSVFile: async (filename, header) => {
        const response = await axios.post(`${API_BASE_URL}/csv/init`, {
            filename,
            header
        });
        return response.data;
    },

    appendToCSVFile: async (filename, rows) => {
        const response = await axios.post(`${API_BASE_URL}/csv/append`, {
            filename,
            rows
        });
        return response.data;
    },

    listCSVFiles: async () => {
        const response = await axios.get(`${API_BASE_URL}/csv/list`);
        return response.data.files; // Extract the files array
    },

    readCSVFile: async (filename) => {
        const response = await axios.get(`${API_BASE_URL}/csv/read/${encodeURIComponent(filename)}`);
        return response.data.content;
    },

    deleteCSVFile: async (filename) => {
        const response = await axios.delete(`${API_BASE_URL}/csv/delete/${encodeURIComponent(filename)}`);
        return response.data;
    },

    deleteOldCSVFiles: async (daysToKeep) => {
        const response = await axios.delete(`${API_BASE_URL}/csv/cleanup`, {
            params: { daysToKeep }
        });
        return response.data;
    },

    fetchEvents: async (startTime, endTime, module = null) => {
        const params = {
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString()
        };
        if (module !== null && module !== undefined) {
            params.module = module;
        }
        console.log(`[fetchEvents] Requesting events:`, {
            startTime: params.startTime,
            endTime: params.endTime,
            module: params.module,
            originalStart: new Date(startTime).toLocaleString(),
            originalEnd: new Date(endTime).toLocaleString()
        });
        const response = await axios.get(`${API_BASE_URL}/csv/fetchEvents`, { params });
        console.log(`[fetchEvents] Response:`, {
            eventCount: response.data.events?.length || 0,
            totalCount: response.data.count
        });
        return response.data;
    },

    // Scanner Operations
    connectScanner: async (comPort) => {
        const response = await axios.post(`${API_BASE_URL}/scanner/connect`, `"${comPort}"`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    },

    setROI: async (x0, y0, x1, y1) => {
        const response = await axios.post(`${API_BASE_URL}/scanner/imagesettings/ROI`, null, {
            params: { x0, y0, x1, y1 }
        });
        return response.data;
    },

    restartService: async () => {
        const response = await axios.post(`${API_BASE_URL}/restart`);
        return response.data;
    },

    disconnectScanner: async () => {
        const response = await axios.post(`${API_BASE_URL}/scanner/disconnect`);
        return response.data;
    },

    getScannerStatus: async () => {
        const response = await axios.get(`${API_BASE_URL}/scanner/status`);
        return response.data;
    },

    scan: async (module = 0) => {
        const response = await axios.post(`${API_BASE_URL}/scanner/scan`, null, {
            params: { module }
        });
        return response.data;
    },

    getScanImage: async () => {
        const response = await axios.get(`${API_BASE_URL}/scanner/scan/image`);
        return response.data; // Returns base64 string from backend
    },

    // Live image streaming
    setLiveImageMode: async (enabled) => {
        const response = await axios.post(`${API_BASE_URL}/scanner/live/set`, null, {
            params: { setLive: enabled }
        });
        return response.data;
    },

    getLiveImage: async () => {
        const response = await axios.get(`${API_BASE_URL}/scanner/live/getimg`);
        return response.data; // Returns { imageData: base64, timestamp: DateTime }
    }
};

export default incubatorService;