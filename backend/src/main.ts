// 必须在所有 import 之前加载 .env（让条件 import 能读到 env vars）
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';

async function bootstrap() {
  // 创建应用实例
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
      ),
      defaultMeta: { service: 'fbautobot-api' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
      ],
    }),
  });

  // 获取配置服务
  const configService = app.get(ConfigService);

  // ── 生产环境启动校验：禁止使用默认密钥 ────────────────────────────────────
  if (process.env.NODE_ENV === 'production' && process.env.DEPLOY_MODE !== 'local') {
    const jwtSecret = configService.get('JWT_SECRET', '');
    if (!jwtSecret || jwtSecret.includes('change-in-production') || jwtSecret.length < 32) {
      console.error('❌ FATAL: JWT_SECRET 未配置或使用默认值，生产环境禁止启动！请在 .env 中设置强密钥。');
      process.exit(1);
    }
    const dbPassword = configService.get('DB_PASSWORD', '');
    if (!dbPassword || dbPassword === 'password') {
      console.error('❌ FATAL: DB_PASSWORD 使用默认值 "password"，生产环境禁止启动！');
      process.exit(1);
    }
  }

  // ── Local & Production 通用校验：ENCRYPTION_KEY 必须配置且非默认值 ─────────
  if (process.env.NODE_ENV === 'production') {
    const encKey = configService.get('ENCRYPTION_KEY', '') || configService.get('encryption.key', '');
    if (!encKey || encKey === 'your-32-character-encryption-key-here' || encKey.length < 32) {
      console.error('❌ FATAL: ENCRYPTION_KEY 未配置、使用默认值或长度不足 32。请在 .env 设置强密钥。');
      process.exit(1);
    }
    const jwtSecret = configService.get('JWT_SECRET', '');
    if (!jwtSecret || jwtSecret.length < 32) {
      console.error('❌ FATAL: JWT_SECRET 未配置或长度不足 32。请在 .env 设置强密钥。');
      process.exit(1);
    }
  }

  // 安全中间件 — 显式解析 boolean（避免 helmet 接收字符串"false"）
  const cspEnabled = configService.get('CONTENT_SECURITY_POLICY', true);
  const hstsEnabled = configService.get('HSTS_ENABLED', true);
  const helmetOptions: any = {};
  if (cspEnabled === false || cspEnabled === 'false') helmetOptions.contentSecurityPolicy = false;
  if (hstsEnabled === false || hstsEnabled === 'false') helmetOptions.hsts = false;
  app.use(helmet(helmetOptions));

  // 压缩中间件
  if (configService.get('COMPRESSION_ENABLED', true)) {
    app.use(compression());
  }

  // Cookie 解析
  app.use(cookieParser());

  // 全局前缀
  app.setGlobalPrefix(configService.get('API_PREFIX', 'api'));

  // API 版本控制
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 全局过滤器
  app.useGlobalFilters(new HttpExceptionFilter());

  // 全局拦截器
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor(),
    new TimeoutInterceptor(10000), // 10秒超时
  );

  // CORS 配置
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOrigin = configService.get('CORS_ORIGIN', '');
  app.enableCors({
    origin: isProduction
      ? (corsOrigin || 'https://yourdomain.com')  // 生产环境：仅允许指定域名
      : (origin: string, callback: Function) => callback(null, origin || 'http://localhost:5173'),  // 开发模式：允许本地前端
    credentials: configService.get('CORS_CREDENTIALS', true),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
  });

  // Swagger 文档
  if (configService.get('SWAGGER_ENABLED', true)) {
    const config = new DocumentBuilder()
      .setTitle('Facebook Auto Bot API')
      .setDescription('Facebook自动化机器人SaaS平台API文档')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: '输入JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('认证', '用户认证相关接口')
      .addTag('用户', '用户管理接口')
      .addTag('账号', 'Facebook账号管理接口')
      .addTag('任务', '自动化任务管理接口')
      .addTag('对话', '对话剧本和执行接口')
      .addTag('通知', '系统通知接口')
      .addTag('监控', '系统监控接口')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(
      configService.get('SWAGGER_PATH', 'api-docs'),
      app,
      document,
    );
  }

  // SPA fallback: 所有不匹配 /api 的 GET 请求都返回前端 index.html
  // 这样 React Router 能处理 /login, /admin/users 等客户端路由
  if (process.env.SERVE_STATIC === 'true') {
    const path = require('path');
    const indexPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use((req: any, res: any, next: any) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api')) return next();
      // 如果是静态文件（.js/.css/.png 等），让 ServeStatic 处理
      if (req.path.includes('.')) return next();
      res.sendFile(indexPath);
    });
  }

  // 启动应用
  const port = configService.get('PORT', 3000);
  const host = configService.get('HOST', '0.0.0.0');

  await app.listen(port, host);

  console.log(`
  🚀 Facebook Auto Bot API 已启动！
  
  环境: ${configService.get('NODE_ENV', 'development')}
  地址: http://${host}:${port}
  API前缀: ${configService.get('API_PREFIX', 'api')}
  Swagger文档: http://${host}:${port}/${configService.get('SWAGGER_PATH', 'api-docs')}
  
  数据库: ${configService.get('DB_HOST', 'localhost')}:${configService.get('DB_PORT', 5432)}/${configService.get('DB_NAME', 'fbautobot')}
  Redis: ${configService.get('REDIS_HOST', 'localhost')}:${configService.get('REDIS_PORT', 6379)}
  RabbitMQ: ${configService.get('RABBITMQ_URL', 'amqp://localhost:5672')}
  `);
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 启动应用
bootstrap().catch((error) => {
  console.error('应用启动失败:', error);
  process.exit(1);
});