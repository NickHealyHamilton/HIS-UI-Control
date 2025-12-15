// In HIS_Backend project - create EventArgs.cs

using System.Linq;
using System;
using HIS.Common.Logging;
using NLog;

namespace HIS_Logic.Events
{
    public class IncubatorLogEventArgs : EventArgs
    {
        public string Module { get; set; }
        public string Timestamp { get; set; }
        public string EventId { get; set; }
        public double Data0 { get; set; }
        public double Data1 { get; set; }
        public double Data2 { get; set; }
        public double Data3 { get; set; }

        public static IncubatorLogEventArgs Parse(string sender, string data)
        {
            try
            {
                // Extract module from sender (e.g., "COM10.Module1" -> "Module1")
                var module = sender.Split('.').LastOrDefault() ?? "Unknown";

                // Parse CSV: serial, timestamp, eventID, data0, data1, data2, data3
                var parts = data.Split(',').Select(p => p.Trim()).ToArray();

                if (parts.Length < 7) return null;

                return new IncubatorLogEventArgs
                {
                    Module = module,
                    Timestamp = parts[1],
                    EventId = parts[2],
                    Data0 = double.TryParse(parts[3], out var d0) ? d0 : 0,
                    Data1 = double.TryParse(parts[4], out var d1) ? d1 : 0,
                    Data2 = double.TryParse(parts[5], out var d2) ? d2 : 0,
                    Data3 = double.TryParse(parts[6], out var d3) ? d3 : 0
                };
            }
            catch
            {
                return null;
            }
        }
    }

    public class HeaterErrorEventArgs : EventArgs
    {
        public string Module { get; set; }
        public string Error { get; set; }
        public DateTime Timestamp { get; set; }

        public static HeaterErrorEventArgs Parse(string sender, string data)
        {
            var module = sender.Split('.').LastOrDefault() ?? "Unknown";
            return new HeaterErrorEventArgs
            {
                Module = module,
                Error = data,
                Timestamp = DateTime.UtcNow
            };
        }
    }

    public class TemperatureEventArgs : EventArgs
    {
        public string Module { get; set; }
        public string EventType { get; set; }
        public DateTime Timestamp { get; set; }

        public static TemperatureEventArgs Parse(string sender, string data)
        {

            var parts = sender.Split('.');
            var module = parts.LastOrDefault() ?? "Unknown";

            return new TemperatureEventArgs
            {
                Module = module,
                EventType = data,
                Timestamp = DateTime.UtcNow
            };
        }
    }

    public class ShakerErrorEventArgs : EventArgs
    {
        public string Module { get; set; }
        public string Error { get; set; }
        public DateTime Timestamp { get; set; }

        public static ShakerErrorEventArgs Parse(string sender, string data)
        {
            var module = sender.Split('.').LastOrDefault() ?? "Unknown";
            return new ShakerErrorEventArgs
            {
                Module = module,
                Error = data,
                Timestamp = DateTime.UtcNow
            };
        }
    }
}
