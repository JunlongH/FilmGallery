#!/bin/bash
# FilmGallery - Docker 镜像构建和发布脚本
# 用于维护者构建并发布 Docker 镜像到 Docker Hub

set -e

# 配置
IMAGE_NAME="filmgallery/server"
VERSION=${1:-"latest"}
PLATFORM="linux/amd64,linux/arm64"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  FilmGallery Docker 镜像构建${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[ERROR] Docker 未安装${NC}"
    exit 1
fi

# 检查 buildx
if ! docker buildx version &> /dev/null; then
    echo -e "${RED}[ERROR] Docker buildx 未安装${NC}"
    echo "请运行: docker buildx create --use"
    exit 1
fi

# 获取版本信息
if [ "$VERSION" = "latest" ]; then
    # 从 package.json 读取版本
    if [ -f "../server/package.json" ]; then
        PKG_VERSION=$(grep -o '"version": *"[^"]*"' ../server/package.json | grep -o '[0-9.]*')
        echo -e "${YELLOW}检测到版本: $PKG_VERSION${NC}"
        read -p "是否使用此版本号？[Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            VERSION=$PKG_VERSION
        fi
    fi
fi

echo -e "${BLUE}[INFO] 镜像信息:${NC}"
echo "  名称: $IMAGE_NAME"
echo "  版本: $VERSION"
echo "  平台: $PLATFORM"
echo ""

# 确认构建
read -p "确认开始构建？[Y/n] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]] && [[ ! -z $REPLY ]]; then
    echo "已取消"
    exit 0
fi

# 登录 Docker Hub
echo -e "${BLUE}[INFO] 登录 Docker Hub...${NC}"
if ! docker login; then
    echo -e "${RED}[ERROR] Docker Hub 登录失败${NC}"
    exit 1
fi

# 创建 buildx builder（如果不存在）
if ! docker buildx ls | grep -q filmgallery-builder; then
    echo -e "${BLUE}[INFO] 创建 buildx builder...${NC}"
    docker buildx create --name filmgallery-builder --use
fi

# 构建并推送多平台镜像
echo -e "${BLUE}[INFO] 构建并推送镜像...${NC}"
echo ""

cd ..

docker buildx build \
    --platform $PLATFORM \
    --file docker/Dockerfile \
    --tag ${IMAGE_NAME}:${VERSION} \
    --tag ${IMAGE_NAME}:latest \
    --push \
    .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ 镜像构建并发布成功！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "发布的镜像:"
    echo "  ${IMAGE_NAME}:${VERSION}"
    echo "  ${IMAGE_NAME}:latest"
    echo ""
    echo "用户可通过以下命令拉取:"
    echo "  docker pull ${IMAGE_NAME}:${VERSION}"
    echo ""
else
    echo -e "${RED}[ERROR] 镜像构建失败${NC}"
    exit 1
fi
