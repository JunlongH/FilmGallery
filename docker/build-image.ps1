# FilmGallery - Docker Image Build Script (Windows)
# Build and publish Docker images to Docker Hub

param(
    [string]$Version = "latest",
    [switch]$Push = $false,
    [switch]$UseMirror = $false
)

$ErrorActionPreference = "Stop"

# Configuration
$ImageName = "filmgallery/server"

Write-Host "==========================================" -ForegroundColor Blue
Write-Host "  FilmGallery Docker Image Build" -ForegroundColor Blue
Write-Host "==========================================" -ForegroundColor Blue
Write-Host ""

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is not installed" -ForegroundColor Red
    exit 1
}

# Get version from package.json
if ($Version -eq "latest") {
    if (Test-Path "..\server\package.json") {
        $packageJson = Get-Content "..\server\package.json" | ConvertFrom-Json
        $pkgVersion = $packageJson.version
        Write-Host "Detected version: $pkgVersion" -ForegroundColor Yellow
        $response = Read-Host "Use this version? [Y/n]"
        if ([string]::IsNullOrEmpty($response) -or $response -match '^[Yy]$') {
            $Version = $pkgVersion
        }
    }
}

# Select Dockerfile
$dockerfilePath = "Dockerfile"
if ($UseMirror) {
    $dockerfilePath = "Dockerfile.cn"
    Write-Host "[INFO] Using China mirror Dockerfile" -ForegroundColor Yellow
}

Write-Host "[INFO] Image information:" -ForegroundColor Blue
Write-Host "  Name: $ImageName"
Write-Host "  Version: $Version"
Write-Host "  Dockerfile: $dockerfilePath"
Write-Host "  Push to Hub: $Push"
Write-Host ""

# Confirm build
$confirm = Read-Host "Confirm to start build? [Y/n]"
if (-not ([string]::IsNullOrEmpty($confirm) -or $confirm -match '^[Yy]$')) {
    Write-Host "Cancelled"
    exit 0
}

# Change to project root
Set-Location ..

# Build image using standard docker build (uses local cache)
Write-Host "[INFO] Building image..." -ForegroundColor Blue
Write-Host ""

docker build `
    --file "docker/$dockerfilePath" `
    --tag "${ImageName}:${Version}" `
    --tag "${ImageName}:latest" `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Image build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[OK] Build succeeded!" -ForegroundColor Green
Write-Host "  ${ImageName}:${Version}"
Write-Host "  ${ImageName}:latest"
Write-Host ""

# Push if requested
if ($Push) {
    Write-Host "[INFO] Login to Docker Hub..." -ForegroundColor Blue
    docker login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Docker Hub login failed" -ForegroundColor Red
        exit 1
    }

    Write-Host "[INFO] Pushing image..." -ForegroundColor Blue
    docker push "${ImageName}:${Version}"
    docker push "${ImageName}:latest"

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "==========================================" -ForegroundColor Green
        Write-Host "  Push succeeded!" -ForegroundColor Green
        Write-Host "==========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Users can pull with:"
        Write-Host "  docker pull ${ImageName}:${Version}"
    } else {
        Write-Host "[ERROR] Push failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "To push to Docker Hub, run:"
    Write-Host "  .\build-image.ps1 $Version -Push"
    Write-Host ""
    Write-Host "To save as tar file:"
    Write-Host "  docker save ${ImageName}:${Version} -o filmgallery-${Version}.tar"
}
