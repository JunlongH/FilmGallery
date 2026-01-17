# Visual Studio Build Tools 自动安装脚本
# 此脚本需要管理员权限

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Visual Studio Build Tools 安装脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "错误: 此脚本需要管理员权限!" -ForegroundColor Red
    Write-Host "请右键点击 PowerShell 并选择 '以管理员身份运行'，然后重新执行此脚本" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "或者直接右键此文件，选择 '使用 PowerShell 运行'" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "✓ 检测到管理员权限" -ForegroundColor Green
Write-Host ""

# 方法 1: 尝试使用 winget (Windows 11 / Windows 10 自带)
Write-Host "方法 1: 尝试使用 winget..." -ForegroundColor Yellow
$wingetExists = Get-Command winget -ErrorAction SilentlyContinue

if ($wingetExists) {
    Write-Host "✓ 检测到 winget，正在安装 Visual Studio Build Tools..." -ForegroundColor Green
    winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Visual Studio Build Tools 安装成功!" -ForegroundColor Green
        Write-Host ""
        Write-Host "请关闭所有 PowerShell/CMD 窗口，重新打开后运行:" -ForegroundColor Yellow
        Write-Host "cd 'd:\Program Files\FilmGalery\server'" -ForegroundColor Cyan
        Write-Host "npm install" -ForegroundColor Cyan
        pause
        exit 0
    }
}

# 方法 2: 下载并安装
Write-Host ""
Write-Host "方法 2: 下载 Visual Studio Build Tools 安装程序..." -ForegroundColor Yellow

$installerPath = "$env:TEMP\vs_buildtools.exe"
$downloadUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"

Write-Host "正在下载到: $installerPath" -ForegroundColor Cyan
try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "✓ 下载完成" -ForegroundColor Green
} catch {
    Write-Host "✗ 下载失败: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "请手动下载并安装:" -ForegroundColor Yellow
    Write-Host "1. 访问: $downloadUrl" -ForegroundColor Cyan
    Write-Host "2. 运行安装程序" -ForegroundColor Cyan
    Write-Host "3. 选择 'Desktop development with C++' 工作负载" -ForegroundColor Cyan
    pause
    exit 1
}

Write-Host ""
Write-Host "正在安装 Visual Studio Build Tools (这可能需要几分钟)..." -ForegroundColor Yellow
Write-Host "请耐心等待，不要关闭此窗口..." -ForegroundColor Yellow

# 安装参数说明:
# --quiet: 静默安装
# --wait: 等待安装完成
# --add Microsoft.VisualStudio.Workload.VCTools: 安装 C++ 工具链
# --includeRecommended: 包含推荐组件

$installArgs = @(
    "--quiet",
    "--wait",
    "--add", "Microsoft.VisualStudio.Workload.VCTools",
    "--includeRecommended"
)

try {
    $process = Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -PassThru -NoNewWindow
    
    if ($process.ExitCode -eq 0 -or $process.ExitCode -eq 3010) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "✓ 安装完成!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "下一步:" -ForegroundColor Yellow
        Write-Host "1. 关闭所有 PowerShell/CMD 窗口" -ForegroundColor Cyan
        Write-Host "2. 重新打开 PowerShell" -ForegroundColor Cyan
        Write-Host "3. 运行以下命令:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "   cd 'd:\Program Files\FilmGalery\server'" -ForegroundColor White
        Write-Host "   npm install" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "警告: 安装程序返回代码 $($process.ExitCode)" -ForegroundColor Yellow
        Write-Host "这可能表示需要重启，或者已经安装了某些组件" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ 安装失败: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "请手动运行安装程序: $installerPath" -ForegroundColor Yellow
    Write-Host "并选择 'Desktop development with C++' 工作负载" -ForegroundColor Yellow
}

Write-Host ""
pause
