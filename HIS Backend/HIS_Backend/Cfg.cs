using System.Xml.Serialization;
using System.Xml;
using Hamilton.Incubator.DeviceDriver;
using System.IO;
using System;

namespace HIS_Logic
{
    internal class Configuration : IHamiltonIncubatorSettings
    {
        //
        // Summary:
        //     The default command timeout
        private const int DefaultCommandTimeout = 60;

        //
        // Summary:
        //     The default number of retries
        private const int DefaultDeviceRetries = 1;

        //
        // Summary:
        //     The default keep alive
        private const int DefaultKeepAlive = 10;

        //
        // Summary:
        //     The default number of logs to retreive
        private const int DefaultLogRetrieveCount = 100;

        //
        // Summary:
        //     The default fork offset value
        private const double DefaultForkOffset = 0.0;

        //
        // Summary:
        //     Gets or Sets a value indicating whether this is using default.
        //
        // Value:
        //     true if using defaults as file was not loaded; otherwise, false.
        [XmlIgnore]
        public bool DefaultsLoaded { get; protected set; }

        //
        // Summary:
        //     The timeout for waiting on commands issued to the Incubator.
        [XmlElement]
        public int CommandTimeout { get; set; }

        //
        // Summary:
        //     The number of allowable retries on connect.
        [XmlElement]
        public ushort ConnectionAttempts { get; set; }

        //
        // Summary:
        //     The keep alive to set on the Incubator.
        [XmlElement]
        public ushort KeepAlive { get; set; }

        //
        // Summary:
        //     The number of logs to retreive when retreiving logs
        [XmlElement]
        public ushort LogRetrieveCount { get; set; }

        //
        // Summary:
        //     The Z-offset to use when presenting the fork.
        [XmlElement]
        public double ForkOffset { get; set; }

        //
        // Summary:
        //     Number of times to attempt to connect to the device
        public ushort DeviceRetries { get; set; }

        //
        // Summary:
        //     Initializes a new instance of the HamiltonIncubatorCOM.Configuration class.
        public Configuration()
        {
            CommandTimeout = 60;
            ConnectionAttempts = 1;
            KeepAlive = 10;
            LogRetrieveCount = 100;
            ForkOffset = 0.0;
            DeviceRetries = 1;
            DefaultsLoaded = true;
        }

        //
        // Summary:
        //     Loads the configuration from file.
        //
        // Returns:
        //     The configuration as read from file or a default configuration if a file could
        //     not be read.
        public static Configuration Load(string pathToConfiguration)
        {
            Configuration configuration = null;
            try
            {
                XmlSerializer xmlSerializer = new XmlSerializer(typeof(Configuration));
                FileStream input = new FileStream(pathToConfiguration, FileMode.Open);
                XmlReader xmlReader = XmlReader.Create(input);
                configuration = (Configuration)xmlSerializer.Deserialize(xmlReader);
                configuration.DefaultsLoaded = false;
            }
            catch (Exception)
            {
                configuration = new Configuration();
            }

            return configuration;
        }
    }
}
