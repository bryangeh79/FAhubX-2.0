# VPN/IP配置集成文档

## 概述
本模块实现Facebook Auto Bot的VPN/IP配置集成系统，确保每个Facebook账号可以使用独立的IP地址，降低被封禁风险。

## 架构设计

### 1. 系统架构
```
┌─────────────────────────────────────────────────────────────┐
│                    VPN/IP集成系统架构                        │
├─────────────────────────────────────────────────────────────┤
│ 应用层                                                      │
│  ├─ VPN客户端管理                                           │
│  ├─ IP地址池管理                                           │
│  ├─ 网络自动化                                              │
│  └─ 网络监控                                                │
│                                                             │
│ 服务层                                                      │
│  ├─ OpenVPN服务                                            │
│  ├─ WireGuard服务                                          │
│  ├─ IP分配服务                                             │
│  └─ 网络诊断服务                                            │
│                                                             │
│ 数据层                                                      │
│  ├─ PostgreSQL (配置存储)                                   │
│  ├─ Redis (状态缓存)                                        │
│  └─ 文件系统 (VPN配置文件)                                  │
└─────────────────────────────────────────────────────────────┘
```

### 2. 模块划分
1. **vpn-client** - VPN客户端管理
2. **ip-pool** - IP地址池管理
3. **network-automation** - 网络自动化
4. **network-monitor** - 网络监控
5. **network-security** - 网络安全

## 功能特性

### 1. VPN协议支持
- **OpenVPN**: 最广泛支持，配置灵活
- **WireGuard**: 高性能，现代协议
- **自定义代理**: SOCKS5, HTTP代理

### 2. IP地址类型
- **住宅IP**: 真实住宅网络，最低风险
- **数据中心IP**: 稳定高速，但风险较高
- **移动IP**: 4G/5G网络，高匿名性
- **共享IP**: 成本低，但可能被关联

### 3. 连接策略
- **固定IP**: 账号始终使用同一IP
- **轮换IP**: 每次任务使用不同IP
- **按需切换**: 检测到风险时切换IP
- **智能选择**: 根据任务类型选择最佳IP

### 4. 监控指标
- **连接状态**: 已连接、断开、错误
- **网络延迟**: ping响应时间
- **带宽使用**: 上传/下载速度
- **稳定性**: 连接持续时间、重连次数

## 技术实现

### 1. 依赖包
```json
{
  "dependencies": {
    "node-openvpn": "^0.1.0",
    "wireguard-wrapper": "^1.0.0",
    "socks-proxy-agent": "^8.0.0",
    "http-proxy-agent": "^7.0.0",
    "ping": "^0.4.4",
    "speedtest-net": "^2.2.0",
    "geoip-lite": "^1.4.0",
    "ip": "^2.0.0",
    "network": "^0.5.0"
  }
}
```

### 2. 数据库表设计

#### VPN配置表 (vpn_configs)
```sql
CREATE TABLE vpn_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('openvpn', 'wireguard', 'proxy')),
  config JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
  health_score INTEGER DEFAULT 100,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### IP地址池表 (ip_pools)
```sql
CREATE TABLE ip_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vpn_config_id UUID REFERENCES vpn_configs(id),
  ip_address INET NOT NULL,
  port INTEGER,
  type VARCHAR(50) CHECK (type IN ('residential', 'datacenter', 'mobile', 'shared')),
  country_code CHAR(2),
  city VARCHAR(100),
  isp VARCHAR(255),
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'reserved', 'blocked')),
  assigned_to UUID,
  health_score INTEGER DEFAULT 100,
  last_health_check TIMESTAMP,
  total_connections INTEGER DEFAULT 0,
  total_duration INTERVAL DEFAULT '0 seconds',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ip_address, port)
);
```

#### 账号IP关联表 (account_ip_mappings)
```sql
CREATE TABLE account_ip_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  ip_pool_id UUID REFERENCES ip_pools(id),
  vpn_config_id UUID REFERENCES vpn_configs(id),
  connection_type VARCHAR(50) CHECK (connection_type IN ('fixed', 'rotating', 'on_demand')),
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
  connection_stats JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 网络监控日志表 (network_monitor_logs)
```sql
CREATE TABLE network_monitor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vpn_config_id UUID REFERENCES vpn_configs(id),
  ip_pool_id UUID REFERENCES ip_pools(id),
  metric_type VARCHAR(50) NOT NULL,
  metric_value DECIMAL(10,2),
  unit VARCHAR(20),
  status VARCHAR(20),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API设计

### 1. VPN配置管理
- `POST /api/vpn/configs` - 创建VPN配置
- `GET /api/vpn/configs` - 获取VPN配置列表
- `GET /api/vpn/configs/:id` - 获取VPN配置详情
- `PUT /api/vpn/configs/:id` - 更新VPN配置
- `DELETE /api/vpn/configs/:id` - 删除VPN配置
- `POST /api/vpn/configs/:id/connect` - 连接VPN
- `POST /api/vpn/configs/:id/disconnect` - 断开VPN连接
- `GET /api/vpn/configs/:id/status` - 获取VPN状态

### 2. IP地址池管理
- `POST /api/ip-pools` - 添加IP到地址池
- `GET /api/ip-pools` - 获取IP地址池列表
- `GET /api/ip-pools/:id` - 获取IP详情
- `PUT /api/ip-pools/:id` - 更新IP信息
- `DELETE /api/ip-pools/:id` - 从地址池移除IP
- `POST /api/ip-pools/assign` - 分配IP给账号
- `POST /api/ip-pools/release` - 释放IP
- `POST /api/ip-pools/:id/health-check` - IP健康检查

### 3. 网络自动化
- `POST /api/network/auto-connect` - 自动连接最佳VPN
- `POST /api/network/rotate-ip` - 轮换IP地址
- `POST /api/network/optimize` - 优化网络连接
- `GET /api/network/status/:accountId` - 获取账号网络状态

### 4. 网络监控
- `GET /api/network/monitor/metrics` - 获取监控指标
- `GET /api/network/monitor/alerts` - 获取告警列表
- `POST /api/network/monitor/test` - 执行网络测试
- `GET /api/network/monitor/report` - 生成网络报告

## 核心算法

### 1. IP分配算法
```typescript
interface IPAllocationStrategy {
  // 基于账号风险等级分配
  allocateByRiskLevel(accountRisk: number): IPPool;
  
  // 基于任务类型分配
  allocateByTaskType(taskType: string): IPPool;
  
  // 基于地理位置分配
  allocateByGeoLocation(countryCode: string): IPPool;
  
  // 基于性能需求分配
  allocateByPerformance(requirements: PerformanceRequirements): IPPool;
}
```

### 2. 网络质量评估
```typescript
interface NetworkQualityMetrics {
  latency: number;      // 延迟(ms)
  jitter: number;       // 抖动(ms)
  packetLoss: number;   // 丢包率(%)
  bandwidth: number;    // 带宽(Mbps)
  stability: number;    // 稳定性评分(0-100)
}

class NetworkQualityEvaluator {
  calculateQualityScore(metrics: NetworkQualityMetrics): number;
  isAcceptableForTask(taskType: string, score: number): boolean;
  getOptimizationSuggestions(metrics: NetworkQualityMetrics): string[];
}
```

### 3. 故障切换策略
```typescript
class FailoverStrategy {
  // 主备切换
  primaryBackupSwitch(currentConfig: VPNConfig): VPNConfig;
  
  // 负载均衡
  loadBalancedSwitch(availableConfigs: VPNConfig[]): VPNConfig;
  
  // 智能故障检测
  detectAndSwitch(monitorData: MonitorData): SwitchDecision;
}
```

## 部署要求

### 1. 系统要求
- **操作系统**: Windows 10+, Linux (Ubuntu 20.04+), macOS 11+
- **Node.js**: 18.0.0+
- **数据库**: PostgreSQL 12+, Redis 6+
- **VPN客户端**: OpenVPN 2.5+, WireGuard

### 2. 网络要求
- 出站端口: 1194 (OpenVPN), 51820 (WireGuard)
- 入站端口: 3000 (API), 6379 (Redis), 5432 (PostgreSQL)
- 带宽: 最小10Mbps，推荐100Mbps

### 3. 安全要求
- VPN配置文件加密存储
- API访问认证和授权
- 网络流量监控和限制
- 安全审计日志

## 监控和告警

### 1. 监控指标
- VPN连接成功率
- IP分配成功率
- 网络延迟和抖动
- 带宽使用率
- 系统资源使用率

### 2. 告警规则
- 连接成功率 < 90% (警告)
- 连接成功率 < 80% (严重)
- 平均延迟 > 300ms (警告)
- 平均延迟 > 500ms (严重)
- IP地址池可用率 < 20% (警告)
- IP地址池可用率 < 10% (严重)

### 3. 告警通知
- 电子邮件通知
- Slack/Telegram通知
- Webhook通知
- 系统日志

## 故障排除

### 1. 常见问题
1. **VPN连接失败**
   - 检查配置文件格式
   - 验证网络连接
   - 检查防火墙设置

2. **IP分配失败**
   - 检查IP地址池状态
   - 验证数据库连接
   - 检查Redis缓存

3. **网络性能差**
   - 运行网络诊断
   - 检查VPN服务器负载
   - 优化连接参数

### 2. 诊断工具
```bash
# 网络诊断
npm run network:diagnose -- --account-id=<account_id>

# VPN状态检查
npm run vpn:status -- --config-id=<config_id>

# IP健康检查
npm run ip:health-check -- --pool-id=<pool_id>
```

## 性能优化

### 1. 连接池优化
- 预建立VPN连接
- 连接复用
- 智能连接保持

### 2. 缓存策略
- Redis缓存热点数据
- 内存缓存连接状态
- 数据库查询优化

### 3. 异步处理
- 使用消息队列处理网络操作
- 异步健康检查
- 批量IP分配

## 扩展性设计

### 1. 水平扩展
- 无状态API服务
- 分布式Redis集群
- 数据库读写分离

### 2. 插件架构
- 可插拔VPN协议支持
- 自定义IP分配策略
- 扩展监控指标

### 3. 配置管理
- 环境变量配置
- 配置文件热重载
- 动态配置更新

## 安全考虑

### 1. 数据安全
- VPN配置加密存储
- 敏感信息脱敏
- 审计日志记录

### 2. 访问控制
- 基于角色的访问控制(RBAC)
- API速率限制
- IP白名单

### 3. 网络安全
- TLS加密通信
- VPN隧道加密
- 防火墙规则

## 测试策略

### 1. 单元测试
- VPN客户端功能测试
- IP分配算法测试
- 网络监控测试

### 2. 集成测试
- VPN连接集成测试
- IP池管理集成测试
- 网络自动化集成测试

### 3. 端到端测试
- 完整工作流测试
- 故障恢复测试
- 性能负载测试

## 维护指南

### 1. 日常维护
- 监控系统状态
- 检查日志文件
- 备份配置文件

### 2. 定期维护
- 更新VPN客户端
- 清理过期IP
- 优化数据库

### 3. 故障恢复
- 自动故障切换
- 手动干预流程
- 数据恢复程序

## 版本历史

### v1.0.0 (初始版本)
- 基础VPN客户端集成
- IP地址池管理
- 基本网络监控

### v1.1.0 (计划)
- 高级网络自动化
- 智能IP分配
- 增强安全功能

### v1.2.0 (计划)
- 多协议支持扩展
- 性能优化
- 高级监控和告警