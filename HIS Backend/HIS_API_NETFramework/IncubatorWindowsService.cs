using System;
using System.ServiceProcess;
using Microsoft.Owin.Hosting;
using HIS_Logic;
using HIS.Common.Logging;

namespace HIS_API_NETFramework
{
    public class IncubatorWindowsService : ServiceBase
    {
        private IDisposable _webApp;
        private static readonly NLog.Logger Logger = SharedLogger.GetLogger();
        private const string ServiceUrl = "http://localhost:5000"; // Can be configured

        public IncubatorWindowsService()
        {
            ServiceName = "HamiltonIncubatorService";
            CanStop = true;
            CanPauseAndContinue = false;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            try
            {
                Logger.Info($"Starting Hamilton Incubator Service on {ServiceUrl}");

                _webApp = WebApp.Start<Startup>(ServiceUrl);

                Logger.Info($"Service started successfully. Swagger UI available at {ServiceUrl}/swagger");
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Failed to start service");
                throw;
            }
        }

        protected override void OnStop()
        {
            try
            {
                Logger.Info("Stopping Hamilton Incubator Service");

                _webApp?.Dispose();

                Logger.Info("Service stopped successfully");
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "Error during service shutdown");
            }
        }

        // This method allows running as console app for debugging
        public void StartInteractive(string[] args)
        {
            OnStart(args);
            Console.WriteLine($"Service running on {ServiceUrl}");
            Console.WriteLine($"Swagger UI: {ServiceUrl}/swagger");
            Console.WriteLine("Press Enter to stop...");
            Console.ReadLine();
            OnStop();
        }
    }
}