# Restart-Services.ps1

Write-Host "Stopping services..." -ForegroundColor Yellow

# Find and stop any node processes running on port 3000 or 3001
$nodePids = Get-NetTCPConnection -LocalPort 3000,3001 -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess -Unique
if ($nodePids) {
    Write-Host "Stopping Node.js processes on ports 3000 and 3001..." -ForegroundColor Cyan
    $nodePids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

# Find and stop the HIS_API_NETFramework.exe process
$backendProcess = Get-Process -Name "HIS_API_NETFramework" -ErrorAction SilentlyContinue
if ($backendProcess) {
    Write-Host "Stopping backend service..." -ForegroundColor Cyan
    $backendProcess | Stop-Process -Force
}

# Give processes time to shut down
Start-Sleep -Seconds 2

Write-Host "Starting services..." -ForegroundColor Yellow

# Start the backend using the executable
$backendExe = "C:\Users\healy_n\Documents\GUI Projects\HIS\HIS Backend\HIS_API_NETFramework\bin\Debug\HIS_API_NETFramework.exe"
Write-Host "Starting backend service..." -ForegroundColor Cyan
Start-Process -FilePath $backendExe -WindowStyle Normal

# Give the backend time to start
Write-Host "Waiting for backend to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Start the React development environment (both dev server and React app)
$frontendPath = "c:\Users\healy_n\Documents\GUI Projects\HIS\HIS UI"
Write-Host "Starting React development environment..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev" -WindowStyle Normal

Write-Host "All services restarted!" -ForegroundColor Green
Write-Host "Backend API: http://localhost:5000" -ForegroundColor Cyan
Write-Host "React App: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Dev Server: http://localhost:3001" -ForegroundColor Cyan