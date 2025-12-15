using System.Web.Http;
using Swashbuckle.Application;

namespace HIS_API_NETFramework
{
    public class SwaggerConfig
    {
        public static void Register()
        {
            var thisAssembly = typeof(SwaggerConfig).Assembly;

            GlobalConfiguration.Configuration
                .EnableSwagger(c =>
                {
                    c.SingleApiVersion("v1", "HIS Incubator API");
                    c.IncludeXmlComments(GetXmlCommentsPath());
                })
                .EnableSwaggerUi();
        }

        private static string GetXmlCommentsPath()
        {
            // Path to XML documentation file (optional but recommended)
            return System.String.Format(@"{0}\bin\HIS_API_NETFramework.XML",
                System.AppDomain.CurrentDomain.BaseDirectory);
        }
    }
}