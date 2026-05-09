import 'reflect-metadata';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.ENCRYPTION_SECRET = 'test-encryption-secret';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'fbautobot_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'password';