using Cognex.DataMan.SDK;
using NLog;
using NLog.Config;
using NLog.Targets;
using System;
using System.IO;

namespace HIS.Common.Logging
{
    public static class SharedLogger
    {
        private static readonly Logger Logger;
        private static readonly LogFactory LogFactory;
        private static readonly Exception InitException;

        static SharedLogger()
        {
            try
            {
                var config = new LoggingConfiguration();

                // Get base directory and ensure logs folder exists
                var baseDir = AppDomain.CurrentDomain.BaseDirectory;
                var logsDir = Path.Combine(baseDir, "logs");

                // Ensure directory exists
                if (!Directory.Exists(logsDir))
                {
                    Directory.CreateDirectory(logsDir);
                }

                // File target - OLD SYNTAX
                var fileTarget = new FileTarget();
                fileTarget.Name = "logfile";
                fileTarget.FileName = Path.Combine(logsDir, "HIS_${shortdate}.log");
                fileTarget.Layout = "${longdate}|${level:uppercase=true}|${logger}|${message} ${exception:format=tostring}";
                fileTarget.CreateDirs = true;
                fileTarget.KeepFileOpen = false;
                fileTarget.ConcurrentWrites = true;
                config.AddTarget("logfile", fileTarget);

                // Console target - OLD SYNTAX
                var consoleTarget = new ConsoleTarget();
                consoleTarget.Name = "console";
                consoleTarget.Layout = "${longdate}|${level:uppercase=true}|${message}";
                config.AddTarget("console", consoleTarget);

                // Add rules - OLD SYNTAX
                var fileRule = new LoggingRule("*", LogLevel.Debug, fileTarget);
                config.LoggingRules.Add(fileRule);

                var consoleRule = new LoggingRule("*", LogLevel.Info, consoleTarget);
                config.LoggingRules.Add(consoleRule);

                // Initialize LogFactory and Logger
                LogFactory = new LogFactory(config);
                Logger = LogFactory.GetCurrentClassLogger();
                Logger.Info("=== Shared logging initialized successfully ===");
            }
            catch (Exception ex)
            {
                InitException = ex;

                // Emergency fallback - write to a file we know works
                try
                {
                    var baseDir = AppDomain.CurrentDomain.BaseDirectory;
                    var logsDir = Path.Combine(baseDir, "logs");

                    if (!Directory.Exists(logsDir))
                    {
                        Directory.CreateDirectory(logsDir);
                    }

                    var emergencyLog = Path.Combine(logsDir, "LOGGER-INIT-ERROR.txt");
                    File.WriteAllText(emergencyLog,
                        $"SharedLogger initialization failed at {DateTime.Now}\r\n" +
                        $"Error: {ex.Message}\r\n" +
                        $"Stack: {ex.StackTrace}\r\n");
                }
                catch { /* Can't even write emergency log */ }
            }
        }

        public static Logger GetLogger()
        {
            if (InitException != null)
            {
                throw new InvalidOperationException(
                    "SharedLogger failed to initialize",
                    InitException
                );
            }
            return Logger;
        }

        public static LogFactory GetLogFactory()
        {
            if (InitException != null)
            {
                throw new InvalidOperationException(
                    "SharedLogger failed to initialize",
                    InitException
                );
            }
            return LogFactory;
        }
    }

    public static class SharedEventLogger
    {
        private static readonly Logger EventLogger;
        private static readonly Exception InitException;

        static SharedEventLogger()
        {
            try
            {
                // Create directory if it doesn't exist
                string logDir = @"C:\ProgramData\Hamilton\HIS API\HIS event logs\";
                if (!Directory.Exists(logDir))
                {
                    Directory.CreateDirectory(logDir);
                }

                // Create daily log file name
                string logFileName = "HIS_EventLog_${shortdate}.txt";
                string logFilePath = Path.Combine(logDir, logFileName);

                // Configure NLog target for event logging - OLD SYNTAX
                var config = new LoggingConfiguration();

                var fileTarget = new FileTarget();
                fileTarget.Name = "eventFile";
                fileTarget.FileName = logFilePath;
                fileTarget.Layout = "${longdate}|${level:uppercase=true}|${message}";
                fileTarget.ArchiveEvery = FileArchivePeriod.Day;
                fileTarget.ArchiveFileName = Path.Combine(logDir, "EventLog_{#}.txt");
                fileTarget.ArchiveDateFormat = "yyyy-MM-dd";
                fileTarget.MaxArchiveFiles = 30;
                fileTarget.CreateDirs = true;
                fileTarget.KeepFileOpen = false;
                fileTarget.ConcurrentWrites = true;

                config.AddTarget("eventFile", fileTarget);

                // Add rule - OLD SYNTAX
                var rule = new LoggingRule("*", LogLevel.Debug, fileTarget);
                config.LoggingRules.Add(rule);

                var logFactory = new LogFactory(config);
                EventLogger = logFactory.GetLogger("EventLogger");

                EventLogger.Info("=== Event logging started ===");
            }
            catch (Exception ex)
            {
                InitException = ex;

                // Emergency fallback
                try
                {
                    string logDir = @"C:\ProgramData\Hamilton\HIS API\HIS event logs\";
                    if (!Directory.Exists(logDir))
                    {
                        Directory.CreateDirectory(logDir);
                    }

                    var emergencyLog = Path.Combine(logDir, "EVENT-LOGGER-INIT-ERROR.txt");
                    File.WriteAllText(emergencyLog,
                        $"SharedEventLogger initialization failed at {DateTime.Now}\r\n" +
                        $"Error: {ex.Message}\r\n" +
                        $"Stack: {ex.StackTrace}\r\n");
                }
                catch { /* Can't even write emergency log */ }
            }
        }

        public static Logger GetEventLogger()
        {
            if (InitException != null)
            {
                throw new InvalidOperationException(
                    "SharedEventLogger failed to initialize",
                    InitException
                );
            }
            return EventLogger;
        }
    }

}