# FilmGallery NAS Server - Windows 部署脚本
# 用法: .\deploy.ps1 [start|stop|restart|status|logs|backup]

param(
    [Parameter(Position=0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs', 'backup', 'update', 'help')]
    [string]$Command = 'help'
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# 颜色输出函数
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# 检查依赖
function Test-Requirements {
    Write-Info "检查系统依赖..."
    
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker 未安装，请先安装 Docker Desktop"
        exit 1
    }
    
    if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Write-Error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    }
    
    Write-Success "系统依赖检查通过"
}

# 初始化配置
function Initialize-Config {
    Write-Info "初始化配置文件..."
    
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Success "已从 .env.example 创建 .env 文件"
            Write-Warning "请编辑 .env 文件以配置数据路径"
        } else {
            Write-Error ".env.example 文件不存在"
            exit 1
        }
    } else {
        Write-Info ".env 文件已存在，跳过创建"
    }
}

# 创建数据目录
function New-Directories {
    Write-Info "创建数据目录..."
    
    # 读取 .env 配置
    $env = @{}
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $env[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    
    $dataPath = if ($env.DATA_PATH) { $env.DATA_PATH } else { "./data" }
    $uploadsPath = if ($env.UPLOADS_PATH) { $env.UPLOADS_PATH } else { "./uploads" }
    
    New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
    New-Item -ItemType Directory -Force -Path "$uploadsPath/thumbnails" | Out-Null
    New-Item -ItemType Directory -Force -Path "$uploadsPath/processed" | Out-Null
    New-Item -ItemType Directory -Force -Path "$uploadsPath/raw" | Out-Null
    
    Write-Success "数据目录创建完成"
}

# 启动服务
function Start-Service {
    Write-Info "启动 FilmGallery NAS Server..."
    
    Test-Requirements
    Initialize-Config
    New-Directories
    
    docker-compose up -d
    
    Write-Success "服务启动成功"
    Write-Info "等待健康检查..."
    Start-Sleep -Seconds 5
    
    Get-Status
}

# 停止服务
function Stop-Service {
    Write-Info "停止 FilmGallery NAS Server..."
    
    docker-compose down
    
    Write-Success "服务已停止"
}

# 重启服务
function Restart-Service {
    Write-Info "重启 FilmGallery NAS Server..."
    
    Stop-Service
    Start-Sleep -Seconds 2
    Start-Service
}

# 查看状态
function Get-Status {
    Write-Info "FilmGallery 服务状态："
    Write-Host ""
    
    docker-compose ps
    
    Write-Host ""
    Write-Info "健康状态："
    
    $container = docker ps --filter "name=filmgallery-server" --format "{{.Status}}"
    if ($container -match "healthy") {
        Write-Success "服务运行正常 (healthy)"
    } elseif ($container -match "starting") {
        Write-Warning "服务正在启动 (starting)"
    } elseif ($container) {
        Write-Error "服务不健康 (unhealthy)"
    } else {
        Write-Error "服务未运行"
    }
    
    Write-Host ""
    Write-Info "访问地址："
    
    # 读取端口配置
    $env = @{}
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $env[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    $port = if ($env.PORT) { $env.PORT } else { "4000" }
    
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "以太网*" | Select-Object -First 1).IPAddress
    if (-not $localIP) {
        $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^169\.' -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1).IPAddress
    }
    
    Write-Host "  本地: http://localhost:$port/api/discover"
    if ($localIP) {
        Write-Host "  局域网: http://${localIP}:$port/api/discover"
    }
}

# 查看日志
function Show-Logs {
    Write-Info "查看服务日志 (Ctrl+C 退出)..."
    docker-compose logs -f --tail=100
}

# 备份数据
function Backup-Data {
    Write-Info "备份数据..."
    
    # 读取配置
    $env = @{}
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $env[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    
    $dataPath = if ($env.DATA_PATH) { $env.DATA_PATH } else { "./data" }
    $backupDir = "$dataPath/backups"
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    
    # 备份数据库
    $dbPath = "$dataPath/film.db"
    if (Test-Path $dbPath) {
        Copy-Item $dbPath "$backupDir/film.db.backup_$timestamp"
        Write-Success "数据库已备份到: $backupDir/film.db.backup_$timestamp"
    } else {
        Write-Warning "数据库文件不存在，跳过备份"
    }
    
    # 列出最近的备份
    Write-Host ""
    Write-Info "最近的备份文件："
    Get-ChildItem $backupDir | Sort-Object LastWriteTime -Descending | Select-Object -First 5 | Format-Table Name, Length, LastWriteTime
}

# 更新服务
function Update-Service {
    Write-Info "更新 FilmGallery..."
    
    docker-compose pull
    docker-compose up -d
    docker image prune -f
    
    Write-Success "更新完成"
}

# 显示帮助
function Show-Help {
    Write-Host "FilmGallery NAS Server - 部署管理脚本"
    Write-Host ""
    Write-Host "用法: .\deploy.ps1 [命令]"
    Write-Host ""
    Write-Host "命令:"
    Write-Host "  start       启动服务"
    Write-Host "  stop        停止服务"
    Write-Host "  restart     重启服务"
    Write-Host "  status      查看状态"
    Write-Host "  logs        查看日志"
    Write-Host "  backup      备份数据"
    Write-Host "  update      更新服务"
    Write-Host "  help        显示帮助"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "  .\deploy.ps1 start    # 启动服务"
    Write-Host "  .\deploy.ps1 logs     # 查看日志"
    Write-Host ""
}

# 主函数
switch ($Command) {
    'start'   { Start-Service }
    'stop'    { Stop-Service }
    'restart' { Restart-Service }
    'status'  { Get-Status }
    'logs'    { Show-Logs }
    'backup'  { Backup-Data }
    'update'  { Update-Service }
    'help'    { Show-Help }
    default   { Show-Help }
}
