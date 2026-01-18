# Verify Docker installation
Write-Host "Checking Docker installation..." -ForegroundColor Blue

if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "[OK] Docker is installed" -ForegroundColor Green
    docker --version
    docker info
} else {
    Write-Host "[ERROR] Docker not found. Please restart your computer after installation." -ForegroundColor Red
}
