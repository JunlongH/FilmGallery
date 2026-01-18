# FilmGallery - Docker 镜像构建和发布脚本（Windows）
# 用于维护者构建并发布 Docker 镜像到 Docker Hub

param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

# 配置
$ImageName = "filmgallery/server"
$Platform = "linux/amd64,linux/arm64"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host "  FilmGallery Docker 镜像构建" -ForegroundColor Blue
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host ""

# 检查 Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker 未安装" -ForegroundColor Red
    exit 1
}

# 检查 buildx
try {
    docker buildx version | Out-Null
} catch {
    Write-Host "[ERROR] Docker buildx 未安装" -ForegroundColor Red
    Write-Host "请运行: docker buildx create --use"
    exit 1
}

# 获取版本信息
if ($Version -eq "latest") {
    if (Test-Path "..\server\package.json") {
        $packageJson = Get-Content "..\server\package.json" | ConvertFrom-Json
        $pkgVersion = $packageJson.version
        Write-Host "检测到版本: $pkgVersion" -ForegroundColor Yellow
        $response = Read-Host "是否使用此版本号？[Y/n]"
        if ([string]::IsNullOrEmpty($response) -or $response -match '^[Yy]$') {
            $Version = $pkgVersion
        }
    }
}

Write-Host "[INFO] 镜像信息:" -ForegroundColor Blue
Write-Host "  名称: $ImageName"
Write-Host "  版本: $Version"
Write-Host "  平台: $Platform"
Write-Host ""

# 确认构建
$confirm = Read-Host "确认开始构建？[Y/n]"
if (-not ([string]::IsNullOrEmpty($confirm) -or $confirm -match '^[Yy]$')) {
    Write-Host "已取消"
    exit 0
}

# 登录 Docker Hub
Write-Host "[INFO] 登录 Docker Hub..." -ForegroundColor Blue
docker login
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker Hub 登录失败" -ForegroundColor Red
    exit 1
}

# 创建 buildx builder（如果不存在）
$builders = docker buildx ls
if (-not ($builders -match "filmgallery-builder")) {
    Write-Host "[INFO] 创建 buildx builder..." -ForegroundColor Blue
    docker buildx create --name filmgallery-builder --use
}

# 构建并推送多平台镜像
Write-Host "[INFO] 构建并推送镜像..." -ForegroundColor Blue
Write-Host ""

Set-Location ..

docker buildx build `
    --platform $Platform `
    --file docker/Dockerfile `
    --tag "${ImageName}:${Version}" `
    --tag "${ImageName}:latest" `
    --push `
    .

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  ✓ 镜像构建并发布成功！" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "发布的镜像:"
    Write-Host "  ${ImageName}:${Version}"
    Write-Host "  ${ImageName}:latest"
    Write-Host ""
    Write-Host "用户可通过以下命令拉取:"
    Write-Host "  docker pull ${ImageName}:${Version}"
    Write-Host ""
} else {
    Write-Host "[ERROR] 镜像构建失败" -ForegroundColor Red
    exit 1
}
