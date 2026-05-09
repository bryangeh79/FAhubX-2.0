# Facebook Auto Bot 后端服务 Dockerfile (生产环境)
# 多阶段构建优化镜像大小

# 构建阶段
FROM node:18-alpine AS builder

# 安装构建依赖
RUN apk add --no-cache python3 make g++ git

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括开发依赖）
RUN npm ci

# 复制源代码
COPY . .

# 运行测试
RUN npm test

# 构建应用
RUN npm run build

# 生产阶段
FROM node:18-alpine

# 安装运行时依赖
RUN apk add --no-cache tini curl

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 仅安装生产依赖
RUN npm ci --only=production

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# 复制必要的配置文件
COPY .env.example .env.example
COPY tsconfig.json ./

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Shanghai

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 更改文件所有权
RUN chown -R nodejs:nodejs /app

# 切换到非root用户
USER nodejs

# 使用 tini 作为 init 进程
ENTRYPOINT ["/sbin/tini", "--"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 启动应用
CMD ["node", "dist/main.js"]