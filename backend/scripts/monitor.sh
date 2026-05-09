#!/bin/bash

# VPN/IP集成监控脚本

set -e

# 加载环境变量
if [ -f "/app/.env" ]; then
    source "/app/.env"
fi

# 默认配置
MONITOR_INTERVAL=${NETWORK_MONITOR_INTERVAL:-300000}
LOG_DIR=${VPN_LOG_DIR:-"/var/log/vpn"}
API_URL="http://localhost:3000"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/monitor.log"
}

# 错误处理函数
error_exit() {
    log "❌ 错误: $1"
    exit 1
}

# 检查服务健康
check_service_health() {
    local endpoint="$API_URL/health"
    local response
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" || echo "000")
    
    if [ "$response" = "200" ]; then
        log "✅ 服务健康检查通过 (HTTP $response)"
        return 0
    else
        log "⚠️  服务健康检查失败 (HTTP $response)"
        return 1
    fi
}

# 检查VPN配置健康
check_vpn_health() {
    local endpoint="$API_URL/vpn-ip/network/monitor/metrics?timeRange=1h"
    local response
    
    response=$(curl -s "$endpoint" || echo "{}")
    
    # 解析响应
    local total_alerts=$(echo "$response" | grep -o '"totalAlerts":[0-9]*' | cut -d: -f2)
    local critical_alerts=$(echo "$response" | grep -o '"criticalAlerts":[0-9]*' | cut -d: -f2)
    
    if [ -n "$critical_alerts" ] && [ "$critical_alerts" -gt 0 ]; then
        log "🚨 发现 $critical_alerts 个严重告警"
        return 1
    elif [ -n "$total_alerts" ] && [ "$total_alerts" -gt 0 ]; then
        log "⚠️  发现 $total_alerts 个告警"
        return 0
    else
        log "✅ VPN配置健康检查通过"
        return 0
    fi
}

# 检查IP地址池状态
check_ip_pool_status() {
    local endpoint="$API_URL/vpn-ip/ip-pools"
    local response
    
    response=$(curl -s "$endpoint" || echo "[]")
    
    # 计算统计信息
    local total_ips=$(echo "$response" | grep -o '"ipAddress"' | wc -l)
    local available_ips=$(echo "$response" | grep -o '"status":"available"' | wc -l)
    
    if [ "$total_ips" -eq 0 ]; then
        log "⚠️  IP地址池为空"
        return 1
    fi
    
    local available_ratio=$((available_ips * 100 / total_ips))
    
    log "📊 IP地址池状态: 总数=$total_ips, 可用=$available_ips ($available_ratio%)"
    
    if [ "$available_ratio" -lt 20 ]; then
        log "⚠️  可用IP比例过低"
        return 1
    fi
    
    return 0
}

# 检查网络连接
check_network_connectivity() {
    # 测试到Google DNS的连接
    if ping -c 3 -W 2 8.8.8.8 > /dev/null 2>&1; then
        log "✅ 网络连接正常"
        return 0
    else
        log "❌ 网络连接失败"
        return 1
    fi
}

# 检查系统资源
check_system_resources() {
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local mem_usage=$(free | grep Mem | awk '{print $3/$2 * 100.0}')
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    
    log "💻 系统资源: CPU=${cpu_usage}%, 内存=${mem_usage}%, 磁盘=${disk_usage}%"
    
    # 检查阈值
    local warnings=0
    
    if [ "$(echo "$cpu_usage > 80" | bc)" -eq 1 ]; then
        log "⚠️  CPU使用率过高"
        warnings=$((warnings + 1))
    fi
    
    if [ "$(echo "$mem_usage > 80" | bc)" -eq 1 ]; then
        log "⚠️  内存使用率过高"
        warnings=$((warnings + 1))
    fi
    
    if [ "$disk_usage" -gt 80 ]; then
        log "⚠️  磁盘使用率过高"
        warnings=$((warnings + 1))
    fi
    
    return $warnings
}

# 执行自动化规则检查
run_automation_checks() {
    local endpoint="$API_URL/vpn-ip/network/auto-connect"
    local test_account="monitor-test-$(date +%s)"
    
    log "🤖 执行自动化规则检查..."
    
    # 测试自动连接功能
    local response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "$endpoint?accountId=$test_account&taskType=login" || echo "000")
    
    if [ "$response" = "201" ]; then
        log "✅ 自动化规则检查通过"
        
        # 清理测试账号
        curl -s -o /dev/null -X POST "$API_URL/vpn-ip/ip-pools/release" \
            -H "Content-Type: application/json" \
            -d "{\"accountId\":\"$test_account\"}" || true
    else
        log "⚠️  自动化规则检查失败 (HTTP $response)"
    fi
}

# 生成监控报告
generate_monitor_report() {
    local report_file="$LOG_DIR/monitor-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "VPN/IP集成监控报告"
        echo "生成时间: $(date)"
        echo "========================================"
        echo ""
        
        # 服务状态
        echo "1. 服务状态:"
        if check_service_health; then
            echo "   ✅ 运行正常"
        else
            echo "   ❌ 运行异常"
        fi
        echo ""
        
        # VPN配置健康
        echo "2. VPN配置健康:"
        if check_vpn_health; then
            echo "   ✅ 配置健康"
        else
            echo "   ❌ 配置异常"
        fi
        echo ""
        
        # IP地址池状态
        echo "3. IP地址池状态:"
        if check_ip_pool_status; then
            echo "   ✅ 状态正常"
        else
            echo "   ❌ 状态异常"
        fi
        echo ""
        
        # 网络连接
        echo "4. 网络连接:"
        if check_network_connectivity; then
            echo "   ✅ 连接正常"
        else
            echo "   ❌ 连接失败"
        fi
        echo ""
        
        # 系统资源
        echo "5. 系统资源:"
        check_system_resources
        echo ""
        
        # 建议
        echo "6. 建议:"
        echo "   - 定期检查VPN配置文件"
        echo "   - 监控IP地址池使用情况"
        echo "   - 设置告警通知"
        echo "   - 定期备份配置数据"
        
    } > "$report_file"
    
    log "📄 监控报告已生成: $report_file"
}

# 主监控循环
main_monitor_loop() {
    log "🚀 启动VPN/IP集成监控"
    log "监控间隔: $((MONITOR_INTERVAL / 1000))秒"
    log "日志目录: $LOG_DIR"
    log "API地址: $API_URL"
    echo ""
    
    while true; do
        local cycle_start=$(date +%s)
        
        log "开始监控周期 $(date '+%Y-%m-%d %H:%M:%S')"
        echo "----------------------------------------"
        
        # 执行各项检查
        local errors=0
        
        if ! check_service_health; then
            errors=$((errors + 1))
        fi
        
        if ! check_vpn_health; then
            errors=$((errors + 1))
        fi
        
        if ! check_ip_pool_status; then
            errors=$((errors + 1))
        fi
        
        if ! check_network_connectivity; then
            errors=$((errors + 1))
        fi
        
        check_system_resources
        local resource_warnings=$?
        
        # 每6次循环执行一次自动化检查
        local cycle_count=$(( (cycle_start / MONITOR_INTERVAL) % 6 ))
        if [ "$cycle_count" -eq 0 ]; then
            run_automation_checks
        fi
        
        # 每12次循环生成一次报告
        if [ "$cycle_count" -eq 0 ]; then
            generate_monitor_report
        fi
        
        # 总结
        echo "----------------------------------------"
        if [ "$errors" -eq 0 ] && [ "$resource_warnings" -eq 0 ]; then
            log "✅ 监控周期完成: 所有检查通过"
        else
            log "⚠️  监控周期完成: 发现 $errors 个错误, $resource_warnings 个警告"
        fi
        
        # 计算等待时间
        local cycle_end=$(date +%s)
        local cycle_duration=$((cycle_end - cycle_start))
        local wait_time=$((MONITOR_INTERVAL / 1000 - cycle_duration))
        
        if [ "$wait_time" -gt 0 ]; then
            log "等待 $wait_time 秒后开始下一周期..."
            sleep "$wait_time"
        else
            log "监控周期超时，立即开始下一周期"
        fi
        
        echo ""
    done
}

# 启动监控
trap 'log "监控停止"; exit 0' INT TERM
main_monitor_loop