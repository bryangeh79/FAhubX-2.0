# 项目结构说明

## 整体结构
```
Facebook Auto Bot/
├── backend/                    # 后端服务
│   ├── src/                   # 源代码
│   │   ├── common/           # 公共模块
│   │   │   ├── decorators/   # 装饰器
│   │   │   ├── filters/      # 异常过滤器
│   │   │   ├── guards/       # 守卫
│   │   │   ├── interceptors/ # 拦截器
│   │   │   ├── middleware/   # 中间件
│   │   │   └── pipes/        # 管道
│   │   ├── config/           # 配置模块
│   │   │   ├── database/     # 数据库配置
│   │   │   ├── auth/         # 认证配置
│   │   │   ├── facebook/     # Facebook API配置
│   │   │   └── queue/        # 队列配置
│   │   ├── database/         # 数据库相关
│   │   │   ├── entities/     # TypeORM实体
│   │   │   ├── migrations/   # 数据库迁移
│   │   │   ├── seeds/        # 种子数据
│   │   │   └── repositories/ # 数据仓库
│   │   ├── modules/          # 业务模块
│   │   │   ├── auth/         # 认证模块
│   │   │   ├── users/        # 用户管理
│   │   │   ├── tenants/      # 租户管理
│   │   │   ├── facebook/     # Facebook集成
│   │   │   ├── tasks/        # 任务管理
│   │   │   ├── analytics/    # 数据分析
│   │   │   └── notifications/# 通知管理
│   │   ├── shared/           # 共享代码
│   │   │   ├── constants/    # 常量定义
│   │   │   ├── enums/        # 枚举类型
│   │   │   ├── interfaces/   # 接口定义
│   │   │   ├── types/        # 类型定义
│   │   │   └── utils/        # 工具函数
│   │   └── main.ts           # 应用入口
│   ├── test/                 # 测试代码
│   │   ├── unit/            # 单元测试
│   │   ├── integration/     # 集成测试
│   │   └── e2e/             # E2E测试
│   ├── .env.example         # 环境变量示例
│   ├── package.json         # 依赖配置
│   ├── tsconfig.json        # TypeScript配置
│   ├── nest-cli.json        # NestJS CLI配置
│   └── Dockerfile           # 生产Dockerfile
├── frontend/                 # 前端应用
│   ├── src/                 # 源代码
│   │   ├── assets/          # 静态资源
│   │   │   ├── images/      # 图片
│   │   │   ├── styles/      # 样式文件
│   │   │   └── fonts/       # 字体文件
│   │   ├── components/      # 公共组件
│   │   │   ├── common/      # 通用组件
│   │   │   ├── layout/      # 布局组件
│   │   │   ├── ui/          # UI组件
│   │   │   └── forms/       # 表单组件
│   │   ├── pages/           # 页面组件
│   │   │   ├── auth/        # 认证页面
│   │   │   ├── dashboard/   # 仪表盘
│   │   │   ├── tenants/     # 租户管理
│   │   │   ├── facebook/    # Facebook管理
│   │   │   ├── tasks/       # 任务管理
│   │   │   └── analytics/   # 数据分析
│   │   ├── hooks/           # 自定义Hooks
│   │   ├── services/        # API服务
│   │   │   ├── api/         # API客户端
│   │   │   ├── auth/        # 认证服务
│   │   │   └── facebook/    # Facebook服务
│   │   ├── store/           # 状态管理
│   │   │   ├── slices/      # Zustand slices
│   │   │   └── index.ts     # Store导出
│   │   ├── utils/           # 工具函数
│   │   │   ├── helpers/     # 辅助函数
│   │   │   ├── validators/  # 验证器
│   │   │   └── constants/   # 常量
│   │   ├── types/           # TypeScript类型
│   │   ├── router/          # 路由配置
│   │   ├── App.tsx          # 根组件
│   │   └── main.tsx         # 应用入口
│   ├── public/              # 公共资源
│   │   ├── index.html       # HTML模板
│   │   ├── favicon.ico      # 网站图标
│   │   └── manifest.json    # PWA清单
│   ├── .env.example         # 环境变量示例
│   ├── package.json         # 依赖配置
│   ├── vite.config.ts       # Vite配置
│   ├── tsconfig.json        # TypeScript配置
│   └── Dockerfile           # 生产Dockerfile
├── infrastructure/          # 基础设施
│   ├── docker-compose.yml   # 开发环境编排
│   ├── docker-compose.prod.yml # 生产环境编排
│   ├── kubernetes/          # K8s部署配置
│   │   ├── deployment/      # 部署配置
│   │   ├── service/         # 服务配置
│   │   ├── ingress/         # 入口配置
│   │   └── configmap/       # 配置映射
│   ├── scripts/             # 部署脚本
│   └── monitoring/          # 监控配置
│       ├── prometheus/      # Prometheus配置
│       └── grafana/         # Grafana仪表盘
├── docs/                    # 项目文档
│   ├── ARCHITECTURE.md      # 架构设计
│   ├── DEVELOPMENT_PLAN.md  # 开发计划
│   ├── API_DOCUMENTATION.md # API文档
│   ├── DEPLOYMENT_GUIDE.md  # 部署指南
│   └── OPERATIONS.md        # 运维手册
├── .github/                 # GitHub配置
│   ├── workflows/           # CI/CD工作流
│   │   ├── ci.yml          # 持续集成
│   │   ├── cd.yml          # 持续部署
│   │   └── security.yml    # 安全扫描
│   └── ISSUE_TEMPLATE/      # Issue模板
├── .gitignore              # Git忽略配置
├── README.md               # 项目说明
├── LICENSE                 # 许可证
└── start-dev.sh            # 开发环境启动脚本
```

## 模块说明

### 后端模块结构

#### 1. 认证模块 (auth)
- 用户注册/登录
- JWT token管理
- 密码重置
- 会话管理
- OAuth2集成

#### 2. 用户模块 (users)
- 用户信息管理
- 个人资料设置
- 头像上传
- 账户安全

#### 3. 租户模块 (tenants)
- 租户创建/管理
- 成员管理
- 订阅管理
- 资源配额
- 账单管理

#### 4. Facebook模块 (facebook)
- Facebook OAuth2集成
- Graph API封装
- Webhook处理
- 媒体管理
- 账号管理

#### 5. 任务模块 (tasks)
- 自动化任务管理
- 任务调度
- 执行监控
- 失败重试
- 历史记录

#### 6. 分析模块 (analytics)
- 数据收集
- 指标计算
- 报告生成
- 趋势分析
- 数据导出

#### 7. 通知模块 (notifications)
- 邮件通知
- 应用内通知
- 推送通知
- 通知模板
- 用户偏好

### 前端模块结构

#### 1. 认证页面 (auth)
- 登录页面
- 注册页面
- 忘记密码
- 邮箱验证

#### 2. 仪表盘 (dashboard)
- 概览页面
- 数据统计
- 快速操作
- 系统状态

#### 3. 租户管理 (tenants)
- 租户列表
- 租户详情
- 成员管理
- 设置页面

#### 4. Facebook管理 (facebook)
- 账号连接
- 页面管理
- 授权管理
- 内容预览

#### 5. 任务管理 (tasks)
- 任务列表
- 任务创建
- 执行历史
- 调度设置

#### 6. 数据分析 (analytics)
- 数据仪表盘
- 报告查看
- 图表分析
- 数据导出

## 开发约定

### 代码规范
- 使用TypeScript严格模式
- ESLint + Prettier代码格式化
- 遵循Airbnb JavaScript风格指南
- 组件和函数使用PascalCase
- 变量和函数使用camelCase
- 常量使用UPPER_SNAKE_CASE

### 提交规范
- 使用Conventional Commits
- 提交前运行lint和测试
- 提交信息使用英文

### 分支策略
- `main`: 生产分支
- `develop`: 开发分支
- `feature/*`: 功能分支
- `bugfix/*`: 修复分支
- `release/*`: 发布分支
- `hotfix/*`: 热修复分支

### 测试策略
- 单元测试: 覆盖核心逻辑
- 集成测试: 覆盖API接口
- E2E测试: 覆盖用户流程
- 性能测试: 关键路径性能
- 安全测试: 安全漏洞扫描

## 环境配置

### 开发环境
- 本地Docker Compose
- 热重载支持
- 调试工具集成
- 模拟数据支持

### 测试环境
- 类生产环境
- 自动化测试
- 性能测试
- 安全扫描

### 生产环境
- Kubernetes集群
- 高可用部署
- 监控告警
- 自动扩缩容

## 部署流程

### 开发部署
```bash
# 启动开发环境
./start-dev.sh up

# 查看日志
./start-dev.sh logs

# 停止环境
./start-dev.sh down
```

### 生产部署
```bash
# 构建镜像
docker build -t facebook-auto-bot:latest .

# 推送镜像
docker push registry.example.com/facebook-auto-bot:latest

# 部署到K8s
kubectl apply -f infrastructure/kubernetes/
```

## 监控与运维

### 监控指标
- 应用性能 (响应时间、错误率)
- 业务指标 (用户数、任务数)
- 基础设施 (CPU、内存、磁盘)
- 安全事件 (登录失败、异常请求)

### 日志管理
- 结构化日志输出
- 日志分级存储
- 日志聚合分析
- 错误追踪

### 告警规则
- 服务不可用告警
- 性能下降告警
- 安全事件告警
- 资源不足告警