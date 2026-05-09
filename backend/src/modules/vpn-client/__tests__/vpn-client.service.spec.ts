import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VPNClientService } from '../services/vpn-client.service';
import { VPNConfig, VPNType, VPNStatus } from '../entities/vpn-config.entity';
import { IPPool, IPStatus } from '../entities/ip-pool.entity';
import { AccountIPMapping, ConnectionStatus } from '../entities/account-ip-mapping.entity';
import { NetworkMonitorLog } from '../entities/network-monitor-log.entity';

describe('VPNClientService', () => {
  let service: VPNClientService;
  let vpnConfigRepository: Repository<VPNConfig>;
  let ipPoolRepository: Repository<IPPool>;
  let accountIPMappingRepository: Repository<AccountIPMapping>;
  let networkMonitorLogRepository: Repository<NetworkMonitorLog>;

  const mockVPNConfigRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn(),
    })),
  };

  const mockIPPoolRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    })),
  };

  const mockAccountIPMappingRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn(),
    })),
  };

  const mockNetworkMonitorLogRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
      getMany: jest.fn(),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VPNClientService,
        {
          provide: getRepositoryToken(VPNConfig),
          useValue: mockVPNConfigRepository,
        },
        {
          provide: getRepositoryToken(IPPool),
          useValue: mockIPPoolRepository,
        },
        {
          provide: getRepositoryToken(AccountIPMapping),
          useValue: mockAccountIPMappingRepository,
        },
        {
          provide: getRepositoryToken(NetworkMonitorLog),
          useValue: mockNetworkMonitorLogRepository,
        },
      ],
    }).compile();

    service = module.get<VPNClientService>(VPNClientService);
    vpnConfigRepository = module.get<Repository<VPNConfig>>(getRepositoryToken(VPNConfig));
    ipPoolRepository = module.get<Repository<IPPool>>(getRepositoryToken(IPPool));
    accountIPMappingRepository = module.get<Repository<AccountIPMapping>>(getRepositoryToken(AccountIPMapping));
    networkMonitorLogRepository = module.get<Repository<NetworkMonitorLog>>(getRepositoryToken(NetworkMonitorLog));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('allocateIP', () => {
    it('should allocate IP based on criteria', async () => {
      const mockIPPool: IPPool = {
        id: 'ip-123',
        ipAddress: '192.168.1.100',
        status: IPStatus.AVAILABLE,
        healthScore: 85,
        type: 'residential',
        countryCode: 'US',
        vpnConfigId: 'vpn-123',
        vpnConfig: null,
        port: null,
        city: null,
        isp: null,
        assignedTo: null,
        lastHealthCheck: null,
        totalConnections: 0,
        totalDuration: '0 seconds',
        averageLatency: 0,
        packetLoss: 0,
        bandwidth: 0,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCriteria = {
        accountId: 'account-123',
        taskType: 'login',
        riskLevel: 'high' as const,
        countryCode: 'US',
        ipType: 'residential' as const,
        minHealthScore: 80,
        maxLatency: 200,
      };

      mockIPPoolRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockIPPool),
      });

      mockIPPoolRepository.save.mockResolvedValue({
        ...mockIPPool,
        status: IPStatus.ASSIGNED,
        assignedTo: 'account-123',
      });

      mockAccountIPMappingRepository.create.mockReturnValue({
        id: 'mapping-123',
        accountId: 'account-123',
        ipPoolId: 'ip-123',
        vpnConfigId: 'vpn-123',
        connectionType: 'fixed',
        status: ConnectionStatus.ACTIVE,
        startTime: new Date(),
      });

      mockAccountIPMappingRepository.save.mockResolvedValue({
        id: 'mapping-123',
        accountId: 'account-123',
        ipPoolId: 'ip-123',
      });

      const result = await service.allocateIP(mockCriteria);

      expect(result).toBeDefined();
      expect(result.status).toBe(IPStatus.ASSIGNED);
      expect(result.assignedTo).toBe('account-123');
      expect(mockIPPoolRepository.save).toHaveBeenCalled();
      expect(mockAccountIPMappingRepository.save).toHaveBeenCalled();
    });

    it('should throw error when no IP matches criteria', async () => {
      const mockCriteria = {
        accountId: 'account-123',
        minHealthScore: 100, // 不可能达到的分数
      };

      mockIPPoolRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      await expect(service.allocateIP(mockCriteria)).rejects.toThrow('No available IP found matching criteria');
    });
  });

  describe('releaseIP', () => {
    it('should release IP and update mapping', async () => {
      const mockMapping = {
        id: 'mapping-123',
        accountId: 'account-123',
        ipPoolId: 'ip-123',
        status: ConnectionStatus.ACTIVE,
      };

      const mockIPPool = {
        id: 'ip-123',
        status: IPStatus.ASSIGNED,
        assignedTo: 'account-123',
      };

      mockAccountIPMappingRepository.findOne.mockResolvedValue(mockMapping);
      mockIPPoolRepository.findOne.mockResolvedValue(mockIPPool);

      await service.releaseIP('account-123', 'mapping-123');

      expect(mockIPPoolRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: IPStatus.AVAILABLE,
          assignedTo: null,
        })
      );

      expect(mockAccountIPMappingRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ConnectionStatus.DISCONNECTED,
          endTime: expect.any(Date),
        })
      );
    });

    it('should throw error when no active mapping found', async () => {
      mockAccountIPMappingRepository.findOne.mockResolvedValue(null);

      await expect(service.releaseIP('account-123')).rejects.toThrow('No active IP mapping found');
    });
  });

  describe('rotateIP', () => {
    it('should release old IP and allocate new one', async () => {
      const releaseSpy = jest.spyOn(service, 'releaseIP').mockResolvedValue();
      const allocateSpy = jest.spyOn(service, 'allocateIP').mockResolvedValue({
        id: 'ip-456',
        ipAddress: '192.168.1.200',
      } as any);

      await service.rotateIP('account-123', 'test rotation');

      expect(releaseSpy).toHaveBeenCalledWith('account-123', undefined);
      expect(allocateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account-123',
          reason: 'test rotation',
        })
      );
    });
  });

  describe('getAccountNetworkStatus', () => {
    it('should return network status for account', async () => {
      const mockMapping = {
        accountId: 'account-123',
        status: ConnectionStatus.ACTIVE,
        startTime: new Date(Date.now() - 3600000), // 1小时前
        ipPool: {
          ipAddress: '192.168.1.100',
          healthScore: 85,
        },
        vpnConfig: {
          name: 'Test VPN',
        },
        connectionType: 'fixed',
        currentLatency: 50,
        currentPacketLoss: 1,
        currentBandwidth: 100,
      };

      mockAccountIPMappingRepository.findOne.mockResolvedValue(mockMapping);

      const result = await service.getAccountNetworkStatus('account-123');

      expect(result).toEqual({
        connected: true,
        status: 'active',
        ipAddress: '192.168.1.100',
        vpnConfig: 'Test VPN',
        connectionType: 'fixed',
        startTime: expect.any(Date),
        duration: expect.any(Number),
        metrics: {
          latency: 50,
          jitter: 0,
          packetLoss: 1,
          bandwidth: {
            download: 100,
            upload: 0,
          },
          stability: 0,
        },
        healthScore: 85,
      });
    });

    it('should return disconnected status when no active mapping', async () => {
      mockAccountIPMappingRepository.findOne.mockResolvedValue(null);

      const result = await service.getAccountNetworkStatus('account-123');

      expect(result).toEqual({
        connected: false,
        status: 'no_active_connection',
      });
    });
  });

  describe('calculateHealthScore', () => {
    it('should calculate correct health score for good metrics', () => {
      const score = (service as any).calculateHealthScore(50, 2, 50);
      expect(score).toBe(100); // 40 + 30 + 30
    });

    it('should calculate correct health score for poor metrics', () => {
      const score = (service as any).calculateHealthScore(600, 25, 0.5);
      expect(score).toBe(10); // 0 + 0 + 10
    });

    it('should calculate correct health score for mixed metrics', () => {
      const score = (service as any).calculateHealthScore(150, 8, 8);
      expect(score).toBe(70); // 30 + 20 + 20
    });
  });
});