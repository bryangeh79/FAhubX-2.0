import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { VPNClientModule } from '../../vpn-client.module';
import { VPNConfig } from '../../entities/vpn-config.entity';
import { IPPool } from '../../entities/ip-pool.entity';
import { AccountIPMapping } from '../../entities/account-ip-mapping.entity';
import { NetworkMonitorLog } from '../../entities/network-monitor-log.entity';

describe('VPNClient Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.TEST_DB_HOST || 'localhost',
          port: parseInt(process.env.TEST_DB_PORT || '5432'),
          username: process.env.TEST_DB_USERNAME || 'postgres',
          password: process.env.TEST_DB_PASSWORD || 'postgres',
          database: process.env.TEST_DB_NAME || 'facebook_auto_bot_test',
          entities: [VPNConfig, IPPool, AccountIPMapping, NetworkMonitorLog],
          synchronize: true,
          dropSchema: true,
        }),
        VPNClientModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('VPN Config Management', () => {
    let vpnConfigId: string;

    it('should create VPN config', async () => {
      const response = await request(app.getHttpServer())
        .post('/vpn-ip/configs')
        .send({
          name: 'Test VPN Config',
          type: 'openvpn',
          config: {
            server: 'vpn.example.com',
            port: 1194,
            username: 'testuser',
            password: 'testpass',
          },
          serverLocation: 'US',
          countryCode: 'US',
          provider: 'Test Provider',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test VPN Config');
      expect(response.body.type).toBe('openvpn');
      expect(response.body.status).toBe('inactive');

      vpnConfigId = response.body.id;
    });

    it('should get VPN config list', async () => {
      const response = await request(app.getHttpServer())
        .get('/vpn-ip/configs')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should get VPN config by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/vpn-ip/configs/${vpnConfigId}`)
        .expect(200);

      expect(response.body.config.id).toBe(vpnConfigId);
      expect(response.body.config.name).toBe('Test VPN Config');
    });

    it('should update VPN config', async () => {
      const response = await request(app.getHttpServer())
        .put(`/vpn-ip/configs/${vpnConfigId}`)
        .send({
          name: 'Updated VPN Config',
          healthScore: 90,
        })
        .expect(200);

      expect(response.body.config.name).toBe('Updated VPN Config');
      expect(response.body.config.healthScore).toBe(90);
    });
  });

  describe('IP Pool Management', () => {
    let vpnConfigId: string;
    let ipPoolId: string;

    beforeAll(async () => {
      // 先创建VPN配置
      const vpnResponse = await request(app.getHttpServer())
        .post('/vpn-ip/configs')
        .send({
          name: 'IP Test VPN',
          type: 'openvpn',
          config: {},
        });

      vpnConfigId = vpnResponse.body.id;
    });

    it('should add IP to pool', async () => {
      const response = await request(app.getHttpServer())
        .post('/vpn-ip/ip-pools')
        .send({
          vpnConfigId,
          ipAddress: '192.168.1.100',
          type: 'residential',
          countryCode: 'US',
          city: 'New York',
          isp: 'Test ISP',
          healthScore: 85,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.ipAddress).toBe('192.168.1.100');
      expect(response.body.status).toBe('available');

      ipPoolId = response.body.id;
    });

    it('should get IP pool list', async () => {
      const response = await request(app.getHttpServer())
        .get('/vpn-ip/ip-pools')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should get IP pool by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/vpn-ip/ip-pools/${ipPoolId}`)
        .expect(200);

      expect(response.body.id).toBe(ipPoolId);
      expect(response.body.ipAddress).toBe('192.168.1.100');
    });

    it('should update IP pool', async () => {
      const response = await request(app.getHttpServer())
        .put(`/vpn-ip/ip-pools/${ipPoolId}`)
        .send({
          healthScore: 95,
          averageLatency: 50,
        })
        .expect(200);

      expect(response.body.healthScore).toBe(95);
      expect(response.body.averageLatency).toBe(50);
    });
  });

  describe('IP Assignment', () => {
    let vpnConfigId: string;
    let ipPoolId: string;
    const accountId = 'test-account-123';

    beforeAll(async () => {
      // 创建VPN配置
      const vpnResponse = await request(app.getHttpServer())
        .post('/vpn-ip/configs')
        .send({
          name: 'Assignment Test VPN',
          type: 'openvpn',
          config: {},
        });

      vpnConfigId = vpnResponse.body.id;

      // 添加IP到池中
      const ipResponse = await request(app.getHttpServer())
        .post('/vpn-ip/ip-pools')
        .send({
          vpnConfigId,
          ipAddress: '10.0.0.100',
          type: 'residential',
          countryCode: 'US',
          healthScore: 90,
        });

      ipPoolId = ipResponse.body.id;
    });

    it('should assign IP to account', async () => {
      const response = await request(app.getHttpServer())
        .post('/vpn-ip/ip-pools/assign')
        .send({
          accountId,
          ipPoolId,
          connectionType: 'fixed',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('assigned');
      expect(response.body.assignedTo).toBe(accountId);
    });

    it('should get account network status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/vpn-ip/network/status/${accountId}`)
        .expect(200);

      expect(response.body.connected).toBe(true);
      expect(response.body.ipAddress).toBe('10.0.0.100');
    });

    it('should release IP from account', async () => {
      const response = await request(app.getHttpServer())
        .post('/vpn-ip/ip-pools/release')
        .send({
          accountId,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should rotate IP for account', async () => {
      // 先分配一个IP
      await request(app.getHttpServer())
        .post('/vpn-ip/ip-pools/assign')
        .send({
          accountId,
          ipPoolId,
        });

      const response = await request(app.getHttpServer())
        .post('/vpn-ip/ip-pools/rotate')
        .send({
          accountId,
          reason: 'test rotation',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('assigned');
    });
  });

  describe('Network Monitoring', () => {
    it('should get network metrics', async () => {
      const response = await request(app.getHttpServer())
        .get('/vpn-ip/network/monitor/metrics')
        .query({ timeRange: '24h' })
        .expect(200);

      expect(response.body).toHaveProperty('timeRange', '24h');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('alerts');
      expect(response.body).toHaveProperty('summary');
    });

    it('should get network alerts', async () => {
      const response = await request(app.getHttpServer())
        .get('/vpn-ip/network/monitor/alerts')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should run network test', async () => {
      const response = await request(app.getHttpServer())
        .post('/vpn-ip/network/monitor/test')
        .query({ ipAddress: '8.8.8.8' })
        .expect(201);

      expect(response.body).toHaveProperty('ipAddress', '8.8.8.8');
      expect(response.body).toHaveProperty('healthScore');
      expect(response.body).toHaveProperty('status');
    });
  });

  describe('Network Automation', () => {
    it('should auto connect to best VPN', async () => {
      const accountId = 'auto-connect-test-123';

      const response = await request(app.getHttpServer())
        .post('/vpn-ip/network/auto-connect')
        .query({ accountId, taskType: 'login' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('assigned');
    });
  });
});