# Kill process occupying port 4000
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "FilmGallery - Kill Port 4000 Process" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Find process using port 4000
Write-Host "[1/2] Finding process on port 4000..." -ForegroundColor Yellow
$tcpConnection = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue

if ($tcpConnection) {
    $processId = $tcpConnection.OwningProcess
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    
    if ($process) {
        Write-Host "Found process:" -ForegroundColor Green
        Write-Host "  PID:  $processId"
        Write-Host "  Name: $($process.ProcessName)"
        Write-Host "  Path: $($process.Path)"
        Write-Host ""
        
        Write-Host "[2/2] Stopping process..." -ForegroundColor Yellow
        try {
            Stop-Process -Id $processId -Force
            Start-Sleep -Seconds 1
            
            # Verify
            $stillRunning = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if (-not $stillRunning) {
                Write-Host "✓ Process stopped successfully!" -ForegroundColor Green
            } else {
                Write-Host "✗ Process still running. Trying harder..." -ForegroundColor Red
                taskkill /F /PID $processId
            }
        } catch {
            Write-Host "✗ Failed to stop process: $_" -ForegroundColor Red
            Write-Host ""
            Write-Host "Try manually:" -ForegroundColor Yellow
            Write-Host "  taskkill /F /PID $processId"
        }
    } else {
        Write-Host "✗ Could not get process information for PID $processId" -ForegroundColor Red
    }
} else {
    Write-Host "✓ Port 4000 is not in use" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done." -ForegroundColor Cyan
Write-Host ""
pause
