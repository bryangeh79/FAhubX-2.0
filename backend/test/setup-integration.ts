import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

// 测试用户数据
export const TEST_USERS = {
  admin: {
    email: 'admin@fbautobot.com',
    password: 'Admin123!',
    username: 'admin',
    fullName: '系统管理员',
  },
  test: {
    email: 'test@fbautobot.com',
    password: 'Test123!',
    username: 'testuser',
    fullName: '测试用户',
  },
};

// 测试Facebook账号数据
export const TEST_FACEBOOK_ACCOUNTS = [
  {
    username: 'test_account_1',
    displayName: '测试账号1',
    email: 'test1@example.com',
    tags: ['测试', '个人'],
  },
  {
    username: 'test_account_2',
    displayName: '测试账号2',
    email: 'test2@example.com',
    tags: ['测试', '商业'],
  },
];

// 测试对话剧本数据
export const TEST_CONVERSATION_SCRIPTS = [
  {
    name: '测试问候剧本',
    description: '用于测试的问候对话剧本',
    category: '问候',
    relationship: '好友',
    timeOfDay: '早晨',
    estimatedDuration: 5,
    difficulty: '简单',
    tags: ['测试', '问候'],
    flow: [
      { type: 'message', content: '你好！', delay: 1000 },
      { type: 'wait', duration: 2000 },
      { type: 'message', content: '今天过得怎么样？', delay: 1000 },
    ],
  },
];

/**
 * 创建测试应用实例
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  
  // 应用全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * 清理数据库
 */
export async function cleanupDatabase(dataSource: DataSource) {
  const queryRunner = dataSource.createQueryRunner();
  
  try {
    await queryRunner.connect();
    
    // 禁用外键约束
    await queryRunner.query('SET session_replication_role = replica;');
    
    // 获取所有表（排除系统表）
    const tables = await queryRunner.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%' 
      AND tablename NOT LIKE 'sql_%'
    `);
    
    // 清空所有表
    for (const table of tables) {
      await queryRunner.query(`TRUNCATE TABLE "${table.tablename}" CASCADE;`);
    }
    
    // 重新启用外键约束
    await queryRunner.query('SET session_replication_role = origin;');
  } finally {
    await queryRunner.release();
  }
}

/**
 * 创建测试用户并获取访问令牌
 */
export async function createTestUser(
  app: INestApplication,
  userData: typeof TEST_USERS.admin,
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  // 先注册用户
  await request(app.getHttpServer())
    .post('/auth/register')
    .send(userData)
    .expect(201);

  // 登录获取令牌
  const loginResponse = await request(app.getHttpServer())
    .post('/auth/login')
    .send({
      email: userData.email,
      password: userData.password,
    })
    .expect(201);

  return {
    accessToken: loginResponse.body.access_token,
    refreshToken: loginResponse.body.refresh_token,
    userId: loginResponse.body.user.id,
  };
}

/**
 * 创建测试Facebook账号
 */
export async function createTestFacebookAccount(
  app: INestApplication,
  accessToken: string,
  accountData: typeof TEST_FACEBOOK_ACCOUNTS[0],
) {
  const response = await request(app.getHttpServer())
    .post('/facebook-accounts')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(accountData)
    .expect(201);

  return response.body;
}

/**
 * 创建测试对话剧本
 */
export async function createTestConversationScript(
  app: INestApplication,
  accessToken: string,
  scriptData: typeof TEST_CONVERSATION_SCRIPTS[0],
) {
  const response = await request(app.getHttpServer())
    .post('/conversation/scripts')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(scriptData)
    .expect(201);

  return response.body;
}

/**
 * 生成测试JWT令牌
 */
export function generateTestToken(
  jwtService: JwtService,
  payload: any = { sub: 'test-user-id', email: 'test@example.com' },
): string {
  return jwtService.sign(payload);
}

/**
 * 等待指定时间
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 验证响应数据结构
 */
export function validateResponseSchema(response: any, schema: any) {
  // 这里可以实现更复杂的schema验证
  // 目前只检查基本结构
  expect(response).toBeDefined();
  
  if (schema.statusCode) {
    expect(response.statusCode).toBe(schema.statusCode);
  }
  
  if (schema.message) {
    expect(response.message).toBe(schema.message);
  }
  
  if (schema.data) {
    expect(response.data).toBeDefined();
  }
}

/**
 * 测试工具类
 */
export class TestUtils {
  static generateRandomEmail(): string {
    return `test${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  }

  static generateRandomUsername(): string {
    return `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  static generateRandomString(length: number = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static generateRandomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

/**
 * 测试配置
 */
export const TEST_CONFIG = {
  timeout: 30000, // 测试超时时间
  database: {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    name: process.env.TEST_DB_NAME || 'fbautobot_test',
    user: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'password',
  },
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 10000,
  },
};

export default {
  createTestApp,
  cleanupDatabase,
  createTestUser,
  createTestFacebookAccount,
  createTestConversationScript,
  generateTestToken,
  wait,
  validateResponseSchema,
  TestUtils,
  TEST_CONFIG,
  TEST_USERS,
  TEST_FACEBOOK_ACCOUNTS,
  TEST_CONVERSATION_SCRIPTS,
};