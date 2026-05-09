import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';

import { AuthService } from '../../src/modules/auth/auth.service';
import { UsersService } from '../../src/modules/users/users.service';
import { UserSessionService } from '../../src/modules/auth/user-session.service';
import { User } from '../../src/modules/users/entities/user.entity';
import { UserSession } from '../../src/modules/auth/entities/user-session.entity';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: UsersService;
  let userSessionService: UserSessionService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    validatePassword: jest.fn(),
    updateLoginStats: jest.fn(),
    findOne: jest.fn(),
    updatePassword: jest.fn(),
  };

  const mockUserSessionService = {
    createSession: jest.fn(),
    validateSession: jest.fn(),
    updateAccessToken: jest.fn(),
    revokeSession: jest.fn(),
    revokeAllSessions: jest.fn(),
    validateAccessToken: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockUserSessionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: UserSessionService,
          useValue: mockUserSessionService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(UserSession),
          useValue: mockUserSessionRepository,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    userSessionService = module.get<UserSessionService>(UserSessionService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);

    // 重置所有模拟函数
    jest.clearAllMocks();

    // 配置模拟返回值
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'jwt.secret':
          return 'test-secret';
        case 'jwt.expiresIn':
          return '1h';
        case 'jwt.refreshSecret':
          return 'test-refresh-secret';
        case 'jwt.refreshExpiresIn':
          return '7d';
        default:
          return null;
      }
    });
  });

  describe('register', () => {
    it('应该成功注册新用户', async () => {
      const registerDto = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        fullName: 'Test User',
        timezone: 'Asia/Kuala_Lumpur',
        language: 'en',
        acceptTerms: true,
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        status: 'active',
      };

      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresIn: 3600,
        tokenType: 'Bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          fullName: 'Test User',
        },
      };

      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValueOnce('access-token-123');
      mockJwtService.signAsync.mockResolvedValueOnce('refresh-token-123');
      mockUserSessionService.createSession.mockResolvedValue({});

      const result = await authService.register(registerDto);

      expect(result).toEqual(mockTokens);
      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersService.create).toHaveBeenCalledWith(expect.objectContaining({
        email: registerDto.email,
        username: registerDto.username,
        password: registerDto.password,
        confirmPassword: registerDto.confirmPassword,
        fullName: registerDto.fullName,
        timezone: registerDto.timezone,
        language: registerDto.language,
        acceptTerms: registerDto.acceptTerms,
      }));
      expect(userSessionService.createSession).toHaveBeenCalled();
    });

    it('应该抛出冲突异常当邮箱已存在', async () => {
      const registerDto = {
        email: 'existing@example.com',
        username: 'testuser',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        acceptTerms: true,
      };

      mockUsersService.findByEmail.mockResolvedValue({ id: 'existing-user' });

      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('应该成功登录', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        status: 'active',
      };

      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresIn: 3600,
        tokenType: 'Bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
        },
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);
      mockUsersService.updateLoginStats.mockResolvedValue(undefined);
      mockJwtService.signAsync.mockResolvedValueOnce('access-token-123');
      mockJwtService.signAsync.mockResolvedValueOnce('refresh-token-123');
      mockUserSessionService.createSession.mockResolvedValue({});

      const result = await authService.login(loginDto);

      expect(result).toEqual(mockTokens);
      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(usersService.validatePassword).toHaveBeenCalledWith(mockUser, loginDto.password);
      expect(usersService.updateLoginStats).toHaveBeenCalledWith(mockUser.id);
      expect(userSessionService.createSession).toHaveBeenCalled();
    });

    it('应该抛出未授权异常当用户不存在', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'Password123!',
      };

      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(usersService.validatePassword).not.toHaveBeenCalled();
    });

    it('应该抛出未授权异常当密码错误', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword123!',
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        status: 'active',
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(false);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersService.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(usersService.validatePassword).toHaveBeenCalledWith(mockUser, loginDto.password);
    });

    it('应该抛出未授权异常当账号被禁用', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        status: 'suspended',
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('应该成功刷新令牌', async () => {
      const refreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      };

      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
      };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        status: 'active',
      };

      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        refreshToken: 'valid-refresh-token',
      };

      const mockTokens = {
        accessToken: 'new-access-token-123',
        refreshToken: 'new-refresh-token-123',
        expiresIn: 3600,
        tokenType: 'Bearer',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
        },
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUserSessionService.validateSession.mockResolvedValue(mockSession);
      mockJwtService.signAsync.mockResolvedValueOnce('new-access-token-123');
      mockJwtService.signAsync.mockResolvedValueOnce('new-refresh-token-123');
      mockUserSessionService.updateAccessToken.mockResolvedValue({});

      const result = await authService.refreshToken(refreshTokenDto);

      expect(result).toEqual(mockTokens);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(refreshTokenDto.refreshToken, {
        secret: 'test-refresh-secret',
      });
      expect(usersService.findOne).toHaveBeenCalledWith(mockPayload.sub);
      expect(userSessionService.validateSession).toHaveBeenCalledWith(
        mockUser.id,
        refreshTokenDto.refreshToken,
      );
      expect(userSessionService.updateAccessToken).toHaveBeenCalled();
    });

    it('应该抛出未授权异常当刷新令牌过期', async () => {
      const refreshTokenDto = {
        refreshToken: 'expired-refresh-token',
      };

      mockJwtService.verifyAsync.mockRejectedValue({
        name: 'TokenExpiredError',
        message: 'Token expired',
      });

      await expect(authService.refreshToken(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });

    it('应该抛出未授权异常当用户不存在', async () => {
      const refreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      };

      const mockPayload = {
        sub: 'nonexistent-user',
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockUsersService.findOne.mockResolvedValue(null);

      await expect(authService.refreshToken(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });

    it('应该抛出未授权异常当会话无效', async () => {
      const refreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      };

      const mockPayload = {
        sub: 'user-123',
      };

      const mockUser = {
        id: 'user-123',
        status: 'active',
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUserSessionService.validateSession.mockResolvedValue(null);

      await expect(authService.refreshToken(refreshTokenDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('应该成功登出', async () => {
      const userId = 'user-123';
      const accessToken = 'access-token-123';

      mockUserSessionService.revokeSession.mockResolvedValue(undefined);

      await authService.logout(userId, accessToken);

      expect(userSessionService.revokeSession).toHaveBeenCalledWith(userId, accessToken);
    });
  });

  describe('logoutAll', () => {
    it('应该成功登出所有设备', async () => {
      const userId = 'user-123';

      mockUserSessionService.revokeAllSessions.mockResolvedValue(undefined);

      await authService.logoutAll(userId);

      expect(userSessionService.revokeAllSessions).toHaveBeenCalledWith(userId);
    });
  });

  describe('changePassword', () => {
    it('应该成功更改密码', async () => {
      const userId = 'user-123';
      const currentPassword = 'CurrentPassword123!';
      const newPassword = 'NewPassword123!';

      const mockUser = {
        id: 'user-123',
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);
      mockUsersService.updatePassword.mockResolvedValue(undefined);
      mockUserSessionService.revokeAllSessions.mockResolvedValue(undefined);

      await authService.changePassword(userId, currentPassword, newPassword);

      expect(usersService.findOne).toHaveBeenCalledWith(userId);
      expect(usersService.validatePassword).toHaveBeenCalledWith(mockUser, currentPassword);
      expect(usersService.updatePassword).toHaveBeenCalledWith(userId, newPassword);
      expect(userSessionService.revokeAllSessions).toHaveBeenCalledWith(userId);
    });

    it('应该抛出错误当当前密码错误', async () => {
      const userId = 'user-123';
      const currentPassword = 'WrongPassword123!';
      const newPassword = 'NewPassword123!';

      const mockUser = {
        id: 'user-123',
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(false);

      await expect(
        authService.changePassword(userId, currentPassword, newPassword),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateAccessToken', () => {
    it('应该成功验证访问令牌', async () => {
      const token = 'valid-access-token';
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockUserSessionService.validateAccessToken.mockResolvedValue(true);

      const result = await authService.validateAccessToken(token);

      expect(result).toEqual(mockPayload);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(token, {
        secret: 'test-secret',
      });
      expect(userSessionService.validateAccessToken).toHaveBeenCalledWith(
        mockPayload.sub,
        token,
      );
    });

    it('应该抛出未授权异常当令牌过期', async () => {
      const token = 'expired-access-token';

      mockJwtService.verifyAsync.mockRejectedValue({
        name: 'TokenExpiredError',
        message: 'Token expired',
      });

      await expect(authService.validateAccessToken(token)).rejects.toThrow(UnauthorizedException);
    });

    it('应该抛出未授权异常当令牌无效', async () => {
      const token = 'invalid-access-token';

      mockJwtService.verifyAsync.mockRejectedValue({
        name: 'JsonWebTokenError',
        message: 'Invalid token',
      });

      await expect(authService.validateAccessToken(token)).rejects.toThrow(UnauthorizedException);
    });

    it('应该抛出未授权异常当令牌已失效', async () => {
      const token = 'revoked-access-token';
      const mockPayload = {
        sub: 'user-123',
      };

      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockUserSessionService.validateAccessToken.mockResolvedValue(false);

      await expect(authService.validateAccessToken(token)).rejects.toThrow(UnauthorizedException);
    });
  });
});