import React from 'react';

const ShelfStatus = ({ status, shakeConfig, barcode, onOpenControls }) => {
    // Debug logging
    console.log(`Shelf ${status?.module} - Status:`, {
        barcode,
        platePresent: status?.platePresent,
        shakeConfig,
        isShakingActive: (status?.shakeStatusCode ?? 0) > 0,
        remainingShakeTime: status?.remainingShakeTime,
        shakeStatusCode: status?.shakeStatusCode
    });
    
    // Determine if temperature control is active (targetTemp !== 0)
    const isTempActive = (status?.targetTemp ?? 0) !== 0;
    
    // Shaking is active based on shakeStatusCode:
    // 0 = inactive, 1 = continuous active, 2 = periodic active
    // For periodic mode (statusCode 2), RPM may be 0 during off cycles
    const isShakingActive = (status?.shakeStatusCode ?? 0) > 0;
    
    // Get shaking configuration from passed props (set when shaking starts)
    const isPeriodic = shakeConfig?.isPeriodic ?? false;
    const isTimed = shakeConfig?.isTimed ?? false;
    const periodicity = shakeConfig?.periodicity ?? 0;
    const periodActive = shakeConfig?.periodActive ?? 0;
    
    // Check if timed shaking just completed (was timed, still active status but time = 0)
    const isShakingComplete = isTimed && isShakingActive && (status?.remainingShakeTime ?? -1) === 0;
    
    // Calculate temperature gradient intensity (0 to 1 scale)
    // Fixed range from 20°C (lowest) to 100°C (highest)
    const getTempGradientIntensity = () => {
        if (!isTempActive) return 0;
        const currentTemp = status?.currentTemp ?? 20;
        
        // Fixed range: 20°C to 60°C
        const minTemp = 20;
        const maxTemp = 60;
        
        // Calculate normalized position (0 to 1)
        const intensity = Math.max(0, Math.min(1, (currentTemp - minTemp) / (maxTemp - minTemp)));
        return intensity;
    };
    
    // Generate dynamic color based on temperature intensity
    // Yellow gradient from cool to hot
    const getTempBorderColor = () => {
        const intensity = getTempGradientIntensity();
        
        // Gradient from yellow (cool) to orange-red (hot)
        // Hue: 60 (yellow) to 10 (red-orange)
        // Saturation: 90% to 100% for vibrant colors
        // Lightness: 50% to 45% for good visibility
        const hue = 60 - (intensity * 50); // 60 (yellow) to 10 (red-orange)
        const saturation = 90 + (intensity * 10); // 90% to 100%
        const lightness = 50 - (intensity * 5); // 50% to 45%
        
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    };
    
    const tempSectionStyle = isTempActive ? {
        borderColor: getTempBorderColor(),
        borderWidth: '2px',
        boxShadow: `0 0 8px ${getTempBorderColor()}33`
    } : {};
    
    return (
        <div className="shelf-status shelf-status-compact">
            <div className="status-header-compact">
                <div className="header-title-group">
                    <h3>
                        Shelf {status.module}
                        {status.platePresent && barcode && (
                            <span className="barcode-display-container">
                                <span className="barcode-label">Barcode:</span>
                                <span className="barcode-value">{barcode}</span>
                            </span>
                        )}
                    </h3>
                </div>
                <div className="header-right-group">
                    <div className={`plate-indicator ${status.platePresent ? 'present' : 'absent'}`}>
                        {status.platePresent ? '● Plate' : '○ Empty'}
                    </div>
                    <button 
                        className="btn btn-primary btn-compact btn-header"
                        onClick={onOpenControls}
                    >
                        Controls
                    </button>
                </div>
            </div>

            <div className="status-content-horizontal">
                {/* Temperature Section */}
                <div 
                    className={`status-section-compact ${isTempActive ? 'temp-active' : ''}`}
                    style={tempSectionStyle}
                >
                    <div className="section-header-compact">
                        <h4>Temperature</h4>
                        {isTempActive && (
                            <span className="status-badge temp-badge">Active</span>
                        )}
                    </div>
                    <div className="status-data-inline">
                        <div className="status-item-inline">
                            <label>Current:</label>
                            <span>{status.currentTemp?.toFixed(1) ?? 'N/A'}°C</span>
                        </div>
                        <div className="status-item-inline">
                            <label>Target:</label>
                            <span>{isTempActive ? status.targetTemp?.toFixed(1) : 'N/A'}°C</span>
                        </div>
                    </div>
                </div>

                {/* Shaking Section */}
                <div className={`status-section-compact ${isShakingActive ? 'shake-active' : ''} ${isShakingComplete ? 'shake-complete' : ''}`}>
                    <div className="section-header-compact">
                        <h4>Shaking</h4>
                        {isShakingActive && !isShakingComplete && (
                            <div className="status-badge-group-compact">
                                <span className={`status-badge ${isTimed ? 'timed-badge' : 'indefinite-badge'}`}>
                                    {isTimed ? 'Timed' : 'Indefinite'}
                                </span>
                                <span className={`status-badge ${isPeriodic ? 'periodic-badge' : 'continuous-badge'}`}>
                                    {isPeriodic ? 'Periodic' : 'Continuous'}
                                </span>
                            </div>
                        )}
                        {isShakingComplete && (
                            <span className="status-badge complete-badge">✓ Complete</span>
                        )}
                    </div>
                    {isShakingActive ? (
                        <div className="status-data-inline">
                            <div className="status-item-inline">
                                <label>RPM:</label>
                                <span>{status.currentRPM ?? 'N/A'} / {status.targetRPM ?? 'N/A'}</span>
                            </div>
                            {status.shakeDurationStatus !== 'Indefinite shaking' && status.remainingShakeTime != null && status.remainingShakeTime >= 0 && (
                                <div className="shake-timer-prominent">
                                    <div className="timer-icon-large">⏱</div>
                                    <div className="timer-content">
                                        <div className="timer-label">Time Remaining</div>
                                        <div className="timer-value-large">{status.remainingShakeTime}s</div>
                                    </div>
                                </div>
                            )}
                            {isPeriodic && (
                                <div className="status-item-inline">
                                    <label>Period:</label>
                                    <span>{periodActive}s / {periodicity}s</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="status-inactive-compact">Off</div>
                    )}
                </div>
            </div>

            {/* Errors Section - Only show if errors exist */}
            {((Array.isArray(status.errors) && status.errors.length > 0) || 
              (Array.isArray(status.shakeErrors) && status.shakeErrors.length > 0)) && (
                <div className="status-errors-compact">
                    {Array.isArray(status.errors) && status.errors.map((error, index) => (
                        <span key={`temp-${index}`} className="error-tag">⚠️ Temp: {error}</span>
                    ))}
                    {Array.isArray(status.shakeErrors) && status.shakeErrors.map((error, index) => (
                        <span key={`shake-${index}`} className="error-tag">⚠️ Shake: {error}</span>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ShelfStatus;