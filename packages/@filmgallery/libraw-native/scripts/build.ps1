<# 
    FilmGallery LibRaw Native Module Build Script (Windows)
    
    This script:
    1. Downloads LibRaw 0.22 source code
    2. Builds the native Node.js addon
    3. Runs tests
    
    Prerequisites:
    - Node.js 16+
    - Visual Studio Build Tools 2022 (with C++ workload)
    - Python 3.6+
#>

param(
    [switch]$SkipDownload,
    [switch]$Debug,
    [switch]$SkipTest
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ModuleDir = Split-Path -Parent $ScriptDir

Write-Host "=== Building @filmgallery/libraw-native ===" -ForegroundColor Cyan
Write-Host ""

# Change to module directory
Push-Location $ModuleDir

try {
    # Check Node.js
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
    
    # Check npm
    $npmVersion = npm --version
    Write-Host "npm version: $npmVersion" -ForegroundColor Green
    
    # Install dependencies
    Write-Host ""
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    
    # Download LibRaw source
    if (-not $SkipDownload) {
        Write-Host ""
        Write-Host "Downloading LibRaw source..." -ForegroundColor Yellow
        npm run download-libraw
    }
    
    # Check if LibRaw source exists
    $librawPath = Join-Path $ModuleDir "deps\libraw\libraw\libraw.h"
    if (-not (Test-Path $librawPath)) {
        Write-Host "Error: LibRaw source not found at $librawPath" -ForegroundColor Red
        Write-Host "Run: npm run download-libraw" -ForegroundColor Yellow
        exit 1
    }
    
    # Build
    Write-Host ""
    Write-Host "Building native module..." -ForegroundColor Yellow
    
    if ($Debug) {
        npm run build:debug
    } else {
        npm run build
    }
    
    # Test
    if (-not $SkipTest) {
        Write-Host ""
        Write-Host "Running tests..." -ForegroundColor Yellow
        npm test
    }
    
    Write-Host ""
    Write-Host "=== Build completed successfully! ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "The native module is ready to use." -ForegroundColor Cyan
    Write-Host "To use in FilmGallery server, update server/package.json:" -ForegroundColor Cyan
    Write-Host '  "@filmgallery/libraw-native": "file:../packages/@filmgallery/libraw-native"' -ForegroundColor White
    
} catch {
    Write-Host ""
    Write-Host "Build failed: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
