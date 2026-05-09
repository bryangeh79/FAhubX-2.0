import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { UserSessionService } from './user-session.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userSessionService: UserSessionService,
  ) {}

  /**
   * 检查是否已有注册用户
   */
  async hasUsers(): Promise<boolean> {
    const count = await this.usersService.count();
    return count > 0;
  }

  /**
   * 用户注册
   */
  async register(registerDto: RegisterDto): Promise<TokenResponseDto> {
    // 检查用户是否已存在
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('该邮箱地址已被注册');
    }

    // 创建用户
    const createUserDto = {
      email: registerDto.email,
      username: registerDto.username,
      password: registerDto.password,
      confirmPassword: registerDto.confirmPassword,
      fullName: registerDto.fullName,
      timezone: registerDto.timezone,
      language: registerDto.language,
      acceptTerms: registerDto.acceptTerms,
      preferences: registerDto.preferences,
    };

    const user = await this.usersService.create(createUserDto);

    // 生成访问令牌和刷新令牌
    const tokens = await this.generateTokens(user);

    // 创建用户会话
    await this.userSessionService.createSession({
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceInfo: registerDto.deviceInfo || {},
      userAgent: registerDto.userAgent,
      ipAddress: registerDto.ipAddress,
    });

    return tokens;
  }

  /**
   * 用户登录
   */
  async login(loginDto: LoginDto): Promise<TokenResponseDto> {
    // 查找用户
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    // 验证密码
    const isValidPassword = await this.usersService.validatePassword(user, loginDto.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    // 检查用户状态
    if (user.status !== 'active') {
      throw new UnauthorizedException('账号已被禁用，请联系管理员');
    }

    // 更新登录统计
    await this.usersService.updateLoginStats(user.id);

    // 生成访问令牌和刷新令牌
    const tokens = await this.generateTokens(user);

    // 创建用户会话
    await this.userSessionService.createSession({
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceInfo: loginDto.deviceInfo || {},
      userAgent: loginDto.userAgent,
      ipAddress: loginDto.ipAddress,
    });

    return tokens;
  }

  /**
   * 刷新访问令牌
   */
  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<TokenResponseDto> {
    try {
      // 验证刷新令牌
      const payload = await this.jwtService.verifyAsync(refreshTokenDto.refreshToken, {
        secret: this.configService.get('jwt.refreshSecret'),
      });

      // 查找用户
      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('用户不存在');
      }

      // 检查用户状态
      if (user.status !== 'active') {
        throw new UnauthorizedException('账号已被禁用，请联系管理员');
      }

      // 验证会话
      const session = await this.userSessionService.validateSession(
        user.id,
        refreshTokenDto.refreshToken,
      );

      if (!session) {
        throw new UnauthorizedException('会话已失效，请重新登录');
      }

      // 生成新的访问令牌
      const tokens = await this.generateTokens(user);

      // 更新会话的访问令牌
      await this.userSessionService.updateAccessToken(
        session.id,
        tokens.accessToken,
        tokens.refreshToken,
      );

      return tokens;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('刷新令牌已过期，请重新登录');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('无效的刷新令牌');
      }
      throw error;
    }
  }

  /**
   * 用户登出
   */
  async logout(userId: string, accessToken: string): Promise<void> {
    await this.userSessionService.revokeSession(userId, accessToken);
  }

  /**
   * 用户登出所有设备
   */
  async logoutAll(userId: string): Promise<void> {
    await this.userSessionService.revokeAllSessions(userId);
  }

  /**
   * 生成访问令牌和刷新令牌
   */
  private async generateTokens(user: Pick<User, 'id' | 'email' | 'username'> & { fullName?: string; avatarUrl?: string; role?: string }): Promise<TokenResponseDto> {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role || 'tenant',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.refreshSecret'),
        expiresIn: this.configService.get('jwt.refreshExpiresIn'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get('jwt.expiresIn'),
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        role: (user as any).role || 'tenant',
      },
    };
  }

  /**
   * 验证访问令牌
   */
  async validateAccessToken(token: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('jwt.secret'),
      });

      // 检查令牌是否在会话中有效
      const isValid = await this.userSessionService.validateAccessToken(payload.sub, token);
      if (!isValid) {
        throw new UnauthorizedException('令牌已失效');
      }

      return payload;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('访问令牌已过期');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('无效的访问令牌');
      }
      throw error;
    }
  }

  /**
   * 获取用户会话列表
   */
  async getUserSessions(userId: string) {
    return this.userSessionService.getUserSessions(userId);
  }

  /**
   * 撤销特定会话
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.userSessionService.revokeSessionById(userId, sessionId);
  }

  /**
   * 更改密码
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // 查找用户
    const user = await this.usersService.findOne(userId);

    // 验证当前密码
    const isValidPassword = await this.usersService.validatePassword(user, currentPassword);
    if (!isValidPassword) {
      throw new BadRequestException('当前密码错误');
    }

    // 更新密码
    await this.usersService.updatePassword(userId, newPassword);

    // 撤销所有会话（安全考虑）
    await this.logoutAll(userId);
  }

  /**
   * 请求密码重置
   */
  async requestPasswordReset(email: string): Promise<{ resetToken: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // 出于安全考虑，不透露用户是否存在
      return { resetToken: uuidv4() };
    }

    // 生成重置令牌
    const resetToken = uuidv4();
    // TODO: 保存重置令牌到数据库，设置过期时间
    // TODO: 发送重置邮件

    return { resetToken };
  }

  /**
   * 重置密码
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    // TODO: 验证重置令牌
    // TODO: 查找用户并更新密码
    // TODO: 使重置令牌失效
    throw new InternalServerErrorException('密码重置功能暂未实现');
  }
}