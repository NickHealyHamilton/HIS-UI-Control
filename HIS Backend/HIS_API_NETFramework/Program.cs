using System;
using System.Linq;
using System.ServiceProcess;
using System.Reflection;
using System.IO;

namespace HIS_API_NETFramework
{
    static class Program
    {
        static void Main(string[] args)
        {
            // CRITICAL: Set up assembly resolver FIRST
            AppDomain.CurrentDomain.AssemblyResolve += CurrentDomain_AssemblyResolve;

            var service = new IncubatorWindowsService();

            // Check if running in interactive mode (console) or as service
            if (Environment.UserInteractive || args.Contains("--console"))
            {
                // Running as console application (for debugging)
                Console.WriteLine("Running in console mode...");
                service.StartInteractive(args);
            }
            else
            {
                // Running as Windows Service
                ServiceBase.Run(service);
            }
        }

        private static Assembly CurrentDomain_AssemblyResolve(object sender, ResolveEventArgs args)
        {
            // Get the assembly name
            var assemblyName = new AssemblyName(args.Name).Name;

            // Get the directory where the service EXE is located
            var assemblyDirectory = AppDomain.CurrentDomain.BaseDirectory;

            // Try to find the DLL
            var assemblyPath = Path.Combine(assemblyDirectory, assemblyName + ".dll");

            if (File.Exists(assemblyPath))
            {
                return Assembly.LoadFrom(assemblyPath);
            }

            return null;
        }
    }
}