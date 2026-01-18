# FilmGallery - Windows 部署测试脚本
# 验证混合算力架构部署是否正常

$ErrorActionPreference = "Continue"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host "  FilmGallery 部署测试脚本" -ForegroundColor Blue
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host ""

# 测试结果统计
$script:TotalTests = 0
$script:PassedTests = 0
$script:FailedTests = 0

# 测试函数
function Test-Item {
    param(
        [string]$TestName,
        [scriptblock]$TestCommand
    )
    
    $script:TotalTests++
    Write-Host "[$script:TotalTests] $TestName ... " -NoNewline
    
    try {
        $result = & $TestCommand
        if ($result) {
            Write-Host "✓ PASS" -ForegroundColor Green
            $script:PassedTests++
            return $true
        } else {
            Write-Host "✗ FAIL" -ForegroundColor Red
            $script:FailedTests++
            return $false
        }
    } catch {
        Write-Host "✗ FAIL" -ForegroundColor Red
        $script:FailedTests++
        return $false
    }
}

# 读取配置
$Port = 4000
if (Test-Path "docker\.env") {
    Get-Content "docker\.env" | ForEach-Object {
        if ($_ -match '^PORT=(\d+)') {
            $Port = $matches[1]
        }
    }
}

$BaseUrl = "http://localhost:$Port"
Write-Host "目标服务器: $BaseUrl" -ForegroundColor Yellow
Write-Host ""

# 1. Docker 环境检查
Write-Host "[阶段 1] Docker 环境检查" -ForegroundColor Blue
Test-Item "Docker 已安装" { Get-Command docker -ErrorAction SilentlyContinue }
Test-Item "Docker Compose 已安装" { Get-Command docker-compose -ErrorAction SilentlyContinue }
Test-Item "Docker 服务运行中" { docker info 2>$null; $? }
Write-Host ""

# 2. 容器状态检查
Write-Host "[阶段 2] 容器状态检查" -ForegroundColor Blue
Test-Item "FilmGallery 容器存在" { 
    docker ps --filter "name=filmgallery-server" | Select-String "filmgallery"
}
Test-Item "容器健康状态正常" {
    $health = docker inspect --format='{{.State.Health.Status}}' filmgallery-server 2>$null
    $health -eq "healthy"
}
Write-Host ""

# 3. API 端点测试
Write-Host "[阶段 3] API 端点测试" -ForegroundColor Blue
Test-Item "Health 端点响应" {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 5
        $response.StatusCode -eq 200
    } catch { $false }
}

Test-Item "Discover 端点响应" {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/discover" -UseBasicParsing -TimeoutSec 5
        $response.StatusCode -eq 200
    } catch { $false }
}

Test-Item "服务器模式为 NAS" {
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/discover" -TimeoutSec 5
        $response.mode -eq "nas"
    } catch { $false }
}

Test-Item "数据库能力已启用" {
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/discover" -TimeoutSec 5
        $response.capabilities.database -eq $true
    } catch { $false }
}

Test-Item "文件能力已启用" {
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/discover" -TimeoutSec 5
        $response.capabilities.files -eq $true
    } catch { $false }
}

Test-Item "算力已禁用" {
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/discover" -TimeoutSec 5
        $response.capabilities.compute -eq $false
    } catch { $false }
}
Write-Host ""

# 4. 数据目录检查
Write-Host "[阶段 4] 数据目录检查" -ForegroundColor Blue
$DataPath = "docker\data"
$UploadsPath = "docker\uploads"

Test-Item "数据目录存在" { Test-Path $DataPath }
Test-Item "上传目录存在" { Test-Path $UploadsPath }
Test-Item "数据目录可写" { 
    try {
        $testFile = Join-Path $DataPath ".write-test"
        [System.IO.File]::WriteAllText($testFile, "test")
        Remove-Item $testFile -Force
        $true
    } catch { $false }
}
Test-Item "上传目录可写" {
    try {
        $testFile = Join-Path $UploadsPath ".write-test"
        [System.IO.File]::WriteAllText($testFile, "test")
        Remove-Item $testFile -Force
        $true
    } catch { $false }
}
Write-Host ""

# 5. 服务功能测试
Write-Host "[阶段 5] 服务功能测试" -ForegroundColor Blue
Test-Item "Rolls API 可访问" {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/rolls" -UseBasicParsing -TimeoutSec 5
        $response.StatusCode -eq 200
    } catch { $false }
}

Test-Item "Films API 可访问" {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/films" -UseBasicParsing -TimeoutSec 5
        $response.StatusCode -eq 200
    } catch { $false }
}

Test-Item "Equipment API 可访问" {
    try {
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/equipment" -UseBasicParsing -TimeoutSec 5
        $response.StatusCode -eq 200
    } catch { $false }
}

# 测试算力 API（应该被拒绝）
$script:TotalTests++
Write-Host "[$script:TotalTests] FilmLab API 正确拒绝 ... " -NoNewline
try {
    Invoke-WebRequest -Uri "$BaseUrl/api/filmlab/preview" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✗ FAIL" -ForegroundColor Red
    $script:FailedTests++
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 503) {
        Write-Host "✓ PASS" -ForegroundColor Green
        $script:PassedTests++
    } else {
        Write-Host "✗ FAIL" -ForegroundColor Red
        $script:FailedTests++
    }
}
Write-Host ""

# 6. 网络连通性测试
Write-Host "[阶段 6] 网络连通性" -ForegroundColor Blue
$LocalIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -notmatch '^169\.' -and $_.IPAddress -ne '127.0.0.1' 
} | Select-Object -First 1).IPAddress

if ($LocalIP) {
    Test-Item "局域网可访问" {
        try {
            $response = Invoke-WebRequest -Uri "http://${LocalIP}:$Port/api/health" -UseBasicParsing -TimeoutSec 5
            $response.StatusCode -eq 200
        } catch { $false }
    }
    Write-Host "   局域网地址: http://${LocalIP}:$Port" -ForegroundColor Yellow
} else {
    Write-Host "   无法获取本地 IP，跳过局域网测试" -ForegroundColor Yellow
}
Write-Host ""

# 7. 性能测试
Write-Host "[阶段 7] 性能测试" -ForegroundColor Blue
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
try {
    Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing | Out-Null
    $stopwatch.Stop()
    $responseTime = $stopwatch.ElapsedMilliseconds
    Write-Host "   API 响应时间: ${responseTime}ms"
    
    if ($responseTime -lt 500) {
        Write-Host "   ✓ 响应时间良好" -ForegroundColor Green
        $script:PassedTests++
    } else {
        Write-Host "   ⚠ 响应时间偏慢" -ForegroundColor Yellow
    }
    $script:TotalTests++
} catch {
    Write-Host "   ✗ 无法测量响应时间" -ForegroundColor Red
}
Write-Host ""

# 测试总结
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host "  测试结果总结" -ForegroundColor Blue
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host ""
Write-Host "总测试数: $TotalTests"
Write-Host "通过: $PassedTests" -ForegroundColor Green
Write-Host "失败: $FailedTests" -ForegroundColor Red
Write-Host ""

$SuccessRate = [math]::Round(($PassedTests / $TotalTests) * 100, 1)
Write-Host "成功率: $SuccessRate%"
Write-Host ""

# 最终判断
if ($FailedTests -eq 0) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host "  ✓ 所有测试通过！部署成功！" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步："
    Write-Host "  1. 配置桌面客户端连接到: $BaseUrl"
    Write-Host "  2. 启用本地 FilmLab 处理"
    Write-Host "  3. 配置移动端应用"
    Write-Host ""
    exit 0
} else {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host "  ✗ 部分测试失败，请检查配置" -ForegroundColor Red
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
    Write-Host ""
    Write-Host "故障排查："
    Write-Host "  1. 查看日志: cd docker; docker-compose logs"
    Write-Host "  2. 检查容器: docker ps -a"
    Write-Host "  3. 重启服务: cd docker; .\deploy.ps1 restart"
    Write-Host ""
    exit 1
}
