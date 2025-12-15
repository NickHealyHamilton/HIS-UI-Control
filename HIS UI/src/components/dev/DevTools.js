import React, { useState } from 'react';
import incubatorService from '../../services/incubatorService';

const DevTools = () => {
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState('');

  // Only show in development
  if (process.env.NODE_ENV !== 'development') return null;

  const handleRestart = async () => {
    if (isRestarting) return;
    
    const confirmed = window.confirm('Are you sure you want to restart the HIS API Windows service? This will disconnect all connections and refresh the page.');
    if (!confirmed) return;
    
    try {
      setIsRestarting(true);
      setRestartMessage('Restarting service...');
      
      await incubatorService.restartService();
      
      setRestartMessage('✓ Service restarted. Refreshing page in 8 seconds...');
      
      // Wait for service to fully restart, then refresh
      setTimeout(() => {
        window.location.reload();
      }, 8000);
      
    } catch (error) {
      console.error('Failed to restart services:', error);
      setRestartMessage('✗ Failed to restart service: ' + (error.message || 'Unknown error'));
      setTimeout(() => {
        setRestartMessage('');
        setIsRestarting(false);
      }, 5000);
    }
  };

  return (
    <div className="dev-tools">
      <button 
        onClick={handleRestart}
        className={`dev-restart-button ${isRestarting ? 'restarting' : ''}`}
        disabled={isRestarting}
      >
        {isRestarting ? '⏳ Restarting...' : '🔄 Restart Services'}
      </button>
      {restartMessage && (
        <div className={`restart-message ${restartMessage.startsWith('✓') ? 'success' : restartMessage.startsWith('✗') ? 'error' : ''}`}>
          {restartMessage}
        </div>
      )}
    </div>
  );
};

export default DevTools;