#!/bin/bash
# FilmGallery NAS Server - 一键部署脚本
# 用法: ./deploy.sh [start|stop|restart|status|logs|backup]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_requirements() {
    log_info "检查系统依赖..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    log_success "系统依赖检查通过"
}

# 初始化配置
init_config() {
    log_info "初始化配置文件..."
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success "已从 .env.example 创建 .env 文件"
            log_warning "请编辑 .env 文件以配置数据路径"
        else
            log_error ".env.example 文件不存在"
            exit 1
        fi
    else
        log_info ".env 文件已存在，跳过创建"
    fi
}

# 创建数据目录
create_directories() {
    log_info "创建数据目录..."
    
    # 从 .env 读取路径
    source .env
    
    mkdir -p "${DATA_PATH:-./data}"
    mkdir -p "${UPLOADS_PATH:-./uploads}"
    mkdir -p "${UPLOADS_PATH:-./uploads}/thumbnails"
    mkdir -p "${UPLOADS_PATH:-./uploads}/processed"
    mkdir -p "${UPLOADS_PATH:-./uploads}/raw"
    
    log_success "数据目录创建完成"
}

# 启动服务
start_service() {
    log_info "启动 FilmGallery NAS Server..."
    
    check_requirements
    init_config
    create_directories
    
    docker-compose up -d
    
    log_success "服务启动成功"
    log_info "等待健康检查..."
    sleep 5
    
    status_service
}

# 停止服务
stop_service() {
    log_info "停止 FilmGallery NAS Server..."
    
    docker-compose down
    
    log_success "服务已停止"
}

# 重启服务
restart_service() {
    log_info "重启 FilmGallery NAS Server..."
    
    stop_service
    sleep 2
    start_service
}

# 查看状态
status_service() {
    log_info "FilmGallery 服务状态："
    echo ""
    
    docker-compose ps
    
    echo ""
    log_info "健康状态："
    
    if docker ps --filter "name=filmgallery-server" --filter "health=healthy" | grep -q filmgallery; then
        log_success "服务运行正常 (healthy)"
    elif docker ps --filter "name=filmgallery-server" --filter "health=starting" | grep -q filmgallery; then
        log_warning "服务正在启动 (starting)"
    elif docker ps --filter "name=filmgallery-server" | grep -q filmgallery; then
        log_error "服务不健康 (unhealthy)"
    else
        log_error "服务未运行"
    fi
    
    echo ""
    log_info "访问地址："
    source .env
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    echo "  本地: http://localhost:${PORT:-4000}/api/discover"
    echo "  局域网: http://${LOCAL_IP}:${PORT:-4000}/api/discover"
}

# 查看日志
view_logs() {
    log_info "查看服务日志 (Ctrl+C 退出)..."
    docker-compose logs -f --tail=100
}

# 备份数据
backup_data() {
    log_info "备份数据..."
    
    source .env
    BACKUP_DIR="${DATA_PATH:-./data}/backups"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    mkdir -p "$BACKUP_DIR"
    
    # 备份数据库
    if [ -f "${DATA_PATH:-./data}/film.db" ]; then
        cp "${DATA_PATH:-./data}/film.db" "$BACKUP_DIR/film.db.backup_$TIMESTAMP"
        log_success "数据库已备份到: $BACKUP_DIR/film.db.backup_$TIMESTAMP"
    else
        log_warning "数据库文件不存在，跳过备份"
    fi
    
    # 列出最近的备份
    echo ""
    log_info "最近的备份文件："
    ls -lh "$BACKUP_DIR" | tail -5
}

# 更新服务
update_service() {
    log_info "更新 FilmGallery..."
    
    docker-compose pull
    docker-compose up -d
    docker image prune -f
    
    log_success "更新完成"
}

# 显示帮助
show_help() {
    echo "FilmGallery NAS Server - 部署管理脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  start       启动服务"
    echo "  stop        停止服务"
    echo "  restart     重启服务"
    echo "  status      查看状态"
    echo "  logs        查看日志"
    echo "  backup      备份数据"
    echo "  update      更新服务"
    echo "  help        显示帮助"
    echo ""
    echo "示例:"
    echo "  $0 start    # 启动服务"
    echo "  $0 logs     # 查看日志"
    echo ""
}

# 主函数
main() {
    case "${1:-}" in
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            status_service
            ;;
        logs)
            view_logs
            ;;
        backup)
            backup_data
            ;;
        update)
            update_service
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            if [ -z "${1:-}" ]; then
                show_help
            else
                log_error "未知命令: $1"
                echo ""
                show_help
                exit 1
            fi
            ;;
    esac
}

main "$@"
