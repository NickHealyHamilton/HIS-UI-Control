@echo off
echo Installing Hamilton Incubator Service...

REM Navigate to build output
cd C:\Users\healy_n\Documents\GUI Projects\HIS\HIS Backend\HIS_API_NETFramework\bin\Debug

REM Stop and uninstall if already exists
sc query HamiltonIncubatorService >nul 2>&1
if %errorlevel% equ 0 (
    echo Service already exists. Stopping and uninstalling...
    net stop HamiltonIncubatorService
    sc delete HamiltonIncubatorService
    timeout /t 2
)

REM Install the service using InstallUtil
echo Installing service...
"%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\InstallUtil.exe" /LogToConsole=true HIS_API_NETFramework.exe

if %errorlevel% equ 0 (
    echo Service installed successfully.
    
    REM Configure firewall rule
    echo Adding firewall rule...
    netsh advfirewall firewall add rule name="Hamilton Incubator API" dir=in action=allow protocol=TCP localport=5000
    
    echo Starting service...
    net start HamiltonIncubatorService
    
    echo.
    echo Service is running!
    echo Swagger UI: http://localhost:5000/swagger
    echo API Base: http://localhost:5000/api/incubator
) else (
    echo Installation failed. Make sure to run as Administrator.
)

pause