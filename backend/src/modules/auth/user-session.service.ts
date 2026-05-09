import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { UserSession } from './entities/user-session.entity';
import { CreateSessionDto } from './dto/create-session.dto';

@Injectable()
export class UserSessionService {
  constructor(
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 创建用户会话
   */
  async createSession(createSessionDto: CreateSessionDto): Promise<UserSession> {
    const session = this.userSessionRepository.create({
      userId: createSessionDto.userId,
      accessToken: createSessionDto.accessToken,
      refreshToken: createSessionDto.refreshToken,
      deviceInfo: createSessionDto.deviceInfo,
      userAgent: createSessionDto.userAgent,
      ipAddress: createSessionDto.ipAddress,
      expiresAt: this.calculateExpiry('access'),
    });

    return this.userSessionRepository.save(session);
  }

  /**
   * 验证会话
   */
  async validateSession(userId: string, refreshToken: string): Promise<UserSession | null> {
    const session = await this.userSessionRepository.findOne({
      where: {
        userId,
        refreshToken,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    return session || null;
  }

  /**
   * 验证访问令牌
   */
  async validateAccessToken(userId: string, accessToken: string): Promise<boolean> {
    const session = await this.userSessionRepository.findOne({
      where: {
        userId,
        accessToken,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    return !!session;
  }

  /**
   * 更新访问令牌
   */
  async updateAccessToken(
    sessionId: string,
    newAccessToken: string,
    newRefreshToken?: string,
  ): Promise<UserSession> {
    const session = await this.userSessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    session.accessToken = newAccessToken;
    if (newRefreshToken) {
      session.refreshToken = newRefreshToken;
    }
    session.expiresAt = this.calculateExpiry('access');
    session.updatedAt = new Date();

    return this.userSessionRepository.save(session);
  }

  /**
   * 撤销会话
   */
  async revokeSession(userId: string, accessToken: string): Promise<void> {
    const session = await this.userSessionRepository.findOne({
      where: {
        userId,
        accessToken,
        revoked: false,
      },
    });

    if (session) {
      session.revoked = true;
      session.revokedAt = new Date();
      await this.userSessionRepository.save(session);
    }
  }

  /**
   * 撤销所有会话
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.userSessionRepository.update(
      { userId, revoked: false },
      { revoked: true, revokedAt: new Date() },
    );
  }

  /**
   * 撤销特定会话
   */
  async revokeSessionById(userId: string, sessionId: string): Promise<void> {
    const session = await this.userSessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    session.revoked = true;
    session.revokedAt = new Date();
    await this.userSessionRepository.save(session);
  }

  /**
   * 获取用户会话列表
   */
  async getUserSessions(userId: string): Promise<UserSession[]> {
    return this.userSessionRepository.find({
      where: { userId, revoked: false },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 清理过期会话
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.userSessionRepository
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now: new Date() })
      .orWhere('revoked = true AND revokedAt < :cleanupDate', {
        cleanupDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30天前
      })
      .execute();

    return result.affected || 0;
  }

  /**
   * 加密敏感数据
   */
  encryptData(data: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(
      this.configService.get('encryption.key', 'your-32-character-encryption-key-here'),
      'salt',
      32,
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  }

  /**
   * 解密敏感数据
   */
  decryptData(encryptedData: string): string {
    const [ivHex, encrypted, authTagHex] = encryptedData.split(':');
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(
      this.configService.get('encryption.key', 'your-32-character-encryption-key-here'),
      'salt',
      32,
    );
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 计算过期时间
   */
  private calculateExpiry(tokenType: 'access' | 'refresh'): Date {
    const now = new Date();
    const raw = tokenType === 'access'
      ? this.configService.get('jwt.expiresIn', '7d')
      : this.configService.get('jwt.refreshExpiresIn', '30d');

    const expiryMs = this.parseExpiry(raw);
    return new Date(now.getTime() + expiryMs);
  }

  private parseExpiry(expiry: string): number {
    const match = String(expiry).match(/^(\d+)(s|m|h|d)?$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // 默认 7 天
    const value = parseInt(match[1], 10);
    const unit = match[2] || 's';
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * (multipliers[unit] || 1000);
  }
}