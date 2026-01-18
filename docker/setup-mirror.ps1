# FilmGallery - Docker Mirror Configuration Script
# Automatically configure Docker to use China mirrors

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Blue
Write-Host "  Docker Mirror Configuration" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# Docker Desktop daemon.json path
$daemonJsonPath = "$env:USERPROFILE\.docker\daemon.json"
$dockerDesktopPath = "$env:APPDATA\Docker\settings.json"

# Mirror list (tested and working)
$mirrors = @(
    "https://docker.1panel.live",
    "https://docker.rainbond.cc",
    "https://docker.m.daocloud.io",
    "https://registry.cn-hangzhou.aliyuncs.com"
)

Write-Host "[INFO] Configuring Docker mirrors..." -ForegroundColor Blue
Write-Host ""
Write-Host "Mirrors to be configured:"
foreach ($mirror in $mirrors) {
    Write-Host "  - $mirror"
}
Write-Host ""

# Create .docker directory if not exists
$dockerDir = "$env:USERPROFILE\.docker"
if (-not (Test-Path $dockerDir)) {
    New-Item -ItemType Directory -Path $dockerDir -Force | Out-Null
    Write-Host "[OK] Created directory: $dockerDir" -ForegroundColor Green
}

# Read existing config or create new one
$config = @{}
if (Test-Path $daemonJsonPath) {
    try {
        $config = Get-Content $daemonJsonPath | ConvertFrom-Json -AsHashtable
        Write-Host "[INFO] Found existing config" -ForegroundColor Yellow
    } catch {
        Write-Host "[WARN] Could not parse existing config, creating new one" -ForegroundColor Yellow
        $config = @{}
    }
}

# Add registry mirrors
$config["registry-mirrors"] = $mirrors

# Save config
$config | ConvertTo-Json -Depth 5 | Set-Content $daemonJsonPath -Encoding UTF8
Write-Host "[OK] Config saved to: $daemonJsonPath" -ForegroundColor Green

# Show the config
Write-Host ""
Write-Host "Current configuration:" -ForegroundColor Blue
Get-Content $daemonJsonPath

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Configuration Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Restart Docker Desktop"
Write-Host "  2. Wait for Docker to be ready (icon turns green)"
Write-Host "  3. Run: .\build-image.ps1 -UseMirror"
Write-Host ""
Write-Host "Or use China mirror Dockerfile directly:"
Write-Host "  .\build-image.ps1 1.9.1 -UseMirror"
Write-Host ""

# Ask to restart Docker
$restart = Read-Host "Restart Docker Desktop now? [Y/n]"
if ([string]::IsNullOrEmpty($restart) -or $restart -match '^[Yy]$') {
    Write-Host "[INFO] Restarting Docker Desktop..." -ForegroundColor Blue
    
    # Stop Docker Desktop
    Get-Process "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 3
    
    # Start Docker Desktop
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
        Write-Host "[OK] Docker Desktop is starting..." -ForegroundColor Green
        Write-Host "Please wait about 30 seconds for it to be ready."
    } else {
        Write-Host "[WARN] Could not find Docker Desktop, please start it manually" -ForegroundColor Yellow
    }
}
