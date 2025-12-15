import { useState, useEffect, useCallback } from 'react';
import incubatorService from '../services/incubatorService';

export const useIncubatorConnection = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isSimulated, setIsSimulated] = useState(false);

    const checkConnection = useCallback(async () => {
        try {
            const status = await incubatorService.getConnectionStatus();
            setIsConnected(status.connected);
            setIsInitialized(status.initialized); // Read initialized status from backend
            setIsSimulated(status.simulated);
        } catch (err) {
            setError(err.message);
            setIsConnected(false);
            setIsInitialized(false);
        }
    }, []);

    const connect = async (comPort) => {
        setIsLoading(true);
        setError(null);
        try {
            await incubatorService.connect(comPort);
            await checkConnection();
            setIsInitialized(false); // Reset initialization on new connection
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const disconnect = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await incubatorService.disconnect();
            await checkConnection();
            setIsInitialized(false); // Reset initialization on disconnect
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const setSimulationMode = async (simulate) => {
        setIsLoading(true);
        setError(null);
        try {
            await incubatorService.setSimulationMode(simulate);
            setIsSimulated(simulate);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const initialize = async () => {
        setIsLoading(true);
        setError(null);
        try {
            await incubatorService.initialize();
            setIsInitialized(true); // Mark as initialized on success
        } catch (err) {
            setError(err.message);
            setIsInitialized(false); // Failed initialization
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        checkConnection();
    }, [checkConnection]);

    return {
        isConnected,
        isInitialized,
        isLoading,
        error,
        isSimulated,
        connect,
        disconnect,
        initialize,
        setSimulationMode
    };
};

export const useIncubatorStatus = (pollInterval = 5000, isConnected = false) => {
    const [shelvesStatus, setShelvesStatus] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchStatus = useCallback(async () => {
        if (!isConnected) {
            return; // Don't fetch if not connected
        }
        
        try {
            setIsLoading(true);
            const response = await incubatorService.getAllShelvesStatus();
            
            // Log raw response for debugging
            console.log('Raw status response from backend:', response.shelves[0]);
            
            // Ensure errors are always arrays and calculate allowedDeviation from alarm temps
            const normalizedShelves = response.shelves.map(shelf => ({
                ...shelf,
                // Calculate allowed deviation from alarm temps (maxAlarmTemp - targetTemp)
                allowedDeviation: (shelf.maxAlarmTemp != null && shelf.targetTemp != null) 
                    ? shelf.maxAlarmTemp - shelf.targetTemp 
                    : null,
                errors: Array.isArray(shelf.errors) ? shelf.errors : [],
                shakeErrors: Array.isArray(shelf.shakeErrors) ? shelf.shakeErrors : []
            }));
            
            // Always update the state to ensure data collection happens every poll
            setShelvesStatus(normalizedShelves);
            
            setError(null);
        } catch (err) {
            setError(err.message);
            // Don't clear shelves on error, just log it
        } finally {
            setIsLoading(false);
        }
    }, [isConnected]);

    useEffect(() => {
        if (!isConnected) {
            return; // Don't start polling if not connected
        }
        
        fetchStatus();
        const interval = setInterval(fetchStatus, pollInterval);
        return () => clearInterval(interval);
    }, [fetchStatus, pollInterval, isConnected]);

    return {
        shelvesStatus,
        isLoading,
        error,
        refreshStatus: fetchStatus
    };
};

export const useForkControl = (isConnected = false, pollInterval = 5000) => {
    const [forkStatus, setForkStatus] = useState({ isParked: true, hasPlate: false });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const getForkStatus = useCallback(async () => {
        if (!isConnected) {
            return; // Don't fetch if not connected
        }
        
        try {
            const status = await incubatorService.getForkStatus();
            setForkStatus(prev => ({
                ...prev,
                isParked: status.isParked
            }));
            setError(null);
        } catch (err) {
            setError(err.message);
        }
    }, [isConnected]);

    const checkLoadedStatus = useCallback(async () => {
        if (!isConnected) {
            return;
        }
        
        setIsLoading(true);
        try {
            const status = await incubatorService.getForkLoadedStatus();
            setForkStatus(prev => ({
                ...prev,
                hasPlate: status.hasPlate
            }));
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [isConnected]);

    const presentFork = async () => {
        setIsLoading(true);
        try {
            await incubatorService.presentFork();
            await getForkStatus();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const parkFork = async () => {
        setIsLoading(true);
        try {
            await incubatorService.parkFork();
            await getForkStatus();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!isConnected) {
            return; // Don't fetch status if not connected
        }
        
        // Initial fetch
        getForkStatus();
        
        // Poll for status updates
        const interval = setInterval(getForkStatus, pollInterval);
        
        return () => clearInterval(interval);
    }, [getForkStatus, isConnected, pollInterval]);

    return {
        forkStatus,
        isLoading,
        error,
        presentFork,
        parkFork,
        checkLoadedStatus,
        refreshStatus: getForkStatus
    };
};