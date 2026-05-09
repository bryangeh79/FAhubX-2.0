# 账号管理系统文档

## 概述
Facebook Auto Bot Phase 5.0 - 10个账号完整管理系统，支持批量操作、健康监控、自动恢复和VPN/IP集成。

## 系统架构

### 1. 批量操作模块 (`account-batch/`)
- 批量选择和管理界面
- 批量启动/暂停/停止功能
- 批量导入/导出功能
- 批量测试和验证功能

### 2. 账号分组系统 (`account-group/`)
- 账号分组创建和管理
- 按组执行任务功能
- 组级别权限控制
- 组统计和分析功能

### 3. 健康监控系统 (`account-health/`)
- 账号状态实时监控
- 健康检查定时任务
- 异常检测和告警
- 健康评分和报告系统

### 4. 自动恢复模块 (`account-recovery/`)
- 账号故障自动检测
- 自动重连和恢复功能
- 备用账号切换机制
- 恢复策略配置

### 5. VPN/IP集成 (`vpn-integration/`)
- VPN配置管理系统
- IP地址池管理
- IP轮换和负载均衡
- 网络连接测试和监控

## 数据库设计

### 扩展的 FacebookAccount 实体
```typescript
// 状态管理
status: 'active' | 'idle' | 'error' | 'disabled' | 'banned'

// 健康指标
healthScore: number
lastHealthCheckAt: Date
loginStatus: boolean
sessionExpiresAt: Date
taskSuccessRate: number
avgResponseTime: number
resourceUsage: { cpu: number; memory: number }

// 批量操作标记
batchOperationId: string
batchOperationStatus: 'pending' | 'running' | 'completed' | 'failed'

// 分组管理
groupId: string
groupName: string

// VPN/IP配置
vpnConfigId: string
currentIp: string
ipPoolId: string
networkQuality: number

// 恢复信息
recoveryAttempts: number
lastRecoveryAt: Date
recoveryStrategy: string
```

### 新实体
1. **AccountGroup** - 账号分组
2. **BatchOperation** - 批量操作记录
3. **HealthCheckLog** - 健康检查日志
4. **RecoveryLog** - 恢复日志
5. **VpnConfig** - VPN配置
6. **IpPool** - IP地址池
7. **NetworkTestLog** - 网络测试日志

## API 设计

### 批量操作 API
- `POST /api/accounts/batch/start` - 批量启动账号
- `POST /api/accounts/batch/pause` - 批量暂停账号
- `POST /api/accounts/batch/stop` - 批量停止账号
- `POST /api/accounts/batch/test` - 批量测试账号
- `POST /api/accounts/batch/export` - 批量导出账号
- `POST /api/accounts/batch/delete` - 批量删除账号

### 分组管理 API
- `POST /api/groups` - 创建分组
- `GET /api/groups` - 获取分组列表
- `PUT /api/groups/:id` - 更新分组
- `DELETE /api/groups/:id` - 删除分组
- `POST /api/groups/:id/accounts` - 添加账号到分组
- `POST /api/groups/:id/execute` - 按组执行任务

### 健康监控 API
- `GET /api/health/accounts` - 获取账号健康状态
- `GET /api/health/accounts/:id` - 获取单个账号健康详情
- `POST /api/health/check` - 手动触发健康检查
- `GET /api/health/report` - 生成健康报告

### 自动恢复 API
- `GET /api/recovery/status` - 获取恢复状态
- `POST /api/recovery/trigger/:id` - 手动触发恢复
- `GET /api/recovery/logs` - 获取恢复日志
- `PUT /api/recovery/strategy` - 更新恢复策略

### VPN/IP API
- `GET /api/vpn/configs` - 获取VPN配置
- `POST /api/vpn/configs` - 创建VPN配置
- `GET /api/vpn/ip-pools` - 获取IP地址池
- `POST /api/vpn/ip-pools` - 创建IP地址池
- `POST /api/vpn/rotate-ip` - 轮换IP地址

## 核心功能实现

### 1. 批量操作效率
- 并发控制：最多10个账号同时操作
- 进度跟踪：实时反馈操作进度
- 结果汇总：详细的操作结果报告
- 错误处理：单个账号失败不影响其他账号

### 2. 健康监控准确性
- 定时检查：默认5分钟一次，可配置
- 多维度指标：登录状态、会话有效期、任务成功率等
- 异常检测：基于阈值的异常检测
- 数据保留：监控数据保留30天

### 3. 自动恢复可靠性
- 快速检测：故障检测时间<1分钟
- 智能恢复：根据故障类型选择恢复策略
- 备用切换：自动切换到备用账号
- 过程追溯：完整的恢复过程日志

### 4. VPN/IP管理灵活性
- 多协议支持：OpenVPN和WireGuard
- 动态分配：IP地址池动态分配
- 质量监控：连接质量实时监控
- 自动切换：网络异常时自动切换VPN

## 技术实现

### 定时任务
使用 `@nestjs/schedule` 实现：
1. 健康检查定时任务
2. 自动恢复检测任务
3. 数据清理任务

### 消息队列
使用 `@nestjs/bull` 和 Redis 实现：
1. 批量操作队列
2. 健康检查队列
3. 恢复任务队列

### WebSocket
实时推送：
1. 批量操作进度
2. 健康状态变化
3. 恢复过程通知

### 数据库优化
1. 索引优化：为常用查询字段创建索引
2. 分区表：按时间分区健康检查日志
3. 读写分离：主从复制提高读取性能

## 安全性

### 数据加密
1. 账号密码：bcrypt 加密存储
2. 访问令牌：AES 加密存储
3. 配置信息：加密存储敏感配置

### 访问控制
1. 用户隔离：用户只能访问自己的账号
2. 操作审计：所有操作记录完整日志
3. API 限流：防止滥用和攻击

### 网络安全
1. HTTPS：强制使用 HTTPS
2. CORS：严格配置跨域策略
3. 防火墙：限制不必要的端口访问

## 监控和告警

### 系统监控
1. 资源监控：CPU、内存、磁盘使用率
2. 性能监控：API响应时间、数据库查询时间
3. 业务监控：账号健康度、任务成功率

### 告警机制
1. 邮件告警：重要异常发送邮件通知
2. Webhook告警：集成第三方通知系统
3. 仪表板：实时监控仪表板

## 部署和运维

### 环境要求
- Node.js >= 18.0.0
- PostgreSQL >= 12.0
- Redis >= 6.0
- 内存：至少 2GB
- 存储：至少 10GB

### 部署步骤
1. 安装依赖：`npm install`
2. 配置环境变量：复制 `.env.example` 到 `.env`
3. 数据库迁移：`npm run db:migrate`
4. 启动服务：`npm run start:prod`
5. 启动Worker：`npm run worker`

### 备份和恢复
1. 数据库备份：每日自动备份
2. 配置文件备份：版本控制管理
3. 恢复流程：文档化恢复步骤

## 测试

### 单元测试
```bash
npm test
```

### 集成测试
```bash
npm run test:e2e
```

### 性能测试
使用 k6 进行负载测试：
```bash
k6 run tests/performance/batch-operations.js
```

## 故障排除

### 常见问题
1. 账号连接失败：检查网络和VPN配置
2. 批量操作超时：调整并发数和超时时间
3. 健康检查异常：检查Facebook API状态
4. 恢复失败：查看恢复日志分析原因

### 日志查看
```bash
# 查看应用日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log

# 查看访问日志
tail -f logs/access.log
```

## 更新日志

### v1.0.0 (2026-04-13)
- 初始版本发布
- 实现批量操作功能
- 实现健康监控系统
- 实现自动恢复机制
- 集成VPN/IP管理

## 联系方式
- 项目仓库：https://github.com/your-repo/facebook-auto-bot
- 问题反馈：issues@example.com
- 文档网站：https://docs.example.com