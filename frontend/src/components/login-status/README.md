# 登录状态监控组件

## 概述
登录状态监控面板用于实时监控Facebook账号的登录状态、会话有效期和系统健康度。

## 已创建的组件

### 1. LoginStatusPage (`/workspace/frontend/src/pages/LoginStatusPage.tsx`)
主监控页面，包含：
- 实时状态显示表格
- 统计卡片（总账号数、在线账号、异常账号、健康度）
- 过滤和搜索功能
- 状态详情查看模态框
- 自动刷新设置
- 批量操作功能

### 2. StatusTrendChart (`/workspace/frontend/src/components/login-status/StatusTrendChart.tsx`)
状态趋势图组件，包含：
- 多种图表类型（折线图、面积图、柱状图）
- 时间范围选择（24小时、7天、30天）
- 多指标选择
- 响应式设计

### 3. AutoReconnectConfig (`/workspace/frontend/src/components/login-status/AutoReconnectConfig.tsx`)
自动重连配置组件，包含：
- 全局自动重连开关
- 重连策略选择（智能、积极、保守、自定义）
- 重连规则管理
- 成功率统计
- 配置建议

### 4. HealthDashboard (`/workspace/frontend/src/components/login-status/HealthDashboard.tsx`)
健康状态仪表板组件，包含：
- 整体健康度评分
- 健康指标详情
- 告警管理
- 优化建议
- 实时监控

### 5. 服务层 (`/workspace/frontend/src/services/login-status.ts`)
登录状态服务，包含：
- 状态数据获取API
- 趋势数据获取
- 重连配置管理
- 告警管理
- 批量操作
- 工具函数

## 功能特性

### 监控指标
1. **登录状态**：在线、离线、验证中、失败
2. **健康状态**：健康评分（0-100）
3. **VPN状态**：连接状态、IP地址、延迟
4. **反检测状态**：启用状态、问题检测
5. **会话信息**：登录时间、最后活动、有效期

### 核心功能
1. **实时刷新**：可配置的自动刷新间隔
2. **状态过滤**：按状态、时间范围过滤
3. **批量操作**：批量重试登录、清除会话
4. **详细查看**：账号状态详情模态框
5. **趋势分析**：状态变化趋势图表
6. **自动重连**：智能重连规则配置
7. **健康监控**：系统健康度评估和告警

## 路由配置
已更新 `App.tsx` 添加路由：
```typescript
<Route
  path="/login-status"
  element={
    <ProtectedRoute>
      <LoginStatusPage />
    </ProtectedRoute>
  }
/>
```

## 导航菜单
已更新 `AppLayout.tsx` 添加导航项：
- 图标：`MonitorOutlined`
- 标签：登录状态监控
- 路径：`/login-status`

## 使用说明

### 快速开始
1. 访问 `/login-status` 页面
2. 查看所有账号的实时状态
3. 使用过滤功能查找特定状态的账号
4. 点击"查看详情"查看账号详细信息
5. 配置自动重连规则

### 配置自动重连
1. 在详情模态框中点击"配置自动重连"
2. 选择重连策略
3. 设置重试次数和间隔
4. 保存配置

### 查看健康状态
1. 在健康仪表板中查看整体健康度
2. 查看各项健康指标
3. 处理未确认的告警
4. 根据优化建议调整配置

## 技术实现

### 数据模拟
当前使用模拟数据，实际使用时需要连接后端API：
- `login-status` API：获取状态数据
- `login-status/stats`：获取统计数据
- `login-status/trends`：获取趋势数据

### 实时更新
支持两种更新方式：
1. 定时轮询（可配置间隔）
2. WebSocket实时推送（待实现）

### 响应式设计
所有组件都支持响应式布局，适配不同屏幕尺寸。

## 后续开发建议

### 后端API开发
需要开发以下API端点：
1. `GET /api/v1/login-status` - 获取状态列表
2. `GET /api/v1/login-status/:id` - 获取单个账号状态
3. `GET /api/v1/login-status/stats` - 获取统计数据
4. `POST /api/v1/login-status/:id/retry` - 重试登录
5. `DELETE /api/v1/login-status/:id/session` - 清除会话

### 功能增强
1. **实时通知**：状态变化时发送通知
2. **导出功能**：导出状态报告
3. **权限控制**：不同用户查看不同账号
4. **历史记录**：登录历史查询
5. **性能优化**：虚拟滚动支持大量账号

## 注意事项
1. 监控的是Puppeteer浏览器实例的网页登录状态，不是API token状态
2. 自动重连功能需要谨慎配置，避免触发风控
3. 健康评分算法需要根据实际业务调整
4. 生产环境需要连接真实的后端服务