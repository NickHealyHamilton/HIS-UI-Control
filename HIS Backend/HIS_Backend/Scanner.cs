using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Cognex.DataMan.SDK;
using Cognex.DataMan.SDK.Discovery;
using HIS.Common.Logging;
using System.Drawing;
using System.Runtime.InteropServices;
using System.IO;
using System.Drawing.Imaging;
using System.IO.Ports;
using Microsoft.Win32;
using ImageFormat = Cognex.DataMan.SDK.ImageFormat;
using HIS_Logic.Events;
using NLog;
using System.Web;

namespace HIS_Logic
{
    public class Scanner : IDisposable
    {
        private DataManSystem _scanner;
        private ISystemConnector _systemConnector;
        private ManualResetEvent _dataReceived;
        private ManualResetEvent _discoveryComplete;
        private ScanResult _lastResult;
        private object _resultLock = new object();
        private bool _isConnected = false;
        private static NLog.Logger _logger = SharedLogger.GetLogger();
        private static Logger _eventLogger = SharedEventLogger.GetEventLogger();
        private SerSystemDiscoverer _serSystemDiscoverer;
        private SerSystemDiscoverer.SystemInfo _systemInfo = null;
        private Thread _customDiscoveryThread;
        private bool _exitDiscoveryThread = false;
        public string comPort = "";

        // Define delegates for events that API can subscribe to
        public event EventHandler<ScanResultEventArgs> ScanEvent;
        public delegate void ScannerConnectionHander(string connectionLogEntry);

        public bool IsConnected => _isConnected;

        public bool ScannerConnect(string comPort)
        {
            try
            {
                if (_isConnected)
                {
                    _logger.Error("Scanner already connected");
                    return true;
                }
                this.comPort = comPort;
                _dataReceived = new ManualResetEvent(false);

                    _logger.Info($"Creating serial connector on comport {this.comPort}");
                    _systemConnector = new SerSystemConnector(this.comPort, 9600);
                    _scanner = new DataManSystem(_systemConnector);

                    _scanner.AutomaticResponseArrived += OnDataArrived;

                    _logger.Info($"Connecting to scanner on comport {this.comPort}");
                    _scanner.Connect();
                    _eventLogger.Info($"Scanner connected on comport {this.comPort}");
                    ScannerConnection($"Scanner connected on {this.comPort}");

                    _logger.Info($"Configuring scanner");
                    ConfigureScanner();

                _isConnected = true;
                return true;
                

                throw new Exception("Could not find a connected scaner");

            }
            catch (Exception ex)
            {
                _eventLogger.Error($"Connection failed: {ex.Message}");
                _logger.Error($"Connection failed: {ex.Message}");
                Cleanup();
                return false;
            }
        }

        public string[] ScannersDiscover()
        {
            try
            {
                if (_isConnected)
                {
                    _logger.Error("Scanner already connected");
                    return Array.Empty<string>();
                }

                _logger.Info("Attempting fast scanner discovery (9600 baud only)");
                _eventLogger.Info("Scanner Discovery: Fast discovery thread starts");

                // Get available COM ports from registry
                RegistryKey registryKey = Registry.LocalMachine.OpenSubKey("Hardware\\DeviceMap\\SerialComm");
                if (registryKey == null)
                {
                    _logger.Warn("Scanner Discovery: No serial ports found in registry");
                    return Array.Empty<string>();
                }

                string[] valueNames = registryKey.GetValueNames();
                List<string> discoveredPorts = new List<string>();

                // Configure serial port settings for DataMan scanners
                const int baudRate = 9600; // Default for DataMan scanners

                foreach (string portName in valueNames)
                {
                    string comPortName = registryKey.GetValue(portName) as string;
                    if (string.IsNullOrEmpty(comPortName))
                        continue;

                    using (SerialPort serialPort = new SerialPort())
                    {
                        serialPort.PortName = comPortName;
                        serialPort.BaudRate = baudRate;
                        serialPort.DtrEnable = true;
                        serialPort.ReadBufferSize = 4096;
                        serialPort.DataBits = 8;
                        serialPort.StopBits = StopBits.One;
                        serialPort.Handshake = Handshake.None;
                        serialPort.Parity = Parity.None;
                        serialPort.ReadTimeout = 250;
                        serialPort.WriteTimeout = 250;

                        if (TryDiscoverScanner(serialPort, comPortName, baudRate))
                        {
                            discoveredPorts.Add(comPortName);
                        }
                    }
                }

                registryKey?.Dispose();

                if (discoveredPorts.Count > 0)
                {
                    _logger.Info($"Scanner Discovery: Found {discoveredPorts.Count} scanner(s)");
                    _eventLogger.Info($"Scanner Discovery: Found {discoveredPorts.Count} scanner(s) on ports: {string.Join(", ", discoveredPorts)}");
                }
                else
                {
                    _logger.Info("Scanner Discovery: No scanners found");
                    _eventLogger.Info("Scanner Discovery: No scanners found");
                }

                return discoveredPorts.ToArray();
            }
            catch (Exception ex)
            {
                _logger.Error($"Scanner Discovery failed: {ex.Message}", ex);
                _eventLogger.Error($"Scanner Discovery failed: {ex.Message}");
                return Array.Empty<string>();
            }
        }

        private bool TryDiscoverScanner(SerialPort serialPort, string portName, int baudRate)
        {
            try
            {
                _logger.Info($"Scanner Discovery: Trying to connect to {portName} at {baudRate} baud");

                serialPort.Open();
                Thread.Sleep(50);

                try
                {
                    // Test DMCC communication
                    bool succeeded;
                    SendDmccWaitResponse(serialPort, "SET DATA.RESULT-TYPE 0", out succeeded);

                    if (!succeeded)
                        return false;

                    string snResponse = SendDmccWaitResponse(serialPort, "GET DEVICE.SERIAL-NUMBER", out succeeded);

                    if (succeeded && !string.IsNullOrEmpty(snResponse))
                    {
                        _logger.Info($"Scanner Discovery: DMCC Device with serial number {snResponse} discovered on {portName} at {baudRate} baud");
                        _eventLogger.Info($"Scanner Discovery: DMCC Device with serial number {snResponse} discovered on {portName} at {baudRate} baud");
                        return true;
                    }

                    return false;
                }
                finally
                {
                    if (serialPort.IsOpen)
                    {
                        serialPort.Close();
                    }
                }
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.Warn($"Scanner Discovery: Could not access port {portName}: {ex.Message}");
                return false;
            }
            catch (Exception ex)
            {
                _logger.Error($"Scanner Discovery: Unexpected error on {portName}: {ex.Message}");
                return false;
            }
        }

        private void OnDataArrived(object sender, AutomaticResponseArrivedEventArgs e)
        {
            lock (_resultLock)
            {
                // Initialize result object if needed
                if (_lastResult == null)
                {
                    _lastResult = new ScanResult { ResponseId = e.ResponseId };
                }

                // Process different result types
                switch (e.DataType)
                {
                    case ResultTypes.ReadString:
                        _lastResult.BarcodeData = Encoding.UTF8.GetString(e.Data);
                        // Don't set Success here yet - wait for both barcode AND image
                        break;

                    case ResultTypes.ReadXml:
                        _lastResult.XmlResult = Encoding.UTF8.GetString(e.Data);
                        break;

                    case ResultTypes.Image:
                        _lastResult.ImageData = e.Data;
                        break;

                    case ResultTypes.ImageGraphics:
                        _lastResult.ImageGraphics = Encoding.UTF8.GetString(e.Data);
                        break;

                    case ResultTypes.CodeQualityData:
                        _lastResult.CodeQualityData = Encoding.UTF8.GetString(e.Data);
                        break;
                }

                // Only signal success when we have BOTH barcode data AND image
                bool hasBarcodeData = !string.IsNullOrEmpty(_lastResult.BarcodeData);
                bool hasImage = _lastResult.ImageData != null && _lastResult.ImageData.Length > 0;

                if (hasBarcodeData && hasImage)
                {
                    _lastResult.Success = true;
                    _dataReceived.Set();
                }
            }
        }

        private string SendDmccWaitResponse(SerialPort serialPort, string command, out bool succeeded)
        {
            const int magicDmccCommandId = 23456;
            succeeded = false;
            string commandStr = $"||:{magicDmccCommandId};1>{command}\r\n";
            serialPort.WriteLine(commandStr);
            _logger.Info($"Scanner Discovery: {serialPort.PortName}: sending '{commandStr.TrimEnd()}'");
            
            string response;
            do
            {
                response = serialPort.ReadLine();
                _logger.Info($"Scanner Discovery: {serialPort.PortName}: received '{response.TrimEnd()}'");
            }
            while (!response.StartsWith("||") || !response.Contains(":" + magicDmccCommandId));
            
            int statusStart = response.IndexOf('[');
            if (statusStart < 0)
                return response;
            
            string statusCode = "";
            for (int i = statusStart + 1; i < response.Length; i++)
            {
                char c = response[i];
                if (char.IsDigit(c))
                {
                    statusCode += c;
                }
                else
                {
                    if (c != ']')
                        return response;
                    response = response.Substring(i + 1).TrimEnd();
                    break;
                }
            }
            
            int status;
            try
            {
                status = int.Parse(statusCode);
            }
            catch
            {
                return response;
            }
            
            if (status != 0)
            {
                _logger.Warn($"Scanner Discovery: command failed with status code {status}: '{commandStr.TrimEnd()}'");
                return response;
            }
            
            succeeded = true;
            return response;
        }

        private void FastDiscoveryThreadFunc()
        {
            try
            {
                _logger.Info("Scanner Discovery: Fast discovery thread starts");
                _eventLogger.Info("Scanner Discovery: Fast discovery thread starts");
                
                RegistryKey registryKey = Registry.LocalMachine.OpenSubKey("Hardware\\DeviceMap\\SerialComm");
                if (registryKey == null)
                {
                    _logger.Warn("Scanner Discovery: No serial ports found in registry");
                    return;
                }
                
                string[] valueNames = registryKey.GetValueNames();
                SerialPort serialPort = new SerialPort();
                serialPort.DtrEnable = true;
                serialPort.ReadBufferSize = 4096;
                serialPort.DataBits = 8;
                serialPort.StopBits = StopBits.One;
                serialPort.Handshake = Handshake.None;
                serialPort.Parity = Parity.None;
                serialPort.ReadTimeout = 250;
                serialPort.WriteTimeout = 250;
                
                // Only check 9600 baud rate (default for DataMan scanners)
                int baudRate = 9600;
                
                foreach (string portName in valueNames)
                {
                    if (_exitDiscoveryThread)
                    {
                        _logger.Info("Scanner Discovery: Thread exit requested");
                        return;
                    }
                    
                    serialPort.PortName = registryKey.GetValue(portName) as string;
                    
                    bool found = false;
                    string serialNumber = null;
                    string deviceName = null;
                    string deviceType = null;
                    int deviceTypeId = 0;
                    
                    try
                    {
                        serialPort.BaudRate = baudRate;
                        serialPort.Open();
                        Thread.Sleep(50);
                        
                        try
                        {
                            _logger.Info($"Scanner Discovery: Trying to connect to {serialPort.PortName} at {baudRate} baud");
                            
                            bool succeeded;
                            SendDmccWaitResponse(serialPort, "SET DATA.RESULT-TYPE 0", out succeeded);
                            
                            string snResponse = SendDmccWaitResponse(serialPort, "GET DEVICE.SERIAL-NUMBER", out succeeded);
                            found = succeeded;
                            if (succeeded)
                                serialNumber = snResponse;
                            
                            string nameResponse = SendDmccWaitResponse(serialPort, "GET DEVICE.NAME", out succeeded);
                            if (succeeded)
                                deviceName = nameResponse;
                            
                            string typeResponse = SendDmccWaitResponse(serialPort, "GET DEVICE.TYPE", out succeeded);
                            if (succeeded)
                                deviceType = typeResponse;
                            
                            try
                            {
                                string idResponse = SendDmccWaitResponse(serialPort, "GET DEVICE.ID", out succeeded);
                                if (succeeded && !string.IsNullOrEmpty(idResponse))
                                    deviceTypeId = int.Parse(idResponse);
                            }
                            catch
                            {
                                // Device ID is optional
                            }
                        }
                        catch
                        {
                            found = false;
                        }
                        finally
                        {
                            serialPort.Close();
                        }
                        
                        if (found)
                        {
                            _logger.Info($"Scanner Discovery: Device '{deviceName}' discovered on {serialPort.PortName} at {baudRate} baud");
                            _eventLogger.Info($"Scanner Discovery: Device '{deviceName}' discovered on {serialPort.PortName}");
                            
                            // Create SystemInfo (note: requires SerSystemDiscoverer.SystemInfo constructor to be public)
                            // If constructor is not accessible, you can directly set _systemInfo fields manually
                            this.comPort = serialPort.PortName;
                            _discoveryComplete.Set();
                            return;
                        }
                    }
                    catch (UnauthorizedAccessException ex)
                    {
                        _logger.Warn($"Scanner Discovery: Could not access port {serialPort.PortName}: {ex.Message}");
                        continue;
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"Scanner Discovery: Unexpected error on {serialPort.PortName}: {ex.Message}");
                    }
                }
                
                _logger.Info("Scanner Discovery: Fast discovery thread finished - no scanner found");
                _eventLogger.Warn("Scanner Discovery: No scanner found on any COM port");
            }
            catch (Exception ex)
            {
                _logger.Error($"Scanner Discovery: Thread quit abnormally: {ex.Message}");
                _eventLogger.Error($"Scanner Discovery: Thread quit abnormally: {ex.Message}");
            }
        }

        private void OnScan(object sender, ScanResultEventArgs e)
        {
            _eventLogger.Info($"Scan event for barcode {e.barcode}");
            if (e != null) ScanEvent?.Invoke(this, e);
        }

        public ScanResult TriggerAndGetResult(int timeoutMs = 5000)
        {
            if (!_isConnected)
            {
                return new ScanResult
                {
                    Success = false,
                    BarcodeData = "Scanner not connected"
                };
            }

            try
            {
                lock (_resultLock)
                {
                    _dataReceived.Reset();
                    _lastResult = null;
                }

                _scanner.SendCommand("TRIGGER ON");

                if (_dataReceived.WaitOne(timeoutMs))
                {
                    lock (_resultLock)
                    {
                        // Verify we have both components for a successful scan
                        bool hasBarcodeData = !string.IsNullOrEmpty(_lastResult.BarcodeData);
                        bool hasImage = _lastResult.ImageData != null && _lastResult.ImageData.Length > 0;

                        _scanner.SendCommand("TRIGGER OFF");
                        ScanResultEventArgs scanargs = new ScanResultEventArgs
                        {
                            barcode = _lastResult.BarcodeData
                        };

                        this.OnScan(this, scanargs);
                        return new ScanResult
                        {
                            ResponseId = _lastResult.ResponseId,
                            Success = hasBarcodeData && hasImage, // Both must be present
                            BarcodeData = _lastResult.BarcodeData ?? "No barcode data received",
                            BarcodeType = _lastResult.BarcodeType,
                            ImageData = _lastResult.ImageData,
                            XmlResult = _lastResult.XmlResult
                        };
                    }
                }
                _scanner.SendCommand("TRIGGER OFF");
                // Timeout - check what we did receive
                lock (_resultLock)
                {
                    bool hasBarcodeData = !string.IsNullOrEmpty(_lastResult?.BarcodeData);
                    bool hasImage = _lastResult?.ImageData != null && _lastResult.ImageData.Length > 0;

                    string timeoutMessage;
                    if (!hasBarcodeData && !hasImage)
                    {
                        timeoutMessage = "Timeout - no barcode or image received";
                    }
                    else if (!hasBarcodeData)
                    {
                        timeoutMessage = "Timeout - image received but no barcode data";
                    }
                    else if (!hasImage)
                    {
                        timeoutMessage = "Timeout - barcode received but no image data";
                    }
                    else
                    {
                        timeoutMessage = "Timeout"; // Shouldn't happen but just in case
                    }

                    ScanResultEventArgs scanargs = new ScanResultEventArgs
                    {
                        barcode = _lastResult.BarcodeData
                    };

                    this.OnScan(this, scanargs);

                    return new ScanResult
                    {
                        Success = false,
                        BarcodeData = timeoutMessage,
                        ImageData = _lastResult?.ImageData
                    };
                }
            }
            catch (Exception ex)
            {
                return new ScanResult
                {
                    Success = false,
                    BarcodeData = $"Error: {ex.Message}"
                };
            }
        }

        public string GetLiveImage()
        {
            try
            {
                Bitmap img = (Bitmap)_scanner.GetLiveImage(ImageFormat.bitmap, ImageSize.Quarter, ImageQuality.High);

                using(var stream = new MemoryStream())
                {
                    img.Save(stream, System.Drawing.Imaging.ImageFormat.Bmp);
                    byte[] imgBytes = stream.ToArray();
                    return Convert.ToBase64String(imgBytes);
                }
            }
            catch (Exception ex)
            {
                _logger.Error(ex.Message);
                return "Live image string unable to be retrieved";    
            }
        }

        public bool ApplyROI(int x0 = 0, int y0 = 0, int x1 = 1280, int y1 = 960)
        {
            try
            {
                _eventLogger.Info($"ATTEMPTING TO SET ROI OF {x0} {x1} {y0} {y1}");
                _scanner.SendCommand($"SET DECODER.ROI {x0} {x1} {y0} {y1}");
                _eventLogger.Info($"ROI APPLIED");
                return true;
            }
            catch(Exception ex)
            {
                string exception = ex.Message;
                _eventLogger.Error($"ROI UPDATE FAILED. {exception}");
                return false;
            }
            
        }

        public bool SendDMCC(string dmcc)
        {
            try
            {
                _scanner.SendCommand(dmcc);
                return true;
            }
            catch (Exception ex)
            {
                return false;
            }
        }

        private void ConfigureScanner()
        {
            try
            {

                // CRITICAL: Tell scanner which result types to send
                _scanner.SetResultTypes(ResultTypes.ReadString | ResultTypes.Image);

                // Enable specific symbologies (use 1 for basic enable, 2 for full omnidirectional)
                _scanner.SendCommand("SET SYMBOL.DATAMATRIX ON"); // 2 = omnidirectional
                _scanner.SendCommand("SET SYMBOL.QR ON");
                _scanner.SendCommand("SET SYMBOL.PDF417 ON");

                // 1D Codes
                _scanner.SendCommand("SET SYMBOL.C128 ON");
                _scanner.SendCommand("SET SYMBOL.C39 ON");
                _scanner.SendCommand("SET SYMBOL.C93 ON");
                _scanner.SendCommand("SET SYMBOL.CODABAR ON");
                _scanner.SendCommand("SET SYMBOL.I2O5 ON"); // Interleaved 2 of 5
                _scanner.SendCommand("SET SYMBOL.EAN-UCC ON");
                _scanner.SendCommand("SET SYMBOL.UPC-EAN ON");

                // Set 1D symbol orientation
                _scanner.SendCommand("SET DECODER.1D-SYMBOL-ORIENTATION 0");

                // Set ROI (adjust based on your DM72 model)
                this.ApplyROI();

                // Set orientation/rotation if needed
                // _scanner.SendCommand("SET IMAGE.ROTATION 0");
            }
            catch (Exception ex)
            {
                _logger.Error($"Configuration failed: {ex.Message}");
                throw; // Re-throw so connection fails
            }
        }

        public void Disconnect()
        {
            Cleanup();
        }

        private void Cleanup()
        {
            try
            {
                // Stop discovery thread if running
                if (_customDiscoveryThread != null && _customDiscoveryThread.IsAlive)
                {
                    _exitDiscoveryThread = true;
                    _customDiscoveryThread.Join(1000); // Wait up to 1 second
                }
                
                if (_scanner != null)
                {
                    _scanner.AutomaticResponseArrived -= OnDataArrived;
                    _scanner.Disconnect();
                }
                _systemConnector?.Disconnect();
                _dataReceived?.Dispose();
                _discoveryComplete?.Dispose();
                _serSystemDiscoverer?.Dispose();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Cleanup failed: {ex.Message}");
            }
            finally
            {
                _isConnected = false;
            }
        }

        public void Dispose()
        {
            Cleanup();
        }

        public event ScannerConnectionHander ScannerConnection;
    }

    public class ScanResult
    {
        public int ResponseId { get; set; }
        public bool Success { get; set; }
        public string BarcodeData { get; set; }
        public string BarcodeType { get; set; }
        public byte[] ImageData { get; set; }
        public string XmlResult { get; set; }
        public string ImageGraphics { get; set; }
        public string CodeQualityData { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public class ScanResultEventArgs
    {
        public string module { get; set; } = string.Empty;
        public string barcode { get; set; } = "SCAN FAILED";
        public DateTime timeStamp { get; set; } = DateTime.UtcNow;
    }
}

