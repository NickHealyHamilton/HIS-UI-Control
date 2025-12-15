using Hamilton.Incubator.DeviceDriver;
using Hamilton.Incubator.DeviceDriver.Objects;
using Hamilton.Incubator.DeviceDriver.Models;
using HIS.Common.Logging;
using System;
using System.Reflection.Emit;
using NLog;
using HIS_Logic.Events;

namespace HIS_Logic
{
    public class HISController
    {
        private static HamiltonIncubatorDevice _tower;
        private static NLog.Logger _logger = SharedLogger.GetLogger();
        private static Logger _eventLogger = SharedEventLogger.GetEventLogger();

        // Define delegates for events that API can subscribe to
        public event EventHandler<IncubatorLogEventArgs> LogEvent;
        public event EventHandler<HeaterErrorEventArgs> HeaterError;
        public event EventHandler<TemperatureEventArgs> TemperatureEvent;
        public event EventHandler<ShakerErrorEventArgs> ShakerError;
        public delegate void HISConnectionEventHandler(string connectionEventLogEntry);

        public bool TowerConnect(string comPort)
        {
            try
            {
                _tower = new HamiltonIncubatorDevice(new Configuration(), SharedLogger.GetLogFactory());

                //wire events
                _tower.CommonHeaterErrorEvent += OnCommonHeaterEvent;
                _tower.CommonPlateAlarmArmed += OnCommonPlateAlarmArmedEvent;
                _tower.CommonPlateAlarmDisarmed += OnCommonPlateAlarmDisarmedEvent;
                _tower.CommonPlateOverTemperature += OnCommonPlateOverTemperatureEvent;
                _tower.CommonPlateTargetTemperatureReached += OnCommonPlateTargetTemperatureReachedEvent;
                _tower.CommonPlateUnderTemperature += OnCommonPlateUnderTemperatureEvent;
                _tower.CommonShakerOperationError += OnCommonShakerOperationErrorEvent;
                _tower.CommonTimedShakeComplete += OnCommonTimedShakeCompleteEvent;
                _tower.CommonLogEntryEvent += OnCommonLogEntryEvent;

                _logger.Info("Connecting tower...");
                bool connected = SendOrThrow(_tower.Connect(comPort));
                if (connected)
                {
                    HISConnected($"HIS tower connected on {comPort}");
                }
                else
                {
                    HISConnected($"FAILED to connect to HIS tower connected on {comPort}");
                }
                return connected;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Connection failed");
                return false;
            }
        }

        public bool TowerDisconnect()
        {
            try
            {
                _logger.Info("Disconnecting tower...");
                return SendOrThrow(_tower.Disconnect());
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Disconnect failed");
                return false;
            }
        }

        public bool TowerInit()
        {
            try
            {
                _logger.Info("Initializing tower...");
                return SendOrThrow(_tower.Initialize());
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Init failed");
                return false;
            }
        }

        public bool ForkPresent() => SendWithLogging(_tower.PresentFork(), "Presenting fork");

        public bool ForkPark() => SendWithLogging(_tower.ParkFork(), "Parking fork");

        public bool ShelfLoadPlate(int module) => SendWithLogging(_tower.PlacePlateWithNoZMove(module), $"Loading plate to shelf {module}");

        public bool ShelfRemovePlate(int module) => SendWithLogging(_tower.RemovePlateWithNoZMove(module), $"Removing plate from shelf {module}");

        public IncubatorStatus GetModuleStatus(int module, bool reset)
        {
            try
            {
                _logger.Info($"Getting status for module {module} (reset: {reset})");
                return SendOrThrow(_tower.GetIncubatorStatus(module, reset));
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Failed to get status for module {module}");
                throw;
            }
        }

        public bool GetPlateLoaded(int module)
        {
            try
            {
                _logger.Info($"Check plate presence in module {module}");
                return SendOrThrow(_tower.IsPlatePresent(module));
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Failed to check plate presence for module {module}");
                throw;
            }
        }

        public bool GetForkParkStatus()
        {
            try
            {
                _logger.Info("Getting fork park status");
                return SendOrThrow(_tower.IsForkParked());
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Getting fork park status failed");
                throw;
            }
        }

        public bool CheckForkLoadStatus()
        {
            try
            {
                _logger.Info("Checking if fork has a plate loaded");
                return SendOrThrow(_tower.IsForkLoaded());
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to check fork load status");
                throw;
            }
        }

        public ShakeStatus GetShakeStatus(int module)
        {
            try
            {
                _logger.Info($"Getting shake status for shelf {module}");
                return SendOrThrow(_tower.GetShakeStatus(module));
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Failed to get shake status for shelf {module}");
                throw;
            }
        }

        public bool StartShaking(int module, int rpm, int shaketime, int periodicity = 0, int periodActive = 0)
        {
            try
            {
                _logger.Info($"Starting shaking for module {module} at {rpm} RPM");
                return SendOrThrow(_tower.Shake(module, rpm, shaketime, periodicity, periodActive));
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Failed to start shaking for module {module}");
                throw;
            }
        }

        public bool StopShaking(int module)
        {
            try
            {
                _logger.Info($"Stopping shaker for shelf {module}");
                return SendOrThrow(_tower.StopShake(module));
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Failed to stop shaking for shelf {module}");
                throw;
            }
        }

        public bool StartTempIncubation(int module, double tempTarget, double allowedDeviation = 300, bool fan = true)
        {
            int ambientMode = fan ? 1 : 0;
            int temp = (int)(tempTarget * 100);
            int minTemp = temp - (int)(allowedDeviation * 100);
            int maxTemp = temp + (int)(allowedDeviation * 100);

            try
            {
                _logger.Info($"Starting temp control for shelf {module} at {tempTarget}°C (mode: {(fan ? "active ventilation" : "ambient")})");
                return SendOrThrow(_tower.Incubate(module, ambientMode, temp, minTemp, maxTemp));
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Failed to start temp control for shelf {module}");
                throw;
            }
        }

        public bool StopTempIncubation(int module)
        {
            try
            {
                _logger.Info($"Stopping temp control for shelf {module}");
                return SendOrThrow(_tower.StopIncubation(module));
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"Failed to stop temp control for shelf {module}");
                throw;
            }
        }
        public bool RaiseForkToMaxZ()
        {
           try
            {
                _logger.Info($"Raising fork to max Z for scanning");
                return SendOrThrow(_tower.PresentForkAbsolute(100000));
            }
            catch (Exception ex )
            {
                _logger.Info(ex,"Failed to raise fork to scanning position");
                throw;
            }
        }

        private void OnCommonHeaterEvent(string sender, string e)
        {
            _eventLogger.Info($"CommonHeaterErrorEvent - Sender: '{sender}', Data: '{e}'");
            var eventArgs = HeaterErrorEventArgs.Parse(sender, e);
            if (HeaterError != null)
            {
                HeaterError.Invoke(this, eventArgs);
            }
        }
        private void OnCommonPlateAlarmArmedEvent(string sender, string e)
        {
            _eventLogger.Info($"CommonPlateAlarmArmed - Sender: '{sender}', Data: '{e}'");
            var args = TemperatureEventArgs.Parse(sender, "AlarmArmed");
            if (args != null) TemperatureEvent?.Invoke(this, args);
        }

        private void OnCommonPlateAlarmDisarmedEvent(string sender, string e)
        {
            _eventLogger.Info($"CommonPlateAlarmDisarmed - Sender: '{sender}', Data: '{e}'");
            var args = TemperatureEventArgs.Parse(sender, "AlarmDisarmed");
            if (args != null) TemperatureEvent?.Invoke(this, args);
        }

        private void OnCommonPlateOverTemperatureEvent(string sender, string e)
        {
            _eventLogger.Info($"CommonPlateOverTemperature - Sender: '{sender}', Data: '{e}'");
            var args = TemperatureEventArgs.Parse(sender, "OverTemperature");
            if (args != null) TemperatureEvent?.Invoke(this, args);
        }

        private void OnCommonPlateTargetTemperatureReachedEvent(string sender, string e)
        {
            _eventLogger.Info($"CommonPlateTargetTemperatureReached - Sender: '{sender}', Data: '{e}'");
            var args = TemperatureEventArgs.Parse(sender, "TargetReached");
            if (args != null) TemperatureEvent?.Invoke(this, args);
        }

        private void OnCommonPlateUnderTemperatureEvent(string sender, string e)
        {
            _eventLogger.Info($"CommonPlateUnderTemperature - Sender: '{sender}', Data: '{e}'");
            var args = TemperatureEventArgs.Parse(sender, "UnderTemperature");
            if (args != null) TemperatureEvent?.Invoke(this, args);
        }

        private void OnCommonShakerOperationErrorEvent(string sender, string e)
        {
            _eventLogger.Info($"CommonShakerOperationError - Sender: '{sender}', Data: '{e}'");
            var args = ShakerErrorEventArgs.Parse(sender, e);
            if (args != null) ShakerError?.Invoke(this, args);
        }

        private void OnCommonTimedShakeCompleteEvent(string sender, string e)
        {
            _eventLogger.Info($"CommonTimedShakeComplete - Sender: '{sender}', Data: '{e}'");
            // This is usually captured in log events, but could create specific event if needed
        }

        private void OnCommonLogEntryEvent(string sender, string e)
        {
            // Log all events but only raise SignalR for meaningful ones
            ;

            var args = IncubatorLogEventArgs.Parse(sender, e);
            if (args != null && !args.EventId.Equals("TemperatureReading", StringComparison.OrdinalIgnoreCase))
            {
                _eventLogger.Info($"CommonLogEntryEvent - Sender: '{sender}', Data: '{e}'");
                // Skip temperature readings (handled by polling), raise others
                LogEvent?.Invoke(this, args);
            }
        }

        public ShakeSpeedRange GetShakeSpeedRange(int module)
        {
            try
            {
                return SendOrThrow(_tower.GetShakeSpeedRange(module));
            }
            catch(Exception ex )
            {
                throw;
            }
        }

        public TemperatureRange GetTempRange(int module)
        {
            try
            {
                return SendOrThrow(_tower.GetTemperatureRange(module));
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        private bool SendWithLogging(IncubatorResult<bool> result, string action)
        {
            try
            {
                _logger.Info(action);
                return SendOrThrow(result);
            }
            catch (Exception ex)
            {
                _logger.Error(ex, $"{action} failed");
                _eventLogger?.Info(action);
                return false;
            }
        }

        private static T SendOrThrow<T>(IncubatorResult<T> incResult)
        {
            if (incResult.SuccessfulExecution) return incResult.Data;
            throw new InvalidOperationException(incResult.Message);
        }

        public event HISConnectionEventHandler HISConnected;
    }
}