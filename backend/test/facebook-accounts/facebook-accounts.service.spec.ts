import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { FacebookAccountsService } from '../../src/modules/facebook-accounts/facebook-accounts.service';
import { FacebookAccount } from '../../src/modules/facebook-accounts/entities/facebook-account.entity';

describe('FacebookAccountsService', () => {
  let service: FacebookAccountsService;
  let configService: ConfigService;

  const mockFacebookAccountRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    })),
    find: jest.fn(),
    update: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookAccountsService,
        {
          provide: getRepositoryToken(FacebookAccount),
          useValue: mockFacebookAccountRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<FacebookAccountsService>(FacebookAccountsService);
    configService = module.get<ConfigService>(ConfigService);

    // 重置所有模拟函数
    jest.clearAllMocks();

    // 配置模拟返回值
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'encryption.secret') {
        return 'test-encryption-secret';
      }
      return null;
    });
  });

  describe('create', () => {
    it('应该成功创建Facebook账号', async () => {
      const userId = 'user-123';
      const createDto = {
        facebookId: '123456789012345',
        name: 'Test Facebook Account',
        accessToken: 'EAAG...',
        accessTokenExpiresAt: '2026-05-12T10:30:00Z',
        accountType: 'user' as const,
      };

      const mockAccount = {
        id: 'account-123',
        userId,
        facebookId: createDto.facebookId,
        name: createDto.name,
        accessToken: 'encrypted-token',
        accessTokenExpiresAt: new Date(createDto.accessTokenExpiresAt),
        accountType: createDto.accountType,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {},
        isActive: jest.fn().mockReturnValue(true),
        needsRefresh: jest.fn().mockReturnValue(false),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(null);
      mockFacebookAccountRepository.create.mockReturnValue(mockAccount);
      mockFacebookAccountRepository.save.mockResolvedValue(mockAccount);

      const result = await service.create(userId, createDto);

      expect(result).toEqual(expect.objectContaining({
        id: 'account-123',
        userId,
        facebookId: createDto.facebookId,
        name: createDto.name,
        accountType: createDto.accountType,
        status: 'active',
        isActive: true,
        isTokenExpiring: false,
      }));
      expect(mockFacebookAccountRepository.findOne).toHaveBeenCalledWith({
        where: { facebookId: createDto.facebookId },
        withDeleted: true,
      });
      expect(mockFacebookAccountRepository.create).toHaveBeenCalled();
      expect(mockFacebookAccountRepository.save).toHaveBeenCalled();
    });

    it('应该抛出冲突异常当Facebook账号已存在', async () => {
      const userId = 'user-123';
      const createDto = {
        facebookId: '123456789012345',
        name: 'Test Facebook Account',
        accessToken: 'EAAG...',
        accessTokenExpiresAt: '2026-05-12T10:30:00Z',
        accountType: 'user' as const,
      };

      const existingAccount = {
        id: 'existing-account',
        userId: 'different-user',
        deletedAt: null,
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);

      await expect(service.create(userId, createDto)).rejects.toThrow(ConflictException);
    });

    it('应该抛出冲突异常当Facebook账号已被删除', async () => {
      const userId = 'user-123';
      const createDto = {
        facebookId: '123456789012345',
        name: 'Test Facebook Account',
        accessToken: 'EAAG...',
        accessTokenExpiresAt: '2026-05-12T10:30:00Z',
        accountType: 'user' as const,
      };

      const deletedAccount = {
        id: 'deleted-account',
        userId,
        deletedAt: new Date(),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(deletedAccount);

      await expect(service.create(userId, createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllByUser', () => {
    it('应该返回用户的Facebook账号列表', async () => {
      const userId = 'user-123';
      const page = 1;
      const limit = 20;

      const mockAccounts = [
        {
          id: 'account-1',
          userId,
          facebookId: '123456789012345',
          name: 'Account 1',
          accountType: 'user' as const,
          status: 'active' as const,
          verified: false,
          config: {},
          metadata: {},
          accessTokenExpiresAt: new Date('2026-05-12T10:30:00Z'),
          isActive: jest.fn().mockReturnValue(true),
          needsRefresh: jest.fn().mockReturnValue(false),
        },
        {
          id: 'account-2',
          userId,
          facebookId: '234567890123456',
          name: 'Account 2',
          accountType: 'page' as const,
          status: 'active' as const,
          verified: true,
          config: {},
          metadata: {},
          accessTokenExpiresAt: new Date('2026-05-13T10:30:00Z'),
          isActive: jest.fn().mockReturnValue(true),
          needsRefresh: jest.fn().mockReturnValue(true),
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockAccounts),
      };

      mockFacebookAccountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAllByUser(userId, page, limit);

      expect(result).toEqual({
        accounts: [
          expect.objectContaining({
            id: 'account-1',
            name: 'Account 1',
            isActive: true,
            isTokenExpiring: false,
          }),
          expect.objectContaining({
            id: 'account-2',
            name: 'Account 2',
            isActive: true,
            isTokenExpiring: true,
          }),
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('account.userId = :userId', { userId });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('account.deletedAt IS NULL');
    });

    it('应该应用过滤器', async () => {
      const userId = 'user-123';
      const filters = {
        status: 'active',
        accountType: 'page',
        verified: true,
        search: 'business',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockFacebookAccountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.findAllByUser(userId, 1, 20, filters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('account.status = :status', {
        status: 'active',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('account.accountType = :accountType', {
        accountType: 'page',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('account.verified = :verified', {
        verified: true,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(account.name ILIKE :search OR account.email ILIKE :search OR account.facebookId ILIKE :search)',
        { search: '%business%' },
      );
    });
  });

  describe('findOne', () => {
    it('应该返回指定的Facebook账号', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';

      const mockAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Test Account',
        accountType: 'user' as const,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {},
        accessTokenExpiresAt: new Date('2026-05-12T10:30:00Z'),
        isActive: jest.fn().mockReturnValue(true),
        needsRefresh: jest.fn().mockReturnValue(false),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(mockAccount);

      const result = await service.findOne(userId, accountId);

      expect(result).toEqual(expect.objectContaining({
        id: accountId,
        userId,
        name: 'Test Account',
        isActive: true,
      }));
      expect(mockFacebookAccountRepository.findOne).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
    });

    it('应该抛出未找到异常当账号不存在', async () => {
      const userId = 'user-123';
      const accountId = 'nonexistent-account';

      mockFacebookAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(userId, accountId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('应该成功更新Facebook账号', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';
      const updateDto = {
        name: 'Updated Account Name',
        status: 'active' as const,
      };

      const existingAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Original Name',
        accountType: 'user' as const,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {},
        accessToken: 'encrypted-token',
        accessTokenExpiresAt: new Date('2026-05-12T10:30:00Z'),
        isActive: jest.fn().mockReturnValue(true),
        needsRefresh: jest.fn().mockReturnValue(false),
      };

      const updatedAccount = {
        ...existingAccount,
        name: updateDto.name,
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);
      mockFacebookAccountRepository.save.mockResolvedValue(updatedAccount);

      const result = await service.update(userId, accountId, updateDto);

      expect(result).toEqual(expect.objectContaining({
        id: accountId,
        name: 'Updated Account Name',
      }));
      expect(mockFacebookAccountRepository.findOne).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(mockFacebookAccountRepository.save).toHaveBeenCalled();
    });

    it('应该更新访问令牌', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';
      const updateDto = {
        accessToken: 'new-access-token',
        accessTokenExpiresAt: '2026-06-12T10:30:00Z',
      };

      const existingAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Test Account',
        accountType: 'user' as const,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {},
        accessToken: 'old-encrypted-token',
        accessTokenExpiresAt: new Date('2026-05-12T10:30:00Z'),
        isActive: jest.fn().mockReturnValue(true),
        needsRefresh: jest.fn().mockReturnValue(false),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);
      mockFacebookAccountRepository.save.mockResolvedValue(existingAccount);

      await service.update(userId, accountId, updateDto);

      expect(mockFacebookAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: expect.any(String), // 应该是加密后的新令牌
        }),
      );
    });
  });

  describe('remove', () => {
    it('应该成功删除Facebook账号', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';

      const existingAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Test Account',
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);
      mockFacebookAccountRepository.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove(userId, accountId);

      expect(mockFacebookAccountRepository.findOne).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
      expect(mockFacebookAccountRepository.softDelete).toHaveBeenCalledWith(accountId);
    });

    it('应该抛出未找到异常当账号不存在', async () => {
      const userId = 'user-123';
      const accountId = 'nonexistent-account';

      mockFacebookAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(userId, accountId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('refreshAccessToken', () => {
    it('应该成功刷新访问令牌', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';
      const newAccessToken = 'new-access-token';
      const newExpiresAt = '2026-06-12T10:30:00Z';
      const newRefreshToken = 'new-refresh-token';

      const existingAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Test Account',
        accountType: 'user' as const,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {},
        accessToken: 'old-encrypted-token',
        accessTokenExpiresAt: new Date('2026-05-12T10:30:00Z'),
        refreshToken: 'old-refresh-token',
        syncStatus: 'failed' as const,
        syncError: 'Token expired',
        isActive: jest.fn().mockReturnValue(true),
        needsRefresh: jest.fn().mockReturnValue(true),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);
      mockFacebookAccountRepository.save.mockResolvedValue({
        ...existingAccount,
        status: 'active',
        syncStatus: 'success',
        syncError: null,
      });

      const result = await service.refreshAccessToken(
        userId,
        accountId,
        newAccessToken,
        newExpiresAt,
        newRefreshToken,
      );

      expect(result).toEqual(expect.objectContaining({
        id: accountId,
        status: 'active',
        syncStatus: 'success',
        syncError: null,
      }));
      expect(mockFacebookAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: expect.any(String), // 应该是加密后的新令牌
          status: 'active',
          syncStatus: 'success',
          syncError: null,
        }),
      );
    });
  });

  describe('syncAccount', () => {
    it('应该成功同步账号信息', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';

      const existingAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Test Account',
        accountType: 'user' as const,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {},
        accessTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 未来24小时
        lastSyncedAt: null,
        syncStatus: 'pending' as const,
        syncError: null,
        isTokenExpired: jest.fn().mockReturnValue(false),
        isActive: jest.fn().mockReturnValue(true),
        needsRefresh: jest.fn().mockReturnValue(false),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);
      mockFacebookAccountRepository.save.mockResolvedValue({
        ...existingAccount,
        lastSyncedAt: new Date(),
        syncStatus: 'success',
      });

      const result = await service.syncAccount(userId, accountId);

      expect(result).toEqual(expect.objectContaining({
        id: accountId,
        syncStatus: 'success',
      }));
      expect(mockFacebookAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSyncedAt: expect.any(Date),
          syncStatus: 'success',
          syncError: null,
        }),
      );
    });

    it('应该抛出错误当令牌已过期', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';

      const existingAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Test Account',
        accountType: 'user' as const,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {},
        accessTokenExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 过去24小时
        lastSyncedAt: null,
        syncStatus: 'pending' as const,
        syncError: null,
        isTokenExpired: jest.fn().mockReturnValue(true),
        isActive: jest.fn().mockReturnValue(true),
        needsRefresh: jest.fn().mockReturnValue(false),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);
      mockFacebookAccountRepository.save.mockResolvedValue({
        ...existingAccount,
        status: 'expired',
        syncStatus: 'failed',
        syncError: '访问令牌已过期',
      });

      await expect(service.syncAccount(userId, accountId)).rejects.toThrow(BadRequestException);
      expect(mockFacebookAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'expired',
          syncStatus: 'failed',
          syncError: '访问令牌已过期',
        }),
      );
    });
  });

  describe('getExpiringAccounts', () => {
    it('应该返回即将过期的账号', async () => {
      const userId = 'user-123';
      const thresholdHours = 24;

      const mockAccounts = [
        {
          id: 'account-1',
          userId,
          facebookId: '123456789012345',
          name: 'Expiring Account',
          accountType: 'user' as const,
          status: 'active' as const,
          verified: false,
          config: {},
          metadata: {},
          accessTokenExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 未来12小时
          isActive: jest.fn().mockReturnValue(true),
          needsRefresh: jest.fn().mockReturnValue(true),
        },
      ];

      mockFacebookAccountRepository.find.mockResolvedValue(mockAccounts);

      const result = await service.getExpiringAccounts(userId, thresholdHours);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        id: 'account-1',
        name: 'Expiring Account',
        isTokenExpiring: true,
      }));
      expect(mockFacebookAccountRepository.find).toHaveBeenCalledWith({
        where: {
          userId,
          status: 'active',
          accessTokenExpiresAt: expect.any(Object),
          deletedAt: null,
        },
      });
    });
  });

  describe('getStats', () => {
    it('应该返回账号统计信息', async () => {
      const userId = 'user-123';

      const mockAccounts = [
        {
          id: 'account-1',
          userId,
          facebookId: '123456789012345',
          name: 'Account 1',
          accountType: 'user' as const,
          status: 'active' as const,
          verified: false,
          config: {},
          metadata: {},
          accessTokenExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        },
        {
          id: 'account-2',
          userId,
          facebookId: '234567890123456',
          name: 'Account 2',
          accountType: 'page' as const,
          status: 'active' as const,
          verified: true,
          config: {},
          metadata: {},
          accessTokenExpiresAt: new Date(Date.now() + 36 * 60 * 60 * 1000),
        },
        {
          id: 'account-3',
          userId,
          facebookId: '345678901234567',
          name: 'Account 3',
          accountType: 'business' as const,
          status: 'expired' as const,
          verified: true,
          config: {},
          metadata: {},
          accessTokenExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockAccounts),
      };

      mockFacebookAccountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getStats(userId);

      expect(result).toEqual({
        totalAccounts: 3,
        activeAccounts: 2,
        expiredAccounts: 1,
        pageAccounts: 1,
        businessAccounts: 1,
        verifiedAccounts: 2,
        expiringSoon: 1, // account-1 在未来24小时内过期
      });
    });
  });

  describe('getDecryptedAccessToken', () => {
    it('应该返回解密的访问令牌', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';
      const encryptedToken = 'iv:encrypted:authTag';
      const decryptedToken = 'decrypted-access-token';

      const existingAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Test Account',
        accountType: 'user' as const,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {
          permissions: ['pages_manage_posts'],
        },
        accessToken: encryptedToken,
        accessTokenExpiresAt: new Date('2026-05-12T10:30:00Z'),
        hasPermission: jest.fn().mockImplementation(function(permission) {
          return this.metadata.permissions.includes(permission);
        }),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);

      // 模拟解密函数（实际服务中会调用解密方法）
      jest.spyOn(service as any, 'decryptData').mockReturnValue(decryptedToken);

      const result = await service.getDecryptedAccessToken(userId, accountId);

      expect(result).toBe(decryptedToken);
      expect(mockFacebookAccountRepository.findOne).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      });
    });

    it('应该抛出未找到异常当账号不存在', async () => {
      const userId = 'user-123';
      const accountId = 'nonexistent-account';

      mockFacebookAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.getDecryptedAccessToken(userId, accountId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('应该抛出禁止异常当没有权限', async () => {
      const userId = 'user-123';
      const accountId = 'account-123';

      const existingAccount = {
        id: accountId,
        userId,
        facebookId: '123456789012345',
        name: 'Test Account',
        accountType: 'user' as const,
        status: 'active' as const,
        verified: false,
        config: {},
        metadata: {
          permissions: [], // 没有权限
        },
        accessToken: 'encrypted-token',
        accessTokenExpiresAt: new Date('2026-05-12T10:30:00Z'),
        hasPermission: jest.fn().mockReturnValue(false),
      };

      mockFacebookAccountRepository.findOne.mockResolvedValue(existingAccount);

      await expect(service.getDecryptedAccessToken(userId, accountId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
