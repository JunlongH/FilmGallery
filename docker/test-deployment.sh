#!/bin/bash
# FilmGallery - 部署测试脚本
# 验证混合算力架构部署是否正常

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  FilmGallery 部署测试脚本${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "[$TOTAL_TESTS] $test_name ... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# 读取配置
if [ -f "docker/.env" ]; then
    source docker/.env
    PORT=${PORT:-4000}
else
    PORT=4000
fi

BASE_URL="http://localhost:$PORT"

echo -e "${YELLOW}目标服务器: $BASE_URL${NC}"
echo ""

# 1. 检查 Docker 环境
echo -e "${BLUE}[阶段 1] Docker 环境检查${NC}"
run_test "Docker 已安装" "command -v docker"
run_test "Docker Compose 已安装" "command -v docker-compose"
run_test "Docker 服务运行中" "docker info"
echo ""

# 2. 检查容器状态
echo -e "${BLUE}[阶段 2] 容器状态检查${NC}"
run_test "FilmGallery 容器存在" "docker ps --filter 'name=filmgallery-server' | grep -q filmgallery"
run_test "容器健康状态正常" "docker inspect --format='{{.State.Health.Status}}' filmgallery-server | grep -q healthy"
echo ""

# 3. API 端点测试
echo -e "${BLUE}[阶段 3] API 端点测试${NC}"
run_test "Health 端点响应" "curl -s -f $BASE_URL/api/health"
run_test "Discover 端点响应" "curl -s -f $BASE_URL/api/discover"
run_test "服务器模式为 NAS" "curl -s $BASE_URL/api/discover | grep -q '\"mode\":\"nas\"'"
run_test "数据库能力已启用" "curl -s $BASE_URL/api/discover | grep -q '\"database\":true'"
run_test "文件能力已启用" "curl -s $BASE_URL/api/discover | grep -q '\"files\":true'"
run_test "算力已禁用" "curl -s $BASE_URL/api/discover | grep -q '\"compute\":false'"
echo ""

# 4. 数据目录检查
echo -e "${BLUE}[阶段 4] 数据目录检查${NC}"
DATA_PATH=${DATA_PATH:-./docker/data}
UPLOADS_PATH=${UPLOADS_PATH:-./docker/uploads}

run_test "数据目录存在" "[ -d '$DATA_PATH' ]"
run_test "上传目录存在" "[ -d '$UPLOADS_PATH' ]"
run_test "数据目录可写" "[ -w '$DATA_PATH' ]"
run_test "上传目录可写" "[ -w '$UPLOADS_PATH' ]"
echo ""

# 5. 服务能力测试
echo -e "${BLUE}[阶段 5] 服务功能测试${NC}"

# 测试数据 API
run_test "Rolls API 可访问" "curl -s -f $BASE_URL/api/rolls"
run_test "Films API 可访问" "curl -s -f $BASE_URL/api/films"
run_test "Equipment API 可访问" "curl -s -f $BASE_URL/api/equipment"

# 测试算力 API（应该被拒绝）
if curl -s $BASE_URL/api/filmlab/preview 2>&1 | grep -q "503\|COMPUTE_REQUIRED"; then
    echo -e "[$((TOTAL_TESTS + 1))] FilmLab API 正确拒绝 ... ${GREEN}✓ PASS${NC}"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "[$((TOTAL_TESTS + 1))] FilmLab API 正确拒绝 ... ${RED}✗ FAIL${NC}"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
echo ""

# 6. 网络连通性测试
echo -e "${BLUE}[阶段 6] 网络连通性${NC}"

# 获取本地 IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [ -n "$LOCAL_IP" ]; then
    run_test "局域网可访问" "curl -s -f http://$LOCAL_IP:$PORT/api/health"
    echo -e "   ${YELLOW}局域网地址: http://$LOCAL_IP:$PORT${NC}"
else
    echo -e "   ${YELLOW}无法获取本地 IP，跳过局域网测试${NC}"
fi
echo ""

# 7. 性能测试
echo -e "${BLUE}[阶段 7] 性能测试${NC}"

# API 响应时间
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" $BASE_URL/api/health)
RESPONSE_MS=$(echo "$RESPONSE_TIME * 1000" | bc)
echo -e "   API 响应时间: ${RESPONSE_MS}ms"

if [ $(echo "$RESPONSE_TIME < 0.5" | bc) -eq 1 ]; then
    echo -e "   ${GREEN}✓ 响应时间良好${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "   ${YELLOW}⚠ 响应时间偏慢${NC}"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""

# 测试总结
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  测试结果总结${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "总测试数: $TOTAL_TESTS"
echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
echo -e "失败: ${RED}$FAILED_TESTS${NC}"
echo ""

# 计算成功率
SUCCESS_RATE=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
echo -e "成功率: $SUCCESS_RATE%"
echo ""

# 最终判断
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ 所有测试通过！部署成功！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "下一步："
    echo "  1. 配置桌面客户端连接到: $BASE_URL"
    echo "  2. 启用本地 FilmLab 处理"
    echo "  3. 配置移动端应用"
    echo ""
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  ✗ 部分测试失败，请检查配置${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "故障排查："
    echo "  1. 查看日志: cd docker && docker-compose logs"
    echo "  2. 检查容器: docker ps -a"
    echo "  3. 重启服务: cd docker && ./deploy.sh restart"
    echo ""
    exit 1
fi
