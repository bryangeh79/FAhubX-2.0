#!/bin/bash

# VPN/IP集成模块部署脚本
# 使用方法: ./scripts/deploy-vpn-ip.sh [environment]

set -e

ENVIRONMENT=${1:-development}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 开始部署VPN/IP集成模块 (环境: $ENVIRONMENT)"
echo "=========================================="

# 加载环境变量
if [ -f "$PROJECT_ROOT/.env.$ENVIRONMENT" ]; then
    echo "📝 加载环境变量: .env.$ENVIRONMENT"
    source "$PROJECT_ROOT/.env.$ENVIRONMENT"
elif [ -f "$PROJECT_ROOT/.env" ]; then
    echo "📝 加载环境变量: .env"
    source "$PROJECT_ROOT/.env"
else
    echo "⚠️  警告: 未找到环境变量文件"
fi

# 检查依赖
echo "🔍 检查系统依赖..."
check_dependency() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ 缺少依赖: $1"
        exit 1
    fi
    echo "✅ $1 已安装"
}

check_dependency "node"
check_dependency "npm"
check_dependency "docker"
check_dependency "docker-compose"

# 安装Node.js依赖
echo "📦 安装Node.js依赖..."
cd "$PROJECT_ROOT"
npm ci --only=production

# 构建项目
echo "🔨 构建项目..."
npm run build

# 运行数据库迁移
echo "🗄️  运行数据库迁移..."
if [ "$ENVIRONMENT" = "production" ]; then
    npm run migration:run
else
    # 开发环境使用同步模式
    npm run schema:sync
fi

# 部署VPN配置文件
echo "🔧 部署VPN配置文件..."
VPN_CONFIG_DIR=${VPN_CONFIG_DIR:-"/etc/vpn/configs"}
sudo mkdir -p "$VPN_CONFIG_DIR"
sudo chmod 755 "$VPN_CONFIG_DIR"

# 创建示例VPN配置文件
if [ ! -f "$VPN_CONFIG_DIR/example.ovpn" ]; then
    echo "📄 创建示例OpenVPN配置文件..."
    sudo tee "$VPN_CONFIG_DIR/example.ovpn" > /dev/null << 'EOF'
client
dev tun
proto udp
remote vpn.example.com 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-CBC
auth SHA256
verb 3
EOF
    sudo chmod 600 "$VPN_CONFIG_DIR/example.ovpn"
fi

# 创建日志目录
echo "📝 创建日志目录..."
VPN_LOG_DIR=${VPN_LOG_DIR:-"/var/log/vpn"}
sudo mkdir -p "$VPN_LOG_DIR"
sudo chmod 755 "$VPN_LOG_DIR"

# 创建系统服务文件
echo "⚙️  创建系统服务..."
if [ "$ENVIRONMENT" = "production" ]; then
    SERVICE_FILE="/etc/systemd/system/facebook-auto-bot-vpn.service"
    
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Facebook Auto Bot VPN/IP Service
After=network.target postgresql.service redis.service
Requires=postgresql.service redis.service

[Service]
Type=simple
User=node
WorkingDirectory=$PROJECT_ROOT
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_ROOT/.env.production
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=facebook-auto-bot-vpn

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$VPN_CONFIG_DIR $VPN_LOG_DIR

[Install]
WantedBy=multi-user.target
EOF

    echo "🔧 重新加载systemd..."
    sudo systemctl daemon-reload
    echo "🚀 启动服务..."
    sudo systemctl enable facebook-auto-bot-vpn.service
    sudo systemctl start facebook-auto-bot-vpn.service
    sudo systemctl status facebook-auto-bot-vpn.service --no-pager
fi

# 创建Docker Compose文件（用于开发环境）
echo "🐳 创建Docker Compose配置..."
if [ "$ENVIRONMENT" = "development" ]; then
    DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker-compose.vpn.yml"
    
    cat > "$DOCKER_COMPOSE_FILE" << EOF
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: \${DB_NAME:-facebook_auto_bot}
      POSTGRES_USER: \${DB_USERNAME:-postgres}
      POSTGRES_PASSWORD: \${DB_PASSWORD:-postgres}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./src/database/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USERNAME:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  vpn-service:
    build:
      context: .
      dockerfile: Dockerfile.vpn
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: development
      DB_HOST: postgres
      DB_PORT: 5432
      REDIS_HOST: redis
      REDIS_PORT: 6379
    ports:
      - "3000:3000"
    volumes:
      - ./src:/app/src
      - ./dist:/app/dist
      - ./node_modules:/app/node_modules
      - vpn_configs:/etc/vpn/configs
      - vpn_logs:/var/log/vpn
    command: npm run start:dev

  vpn-monitor:
    build:
      context: .
      dockerfile: Dockerfile.vpn
    depends_on:
      - vpn-service
    environment:
      NODE_ENV: development
      DB_HOST: postgres
      DB_PORT: 5432
      REDIS_HOST: redis
      REDIS_PORT: 6379
    volumes:
      - vpn_configs:/etc/vpn/configs
      - vpn_logs:/var/log/vpn
    command: npm run monitor

volumes:
  postgres_data:
  redis_data:
  vpn_configs:
  vpn_logs:
EOF

    echo "✅ Docker Compose配置已创建: $DOCKER_COMPOSE_FILE"
    echo "📋 使用以下命令启动开发环境:"
    echo "   docker-compose -f $DOCKER_COMPOSE_FILE up -d"
fi

# 创建健康检查脚本
echo "🏥 创建健康检查脚本..."
HEALTH_CHECK_SCRIPT="$PROJECT_ROOT/scripts/check-vpn-health.sh"

cat > "$HEALTH_CHECK_SCRIPT" << 'EOF'
#!/bin/bash

# VPN/IP集成健康检查脚本

set -e

API_URL=${API_URL:-"http://localhost:3000"}
HEALTH_ENDPOINT="$API_URL/vpn-ip/network/monitor/metrics?timeRange=1h"

echo "🔍 检查VPN/IP集成健康状态..."
echo "API端点: $HEALTH_ENDPOINT"

# 检查API响应
response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT" || echo "000")

if [ "$response" = "200" ]; then
    echo "✅ API服务正常 (HTTP $response)"
    
    # 获取详细健康信息
    health_data=$(curl -s "$HEALTH_ENDPOINT")
    
    # 解析JSON响应
    total_alerts=$(echo "$health_data" | grep -o '"totalAlerts":[0-9]*' | cut -d: -f2)
    critical_alerts=$(echo "$health_data" | grep -o '"criticalAlerts":[0-9]*' | cut -d: -f2)
    
    if [ "$critical_alerts" -gt 0 ]; then
        echo "⚠️  发现 $critical_alerts 个严重告警"
        exit 1
    elif [ "$total_alerts" -gt 0 ]; then
        echo "⚠️  发现 $total_alerts 个告警"
        exit 0
    else
        echo "✅ 系统健康，无告警"
        exit 0
    fi
else
    echo "❌ API服务异常 (HTTP $response)"
    exit 1
fi
EOF

chmod +x "$HEALTH_CHECK_SCRIPT"
echo "✅ 健康检查脚本已创建: $HEALTH_CHECK_SCRIPT"

# 创建备份脚本
echo "💾 创建备份脚本..."
BACKUP_SCRIPT="$PROJECT_ROOT/scripts/backup-vpn-data.sh"

cat > "$BACKUP_SCRIPT" << 'EOF'
#!/bin/bash

# VPN/IP数据备份脚本

set -e

BACKUP_DIR=${BACKUP_DIR:-"/var/backups/facebook-auto-bot"}
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/vpn_ip_backup_$DATE.tar.gz"

echo "📦 开始备份VPN/IP数据..."
echo "备份文件: $BACKUP_FILE"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份数据库
echo "🗄️  备份数据库..."
PGPASSWORD=${DB_PASSWORD:-postgres} pg_dump \
  -h ${DB_HOST:-localhost} \
  -p ${DB_PORT:-5432} \
  -U ${DB_USERNAME:-postgres} \
  -d ${DB_NAME:-facebook_auto_bot} \
  -F c \
  -f "/tmp/vpn_ip_db_$DATE.dump"

# 备份配置文件
echo "🔧 备份配置文件..."
tar -czf "$BACKUP_FILE" \
  -C / \
  etc/vpn/configs \
  var/log/vpn \
  "/tmp/vpn_ip_db_$DATE.dump"

# 清理临时文件
rm -f "/tmp/vpn_ip_db_$DATE.dump"

# 保留最近7天的备份
echo "🧹 清理旧备份..."
find "$BACKUP_DIR" -name "vpn_ip_backup_*.tar.gz" -mtime +7 -delete

echo "✅ 备份完成: $BACKUP_FILE"
echo "📊 备份大小: $(du -h "$BACKUP_FILE" | cut -f1)"
EOF

chmod +x "$BACKUP_SCRIPT"
echo "✅ 备份脚本已创建: $BACKUP_SCRIPT"

# 创建监控仪表板配置
echo "📊 创建监控仪表板配置..."
GRAFANA_DASHBOARD="$PROJECT_ROOT/scripts/grafana-dashboard.json"

cat > "$GRAFANA_DASHBOARD" << 'EOF'
{
  "dashboard": {
    "title": "VPN/IP集成监控",
    "tags": ["vpn", "network", "monitoring"],
    "timezone": "browser",
    "panels": [
      {
        "title": "VPN配置健康状态",
        "type": "stat",
        "targets": [
          {
            "expr": "avg(vpn_config_health_score)",
            "legendFormat": "平均健康分数"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                {"color": "red", "value": 0},
                {"color": "yellow", "value": 50},
                {"color": "green", "value": 70}
              ]
            }
          }
        }
      },
      {
        "title": "IP地址池状态",
        "type": "piechart",
        "targets": [
          {
            "expr": "count(ip_pool_status{status=\"available\"})",
            "legendFormat": "可用"
          },
          {
            "expr": "count(ip_pool_status{status=\"assigned\"})",
            "legendFormat": "已分配"
          },
          {
            "expr": "count(ip_pool_status{status=\"blocked\"})",
            "legendFormat": "已阻止"
          }
        ]
      },
      {
        "title": "网络延迟趋势",
        "type": "timeseries",
        "targets": [
          {
            "expr": "avg(network_latency_ms)",
            "legendFormat": "平均延迟"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "ms"
          }
        }
      },
      {
        "title": "告警统计",
        "type": "bargauge",
        "targets": [
          {
            "expr": "count(network_alerts{level=\"critical\"})",
            "legendFormat": "严重"
          },
          {
            "expr": "count(network_alerts{level=\"warning\"})",
            "legendFormat": "警告"
          },
          {
            "expr": "count(network_alerts{level=\"info\"})",
            "legendFormat": "信息"
          }
        ]
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    }
  }
}
EOF

echo "✅ 监控仪表板配置已创建: $GRAFANA_DASHBOARD"

echo ""
echo "🎉 VPN/IP集成模块部署完成!"
echo "=========================================="
echo "📋 下一步操作:"
echo ""
if [ "$ENVIRONMENT" = "production" ]; then
    echo "1. 检查服务状态: sudo systemctl status facebook-auto-bot-vpn"
    echo "2. 查看服务日志: sudo journalctl -u facebook-auto-bot-vpn -f"
else
    echo "1. 启动开发环境: docker-compose -f docker-compose.vpn.yml up -d"
    echo "2. 运行健康检查: ./scripts/check-vpn-health.sh"
fi
echo "3. 访问API文档: http://localhost:3000/api/docs"
echo "4. 运行备份: ./scripts/backup-vpn-data.sh"
echo ""
echo "🔧 配置说明:"
echo "   - VPN配置文件目录: $VPN_CONFIG_DIR"
echo "   - VPN日志目录: $VPN_LOG_DIR"
echo "   - 数据库: ${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-facebook_auto_bot}"
echo "   - Redis: ${REDIS_HOST:-localhost}:${REDIS_PORT:-6379}"
echo ""
echo "⚠️  安全提醒:"
echo "   - 确保VPN配置文件权限设置为600"
echo "   - 定期更新数据库密码和JWT密钥"
echo "   - 启用防火墙限制访问端口"
echo "   - 定期检查并应用安全更新"