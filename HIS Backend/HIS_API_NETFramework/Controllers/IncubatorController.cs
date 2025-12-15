using System;
using System.Collections.Generic;
using System.Web.Http;
using Hamilton.Incubator.DeviceDriver.Models;
using HIS_Logic;
using HIS_Logic.Events;
using HIS.Common.Logging;
using Swashbuckle.Swagger.Annotations;
using System.IO;
using System.Linq;
using System.Web.Http.Results;
using NLog;
using HIS_API_NETFramework.Hubs;
using Microsoft.AspNet.SignalR;
using System.IO.Ports;
using System.Threading.Tasks;
using System.Diagnostics;

namespace HIS_API_NETFramework.Controllers
{
    /// <summary>
    /// Controller for managing Hamilton Incubator operations
    /// </summary>
    [RoutePrefix("api/incubator")]
    public class IncubatorController : ApiController
    {
        private static HISController _towerController = null;
        private static readonly object _lock = new object();
        private static NLog.Logger _logger = SharedLogger.GetLogger();
        private static Logger _eventLogger = SharedEventLogger.GetEventLogger();
        public static bool _isSimulationMode = false;
        private static SimulationState _simulationState = new SimulationState();
        public static bool _isConnected = false;
        public static bool _initialized = false;
        private static Scanner _scanner = null;

        /// <summary>
        /// Set simulation mode
        /// </summary>
        [HttpPost]
        [Route("simulate")]
        [SwaggerResponse(200, "Simulation mode set successfully")]
        [SwaggerResponse(400, "Failed to set simulation mode")]
        public IHttpActionResult SetSimulationMode([FromBody] bool simulate)
        {
            try
            {
                lock (_lock)
                {
                    if (_isConnected)
                    {
                        return BadRequest("Cannot change simulation mode while connected. Disconnect first.");
                    }

                    _isSimulationMode = simulate;
                    if (simulate)
                    {
                        _isSimulationMode = true;
                        _simulationState = new SimulationState(); // Reset state
                    }
                    else
                    {
                        _isSimulationMode = false;
                        _simulationState = null;
                    }
                    _logger.Info($"Simulation mode {(simulate ? "enabled" : "disabled")}");
                    return Ok(new { simulated = simulate });
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Failed to set simulation mode");
                return BadRequest(ex.Message);
            }
        }
        /// <summary>
        /// Restart the HIS API Windows service
        /// </summary>
        [HttpPost]
        [Route("restart")]
        [SwaggerResponse(200, "Service restart initiated")]
        [SwaggerResponse(500, "Failed to restart service")]
        public IHttpActionResult RestartService()
        {
            try
            {
                string scriptPath = @"C:\ProgramData\Hamilton\HIS API\RestartService.bat";

                // Start the script detached so it can restart us
                Process.Start(new ProcessStartInfo
                {
                    FileName = scriptPath,
                    UseShellExecute = true,
                    CreateNoWindow = true
                });

                return Ok("Service restart initiated");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Discover all connected devices (scanners and HIS) on available COM ports
        /// </summary>
        [HttpPost]
        [Route("discover")]
        [SwaggerResponse(200, "Devices found", Type = typeof(DeviceDiscoveryResponse))]
        [SwaggerResponse(400, "No devices found or discovery failed")]
        [SwaggerResponse(500, "Internal server error during discovery")]
        public IHttpActionResult DiscoverDevices()
        {
            List<DiscoveredDevice> foundDevices = new List<DiscoveredDevice>();

            try
            {
                string[] comPorts = FindCOMPorts();

                if (comPorts.Length == 0)
                {
                    _logger.Info("Discovery: No COM ports found on system");
                    return BadRequest("No COM ports available");
                }

                _logger.Info($"Discovery: Found {comPorts.Length} COM port(s) on system");

                // Step 1: Discover scanners first
                string[] scannerPorts = DiscoverScanners(foundDevices);

                // Step 2: Remove scanner ports from the list to avoid re-checking them
                string[] remainingPorts = comPorts.Except(scannerPorts).ToArray();
                _logger.Info($"Discovery: {remainingPorts.Length} port(s) remaining after scanner discovery");

                // Step 3: Discover HIS devices on remaining ports
                DiscoverHISDevices(remainingPorts, foundDevices);

                // Return results
                if (foundDevices.Count > 0)
                {
                    _logger.Info($"Discovery complete: Found {foundDevices.Count} device(s)");

                    var response = new
                    {
                        message = $"Found {foundDevices.Count} device(s)",
                        totalDevices = foundDevices.Count,
                        scanners = foundDevices.Count(d => d.DeviceType == "Scanner"),
                        hisDevices = foundDevices.Count(d => d.DeviceType == "HIS"),
                        devices = foundDevices,
                        timestamp = DateTime.Now
                    };

                    return Ok(response);
                }
                else
                {
                    _logger.Info("Discovery complete: No devices found");
                    return BadRequest("No devices found on any COM port");
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"Discovery failed with exception: {ex.Message}", ex);
                return InternalServerError(ex);
            }
        }

        private string[] DiscoverScanners(List<DiscoveredDevice> foundDevices)
        {
            try
            {
                _logger.Info("Discovery: Starting scanner discovery");

                _scanner = new Scanner();
                string[] scannerPorts = _scanner.ScannersDiscover();
                _scanner = null;

                if (scannerPorts != null && scannerPorts.Length > 0)
                {
                    _logger.Info($"Discovery: Found {scannerPorts.Length} scanner(s)");

                    foreach (string port in scannerPorts)
                    {
                        foundDevices.Add(new DiscoveredDevice
                        {
                            Port = port,
                            DeviceType = "Scanner",
                            Description = "DMCC Scanner"
                        });

                        _logger.Info($"Discovery: Scanner found on {port}");
                    }
                }
                else
                {
                    _logger.Info("Discovery: No scanners found");
                }

                return scannerPorts ?? Array.Empty<string>();
            }
            catch (Exception ex)
            {
                _logger.Error($"Discovery: Scanner discovery failed: {ex.Message}", ex);
                return Array.Empty<string>();
            }
        }

        private void DiscoverHISDevices(string[] comPorts, List<DiscoveredDevice> foundDevices)
        {
            if (comPorts == null || comPorts.Length == 0)
            {
                _logger.Info("Discovery: No ports to check for HIS devices");
                return;
            }

            try
            {
                _logger.Info($"Discovery: Starting HIS device discovery on {comPorts.Length} port(s)");

                // Store original connection state
                bool wasConnected = _isConnected;
                var previousController = _towerController;

                try
                {
                    // Ensure disconnected for discovery
                    if (_isConnected && _towerController != null)
                    {
                        _logger.Info("Discovery: Disconnecting existing HIS connection for discovery");
                        _towerController.TowerDisconnect();
                        _isConnected = false;
                        _towerController = null;
                    }

                    foreach (string comPort in comPorts)
                    {
                        _logger.Info($"Discovery: Testing {comPort} for HIS device");

                        // Use a timeout wrapper for discovery
                        bool isHIS = false;
                        bool testCompleted = false;
                        Exception testException = null;

                        var discoveryTask = Task.Run(() =>
                        {
                            try
                            {
                                _towerController = new HISController();
                                isHIS = _towerController.TowerConnect(comPort);
                                testCompleted = true;

                                if (isHIS)
                                {
                                    _towerController.TowerDisconnect();
                                }
                            }
                            catch (Exception ex)
                            {
                                testException = ex;
                            }
                        });

                        // Wait up to 10 seconds for each port
                        if (discoveryTask.Wait(TimeSpan.FromSeconds(10)))
                        {
                            if (testException != null)
                            {
                                _logger.Warn($"Discovery: Error testing {comPort}: {testException.Message}");
                            }
                            else if (testCompleted && isHIS)
                            {
                                _logger.Info($"Discovery: HIS device found on {comPort}");

                                foundDevices.Add(new DiscoveredDevice
                                {
                                    Port = comPort,
                                    DeviceType = "HIS",
                                    Description = "HIS Incubator"
                                });
                            }
                            else
                            {
                                _logger.Info($"Discovery: No HIS device on {comPort}");
                            }
                        }
                        else
                        {
                            _logger.Warn($"Discovery: Timeout testing {comPort} - skipping");
                        }

                        _towerController = null;
                    }

                    // Restore previous connection if it existed
                    if (wasConnected && previousController != null)
                    {
                        _logger.Info("Discovery: Restoring previous HIS connection");
                        _towerController = previousController;
                        _isConnected = true;
                    }
                }
                catch (Exception ex)
                {
                    _logger.Error($"Discovery: HIS discovery process failed: {ex.Message}", ex);

                    // Attempt to restore state on error
                    if (wasConnected && previousController != null)
                    {
                        try
                        {
                            _towerController = previousController;
                            _isConnected = true;
                        }
                        catch
                        {
                            // Ignore restoration errors
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"Discovery: HIS device discovery failed: {ex.Message}", ex);
            }
        }

        private string[] FindCOMPorts()
        {
            try
            {
                string[] ports = SerialPort.GetPortNames();
                _logger.Info($"Found {ports.Length} COM port(s) on system: {string.Join(", ", ports)}");
                return ports;
            }
            catch (Exception ex)
            {
                _logger.Error($"Error retrieving COM ports: {ex.Message}", ex);
                return Array.Empty<string>();
            }
        }

        // Data models for structured response
        public class DiscoveredDevice
        {
            public string Port { get; set; }
            public string DeviceType { get; set; }
            public string Description { get; set; }
        }

        public class DeviceDiscoveryResponse
        {
            public string Message { get; set; }
            public int TotalDevices { get; set; }
            public int Scanners { get; set; }
            public int HisDevices { get; set; }
            public List<DiscoveredDevice> Devices { get; set; }
            public DateTime Timestamp { get; set; }
        }
        /// <summary>
        /// Connect to the incubator device
        /// </summary>
        [HttpPost]
        [Route("connect")]
        [SwaggerResponse(200, "Tower connected successfully")]
        [SwaggerResponse(400, "Connection failed")]
        public IHttpActionResult Connect([FromBody] string comPort)
        {
            lock (_lock)
            {
                try
                {                       
                    if (_isConnected)
                    {
                        _logger.Info("towerController object not null!");
                        return BadRequest("Tower is already connected.");
                    }

                    if (_isSimulationMode)
                    {
                        _logger.Info("Simulation mode: Connected");
                        _isConnected = true;
                        return Ok(new { message = "Simulated connection successful", timestamp = DateTime.Now });
                    }

                    _towerController = new HISController();

                    //wire events for SignalR
                    _towerController.LogEvent += OnLogEvent;
                    _towerController.TemperatureEvent += OnTempEvent;
                    _towerController.HeaterError += OnHeaterError;
                    _towerController.ShakerError += OnShakerError;
                    _towerController.HISConnected += OnTowerConnect;

                    bool connected = _towerController.TowerConnect(comPort);
                    if (connected) { _isConnected = true;}
                    return connected ?
                        (IHttpActionResult)Ok(new { message = "Tower connected.", timestamp = DateTime.Now }) :
                        BadRequest("Connection failed.");
                }
                catch (Exception ex)
                {
                    return InternalServerError(ex);
                }
            }
        }

        private void OnLogEvent(object sender, IncubatorLogEventArgs e)
        {
            // Get SignalR hub context
            var hubContext = GlobalHost.ConnectionManager.GetHubContext<IncubatorHub>();

            // Push to all connected clients
            hubContext.Clients.Group("IncubatorEvents").logEvent(new
            {
                module = e.Module,
                timestamp = e.Timestamp,
                eventId = e.EventId,
                data0 = e.Data0,
                data1 = e.Data1,
                data2 = e.Data2,
                data3 = e.Data3
            });
        }

        private void OnTempEvent(object sender, TemperatureEventArgs e)
        {
            var hubContext = GlobalHost.ConnectionManager.GetHubContext<IncubatorHub>();
            hubContext.Clients.Group("IncubatorEvents").temperatureEvent(new
            {
                module = e.Module,
                eventType = e.EventType,
                timestamp = e.Timestamp
            });
        }

        private void OnHeaterError(object sender, HeaterErrorEventArgs e)
        {
            var hubContext = GlobalHost.ConnectionManager.GetHubContext<IncubatorHub>();
            hubContext.Clients.Group("IncubatorEvents").heaterError(new
            {
                module = e.Module,
                error = e.Error,
                timestamp = e.Timestamp
            });
        }

        private void OnShakerError(object sender, ShakerErrorEventArgs e)
        {
            var hubContext = GlobalHost.ConnectionManager.GetHubContext<IncubatorHub>();
            hubContext.Clients.Group("IncubatorEvents").shakerError(new
            {
                module = e.Module,
                error = e.Error,
                timestamp = e.Timestamp
            }); ;
        }

        private void OnTowerConnect(string eventLoggerEntry)
        {
            _eventLogger.Info($"HIS connection event");
            var hubContext = GlobalHost.ConnectionManager.GetHubContext<IncubatorHub>();
            hubContext.Clients.Group("IncubatorEvents").hisConnectionEvent(new
            {
                connectionEventData = eventLoggerEntry
            });
        }

        /// <summary>
        /// Disconnect from the incubator device
        /// </summary>
        [HttpPost]
        [Route("disconnect")]
        [SwaggerResponse(200, "Tower disconnected successfully")]
        [SwaggerResponse(400, "Disconnect failed")]
        public IHttpActionResult Disconnect()
        {
            lock (_lock)
            {
                try
                {
                    if (_isSimulationMode)
                    {
                        _isConnected = false;
                        _initialized = false;
                        _logger.Info("Simulation mode: Disconnected");
                        return Ok(new { message = "Simulated disconnection successful", timestamp = DateTime.Now });
                    }

                    if (!_isConnected)
                    {
                        return BadRequest("Tower is not connected.");
                    }

                    bool disconnected = _towerController.TowerDisconnect();
                    if (disconnected)
                    {
                        _isConnected = false;
                        _initialized = false;
                        _towerController = null;
                        return Ok(new { message = "Tower disconnected.", timestamp = DateTime.Now });
                    }
                    return BadRequest("Disconnect failed.");
                }
                catch (Exception ex)
                {
                    return InternalServerError(ex);
                }
            }
        }

        /// <summary>
        /// Initialize the incubator device
        /// </summary>
        [HttpPost]
        [Route("init")]
        [SwaggerResponse(200, "Tower initialized successfully")]
        [SwaggerResponse(400, "Initialization failed")]
        public IHttpActionResult Initialize()
        {
            try
            {
                if (!_isConnected)
                {
                    return BadRequest("Tower is not connected.");
                }

                if (_isSimulationMode)
                {
                    _initialized = true;
                    _logger.Info("Simulation mode: Initialized");
                    return Ok(new { message = "Simulated initialization successful", timestamp = DateTime.Now });
                }

                bool result = _towerController.TowerInit();
                if (result) { _initialized = true; }
                return result ?
                    (IHttpActionResult)Ok(new { message = "Tower initialized.", timestamp = DateTime.Now }) :
                    BadRequest("Initialization failed.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Present the fork
        /// </summary>
        [HttpPost]
        [Route("fork/present")]
        [SwaggerResponse(200, "Fork presented successfully")]
        [SwaggerResponse(400, "Fork presentation failed")]
        public IHttpActionResult PresentFork()
        {
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Tower is not initialized.");
                }
                if (_isSimulationMode)
                {
                    _simulationState.IsForkParked = false;
                    _logger.Info("Simulation mode: fork presented");
                    return Ok(new { message = "Simulated fork presentation successful", timestamp = DateTime.Now });
                }

                return _towerController.ForkPresent() ?
                    (IHttpActionResult)Ok(new { message = "Fork presented.", timestamp = DateTime.Now }) :
                    BadRequest("Fork presentation failed.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Present the fork to scanning position at max tower Z
        /// </summary>
        [HttpPost]
        [Route("fork/moveToScanningPosition")]
        [SwaggerResponse(200, "Fork presented successfully")]
        [SwaggerResponse(400, "Fork presentation failed")]
        public IHttpActionResult PresentForkToScanningPosition()
        {
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Tower is not initialized.");
                }
                if (_isSimulationMode)
                {
                    _simulationState.IsForkParked = false;
                    _logger.Info("Simulation mode: fork presented");
                    return Ok(new { message = "Simulated fork presentation successful", timestamp = DateTime.Now });
                }

                return _towerController.RaiseForkToMaxZ() ?
                    (IHttpActionResult)Ok(new { message = "Fork presented to scanner.", timestamp = DateTime.Now }) :
                    BadRequest("Fork presentation to scanner failed.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Park the fork
        /// </summary>
        [HttpPost]
        [Route("fork/park")]
        [SwaggerResponse(200, "Fork parked successfully")]
        [SwaggerResponse(400, "Fork park failed")]
        public IHttpActionResult ParkFork()
        {
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Tower is not initialized.");
                }
                if (_isSimulationMode)
                {
                    _simulationState.IsForkParked = true;
                    _logger.Info("Simulation mode: fork parked");
                    return Ok(new { message = "Simulated fork presentation successful", timestamp = DateTime.Now });
                }

                return _towerController.ForkPark() ?
                    (IHttpActionResult)Ok(new { message = "Fork parked.", timestamp = DateTime.Now }) :
                    BadRequest("Fork park failed.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Get the fork parking status
        /// </summary>
        [HttpGet]
        [Route("fork/status/park")]
        [SwaggerResponse(200, "Fork parking status retrieved successfully")]
        [SwaggerResponse(400, "Failed to get fork parking status")]
        public IHttpActionResult GetForkStatus()
        {
            try
            {
                bool isParked;

                if (!_isConnected)
                {
                    return BadRequest("Tower is not connected.");
                }

                if (_isSimulationMode)
                {
                    isParked = _simulationState.IsForkParked;
                }
                else
                {
                    isParked = _towerController.GetForkParkStatus();
                }
                

                return Ok(new { 
                    isParked = isParked,
                    timestamp = DateTime.Now 
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Get the fork plate loaded status
        /// </summary>
        [HttpGet]
        [Route("fork/status/loaded")]
        [SwaggerResponse(200, "Fork laoded status retrieved successfully")]
        [SwaggerResponse(400, "Failed to get fork laoded status")]
        public IHttpActionResult GetForkLoadedStatus()
        {
            try
            {
                bool hasPlate;

                if (!_initialized)
                {
                    return BadRequest("Tower is not initialized.");
                }

                if (_isSimulationMode)
                {
                    hasPlate = _simulationState.IsForkLoaded;
                }
                else
                {
                    hasPlate = _towerController.CheckForkLoadStatus();
                }


                return Ok(new
                {
                    hasPlate = hasPlate,
                    timestamp = DateTime.Now
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Load a plate onto a specific shelf
        /// </summary>
        /// <param name="module">Shelf module number (1-4)</param>
        [HttpPost]
        [Route("shelf/load/{module}")]
        [SwaggerResponse(200, "Plate loaded successfully")]
        [SwaggerResponse(400, "Failed to load plate")]
        public IHttpActionResult LoadPlate(int module)
        {
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Tower is not initialized.");
                }

                if (module < 1 || module > 4)
                {
                    return BadRequest("Module must be between 1 and 4.");
                }

                if (_isSimulationMode)
                {
                    _simulationState.IsForkParked = false;
                    _simulationState.IsForkLoaded = false;
                    _simulationState.Shelves[module].HasPlate = true;
                    _logger.Info($"Simulation mode: Plate loaded into shelf {module}");
                    return Ok(new { message = $"Plate loaded into shelf {module}.", timestamp = DateTime.Now });
                }

                return _towerController.ShelfLoadPlate(module) ?
                    (IHttpActionResult)Ok(new { message = $"Plate loaded into shelf {module}.", module, timestamp = DateTime.Now }) :
                    BadRequest($"Failed to load plate into module {module}.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Remove a plate from a specific shelf
        /// </summary>
        /// <param name="module">Shelf module number (1-4)</param>
        [HttpPost]
        [Route("shelf/remove/{module}")]
        [SwaggerResponse(200, "Plate removed successfully")]
        [SwaggerResponse(400, "Failed to remove plate")]
        public IHttpActionResult RemovePlate(int module)
        {
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Tower is not initiailized.");
                }

                if (module < 1 || module > 4)
                {
                    return BadRequest("Module must be between 1 and 4.");
                }

                if (_isSimulationMode)
                {
                    _simulationState.IsForkParked = false;
                    _simulationState.IsForkLoaded = true;
                    _simulationState.Shelves[module].HasPlate = false;
                    _logger.Info($"Simulation mode: Plate removed from shelf {module}");
                    return Ok(new { message = $"Plate removed from shelf {module}.", timestamp = DateTime.Now });
                }

                return _towerController.ShelfRemovePlate(module) ?
                    (IHttpActionResult)Ok(new { message = $"Plate removed from shelf {module}.", module, timestamp = DateTime.Now }) :
                    BadRequest($"Failed to remove plate from module {module}.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Start shaking a specific shelf
        /// </summary>
        /// <param name="module">Shelf module number (1-4)</param>
        [HttpPost]
        [Route("shelf/{module}/shake/start")]
        [SwaggerResponse(200, "Shaking started successfully")]
        [SwaggerResponse(400, "Failed to start shaking")]
        public IHttpActionResult StartShaking(int module, [FromBody] ShakeParameters parameters)
        {
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Tower not initialized.");
                }
                if (module < 1 || module > 4)
                {
                    return BadRequest("Module must be between 1 and 4.");
                }
                if (parameters == null)
                {
                    return BadRequest("Shake parameters are required.");
                }
                if (_isSimulationMode)
                {
                    var shelf = _simulationState.Shelves[module];
                    shelf.IsShaking = true;
                    shelf.TargetRPM = parameters.TargetRPM;

                    if(parameters.ShakeTime == 0)
                    {
                        shelf.IndefiniteShaking = true;
                    }

                    if(parameters.Periodicity > 0)
                    {
                        shelf.Periodicity = parameters.Periodicity;
                        shelf.PeriodActive = parameters.PeriodActive;
                        shelf.PeriodicShaking = true;
                    }

                    _logger.Info($"Simulation: Started shaking for shelf {module} at {parameters.TargetRPM} RPM");

                    return Ok(new
                    {
                        message = $"Simulated shaking started for shelf {module}.",
                        module,
                        parameters,
                        timestamp = DateTime.Now
                    });
                }

                bool result = _towerController.StartShaking(
                    module, 
                    parameters.TargetRPM, 
                    parameters.ShakeTime,
                    parameters.Periodicity ?? 0,
                    parameters.PeriodActive ?? 0
                );

                return result ?
                    (IHttpActionResult)Ok(new { 
                        message = $"Shaking started for shelf {module}.", 
                        module,
                        parameters,
                        timestamp = DateTime.Now 
                    }) :
                    BadRequest($"Failed to start shaking for module {module}.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Stop shaking a specific shelf
        /// </summary>
        /// <param name="module">Shelf module number (1-4)</param>
        [HttpPost]
        [Route("shelf/{module}/shake/stop")]
        [SwaggerResponse(200, "Shaking stopped successfully")]
        [SwaggerResponse(400, "Failed to stop shaking")]
        public IHttpActionResult StopShaking(int module)
        {
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Not connected in simulation mode.");
                }

                if (module < 1 || module > 4)
                {
                    return BadRequest("Module must be between 1 and 4.");
                }

                if(_isSimulationMode)
                {
                    var shelf = _simulationState.Shelves[module];
                    shelf.IsShaking = false;
                    shelf.TargetRPM = 0;
                    shelf.ShakeTime = 0;
                    shelf.Periodicity = 0;
                    shelf.PeriodActive = 0;
                    shelf.PeriodicShaking = false;
                    shelf.IndefiniteShaking = false;

                    _logger.Info($"Simulation: Stopped shaking for shelf {module}");

                    return Ok(new
                    {
                        message = $"Simulated shaking stopped for shelf {module}.",
                        module,
                        timestamp = DateTime.Now
                    });
                }


                bool result = _towerController.StopShaking(module);

                return result ?
                    (IHttpActionResult)Ok(new { 
                        message = $"Shaking stopped for shelf {module}.", 
                        module,
                        timestamp = DateTime.Now 
                    }) :
                    BadRequest($"Failed to stop shaking for module {module}.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Start temperature incubation for a specific shelf
        /// </summary>
        /// <param name="module">Shelf module number (1-4)</param>
        [HttpPost]
        [Route("shelf/{module}/temp/start")]
        [SwaggerResponse(200, "Temperature control started successfully")]
        [SwaggerResponse(400, "Failed to start temperature control")]
        public IHttpActionResult StartTemperature(int module, [FromBody] TempParameters parameters)
        {
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Not connected in simulation mode.");
                }

                if (module < 1 || module > 4)
                {
                    return BadRequest("Module must be between 1 and 4.");
                }

                if (parameters == null)
                {
                    return BadRequest("Temperature parameters are required.");
                }

                if(_isSimulationMode)
                {
                    var shelf = _simulationState.Shelves[module];
                    shelf.IsHeating = true;
                    shelf.TargetTemp = (int)(parameters.TargetTemp * 100);
                    shelf.CurrentTemp = shelf.TargetTemp; // Instantly reach target in simulation
                    shelf.AllowedDeviation = (int)(parameters.AllowedDeviation * 100);
                    _logger.Info($"Simulation: Started temp control for shelf {module} at {parameters.TargetTemp}°C");

                    return Ok(new
                    {
                        message = $"Simulated temperature control started for shelf {module}.",
                        module,
                        parameters,
                        timestamp = DateTime.Now
                    });
                }

                bool result = _towerController.StartTempIncubation(
                    module,
                    parameters.TargetTemp,
                    parameters.AllowedDeviation ?? 250,
                    parameters.Fan ?? true
                );

                return result ?
                    (IHttpActionResult)Ok(new { 
                        message = $"Temperature control started for shelf {module}.", 
                        module,
                        parameters,
                        timestamp = DateTime.Now 
                    }) :
                    BadRequest($"Failed to start temperature control for module {module}.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Stop temperature incubation for a specific shelf
        /// </summary>
        /// <param name="module">Shelf module number (1-4)</param>
        [HttpPost]
        [Route("shelf/{module}/temp/stop")]
        [SwaggerResponse(200, "Temperature control stopped successfully")]
        [SwaggerResponse(400, "Failed to stop temperature control")]
        public IHttpActionResult StopTemperature(int module)
        {
            try
            {
                if (!_initialized)
                {
                     return BadRequest("Not connected in simulation mode.");
                }

                if (module < 1 || module > 4)
                {
                    return BadRequest("Module must be between 1 and 4.");
                }
                
                if(_isSimulationMode)
                {
                    var shelf = _simulationState.Shelves[module];
                    shelf.IsHeating = false;
                    shelf.TargetTemp = 0;
                    shelf.CurrentTemp = 2500;
                    shelf.AllowedDeviation = 250;

                    _logger.Info($"Simulation: Stopped temp control for shelf {module}");

                    return Ok(new
                    {
                        message = $"Simulated temperature control stopped for shelf {module}.",
                        module,
                        timestamp = DateTime.Now
                    });
                }

                bool result = _towerController.StopTempIncubation(module);

                return result ?
                    (IHttpActionResult)Ok(new { 
                        message = $"Temperature control stopped for shelf {module}.", 
                        module,
                        timestamp = DateTime.Now 
                    }) :
                    BadRequest($"Failed to stop temperature control for module {module}.");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }


        /// <summary>
        /// Get connection status
        /// </summary>
        [HttpGet]
        [Route("status")]
        [SwaggerResponse(200, "Status retrieved successfully")]
        public IHttpActionResult GetStatus()
        {
            return Ok(new
            {
                connected = _isConnected,
                initialized = _initialized,
                simulated = _isSimulationMode,
                timestamp = DateTime.Now
            });
        }

        /// <summary>
        /// Get status for all shelves
        /// </summary>
        /// <param name="reset">Whether to reset min/max temperatures</param>
        [HttpGet]
        [Route("shelves/status")]
        [SwaggerResponse(200, "All shelf statuses retrieved successfully")]
        [SwaggerResponse(400, "Device not connected")]
        public IHttpActionResult GetAllShelvesStatus([FromUri] bool reset = false)
        {
            try
            {
                if (!_isConnected)
                {
                    return BadRequest("Tower not connected.");
                }

                var Shelves = new List<object>();

                for (int module = 1; module <= 4; module++)
                {
                    try
                    {
                        if (_isSimulationMode)
                        {
                            // Simulation mode - use simulation state
                            var shelf = _simulationState.Shelves[module];
                            
                            // Determine status code based on simulation state
                            int statusCode = 0; // Default: Ambient
                            if (shelf.IsHeating && shelf.TargetTemp > 0)
                            {
                                statusCode = 1; // Active Ventilation
                            }
                            
                            // Determine shake status code
                            int shakeStatusCode = 0; // Default: Shaking off
                            if (shelf.IsShaking)
                            {
                                shakeStatusCode = shelf.PeriodicShaking ? 2 : 1; // Periodic or Continuous
                            }
                            
                            // Determine shake duration status
                            int shakeDurationStatusCode = 2; // Inactive
                            if (shelf.IsShaking)
                            {
                                shakeDurationStatusCode = shelf.IndefiniteShaking ? 3 : 0; // Indefinite or Not complete
                            }

                            Shelves.Add(new
                            {
                                module = module,
                                status = GetStatusText(statusCode, "Incubation"),
                                statusCode = statusCode,
                                currentTemp = shelf.CurrentTemp / 100.0,
                                lastMinTemp = shelf.CurrentTemp / 100.0, // Simulation: use current as min/max
                                lastMaxTemp = shelf.CurrentTemp / 100.0,
                                targetTemp = shelf.TargetTemp / 100.0,
                                minAlarmTemp = (shelf.TargetTemp - (shelf.AllowedDeviation ?? 250)) / 100.0,
                                maxAlarmTemp = (shelf.TargetTemp + (shelf.AllowedDeviation ?? 250)) / 100.0,
                                alarmEnabled = shelf.IsHeating,
                                errors = new List<string>(), // Simulation: no errors
                                platePresent = shelf.HasPlate,
                                shakeStatusCode = shakeStatusCode,
                                shakeStatus = GetStatusText(shakeStatusCode, "ShakingType"),
                                currentRPM = shelf.IsShaking ? shelf.TargetRPM : 0,
                                targetRPM = shelf.TargetRPM,
                                shakeDurationStatus = GetStatusText(shakeDurationStatusCode, "ShakingTimeStatus"),
                                remainingShakeTime = shelf.ShakeTime,
                                shakePeriod = shelf.Periodicity ?? 0,
                                remainingShakeTimeInPeriod = shelf.PeriodActive ?? 0,
                                shakeErrors = new List<string>() // Simulation: no errors
                            });
                        }
                        else
                        {
                            // Live mode - query hardware
                            var status = _towerController.GetModuleStatus(module, reset);
                            bool platePresent = _towerController.GetPlateLoaded(module);
                            var shakeData = _towerController.GetShakeStatus(module);

                            Shelves.Add(new
                            {
                                module = module,
                                status = GetStatusText(status.Status, "Incubation"),
                                statusCode = status.Status,
                                currentTemp = status.CurrentTemp / 100.0,
                                lastMinTemp = status.LastMinTemp / 100.0,
                                lastMaxTemp = status.LastMaxTemp / 100.0,
                                targetTemp = status.TargetTemp / 100.0,
                                minAlarmTemp = status.MinAlarmTemp / 100.0,
                                maxAlarmTemp = status.MaxAlarmTemp / 100.0,
                                alarmEnabled = status.AlarmEnabled,
                                errors = status.IncubatorErrors,
                                platePresent = platePresent,
                                shakeStatusCode = shakeData.Status,
                                shakeStatus = GetStatusText(shakeData.Status, "ShakingType"),
                                currentRPM = shakeData.CurrentSpeed,
                                targetRPM = shakeData.TargetSpeed,
                                shakeDurationStatus = GetStatusText(shakeData.RemainingShakeTimeStatus, "ShakingTimeStatus"),
                                remainingShakeTime = shakeData.RemainingShakeTime,
                                shakePeriod = shakeData.ShakePeriod,
                                remainingShakeTimeInPeriod = shakeData.ShakeActiveTime,
                                shakeErrors = shakeData.Errors
                            });
                        }
                    }
                    catch (Exception ex)
                    {
                        Shelves.Add(new
                        {
                            module = module,
                            error = ex.Message
                        });
                    }
                }

                return Ok(new
                {
                    shelves = Shelves,
                    timestamp = DateTime.Now
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Get the fork plate loaded status
        /// </summary>
        [HttpGet]
        [Route("shelves/ranges")]
        [SwaggerResponse(200, "Shelf ranges retrieved successfully")]
        [SwaggerResponse(400, "Failed to retrieve shelf ranges")]
        public IHttpActionResult GetShelfRanges()
        {
            List<object> shelfRanges = new List<object>();
            try
            {
                if (!_initialized)
                {
                    return BadRequest("Tower is not connected.");
                }

                for (int module = 1; module <= 4; module++)
                {
                    try
                    {
                        if (_isSimulationMode)
                        {
                            shelfRanges.Add(new
                            {
                                module = module,
                                minSpeed = 40,
                                maxSpeed = 1200,
                                minTemp = 0,
                                maxTemp = 6000
                            });
                        }
                        else
                        {
                            ShakeSpeedRange speedRange = _towerController.GetShakeSpeedRange(module);
                            TemperatureRange tempRange = _towerController.GetTempRange(module);
                            shelfRanges.Add(new
                            {
                                module = module,
                                minSpeed = speedRange.MinimumSpeed,
                                maxSpeed = speedRange.MaximumSpeed,
                                minTemp = tempRange.MinimumTemperature,
                                maxTemp = tempRange.MaximumTemperature
                            });
                        }
                    }
                    catch (Exception ex)
                    {
                        shelfRanges.Add(new
                        {
                            module = module,
                            error = ex.Message
                        });
                    }
                }
                return Ok(new
                {
                    shelfRanges = shelfRanges,
                    timestamp = DateTime.Now
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Helper method to convert status code to text
        /// </summary>
        private string GetStatusText(int statusCode, string statusType)
        {
            switch(statusType)
            {
                case "Incubation":
                    switch (statusCode)
                    {
                        case 0: return "Ambient";
                        case 1: return "Active Ventilation";
                        case 2: return "Inactive";
                        default: return "Unknown";
                    }

                case "ShakingType":
                    switch (statusCode)
                    {
                        case 0: return "Shaking off";
                        case 1: return "Shaking On";
                        case 2: return "Periodic Shaking";
                        default: return "Unknown";
                    }

                case "ShakingTimeStatus":
                    switch (statusCode)
                    {
                        case 0: return "Shaking not complete";
                        case 1: return "Shaking expired";
                        case 2: return "Inactive";
                        case 3: return "Indefinite shaking";
                        default: return "Unknown";
                    }

                default:
                    return "Unknown"; // <-- covers unexpected statusType
            }
        }
    }
    public class ShakeParameters
    {
        /// <summary>
        /// Target RPM for shaking
        /// </summary>
        public int TargetRPM { get; set; }

        /// <summary>
        /// Duration of shaking in seconds
        /// </summary>
        public int ShakeTime { get; set; }

        /// <summary>
        /// Optional: Period for periodic shaking
        /// </summary>
        public int? Periodicity { get; set; }

        /// <summary>
        /// Optional: Active time within each period
        /// </summary>
        public int? PeriodActive { get; set; }
    }

    public class TempParameters
    {
        public int TargetTemp { get; set; }

        public int? AllowedDeviation { get; set; }

        /// <summary>
        /// Optional: Whether to use fan for active ventilation (default: true)
        /// </summary>
        public bool? Fan { get; set; }
    }

    // Simulation state - simple in-memory state for testing without hardware
    internal class SimulationState
    {
        //public bool IsConnected { get; set; }
        //public bool IsInitialized { get; set; }
        public bool IsForkParked { get; set; } = true;
        public bool IsForkLoaded { get; set; } = false;
        public Dictionary<int, ShelfState> Shelves { get; set; } = new Dictionary<int, ShelfState>
        {
            { 1, new ShelfState() },
            { 2, new ShelfState() },
            { 3, new ShelfState() },
            { 4, new ShelfState() }
        };

        public class ShelfState
        {
            public bool HasPlate { get; set; } = false;
            public bool IsHeating { get; set; } = false;
            public int CurrentTemp { get; set; } = 2500; // 25.00°C
            public int TargetTemp { get; set; } = 2500;
            /// <summary>
            /// Optional: Allowed temperature deviation in hundredths of degrees (default: 300 = 3.00°C)
            /// </summary>
            public int? AllowedDeviation { get; set; } = 250;
            /// <summary>
            /// Target RPM for shaking
            /// </summary>
            public int TargetRPM { get; set; } = 0;

            /// <summary>
            /// Duration of shaking in seconds
            /// </summary>
            public int ShakeTime { get; set; }

            /// <summary>
            /// Optional: Period for periodic shaking
            /// </summary>
            public int? Periodicity { get; set; }

            /// <summary>
            /// Optional: Active time within each period
            /// </summary>
            public int? PeriodActive { get; set; }
            public bool IsShaking { get; set; } = false;
            public bool PeriodicShaking { get; set; } = false;
            public bool IndefiniteShaking { get; set; } = false;
        }
    }

    [RoutePrefix("api/incubator/scanner")]
    public class ScannerController : ApiController
    {
        // Use static for scanner to persist across requests
        private static Scanner _scanner;
        private static bool _scannerPresent = true;
        private static readonly object _scannerLock = new object();
        private static ScanResult _lastScan = null;
        private string _scanModule;
        private static Logger _eventLogger = SharedEventLogger.GetEventLogger();

        /// <summary>
        /// Connect to scanner
        /// </summary>
        [HttpPost]
        [Route("connect")]
        [SwaggerResponse(200, "Successfully connected to scanner")]
        [SwaggerResponse(400, "Connection failed")]
        public IHttpActionResult ConnectScanner([FromBody] string comPort)
        {
            try
            {
                // Simulation mode handling
                if (IncubatorController._isSimulationMode)
                {
                    lock (_scannerLock)
                    {
                        _scannerPresent = true;
                    }
                    return Ok(new
                    {
                        message = "Scanner connected in simulation mode",
                        timestamp = DateTime.UtcNow
                    });
                }

                // Check if scanner hardware is present
                if (!_scannerPresent)
                {
                    return BadRequest("No scanner hardware detected on HIS");
                }

                lock (_scannerLock)
                {
                    // Check if already connected
                    if (_scanner != null && _scanner.IsConnected)
                    {
                        return Ok(new
                        {
                            message = $"Scanner already connected on",
                            timestamp = DateTime.UtcNow
                        });
                    }
                    
                    // Create new scanner instance if needed
                    if (_scanner == null)
                    {
                        _scanner = new Scanner();
                        _scanner.ScannerConnection += OnConnectionEvent;
                        _scanner.ScanEvent += OnScanEvent;
                    }

                    bool result = _scanner.ScannerConnect(comPort);

                    if (result)
                    {
                        return Ok(new
                        {
                            message = $"Connected to scanner on COM port {_scanner.comPort}",
                            comPort = _scanner.comPort,
                            timestamp = DateTime.UtcNow
                        });
                    }
                    else
                    {
                        return BadRequest($"Failed to connect to scanner on COM port {_scanner.comPort}");
                    }
                }
            }
            catch (Exception ex)
            {

                return InternalServerError(ex);
            }
        }

        private void OnScanEvent(object sender, ScanResultEventArgs e)
        {
            _eventLogger.Info($"Scan event for barcode {e.barcode}");
            var hubContext = GlobalHost.ConnectionManager.GetHubContext<IncubatorHub>();
            hubContext.Clients.Group("IncubatorEvents").scanEvent(new
            {
                module = this._scanModule,
                barcode = e.barcode,
                timestamp = e.timeStamp
            });
        }

        private void OnConnectionEvent(string eventString)
        {
            _eventLogger.Info($"Scan connection event for barcode");
            var hubContext = GlobalHost.ConnectionManager.GetHubContext<IncubatorHub>();
            hubContext.Clients.Group("IncubatorEvents").scanConnectionEvent(new
            {
                connectionEventData = eventString
            });
        }

        /// <summary>
        /// Scan a plate and return barcode results with image
        /// </summary>
        [HttpPost]
        [Route("scan")]
        [SwaggerResponse(200, "Scan executed successfully - barcode and image retrieved", typeof(ScanResponseDto))]
        [SwaggerResponse(400, "Scan failed - missing barcode or image")]
        public IHttpActionResult Scan([FromUri] int module = 0)
        {
            this._scanModule = Convert.ToString(module);

            try
            {
                if (!IncubatorController._initialized)
                {
                    return BadRequest("Incubator not initialized");
                }

                // Simulation mode
                if (IncubatorController._isSimulationMode)
                {
                    var simResult = new ScanResult
                    {
                        Success = true,
                        BarcodeData = $"SIM_PLATE_{module}_{DateTime.UtcNow:yyyyMMddHHmmss}",
                        ImageData = GenerateSimulatedImage() // Optional: generate fake image data
                    };

                    return Ok(new ScanResponseDto
                    {
                        Success = simResult.Success,
                        BarcodeData = simResult.BarcodeData,
                        Module = module,
                        HasImage = true,
                        ImageSize = simResult.ImageData?.Length ?? 0,
                        Timestamp = DateTime.UtcNow,
                        IsSimulation = true
                    });
                }

                // Real scanner mode
                lock (_scannerLock)
                {
                    if (_scanner == null || !_scanner.IsConnected)
                    {
                        return BadRequest("Scanner not connected. Please connect first.");
                    }

                    _lastScan = _scanner.TriggerAndGetResult(5000);

                    if (_lastScan.Success)
                    {
                        // Successful scan - we have both barcode and image
                        return Ok(new ScanResponseDto
                        {
                            Success = true,
                            BarcodeData = _lastScan.BarcodeData,
                            BarcodeType = _lastScan.BarcodeType,
                            Module = module,
                            ResponseId = _lastScan.ResponseId,
                            HasImage = true,
                            ImageSize = _lastScan.ImageData.Length,
                            Timestamp = DateTime.UtcNow,
                            IsSimulation = false
                        });
                    }
                    else
                    {
                        return BadRequest("Scan failed");
                    }
                }
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        // Optional: Generate simulated image data for testing
        private byte[] GenerateSimulatedImage()
        {
            // Return a small fake image byte array for simulation
            return new byte[1024]; // 1KB fake image
        }

        /// <summary>
        /// Get the image from the last scan
        /// </summary>
        [HttpGet]
        [Route("scan/image")]
        [SwaggerResponse(200, "Image retrieved successfully", typeof(string))]
        [SwaggerResponse(404, "No image available")]
        public IHttpActionResult GetLastScanImage()
        {
            try
            {
                lock (_scannerLock)
                {
                    if (_scanner == null)
                    {
                        return NotFound();
                    }

                    // You'd need to store the last successful scan result
                    // Consider adding a static field: private static ScanResult _lastSuccessfulScan;

                    if (_lastScan?.ImageData != null)
                    {
                        return Ok(new
                        {
                            imageData = Convert.ToBase64String(_lastScan.ImageData),
                            imageSize = _lastScan.ImageData.Length,
                            barcodeData = _lastScan.BarcodeData,
                            timestamp = _lastScan.Timestamp
                        });
                    }

                    return NotFound();
                }
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Get the image from the last scan
        /// </summary>
        [HttpPost]
        [Route("live/set")]
        [SwaggerResponse(200, "Live image mode toggled successfully")]
        [SwaggerResponse(400, "Could not toggle live image mode")]
        public IHttpActionResult SetLiveImgMode([FromUri] bool setLive)
        {
            try
            {
                lock (_scannerLock)
                {
                    _scanner.SendDMCC($"SET LIVEIMG.MODE {(setLive ? "2" : "0")}");
                    return Ok("Live img mode toggled");
                }
            }
            catch(Exception ex)
            {
                return BadRequest("Could not set live image mode");
            }
        }

        /// <summary>
        /// Set the scanner ROI
        /// </summary>
        [HttpPost]
        [Route("imagesettings/ROI")]
        [SwaggerResponse(200, "ROI successfully set")]
        [SwaggerResponse(400, "ROI failed to be applied")]
        public IHttpActionResult SetROI([FromUri] int x0 = 0, int y0 = 0, int x1 = 1280, int y1 = 960)
        {
            try
            {
                lock (_scannerLock)
                {
                    _scanner.ApplyROI(x0, y0, x1, y1);
                    return Ok("ROI applied");
                }
            }
            catch (Exception ex)
            {
                return BadRequest("Could not apply ROI");
            }
        }

        /// <summary>
        /// Get the image from the last scan
        /// </summary>
        [HttpGet]
        [Route("live/getimg")]
        [SwaggerResponse(200, "Image retrieved successfully", typeof(string))]
        [SwaggerResponse(404, "No image available")]
        public IHttpActionResult GetLiveImage()
        {
            try
            {
                lock (_scannerLock)
                {
                    if (_scanner == null)
                    {
                        return NotFound();
                    }

                    string base64 = _scanner.GetLiveImage();
                    {
                        if (base64 != "Live image string unable to be retrieved") { }
                        return Ok(new
                        {
                            imageData = base64,
                            timestamp = DateTime.Now
                        }); ;
                    }

                    return NotFound();
                }
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Disconnect from scanner
        /// </summary>
        [HttpPost]
        [Route("disconnect")]
        [SwaggerResponse(200, "Successfully disconnected from scanner")]
        public IHttpActionResult DisconnectScanner()
        {
            try
            {
                lock (_scannerLock)
                {
                    if (_scanner != null)
                    {
                        _scanner.Disconnect();
                        _scanner = null;
                    }
                }

                return Ok(new
                {
                    message = "Scanner disconnected",
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        /// <summary>
        /// Get scanner connection status
        /// </summary>
        [HttpGet]
        [Route("status")]
        [SwaggerResponse(200, "Scanner status retrieved")]
        public IHttpActionResult GetStatus()
        {
            lock (_scannerLock)
            {
                return Ok(new
                {
                    isConnected = _scanner?.IsConnected ?? false,
                    scannerPresent = _scannerPresent,
                    isSimulation = IncubatorController._isSimulationMode,
                    timestamp = DateTime.UtcNow
                });
            }
        }
    }

    // DTO for cleaner response
    public class ScanResponseDto
    {
        public bool Success { get; set; }
        public string BarcodeData { get; set; }
        public string BarcodeType { get; set; }
        public int Module { get; set; }
        public int ResponseId { get; set; }
        public bool HasImage { get; set; }
        public int ImageSize { get; set; }
        public DateTime Timestamp { get; set; }
        public bool IsSimulation { get; set; }
    }


    [RoutePrefix("api/incubator/csv")]
    public class CSVController : ApiController
    {
        private const string DATA_LOG_PATH = @"C:\ProgramData\Hamilton\HIS API\Data logs";
        private static Logger _eventLogger = SharedEventLogger.GetEventLogger();

        [HttpPost]
        [Route("init")]
        [SwaggerResponse(200, "")]
        [SwaggerResponse(400, "")]
        public IHttpActionResult InitializeFile([FromBody] InitFileRequest request)
        {
            try
            {
                // Ensure directory exists
                Directory.CreateDirectory(DATA_LOG_PATH);

                var filePath = Path.Combine(DATA_LOG_PATH, request.Filename);

                // Only create if doesn't exist
                if (!System.IO.File.Exists(filePath))
                {
                    System.IO.File.WriteAllText(filePath, request.Header + Environment.NewLine);
                }

                return Ok(new
                {
                    success = true,
                    message = "File initialized",
                    path = filePath
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }
        [HttpPost]
        [Route("append")]
        [SwaggerResponse(200, "")]
        [SwaggerResponse(400, "")]
        public IHttpActionResult AppendRows([FromBody] AppendRowsRequest request)
        {
            try
            {
                var filePath = Path.Combine(DATA_LOG_PATH, request.Filename);

                if (!System.IO.File.Exists(filePath))
                {
                    return BadRequest("File not found");
                }

                System.IO.File.AppendAllLines(filePath, request.Rows);

                return Ok(new
                {
                    success = true,
                    rowsAppended = request.Rows.Length
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }
        [HttpGet]
        [Route("list")]
        [SwaggerResponse(200, "")]
        [SwaggerResponse(400, "")]

        public IHttpActionResult ListFiles()
        {
            try
            {
                Directory.CreateDirectory(DATA_LOG_PATH);

                var files = Directory.GetFiles(DATA_LOG_PATH, "*.csv")
                    .Select(path => new FileInfo(path))
                    .Select(fileInfo => new
                    {
                        filename = fileInfo.Name,
                        size = fileInfo.Length,
                        rowCount = System.IO.File.ReadLines(fileInfo.FullName).Count() - 1, // Subtract header
                        lastModified = fileInfo.LastWriteTimeUtc
                    })
                    .OrderByDescending(f => f.lastModified)
                    .ToList();

                return Ok(new { files });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        [HttpGet]
        [Route("read/{filename}")]
        [SwaggerResponse(200, "")]
        [SwaggerResponse(400, "")]
        public IHttpActionResult ReadFile(string filename)
        {
            try
            {
                var filePath = Path.Combine(DATA_LOG_PATH, filename);

                if (!System.IO.File.Exists(filePath))
                {
                    return BadRequest("File not found");
                }

                var content = System.IO.File.ReadAllText(filePath);

                return Ok(new
                {
                    filename,
                    content
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        [HttpDelete]
        [Route("delete/{filename}")]
        [SwaggerResponse(200, "")]
        [SwaggerResponse(400, "")]
        public IHttpActionResult DeleteFile(string filename)
        {
            try
            {
                var filePath = Path.Combine(DATA_LOG_PATH, filename);

                if (System.IO.File.Exists(filePath))
                {
                    System.IO.File.Delete(filePath);
                    return Ok(new { success = true, message = "File deleted" });
                }

                return BadRequest("File not found");
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        [HttpDelete]
        [Route("cleanup")]
        [SwaggerResponse(200, "")]
        [SwaggerResponse(400, "")]
        public IHttpActionResult CleanupOldFiles(int daysToKeep = 7)
        {
            try
            {
                Directory.CreateDirectory(DATA_LOG_PATH);

                var cutoffDate = DateTime.UtcNow.AddDays(-daysToKeep);
                var deletedFiles = new List<string>();

                var files = Directory.GetFiles(DATA_LOG_PATH, "*.csv");

                foreach (var filePath in files)
                {
                    var fileInfo = new FileInfo(filePath);
                    if (fileInfo.LastWriteTimeUtc < cutoffDate)
                    {
                        System.IO.File.Delete(filePath);
                        deletedFiles.Add(fileInfo.Name);
                    }
                }

                return Ok(new
                {
                    success = true,
                    deletedCount = deletedFiles.Count,
                    deletedFiles
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }

        [HttpGet]
        [Route("fetchEvents")]
        [SwaggerResponse(200, "Event log entries retrieved")]
        [SwaggerResponse(400, "Failed to retrieve events")]
        public IHttpActionResult GetEvents(DateTime startTime, DateTime endTime, int? module = null)
        {
            try
            {
                var eventLogPath = @"C:\ProgramData\Hamilton\HIS API\HIS Event logs";
                var events = new List<object>();

                if (!Directory.Exists(eventLogPath))
                {
                    return Ok(new { events = events, count = 0 });
                }
                // Check and convert if needed
                if (startTime.Kind == DateTimeKind.Utc)
                {
                    startTime = startTime.ToLocalTime();
                }
                if (endTime.Kind == DateTimeKind.Utc)
                {
                    endTime = endTime.ToLocalTime();
                }

                // Get all log files - check both .log and .txt extensions
                var allLogFiles = new List<string>();
                allLogFiles.AddRange(Directory.GetFiles(eventLogPath, "*.log"));
                allLogFiles.AddRange(Directory.GetFiles(eventLogPath, "*.txt"));
                
                var logFiles = allLogFiles
                    .Select(f => new FileInfo(f))
                    .Where(fi => {
                        // Try to parse date from filename like "HIS_EventLog_2025-12-08.txt"
                        var match = System.Text.RegularExpressions.Regex.Match(
                            fi.Name, @"(\d{4})-(\d{2})-(\d{2})");
                        if (match.Success)
                        {
                            var fileDate = new DateTime(
                                int.Parse(match.Groups[1].Value),
                                int.Parse(match.Groups[2].Value),
                                int.Parse(match.Groups[3].Value));
                            return fileDate >= startTime.Date && fileDate <= endTime.Date;
                        }
                        // Fallback to LastWriteTime if no date in filename
                        return fi.LastWriteTime >= startTime.AddDays(-1) &&
                               fi.LastWriteTime <= endTime.AddDays(1);
                    })
                    .OrderBy(fi => fi.Name)
                    .ToList();

                _eventLogger.Info($"EVENT FILES TO PARSE: {string.Join(", ", logFiles.Select(fi => fi.FullName))}");

                foreach (var logFile in logFiles)
                {
                    var lines = System.IO.File.ReadAllLines(logFile.FullName);

                    foreach (var line in lines)
                    {
                        try
                        {
                            // Parse log line format: 
                            // "2025-12-10 12:16:47.5877|INFO|CommonPlateUnderTemperature - Sender: 'COM10.Heater', Data: 'System.EventArgs'"
                            var parts = line.Split(new[] { '|' }, 3);
                            if (parts.Length < 3) continue;

                            var timestampStr = parts[0].Trim();
                            var level = parts[1].Trim();
                            var message = parts[2].Trim();

                            DateTime timestamp;
                            if (!DateTime.TryParse(timestampStr, out timestamp)) continue;
                            
                            // Ensure log timestamp is treated as local time
                            if (timestamp.Kind == DateTimeKind.Unspecified)
                            {
                                timestamp = DateTime.SpecifyKind(timestamp, DateTimeKind.Local);
                            }

                            // Filter by time range
                            if (timestamp < startTime || timestamp > endTime) continue;

                            // Filter by module if specified
                            if (module.HasValue)
                            {
                                var moduleStr = $"Module{module.Value}";
                                var shelfStr = $"Shelf {module.Value}";
                                if (!message.Contains(moduleStr) && !message.Contains(shelfStr))
                                    continue;
                            }

                            // Parse sender and event type
                            string eventType = "Unknown";
                            string sender = "";

                            if (message.Contains(" - Sender:"))
                            {
                                var eventParts = message.Split(new[] { " - Sender:" },
                                                              StringSplitOptions.None);
                                eventType = eventParts[0].Trim();

                                if (eventParts.Length > 1)
                                {
                                    var senderPart = eventParts[1];
                                    var senderMatch = System.Text.RegularExpressions.Regex.Match(
                                        senderPart, @"'([^']*)'");
                                    if (senderMatch.Success)
                                    {
                                        sender = senderMatch.Groups[1].Value;
                                    }
                                }
                            }

                            events.Add(new
                            {
                                timestamp = timestamp.ToString("o"),
                                level = level,
                                eventType = eventType,
                                sender = sender,
                                message = message
                            });
                        }
                        catch
                        {
                            // Skip malformed lines
                            continue;
                        }
                    }
                }

                return Ok(new
                {
                    events = events,
                    count = events.Count,
                    startTime = startTime.ToString("o"),
                    endTime = endTime.ToString("o"),
                    module = module
                });
            }
            catch (Exception ex)
            {
                return InternalServerError(ex);
            }
        }
    }

    // Request Models
    public class InitFileRequest
    {
        public string Filename { get; set; }
        public string Header { get; set; }
    }

    public class AppendRowsRequest
    {
        public string Filename { get; set; }
        public string[] Rows { get; set; }
    }
}
