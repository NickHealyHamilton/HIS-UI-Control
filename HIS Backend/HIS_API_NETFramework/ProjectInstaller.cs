using System.ComponentModel;
using System.Configuration.Install;
using System.ServiceProcess;

namespace HIS_API_NETFramework
{
    [RunInstaller(true)]
    public class ProjectInstaller : Installer
    {
        private ServiceProcessInstaller serviceProcessInstaller;
        private ServiceInstaller serviceInstaller;

        public ProjectInstaller()
        {
            serviceProcessInstaller = new ServiceProcessInstaller
            {
                Account = ServiceAccount.LocalSystem, // Has permissions for COM ports
                Username = null,
                Password = null
            };

            serviceInstaller = new ServiceInstaller
            {
                ServiceName = "HamiltonIncubatorService",
                DisplayName = "Hamilton Incubator Service",
                Description = "Web API service for controlling Hamilton Incubator with 4 shelves",
                StartType = ServiceStartMode.Automatic
            };

            Installers.Add(serviceProcessInstaller);
            Installers.Add(serviceInstaller);
        }
    }
}