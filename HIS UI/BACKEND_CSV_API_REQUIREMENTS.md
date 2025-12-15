# Backend API Endpoints Needed for CSV File Management

The frontend has been updated to use filesystem-based CSV logging. You need to add these endpoints to your backend C# API.

## API Endpoints Required

### Base Path
`/api/incubator/csv/`

---

### 0. Get Unique Barcodes (NEW)
**GET** `/api/incubator/csv/barcodes`

**Query Parameters:**
- `startTime` (ISO 8601 datetime string) - Start of time range
- `endTime` (ISO 8601 datetime string) - End of time range  
- `mode` (string) - Either "live" or "simulated"

**Logic:**
- Get all CSV files matching mode prefix (incubator_live or incubator_simulated)
- Parse CSV files and extract barcode column (index 7)
- Filter rows by timestamp (column 1) within the time range
- Return distinct/unique barcodes sorted alphabetically
- Skip empty/null barcodes

**Response:**
```json
{
  "barcodes": [
    "ABC123",
    "DEF456", 
    "GHI789"
  ],
  "count": 3
}
```

---

### 1. Initialize CSV File
**POST** `/api/incubator/csv/init`

**Request Body:**
```json
{
  "filename": "incubator_live_2025-10-23.csv",
  "header": "shelf,timestamp,currentTemp,targetTemp,currentRPM,targetRPM,platePresent"
}
```

**Logic:**
- Check if directory exists: `C:\ProgramData\Hamilton\HIS API\Data logs`
- Create directory if it doesn't exist
- Check if file already exists
- If file doesn't exist, create it and write header line
- Return success status

**Response:**
```json
{
  "success": true,
  "message": "File initialized",
  "path": "C:\\ProgramData\\Hamilton\\HIS API\\Data logs\\incubator_live_2025-10-23.csv"
}
```

---

### 2. Append Rows to CSV File
**POST** `/api/incubator/csv/append`

**Request Body:**
```json
{
  "filename": "incubator_live_2025-10-23.csv",
  "rows": [
    "1,2025-10-23T14:30:00.000Z,37.5,37.0,150,150,true",
    "2,2025-10-23T14:30:00.000Z,25.0,25.0,100,100,true"
  ]
}
```

**Logic:**
- Build full path: `C:\ProgramData\Hamilton\HIS API\Data logs\{filename}`
- Append rows to file (one per line)
- Use `File.AppendAllLines()` in C#

**Response:**
```json
{
  "success": true,
  "rowsAppended": 2
}
```

---

### 3. List CSV Files
**GET** `/api/incubator/csv/list`

**Logic:**
- List all files in `C:\ProgramData\Hamilton\HIS API\Data logs`
- Filter for `*.csv` files
- Return file info: name, size, row count, modified date

**Response:**
```json
{
  "files": [
    {
      "filename": "incubator_live_2025-10-23.csv",
      "size": 1048576,
      "rowCount": 345600,
      "lastModified": "2025-10-23T23:59:59Z"
    },
    {
      "filename": "incubator_simulated_2025-10-23.csv",
      "size": 524288,
      "rowCount": 172800,
      "lastModified": "2025-10-23T18:30:00Z"
    }
  ]
}
```

---

### 4. Read CSV File
**GET** `/api/incubator/csv/read/{filename}`

**Example:** `/api/incubator/csv/read/incubator_live_2025-10-23.csv`

**Logic:**
- URL decode filename
- Build full path
- Read entire file content
- Return as string

**Response:**
```json
{
  "filename": "incubator_live_2025-10-23.csv",
  "content": "shelf,timestamp,currentTemp,targetTemp,currentRPM,targetRPM,platePresent\n1,2025-10-23T14:30:00.000Z,37.5,37.0,150,150,true\n..."
}
```

**Note:** For large files, consider pagination or streaming.

---

### 5. Delete CSV File
**DELETE** `/api/incubator/csv/delete/{filename}`

**Example:** `/api/incubator/csv/delete/incubator_live_2025-10-22.csv`

**Logic:**
- URL decode filename
- Build full path
- Delete file if exists
- Return success

**Response:**
```json
{
  "success": true,
  "message": "File deleted"
}
```

---

### 6. Delete Old CSV Files
**DELETE** `/api/incubator/csv/cleanup?daysToKeep=7`

**Query Parameters:**
- `daysToKeep` (int, default: 7)

**Logic:**
- Get all CSV files in directory
- Filter files older than X days
- Delete matching files
- Return count

**Response:**
```json
{
  "success": true,
  "deletedCount": 3,
  "deletedFiles": [
    "incubator_live_2025-10-15.csv",
    "incubator_live_2025-10-14.csv",
    "incubator_simulated_2025-10-15.csv"
  ]
}
```

---

## C# Implementation Example (.NET Framework 4.8 / Web API 2)

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;

namespace YourNamespace.Controllers
{
    [RoutePrefix("api/incubator/csv")]
    public class CSVController : ApiController
    {
        private const string DATA_LOG_PATH = @"C:\ProgramData\Hamilton\HIS API\Data logs";

        [HttpPost]
        [Route("init")]
        public IHttpActionResult InitializeFile(InitFileRequest request)
        {
            try
            {
                // Ensure directory exists
                Directory.CreateDirectory(DATA_LOG_PATH);
                
                var filePath = Path.Combine(DATA_LOG_PATH, request.Filename);
                
                // Only create if doesn't exist
                if (!File.Exists(filePath))
                {
                    File.WriteAllText(filePath, request.Header + Environment.NewLine);
                }
                
                return Ok(new
                {
                    success = true,
                    message = "File initialized",
                    path = filePath
                });
            }
            catch (Exception ex)
            {
                return Content(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        [HttpPost]
        [Route("append")]
        public IHttpActionResult AppendRows(AppendRowsRequest request)
        {
            try
            {
                var filePath = Path.Combine(DATA_LOG_PATH, request.Filename);
                
                if (!File.Exists(filePath))
                {
                    return Content(HttpStatusCode.NotFound, new { success = false, message = "File not found" });
                }
                
                File.AppendAllLines(filePath, request.Rows);
                
                return Ok(new
                {
                    success = true,
                    rowsAppended = request.Rows.Length
                });
            }
            catch (Exception ex)
            {
                return Content(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        [HttpGet]
        [Route("list")]
        public IHttpActionResult ListFiles()
        {
            try
            {
                Directory.CreateDirectory(DATA_LOG_PATH);
                
                var files = Directory.GetFiles(DATA_LOG_PATH, "*.csv")
                    .Select(path => new FileInfo(path))
                    .Select(fileInfo => new
                    {
                        filename = fileInfo.Name,
                        size = fileInfo.Length,
                        rowCount = File.ReadLines(fileInfo.FullName).Count() - 1, // Subtract header
                        lastModified = fileInfo.LastWriteTimeUtc
                    })
                    .OrderByDescending(f => f.lastModified)
                    .ToList();
                
                return Ok(new { files });
            }
            catch (Exception ex)
            {
                return Content(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        [HttpGet]
        [Route("read/{filename}")]
        public IHttpActionResult ReadFile(string filename)
        {
            try
            {
                var filePath = Path.Combine(DATA_LOG_PATH, filename);
                
                if (!File.Exists(filePath))
                {
                    return Content(HttpStatusCode.NotFound, new { success = false, message = "File not found" });
                }
                
                var content = File.ReadAllText(filePath);
                
                return Ok(new
                {
                    filename,
                    content
                });
            }
            catch (Exception ex)
            {
                return Content(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete]
        [Route("delete/{filename}")]
        public IHttpActionResult DeleteFile(string filename)
        {
            try
            {
                var filePath = Path.Combine(DATA_LOG_PATH, filename);
                
                if (File.Exists(filePath))
                {
                    File.Delete(filePath);
                    return Ok(new { success = true, message = "File deleted" });
                }
                
                return Content(HttpStatusCode.NotFound, new { success = false, message = "File not found" });
            }
            catch (Exception ex)
            {
                return Content(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete]
        [Route("cleanup")]
        public IHttpActionResult CleanupOldFiles(int daysToKeep = 7)
        {
            try
            {
                Directory.CreateDirectory(DATA_LOG_PATH);
                
                var cutoffDate = DateTime.UtcNow.AddDays(-daysToKeep);
                var deletedFiles = new List<string>();
                
                var files = Directory.GetFiles(DATA_LOG_PATH, "*.csv");
                
                foreach (var filePath in files)
                {
                    var fileInfo = new FileInfo(filePath);
                    if (fileInfo.LastWriteTimeUtc < cutoffDate)
                    {
                        File.Delete(filePath);
                        deletedFiles.Add(fileInfo.Name);
                    }
                }
                
                return Ok(new
                {
                    success = true,
                    deletedCount = deletedFiles.Count,
                    deletedFiles
                });
            }
            catch (Exception ex)
            {
                return Content(HttpStatusCode.InternalServerError, new { success = false, message = ex.Message });
            }
        }
    }

    // Request Models
    public class InitFileRequest
    {
        public string Filename { get; set; }
        public string Header { get; set; }
    }

    public class AppendRowsRequest
    {
        public string Filename { get; set; }
        public string[] Rows { get; set; }
    }
}
```

---

## Key Differences from ASP.NET Core:

### **1. Attributes:**
- ❌ `[ApiController]` → Not needed in Web API 2
- ❌ `[Route("api/incubator/csv")]` on class → Use `[RoutePrefix]`
- ✅ `[RoutePrefix("api/incubator/csv")]` → Defines base path
- ✅ `[Route("init")]` → Defines relative route

### **2. Base Class:**
- ❌ `ControllerBase` (ASP.NET Core)
- ✅ `ApiController` (Web API 2)

### **3. Return Types:**
- ❌ `IActionResult` (ASP.NET Core)
- ✅ `IHttpActionResult` (Web API 2)
- ✅ `Ok()` - Still works
- ✅ `Content(HttpStatusCode.NotFound, ...)` - For error responses

### **4. Query Parameters:**
- ❌ `[FromQuery]` (ASP.NET Core)
- ✅ Just use parameter name - Web API 2 auto-binds query strings
- Example: `CleanupOldFiles(int daysToKeep = 7)` automatically reads from `?daysToKeep=7`

### **5. Body Parameters:**
- ❌ `[FromBody]` is optional in ASP.NET Core
- ✅ Web API 2 auto-binds complex types from body
- No attribute needed for `InitFileRequest` and `AppendRowsRequest`

### **6. File Operations:**
- ❌ `System.IO.File` (ambiguous in Core)
- ✅ `File` - Works fine in .NET Framework

### **7. Status Codes:**
- ✅ `Ok(object)` - 200 OK
- ✅ `Content(HttpStatusCode.NotFound, object)` - 404 Not Found
- ✅ `Content(HttpStatusCode.InternalServerError, object)` - 500 Error

---

## WebApiConfig.cs Setup

Make sure your `WebApiConfig.cs` has attribute routing enabled:

```csharp
using System.Web.Http;

public static class WebApiConfig
{
    public static void Register(HttpConfiguration config)
    {
        // Enable attribute routing
        config.MapHttpAttributeRoutes();

        // Default route (optional)
        config.Routes.MapHttpRoute(
            name: "DefaultApi",
            routeTemplate: "api/{controller}/{id}",
            defaults: new { id = RouteParameter.Optional }
        );
    }
}
```

---

## Testing

1. **Test directory creation**: Ensure `C:\ProgramData\Hamilton\HIS API\Data logs` is created
2. **Test file initialization**: POST to `/init` endpoint
3. **Test appending**: POST to `/append` endpoint multiple times
4. **Test listing**: GET `/list` - verify files appear
5. **Test reading**: GET `/read/{filename}` - verify content is correct
6. **Test deletion**: DELETE `/delete/{filename}`
7. **Test cleanup**: DELETE `/cleanup?daysToKeep=7`

---

## Security Considerations

1. **Path Traversal**: Sanitize filename inputs to prevent `../` attacks
2. **File Size Limits**: Consider max file size for reading (e.g., 100 MB)
3. **Rate Limiting**: Limit append requests if needed
4. **Authentication**: Add authentication if API is exposed externally

---

## Performance Notes

- **Large File Reading**: For files > 50 MB, consider:
  - Streaming response
  - Pagination
  - Reading last N rows only
  
- **Append Performance**: Current batching (10 rows per write) is reasonable

- **Row Counting**: Counting rows is expensive for large files. Consider caching or removing from `/list` endpoint.
