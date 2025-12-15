using System;
using System.Collections.Generic;
using System.Web.Http;
using Hamilton.Incubator.DeviceDriver.Models;
using HIS_Logic;
using HIS.Common.Logging;
using Swashbuckle.Swagger.Annotations;

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
        private static bool _isSimulationMode = false;
        private static SimulationState _simulationState = new SimulationState();
        private static bool _isConnected = false;
        private static bool _initialized = false;

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
        /// Connect to the incubator device
        /// </summary>
        [HttpPost]
        [Route("connect")]
        [SwaggerResponse(200, "Tower connected successfully")]
        [SwaggerResponse(400, "Connection failed")]
        public IHttpActionResult Connect()
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
                    bool connected = _towerController.TowerConnect();
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

                if (!_initialized)
                {
                    return BadRequest("Tower is not initialized.");
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
                    return BadRequest("Tower not connected in simulation mode.");
                }

                var Shelves = new List<object>();

                for (int module = 1; module <= 4; module++)
                {
                    try
                    {
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
}
