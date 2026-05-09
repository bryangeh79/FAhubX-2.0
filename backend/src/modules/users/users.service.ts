import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';

import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { encryptString, decryptString, maskSecret } from '../../common/crypto.util';

export type AiProvider = 'claude' | 'openai' | 'deepseek';

export interface GroupJoinSettings {
  keywords: string[];
  dailyLimit: number;
  strategy: 'random' | 'sequential' | 'weighted';
  aiAnswerEnabled: boolean;
  aiAnswerPrompt: string;
  aiProvider?: AiProvider;
  /** 响应时遮罩显示（如 sk-…abc9）；保存时如果传新 key 会加密覆盖 */
  aiApiKey?: string;
  /** 标记：当前是否已配置 key（前端根据此判断 */
  aiApiKeyConfigured?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 创建新用户
   */
  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // 验证密码匹配
    if (createUserDto.password !== createUserDto.confirmPassword) {
      throw new BadRequestException('密码和确认密码不匹配');
    }

    // 检查邮箱是否已存在
    const existingEmail = await this.usersRepository.findOne({
      where: { email: createUserDto.email.toLowerCase() },
      withDeleted: true,
    });

    if (existingEmail) {
      if (existingEmail.deletedAt) {
        throw new ConflictException('该邮箱地址已被删除，请联系管理员恢复');
      }
      throw new ConflictException('该邮箱地址已被注册');
    }

    // 检查用户名是否已存在
    const existingUsername = await this.usersRepository.findOne({
      where: { username: createUserDto.username.toLowerCase() },
      withDeleted: true,
    });

    if (existingUsername) {
      if (existingUsername.deletedAt) {
        throw new ConflictException('该用户名已被删除，请联系管理员恢复');
      }
      throw new ConflictException('该用户名已被使用');
    }

    try {
      // 哈希密码
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(createUserDto.password, saltRounds);

      // 创建用户实体
      const user = this.usersRepository.create({
        email: createUserDto.email,
        username: createUserDto.username,
        passwordHash,
        fullName: createUserDto.fullName,
        timezone: createUserDto.timezone || 'UTC',
        language: createUserDto.language || 'en',
        preferences: createUserDto.preferences || {},
      });

      // 保存用户
      const savedUser = await this.usersRepository.save(user);

      // 转换为响应DTO
      return this.toResponseDto(savedUser);
    } catch (error) {
      if (error.code === '23505') {
        // PostgreSQL唯一约束冲突
        throw new ConflictException('用户创建失败，请检查邮箱和用户名是否唯一');
      }
      throw new InternalServerErrorException('用户创建失败，请稍后重试');
    }
  }

  /**
   * 查找所有用户
   */
  async findAll(
    page = 1,
    limit = 20,
    filters?: {
      status?: string;
      emailVerified?: boolean;
      search?: string;
    },
  ): Promise<{
    users: UserResponseDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const skip = (page - 1) * limit;
    const queryBuilder = this.usersRepository.createQueryBuilder('user');

    // 应用过滤器
    if (filters?.status) {
      queryBuilder.andWhere('user.status = :status', { status: filters.status });
    }

    if (filters?.emailVerified !== undefined) {
      queryBuilder.andWhere('user.emailVerified = :emailVerified', {
        emailVerified: filters.emailVerified,
      });
    }

    if (filters?.search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.username ILIKE :search OR user.fullName ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    // 排除已删除的用户
    queryBuilder.andWhere('user.deletedAt IS NULL');

    // 获取总数
    const total = await queryBuilder.getCount();

    // 获取分页数据
    const users = await queryBuilder
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      users: users.map(user => this.toResponseDto(user)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 根据ID查找用户
   */
  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`用户 ${id} 不存在`);
    }

    return this.toResponseDto(user);
  }

  /**
   * 统计用户总数
   */
  async count(): Promise<number> {
    return this.usersRepository.count();
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * 根据用户名查找用户
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { username: username.toLowerCase() },
    });
  }

  /**
   * 更新用户信息
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`用户 ${id} 不存在`);
    }

    // 检查邮箱是否已被其他用户使用
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingEmail = await this.usersRepository.findOne({
        where: { email: updateUserDto.email.toLowerCase() },
      });

      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException('该邮箱地址已被其他用户使用');
      }
    }

    // 检查用户名是否已被其他用户使用
    if (updateUserDto.username && updateUserDto.username !== user.username) {
      const existingUsername = await this.usersRepository.findOne({
        where: { username: updateUserDto.username.toLowerCase() },
      });

      if (existingUsername && existingUsername.id !== id) {
        throw new ConflictException('该用户名已被其他用户使用');
      }
    }

    // 更新用户信息
    Object.assign(user, updateUserDto);

    try {
      const updatedUser = await this.usersRepository.save(user);
      return this.toResponseDto(updatedUser);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('更新失败，请检查邮箱和用户名是否唯一');
      }
      throw new InternalServerErrorException('更新失败，请稍后重试');
    }
  }

  /**
   * 更新用户 UI 语言（轻量端点，前端 Header 语言切换用）
   */
  async updateLanguage(id: string, language: string): Promise<void> {
    await this.usersRepository.update(id, { language });
  }

  /**
   * v1.2.0 Phase 1 — 暖化设置（存在 preferences.warmup 里）
   */
  async getWarmupSettings(id: string): Promise<{ groupCount: number }> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);
    const groupCount = (user.preferences as any)?.warmup?.groupCount ?? 3;
    return { groupCount };
  }

  async updateWarmupSettings(
    id: string,
    settings: { groupCount: number },
  ): Promise<{ groupCount: number }> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);
    user.preferences = {
      ...(user.preferences || {}),
      warmup: {
        ...((user.preferences as any)?.warmup || {}),
        groupCount: settings.groupCount,
      },
    };
    await this.usersRepository.save(user);
    return { groupCount: settings.groupCount };
  }

  /**
   * v1.2.0 Phase 4 —— 加群设置（关键词、上限、策略、AI 回答）
   *
   * 响应时 API Key 已被遮罩 —— 不会泄露真实 key。
   * 新 key 写入时会用 encryption.key 加密后存 JSONB。
   */
  async getGroupJoinSettings(id: string): Promise<GroupJoinSettings> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);
    const gj = (user.preferences as any)?.warmup?.groupJoin || {};
    let aiApiKeyMasked = '';
    let aiApiKeyConfigured = false;
    if (gj.aiApiKeyEncrypted) {
      try {
        const decrypted = decryptString(gj.aiApiKeyEncrypted, this.getEncryptionKey());
        aiApiKeyMasked = maskSecret(decrypted);
        aiApiKeyConfigured = !!decrypted;
      } catch {
        // 解密失败 —— 可能是 encryption.key 变了；不暴露任何东西
      }
    }
    return {
      keywords: gj.keywords ?? [],
      dailyLimit: gj.dailyLimit ?? 3,
      strategy: gj.strategy ?? 'random',
      aiAnswerEnabled: gj.aiAnswerEnabled ?? false,
      aiAnswerPrompt: gj.aiAnswerPrompt ?? '',
      aiProvider: gj.aiProvider ?? 'claude',
      aiApiKey: aiApiKeyMasked,
      aiApiKeyConfigured,
    };
  }

  async updateGroupJoinSettings(
    id: string,
    settings: GroupJoinSettings,
  ): Promise<GroupJoinSettings> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);

    const existing = (user.preferences as any)?.warmup?.groupJoin || {};

    // API Key 规则：
    // - 空串 / undefined → 保留旧值
    // - 以 '…' 开头（前端回传的遮罩值）→ 保留旧值
    // - '__CLEAR__' → 明确清空
    // - 其他非空 → 加密后覆盖
    let aiApiKeyEncrypted = existing.aiApiKeyEncrypted;
    const rawKey = (settings.aiApiKey ?? '').trim();
    if (rawKey === '__CLEAR__') {
      aiApiKeyEncrypted = null;
    } else if (rawKey && !rawKey.includes('…')) {
      aiApiKeyEncrypted = encryptString(rawKey, this.getEncryptionKey());
    }

    user.preferences = {
      ...(user.preferences || {}),
      warmup: {
        ...((user.preferences as any)?.warmup || {}),
        groupJoin: {
          keywords: Array.isArray(settings.keywords)
            ? settings.keywords.filter(k => k && typeof k === 'string').slice(0, 50)
            : [],
          dailyLimit: Math.max(1, Math.min(20, Number(settings.dailyLimit) || 3)),
          strategy: ['random', 'sequential', 'weighted'].includes(settings.strategy)
            ? settings.strategy : 'random',
          aiAnswerEnabled: !!settings.aiAnswerEnabled,
          aiAnswerPrompt: typeof settings.aiAnswerPrompt === 'string'
            ? settings.aiAnswerPrompt.slice(0, 500) : '',
          aiProvider: ['claude', 'openai', 'deepseek'].includes(settings.aiProvider as string)
            ? settings.aiProvider : 'claude',
          aiApiKeyEncrypted,
        },
      },
    };
    await this.usersRepository.save(user);
    return this.getGroupJoinSettings(id);
  }

  /**
   * 内部使用：拿明文 API Key（任务执行器调 AI 时用）
   * 不通过 HTTP 响应暴露，只给其他后端服务调用。
   */
  async getDecryptedAiApiKey(userId: string): Promise<{ provider: AiProvider; apiKey: string } | null> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return null;
    const gj = (user.preferences as any)?.warmup?.groupJoin;
    if (!gj?.aiApiKeyEncrypted) return null;
    try {
      const apiKey = decryptString(gj.aiApiKeyEncrypted, this.getEncryptionKey());
      if (!apiKey) return null;
      return {
        provider: (gj.aiProvider ?? 'claude') as AiProvider,
        apiKey,
      };
    } catch {
      return null;
    }
  }

  private getEncryptionKey(): string {
    return this.configService.get(
      'encryption.key',
      'your-32-character-encryption-key-here',
    );
  }


  /**
   * 更新用户偏好设置
   */
  async updatePreferences(id: string, preferencesDto: UpdatePreferencesDto): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`用户 ${id} 不存在`);
    }

    // 合并偏好设置
    user.preferences = {
      ...user.preferences,
      ...preferencesDto.preferences,
    };

    const updatedUser = await this.usersRepository.save(user);
    return this.toResponseDto(updatedUser);
  }

  /**
   * 删除用户（软删除）
   */
  async remove(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`用户 ${id} 不存在`);
    }

    // 软删除
    await this.usersRepository.softDelete(id);
  }

  /**
   * 验证用户密码
   */
  async validatePassword(user: User | { id: string; passwordHash?: string }, password: string): Promise<boolean> {
    if (!user.passwordHash) {
      // fetch the full user entity if passwordHash is not available
      const fullUser = await this.usersRepository.findOne({ where: { id: user.id } });
      if (!fullUser) return false;
      return bcrypt.compare(password, fullUser.passwordHash);
    }
    return bcrypt.compare(password, user.passwordHash);
  }

  /**
   * 更新用户密码
   */
  async updatePassword(id: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`用户 ${id} 不存在`);
    }

    const saltRounds = 10;
    user.passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.usersRepository.save(user);
  }

  /**
   * 验证邮箱
   */
  async verifyEmail(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`用户 ${id} 不存在`);
    }

    if (user.emailVerified) {
      return this.toResponseDto(user);
    }

    user.emailVerified = true;
    const updatedUser = await this.usersRepository.save(user);

    return this.toResponseDto(updatedUser);
  }

  /**
   * 更新登录统计
   */
  async updateLoginStats(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      return;
    }

    user.incrementLoginCount();
    await this.usersRepository.save(user);
  }

  /**
   * 转换为响应DTO
   */
  private toResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      status: user.status,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      language: user.language,
      preferences: user.preferences,
      totalLogins: user.totalLogins,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * 获取用户统计信息
   */
  async getStats(userId: string): Promise<{
    totalAccounts: number;
    totalTasks: number;
    activeTasks: number;
    successRate: number;
    lastActivity: Date;
  }> {
    // 这里需要连接其他表获取统计信息
    // 暂时返回模拟数据
    return {
      totalAccounts: 0,
      totalTasks: 0,
      activeTasks: 0,
      successRate: 0,
      lastActivity: new Date(),
    };
  }
}