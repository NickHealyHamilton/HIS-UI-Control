using System;
using System.Collections.Generic;
using Hamilton.Incubator.DeviceDriver.Models;
using Hamilton.Incubator.DeviceDriver.Objects;

namespace HIS_Logic.Simulation
{
    public class SimulatedIncubator : IDisposable
    {
        private readonly NLog.Logger _logger;
        private bool _isConnected;
        private bool _isInitialized;
        private bool _isForkParked = true;
        private bool _isForkLoaded;
        private readonly Dictionary<int, ModuleState> _moduleStates;

        public SimulatedIncubator(NLog.Logger logger)
        {
            _logger = logger;
            _moduleStates = new Dictionary<int, ModuleState>();
            for (int i = 1; i <= 4; i++)
            {
                _moduleStates[i] = new ModuleState();
            }
            _logger.Info("Simulated incubator created");
        }

        public IncubatorResult<bool> Connect(string port)
        {
            _logger.Info($"Simulated connect on port {port}");
            _isConnected = true;
            return new IncubatorResult<bool>(true, "Simulated connection successful");
        }

        public IncubatorResult<bool> Disconnect()
        {
            _logger.Info("Simulated disconnect");
            _isConnected = false;
            return new IncubatorResult<bool>(true, "Simulated disconnection successful");
        }

        public IncubatorResult<bool> Initialize()
        {
            if (!_isConnected)
            {
                _logger.Error("Cannot initialize: Not connected");
                return new IncubatorResult<bool>(false, "Not connected");
            }
            
            _logger.Info("Simulated initialization");
            _isInitialized = true;
            return new IncubatorResult<bool>(true, "Simulated initialization successful");
        }

        public IncubatorResult<bool> PresentFork()
        {
            if (!CheckInitialized())
                return new IncubatorResult<bool>(false, "Not connected or initialized");

            _logger.Info("Simulated fork present");
            _isForkParked = false;
            return new IncubatorResult<bool>(true, "Fork presented");
        }

        public IncubatorResult<bool> ParkFork()
        {
            if (!CheckInitialized())
                return new IncubatorResult<bool>(false, "Not connected or initialized");

            _logger.Info("Simulated fork park");
            _isForkParked = true;
            return new IncubatorResult<bool>(true, "Fork parked");
        }

        public IncubatorResult<bool> IsForkParked()
        {
            if (!CheckInitialized())
                return new IncubatorResult<bool>(false, "Not connected or initialized");

            _logger.Info($"Simulated fork park status: {_isForkParked}");
            return new IncubatorResult<bool>(_isForkParked, "Fork park status checked");
        }

        public IncubatorResult<bool> IsForkLoaded()
        {
            if (!CheckInitialized())
                return new IncubatorResult<bool>(false, "Not connected or initialized");

            _logger.Info($"Simulated fork load status: {_isForkLoaded}");
            return new IncubatorResult<bool>(_isForkLoaded, "Fork load status checked");
        }

        public IncubatorResult<bool> PlacePlateWithNoZMove(int module)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<bool>(false, "Invalid module or not initialized");

            var state = _moduleStates[module];
            if (state.HasPlate)
            {
                _logger.Error($"Cannot place plate: Module {module} already has plate");
                return new IncubatorResult<bool>(false, "Module already has plate");
            }

            _logger.Info($"Simulated place plate in module {module}");
            state.HasPlate = true;
            return new IncubatorResult<bool>(true, "Plate placed successfully");
        }

        public IncubatorResult<bool> RemovePlateWithNoZMove(int module)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<bool>(false, "Invalid module or not initialized");

            var state = _moduleStates[module];
            if (!state.HasPlate)
            {
                _logger.Error($"Cannot remove plate: No plate in module {module}");
                return new IncubatorResult<bool>(false, "No plate in module");
            }

            _logger.Info($"Simulated remove plate from module {module}");
            state.HasPlate = false;
            return new IncubatorResult<bool>(true, "Plate removed successfully");
        }

        public IncubatorResult<bool> IsPlatePresent(int module)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<bool>(false, "Invalid module or not initialized");

            var hasPlate = _moduleStates[module].HasPlate;
            _logger.Info($"Simulated plate presence check for module {module}: {hasPlate}");
            return new IncubatorResult<bool>(hasPlate, "Plate presence checked");
        }

        public IncubatorResult<IncubatorStatus> GetIncubatorStatus(int module, bool reset)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<IncubatorStatus>(null, "Invalid module or not initialized");

            var state = _moduleStates[module];
            var status = new IncubatorStatus
            {
                Status = state.IsHeating ? 1 : 0,
                CurrentTemp = state.CurrentTemp,
                TargetTemp = state.TargetTemp,
                LastMinTemp = state.MinTemp,
                LastMaxTemp = state.MaxTemp,
                MinAlarmTemp = state.MinAlarmTemp,
                MaxAlarmTemp = state.MaxAlarmTemp,
                AlarmEnabled = true,
                IncubatorErrors = new List<string>()
            };

            if (reset)
            {
                state.MinTemp = state.CurrentTemp;
                state.MaxTemp = state.CurrentTemp;
            }

            _logger.Info($"Simulated status for module {module}: Current={status.CurrentTemp/100.0:F2}°C, Target={status.TargetTemp/100.0:F2}°C");
            return new IncubatorResult<IncubatorStatus>(status, "Status retrieved");
        }

        public IncubatorResult<bool> Incubate(int module, int ambientMode, int targetTemp, int minTemp, int maxTemp)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<bool>(false, "Invalid module or not initialized");

            var state = _moduleStates[module];
            state.IsHeating = true;
            state.TargetTemp = targetTemp;
            state.MinAlarmTemp = minTemp;
            state.MaxAlarmTemp = maxTemp;
            state.CurrentTemp = targetTemp; // In simulation, instantly reach target

            _logger.Info($"Simulated temperature control start for module {module}: Target={targetTemp/100.0:F2}°C, Mode={ambientMode}");
            return new IncubatorResult<bool>(true, "Temperature control started");
        }

        public IncubatorResult<bool> StopIncubation(int module)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<bool>(false, "Invalid module or not initialized");

            _logger.Info($"Simulated temperature control stop for module {module}");
            _moduleStates[module].IsHeating = false;
            return new IncubatorResult<bool>(true, "Temperature control stopped");
        }

        public IncubatorResult<bool> Shake(int module, int rpm, int shakeTime, int periodicity = 0, int periodActive = 0)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<bool>(false, "Invalid module or not initialized");

            var state = _moduleStates[module];
            state.IsShaking = true;
            state.ShakeRPM = rpm;
            state.ShakeTime = shakeTime;
            state.Periodicity = periodicity;
            state.PeriodActive = periodActive;

            _logger.Info($"Simulated shaking start for module {module}: {rpm} RPM for {shakeTime}s");
            return new IncubatorResult<bool>(true, "Shaking started");
        }

        public IncubatorResult<bool> StopShake(int module)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<bool>(false, "Invalid module or not initialized");

            _logger.Info($"Simulated shaking stop for module {module}");
            _moduleStates[module].IsShaking = false;
            return new IncubatorResult<bool>(true, "Shaking stopped");
        }

        public IncubatorResult<ShakeStatus> GetShakeStatus(int module)
        {
            if (!ValidateModule(module))
                return new IncubatorResult<ShakeStatus>(null, "Invalid module or not initialized");

            var state = _moduleStates[module];
            var status = new ShakeStatus
            {
                Mode = state.IsShaking ? 1 : 0,
                Status = state.IsShaking ? 1 : 0,
                TimerStatus = state.IsShaking ? 1 : 0,
                CurrentRPM = state.ShakeRPM,
                TargetRPM = state.ShakeRPM,
                TimeRemaining = state.IsShaking ? state.ShakeTime : 0
            };

            _logger.Info($"Simulated shake status for module {module}: {(state.IsShaking ? "Shaking" : "Stopped")} at {state.ShakeRPM} RPM");
            return new IncubatorResult<ShakeStatus>(status, "Shake status retrieved");
        }

        private bool CheckInitialized()
        {
            if (!_isConnected || !_isInitialized)
            {
                _logger.Error("Operation failed: Device not connected or initialized");
                return false;
            }
            return true;
        }

        private bool ValidateModule(int module)
        {
            if (!CheckInitialized()) return false;
            
            if (module < 1 || module > 4)
            {
                _logger.Error($"Invalid module number: {module}");
                return false;
            }
            return true;
        }

        public void Dispose()
        {
            // Cleanup if needed
        }

        private class ModuleState
        {
            public bool HasPlate { get; set; }
            public bool IsHeating { get; set; }
            public bool IsShaking { get; set; }
            public int CurrentTemp { get; set; } = 2500; // 25.00°C
            public int TargetTemp { get; set; } = 2500;
            public int MinTemp { get; set; } = 2500;
            public int MaxTemp { get; set; } = 2500;
            public int MinAlarmTemp { get; set; } = 2000;
            public int MaxAlarmTemp { get; set; } = 3000;
            public int ShakeRPM { get; set; }
            public int ShakeTime { get; set; }
            public int Periodicity { get; set; }
            public int PeriodActive { get; set; }
        }
    }
}