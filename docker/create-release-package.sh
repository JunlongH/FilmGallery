#!/bin/bash
# FilmGallery - 创建发布包脚本
# 生成用户下载的一键部署包

set -e

VERSION=${1:-$(date +%Y%m%d)}
RELEASE_DIR="filmgallery-deploy-${VERSION}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  创建 FilmGallery 发布包"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "版本: $VERSION"
echo "目标目录: $RELEASE_DIR"
echo ""

# 创建发布目录
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# 复制部署文件
echo "[1/4] 复制部署文件..."
cp release/docker-compose.yml "$RELEASE_DIR/"
cp release/.env.example "$RELEASE_DIR/"
cp release/README.md "$RELEASE_DIR/"

# 复制部署脚本（可选）
echo "[2/4] 复制部署脚本..."
cp deploy.sh "$RELEASE_DIR/"
cp deploy.ps1 "$RELEASE_DIR/"
chmod +x "$RELEASE_DIR/deploy.sh"

# 复制文档
echo "[3/4] 复制文档..."
mkdir -p "$RELEASE_DIR/docs"
cp ../QUICKSTART.md "$RELEASE_DIR/docs/"
cp ../DEPLOYMENT.md "$RELEASE_DIR/docs/"

# 创建压缩包
echo "[4/4] 创建压缩包..."
tar -czf "${RELEASE_DIR}.tar.gz" "$RELEASE_DIR"
zip -r "${RELEASE_DIR}.zip" "$RELEASE_DIR" > /dev/null

# 计算文件大小
TAR_SIZE=$(du -h "${RELEASE_DIR}.tar.gz" | cut -f1)
ZIP_SIZE=$(du -h "${RELEASE_DIR}.zip" | cut -f1)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ 发布包创建成功！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "生成的文件:"
echo "  ${RELEASE_DIR}.tar.gz (${TAR_SIZE})"
echo "  ${RELEASE_DIR}.zip (${ZIP_SIZE})"
echo ""
echo "用户使用方法:"
echo "  1. 下载并解压"
echo "  2. cd ${RELEASE_DIR}"
echo "  3. cp .env.example .env"
echo "  4. docker-compose up -d"
echo ""
