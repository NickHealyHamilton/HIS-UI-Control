using System.Web.Http;
using Owin;
using Swashbuckle.Application;
using System.Web.Http.Cors;
using Microsoft.Owin.Cors;

namespace HIS_API_NETFramework
{
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            var config = new HttpConfiguration();

            // Enable CORS for your React frontend
            var cors = new EnableCorsAttribute("http://localhost:3000", "*", "*");
            config.EnableCors(cors);

            // Web API routes
            config.MapHttpAttributeRoutes();

            config.Routes.MapHttpRoute(
                name: "DefaultApi",
                routeTemplate: "api/{controller}/{id}",
                defaults: new { id = RouteParameter.Optional }
            );

            // Enable Swagger
            config.EnableSwagger(c =>
            {
                c.SingleApiVersion("v1", "Hamilton Incubator API");
                c.DescribeAllEnumsAsStrings();
            })
            .EnableSwaggerUi(c =>
            {
                c.DocumentTitle("Hamilton Incubator API");
            });

            // JSON formatting
            config.Formatters.JsonFormatter.SerializerSettings.Formatting =
                Newtonsoft.Json.Formatting.Indented;

            app.UseWebApi(config);

            // Enable CORS for SignalR - MUST come before MapSignalR
            app.UseCors(CorsOptions.AllowAll);

            // Enable SignalR with configuration
            var hubConfiguration = new Microsoft.AspNet.SignalR.HubConfiguration
            {
                EnableDetailedErrors = true
            };
            app.MapSignalR(hubConfiguration);
        }
    }
}