import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  cleanupDatabase,
  TEST_USERS,
  createTestUser,
} from '../setup-integration';

describe('认证模块集成测试', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let testUserTokens: { accessToken: string; refreshToken: string; userId: string };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    
    // 清理数据库
    await cleanupDatabase(dataSource);
    
    // 创建测试用户
    testUserTokens = await createTestUser(app, TEST_USERS.test);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('应该成功注册新用户', async () => {
      const userData = {
        email: `newuser${Date.now()}@example.com`,
        username: `newuser${Date.now()}`,
        password: 'Test123!',
        fullName: '新测试用户',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('注册成功');
    });

    it('应该拒绝无效的邮箱格式', async () => {
      const userData = {
        email: 'invalid-email',
        username: 'testuser',
        password: 'Test123!',
        fullName: '测试用户',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('邮箱');
    });

    it('应该拒绝弱密码', async () => {
      const userData = {
        email: 'test@example.com',
        username: 'testuser',
        password: '123', // 太短
        fullName: '测试用户',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('密码');
    });

    it('应该拒绝重复的邮箱', async () => {
      const userData = {
        email: TEST_USERS.test.email, // 已存在的邮箱
        username: 'differentuser',
        password: 'Test123!',
        fullName: '不同用户',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('已存在');
    });

    it('应该拒绝重复的用户名', async () => {
      const userData = {
        email: 'different@example.com',
        username: TEST_USERS.test.username, // 已存在的用户名
        password: 'Test123!',
        fullName: '不同用户',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('已存在');
    });
  });

  describe('POST /auth/login', () => {
    it('应该成功登录', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: TEST_USERS.test.password,
        })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email', TEST_USERS.test.email);
      expect(response.body.user).toHaveProperty('username', TEST_USERS.test.username);
    });

    it('应该拒绝错误的密码', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('密码');
    });

    it('应该拒绝不存在的用户', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('用户');
    });

    it('应该验证请求参数', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          // 缺少email和password
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(Array.isArray(response.body.message)).toBe(true);
    });
  });

  describe('POST /auth/refresh', () => {
    it('应该成功刷新令牌', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: testUserTokens.refreshToken,
        })
        .expect(201);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(typeof response.body.access_token).toBe('string');
      expect(typeof response.body.refresh_token).toBe('string');
    });

    it('应该拒绝无效的刷新令牌', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('无效');
    });

    it('应该拒绝过期的刷新令牌', async () => {
      // 注意：这个测试需要模拟过期的令牌
      // 目前只测试缺少令牌的情况
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          // 缺少refreshToken
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/logout', () => {
    it('应该成功登出', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${testUserTokens.accessToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('成功');
    });

    it('应该拒绝未认证的请求', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('未授权');
    });

    it('登出后令牌应该失效', async () => {
      // 先登出
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${testUserTokens.accessToken}`)
        .expect(201);

      // 尝试使用已失效的令牌访问受保护端点
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${testUserTokens.accessToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/logout-all', () => {
    it('应该成功登出所有设备', async () => {
      // 先创建另一个会话
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: TEST_USERS.test.password,
        })
        .expect(201);

      const newAccessToken = loginResponse.body.access_token;

      // 登出所有设备
      const response = await request(app.getHttpServer())
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('所有设备');

      // 验证令牌已失效
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(401);
    });
  });

  describe('GET /auth/profile', () => {
    it('应该获取当前用户信息', async () => {
      // 重新登录获取新令牌
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: TEST_USERS.test.password,
        })
        .expect(201);

      const accessToken = loginResponse.body.access_token;

      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', TEST_USERS.test.email);
      expect(response.body).toHaveProperty('username', TEST_USERS.test.username);
      expect(response.body).toHaveProperty('fullName', TEST_USERS.test.fullName);
      expect(response.body).toHaveProperty('emailVerified');
      expect(response.body).toHaveProperty('preferences');
    });

    it('应该拒绝未认证的请求', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .expect(401);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('GET /auth/sessions', () => {
    it('应该获取用户会话列表', async () => {
      // 重新登录获取新令牌
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: TEST_USERS.test.password,
        })
        .expect(201);

      const accessToken = loginResponse.body.access_token;

      const response = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('id');
        expect(response.body[0]).toHaveProperty('userAgent');
        expect(response.body[0]).toHaveProperty('ipAddress');
        expect(response.body[0]).toHaveProperty('createdAt');
      }
    });
  });

  describe('DELETE /auth/sessions/:sessionId', () => {
    it('应该撤销特定会话', async () => {
      // 重新登录获取新令牌和会话
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: TEST_USERS.test.password,
        })
        .expect(201);

      const accessToken = loginResponse.body.access_token;

      // 获取会话列表
      const sessionsResponse = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      if (sessionsResponse.body.length > 0) {
        const sessionId = sessionsResponse.body[0].id;

        const response = await request(app.getHttpServer())
          .delete(`/auth/sessions/${sessionId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('成功');
      }
    });
  });

  describe('PATCH /auth/change-password', () => {
    it('应该成功更改密码', async () => {
      // 重新登录获取新令牌
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: TEST_USERS.test.password,
        })
        .expect(201);

      const accessToken = loginResponse.body.access_token;

      const response = await request(app.getHttpServer())
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: TEST_USERS.test.password,
          newPassword: 'NewTest123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('成功');

      // 验证新密码可以登录
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: 'NewTest123!',
        })
        .expect(201);

      // 改回原密码以便其他测试
      await request(app.getHttpServer())
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'NewTest123!',
          newPassword: TEST_USERS.test.password,
        })
        .expect(200);
    });

    it('应该拒绝错误的当前密码', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: TEST_USERS.test.email,
          password: TEST_USERS.test.password,
        })
        .expect(201);

      const accessToken = loginResponse.body.access_token;

      const response = await request(app.getHttpServer())
        .patch('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewTest123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('密码');
    });
  });

  describe('POST /auth/request-password-reset', () => {
    it('应该成功请求密码重置', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/request-password-reset')
        .send({
          email: TEST_USERS.test.email,
        })
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('发送');
    });

    it('应该处理不存在的邮箱', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/request-password-reset')
        .send({
          email: 'nonexistent@example.com',
        })
        .expect(201); // 出于安全考虑，即使邮箱不存在也返回成功

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/reset-password', () => {
    it('应该验证重置令牌参数', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          // 缺少token和newPassword
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    // 注意：实际的重置密码测试需要有效的重置令牌
    // 这通常通过模拟邮件服务来实现
  });
});