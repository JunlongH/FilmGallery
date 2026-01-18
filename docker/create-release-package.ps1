# FilmGallery - 创建发布包脚本（Windows）
# 生成用户下载的一键部署包

param(
    [string]$Version = (Get-Date -Format "yyyyMMdd")
)

$ReleaseDir = "filmgallery-deploy-$Version"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host "  创建 FilmGallery 发布包" -ForegroundColor Blue
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
Write-Host ""
Write-Host "版本: $Version"
Write-Host "目标目录: $ReleaseDir"
Write-Host ""

# 创建发布目录
if (Test-Path $ReleaseDir) {
    Remove-Item $ReleaseDir -Recurse -Force
}
New-Item -ItemType Directory -Path $ReleaseDir | Out-Null

# 复制部署文件
Write-Host "[1/4] 复制部署文件..."
Copy-Item "release\docker-compose.yml" "$ReleaseDir\"
Copy-Item "release\.env.example" "$ReleaseDir\"
Copy-Item "release\README.md" "$ReleaseDir\"

# 复制部署脚本（可选）
Write-Host "[2/4] 复制部署脚本..."
Copy-Item "deploy.sh" "$ReleaseDir\"
Copy-Item "deploy.ps1" "$ReleaseDir\"

# 复制文档
Write-Host "[3/4] 复制文档..."
New-Item -ItemType Directory -Path "$ReleaseDir\docs" | Out-Null
Copy-Item "..\QUICKSTART.md" "$ReleaseDir\docs\"
Copy-Item "..\DEPLOYMENT.md" "$ReleaseDir\docs\"

# 创建压缩包
Write-Host "[4/4] 创建压缩包..."
Compress-Archive -Path $ReleaseDir -DestinationPath "${ReleaseDir}.zip" -Force

# 计算文件大小
$zipSize = (Get-Item "${ReleaseDir}.zip").Length / 1KB

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✓ 发布包创建成功！" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "生成的文件:"
Write-Host "  ${ReleaseDir}.zip ($([math]::Round($zipSize, 2)) KB)"
Write-Host ""
Write-Host "用户使用方法:"
Write-Host "  1. 下载并解压"
Write-Host "  2. cd $ReleaseDir"
Write-Host "  3. cp .env.example .env"
Write-Host "  4. docker-compose up -d"
Write-Host ""
