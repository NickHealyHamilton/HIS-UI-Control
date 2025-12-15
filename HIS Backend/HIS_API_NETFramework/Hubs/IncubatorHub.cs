using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNet.SignalR;

namespace HIS_API_NETFramework.Hubs
{
    public class IncubatorHub : Hub
    {
        // Called when React connects
        public void Subscribe()
        {
            Groups.Add(Context.ConnectionId, "IncubatorEvents");
        }

        // Called when React disconnects
        public void Unsubscribe()
        {
            Groups.Remove(Context.ConnectionId, "IncubatorEvents");
        }
    }
}
