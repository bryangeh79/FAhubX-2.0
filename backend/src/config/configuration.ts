export default () => ({
  // 应用配置
  app: {
    name: process.env.APP_NAME || 'Facebook Auto Bot',
    version: process.env.APP_VERSION || '1.0.0',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || '0.0.0.0',
    apiPrefix: process.env.API_PREFIX || 'api',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
    backendUrl: process.env.BACKEND_URL || 'http://localhost:3000',
  },

  // 数据库配置
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'fbautobot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    sync: process.env.DB_SYNC === 'true',
    logging: process.env.DB_LOGGING === 'true',
    ssl: process.env.DB_SSL === 'true',
  },

  // Redis配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    tls: process.env.REDIS_TLS === 'true',
  },

  // RabbitMQ配置
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    user: process.env.RABBITMQ_USER || 'admin',
    password: process.env.RABBITMQ_PASSWORD || 'password',
    queuePrefix: process.env.RABBITMQ_QUEUE_PREFIX || 'fbautobot',
  },

  // MinIO配置
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost:9000',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'fbautobot',
    region: process.env.MINIO_REGION || 'us-east-1',
    useSSL: process.env.MINIO_USE_SSL === 'true',
  },

  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // 加密配置
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key-here',
    iv: process.env.ENCRYPTION_IV || 'your-16-character-iv-here',
  },

  // 会话配置
  session: {
    secret: process.env.SESSION_SECRET || 'your-session-secret-key-change-in-production',
    maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000,
  },

  // 限流配置
  rateLimit: {
    window: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },

  // CORS配置
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  // 日志配置
  log: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined',
    dir: process.env.LOG_DIR || './logs',
  },

  // 监控配置
  monitoring: {
    metricsPath: process.env.PROMETHEUS_METRICS_PATH || '/metrics',
    defaultMetrics: process.env.PROMETHEUS_DEFAULT_METRICS === 'true',
  },

  // 任务配置
  task: {
    maxConcurrent: parseInt(process.env.TASK_MAX_CONCURRENT, 10) || 10,
    retryMaxAttempts: parseInt(process.env.TASK_RETRY_MAX_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.TASK_RETRY_DELAY, 10) || 300000,
    timeout: parseInt(process.env.TASK_TIMEOUT, 10) || 1800000,
  },

  // Facebook配置
  facebook: {
    appId: process.env.FACEBOOK_APP_ID || 'your-facebook-app-id',
    appSecret: process.env.FACEBOOK_APP_SECRET || 'your-facebook-app-secret',
    appVersion: process.env.FACEBOOK_APP_VERSION || 'v18.0',
    redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/facebook/callback',
    scope: process.env.FACEBOOK_SCOPE || 'email,public_profile,pages_manage_posts,pages_read_engagement',
  },

  // 邮件配置
  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password',
    from: process.env.SMTP_FROM || 'noreply@fbautobot.com',
  },

  // 管理员配置
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@fbautobot.com',
    password: process.env.ADMIN_PASSWORD || 'Admin123!',
  },

  // 开发工具配置
  development: {
    debug: process.env.DEBUG === 'true',
    typeormDebug: process.env.TYPEORM_DEBUG === 'true',
    swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
    swaggerPath: process.env.SWAGGER_PATH || '/api-docs',
  },

  // 安全配置
  security: {
    helmetEnabled: process.env.HELMET_ENABLED === 'true',
    csrfEnabled: process.env.CSRF_ENABLED === 'true',
    contentSecurityPolicy: process.env.CONTENT_SECURITY_POLICY === 'true',
    hstsEnabled: process.env.HSTS_ENABLED === 'true',
  },

  // 性能配置
  performance: {
    compressionEnabled: process.env.COMPRESSION_ENABLED === 'true',
    cacheControl: process.env.CACHE_CONTROL === 'true',
    responseTime: process.env.RESPONSE_TIME === 'true',
  },

  // 测试配置
  test: {
    dbName: process.env.TEST_DB_NAME || 'fbautobot_test',
    dbSync: process.env.TEST_DB_SYNC === 'true',
    dbDropSchema: process.env.TEST_DB_DROP_SCHEMA === 'true',
  },
});