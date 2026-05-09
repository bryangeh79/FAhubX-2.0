import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThanOrEqual, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import { FacebookAccount } from './entities/facebook-account.entity';
import { CreateFacebookAccountDto } from './dto/create-facebook-account.dto';
import { UpdateFacebookAccountDto } from './dto/update-facebook-account.dto';
import { FacebookAccountResponseDto } from './dto/facebook-account-response.dto';

@Injectable()
export class FacebookAccountsService implements OnModuleInit {
  private readonly logger = new Logger(FacebookAccountsService.name);

  constructor(
    @InjectRepository(FacebookAccount)
    private readonly facebookAccountsRepository: Repository<FacebookAccount>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 启动时自动 ensure schema —— 项目没启用 migrationsRun，
   * 所以在这里 idempotent 地加列 + 回填 + 建唯一索引。
   * 既适用于升级也适用于全新装机。
   */
  async onModuleInit(): Promise<void> {
    try {
      // 1. 加 accountNumber 字段（v1.2.0 Phase 0）
      await this.dataSource.query(`
        ALTER TABLE facebook_accounts
          ADD COLUMN IF NOT EXISTS "accountNumber" INTEGER
      `);

      // 2. 回填现有账号（每租户按 createdAt ASC 从 1 开始）
      //    只填 accountNumber IS NULL 的记录，重启时不会重复
      await this.dataSource.query(`
        WITH numbered AS (
          SELECT
            id,
            ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC) AS rn
          FROM facebook_accounts
          WHERE "deletedAt" IS NULL AND "accountNumber" IS NULL
        )
        UPDATE facebook_accounts
        SET "accountNumber" = numbered.rn
        FROM numbered
        WHERE facebook_accounts.id = numbered.id
      `);

      // 3. 建唯一索引（同一租户的未删除账号不能重复编号）
      await this.dataSource.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_accounts_user_number
          ON facebook_accounts ("userId", "accountNumber")
          WHERE "deletedAt" IS NULL AND "accountNumber" IS NOT NULL
      `);

      // 4. 加 warmupGroupNumber 字段（v1.2.0 Phase 1 —— 分组系统）
      await this.dataSource.query(`
        ALTER TABLE facebook_accounts
          ADD COLUMN IF NOT EXISTS "warmupGroupNumber" INTEGER
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_facebook_accounts_warmup_group
          ON facebook_accounts ("warmupGroupNumber")
          WHERE "deletedAt" IS NULL
      `);

      this.logger.log('✅ accountNumber + warmupGroup schema ensured (v1.2.0 Phase 0+1)');
    } catch (err: any) {
      this.logger.error(`accountNumber schema init failed: ${err.message}`);
    }
  }

  /**
   * 创建Facebook账号
   */
  async create(
    userId: string,
    createFacebookAccountDto: CreateFacebookAccountDto,
  ): Promise<FacebookAccountResponseDto> {
    // ── 配额校验：检查账号数量是否已达上限 ────────────────────────────────
    let maxAccounts = 10;
    let isAdmin = false;

    if (process.env.DEPLOY_MODE === 'local') {
      // Local 模式：从 LicenseService 获取配额
      try {
        const { LicenseService } = await import('../license/license.service');
        const { ModuleRef } = await import('@nestjs/core');
        // Fallback: 直接从 dataSource 查本地 DB（local 模式只有一个用户）
        maxAccounts = 10; // will be overridden below
      } catch {}
      // 在 local 模式下，从环境中读取（LicenseService 把值缓存到了文件）
      try {
        const cachePath = require('path').join(process.cwd(), 'license-cache.json');
        const cache = JSON.parse(require('fs').readFileSync(cachePath, 'utf8'));
        maxAccounts = cache.maxAccounts || 10;
      } catch {}
    } else {
      // Cloud 模式：从 users 表获取配额
      const [user] = await this.dataSource.query(
        `SELECT role, "max_accounts" AS "maxAccounts" FROM users WHERE id = $1`,
        [userId],
      );
      if (user) {
        maxAccounts = user.maxAccounts || 10;
        isAdmin = user.role === 'admin';
      }
    }

    if (!isAdmin) {
      const [{ count }] = await this.dataSource.query(
        `SELECT COUNT(*) AS count FROM facebook_accounts WHERE "userId" = $1 AND "deletedAt" IS NULL`,
        [userId],
      );
      const currentCount = parseInt(count, 10);
      if (currentCount >= maxAccounts) {
        throw new ForbiddenException(
          `已达账号上限（${currentCount}/${maxAccounts}），请联系管理员升级配套`,
        );
      }
    }

    // 检查该用户邮箱是否已添加过
    const existingAccount = await this.facebookAccountsRepository.findOne({
      where: { email: createFacebookAccountDto.email, userId },
      withDeleted: true,
    });

    if (existingAccount) {
      if (existingAccount.deletedAt) {
        // 自动恢复被软删除的账号并更新数据
        await this.dataSource.query(
          `DELETE FROM facebook_accounts WHERE id = $1`,
          [existingAccount.id],
        );
        console.log(`[${createFacebookAccountDto.email}] 旧的软删除账号已清除，重新创建`);
      } else {
        throw new ConflictException('该Facebook账号已存在');
      }
    }

    try {
      // 加密密码（必须存储）
      const encryptedPassword = this.encryptData(createFacebookAccountDto.facebookPassword);

      // 可选字段加密
      const encryptedAccessToken = createFacebookAccountDto.accessToken
        ? this.encryptData(createFacebookAccountDto.accessToken)
        : null;

      // 分配账号编号（#01 起，回收已删除的编号）
      const accountNumber = await this.allocateAccountNumber(userId);

      // 创建账号实体
      const account = this.facebookAccountsRepository.create({
        userId,
        accountNumber,
        facebookId: createFacebookAccountDto.facebookId || null,
        name: createFacebookAccountDto.name,
        email: createFacebookAccountDto.email,
        facebookPassword: encryptedPassword,
        accessToken: encryptedAccessToken,
        accessTokenExpiresAt: createFacebookAccountDto.accessTokenExpiresAt
          ? new Date(createFacebookAccountDto.accessTokenExpiresAt)
          : null,
        accountType: createFacebookAccountDto.accountType || 'user',
        messengerPin: createFacebookAccountDto.messengerPin || null,
        vpnConfigId: createFacebookAccountDto.vpnConfigId || null,
        remarks: createFacebookAccountDto.remarks,
        verified: createFacebookAccountDto.verified || false,
        config: createFacebookAccountDto.config || {},
        metadata: createFacebookAccountDto.metadata || {},
        status: 'idle',
      });

      // 保存账号
      const savedAccount = await this.facebookAccountsRepository.save(account);

      // 转换为响应DTO
      return this.toResponseDto(savedAccount);
    } catch (error) {
      if (error.code === '23505') {
        // PostgreSQL唯一约束冲突
        throw new ConflictException('Facebook账号创建失败，请检查Facebook ID是否唯一');
      }
      throw new InternalServerErrorException('Facebook账号创建失败，请稍后重试');
    }
  }

  /**
   * 查找用户的所有Facebook账号
   */
  async findAllByUser(
    userId: string,
    page = 1,
    limit = 20,
    filters?: {
      status?: string;
      accountType?: string;
      verified?: boolean;
      search?: string;
    },
  ): Promise<{
    accounts: FacebookAccountResponseDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const skip = (page - 1) * limit;
    const queryBuilder = this.facebookAccountsRepository.createQueryBuilder('account');

    // 只查询当前用户的账号
    queryBuilder.where('account.userId = :userId', { userId });

    // 应用过滤器
    if (filters?.status) {
      queryBuilder.andWhere('account.status = :status', { status: filters.status });
    }

    if (filters?.accountType) {
      queryBuilder.andWhere('account.accountType = :accountType', {
        accountType: filters.accountType,
      });
    }

    if (filters?.verified !== undefined) {
      queryBuilder.andWhere('account.verified = :verified', {
        verified: filters.verified,
      });
    }

    if (filters?.search) {
      queryBuilder.andWhere(
        '(account.name ILIKE :search OR account.email ILIKE :search OR account.facebookId ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    // 排除已删除的账号
    queryBuilder.andWhere('account.deletedAt IS NULL');

    // 获取总数
    const total = await queryBuilder.getCount();

    // 获取分页数据 — 按账号编号 ASC 排序（#01 在最上面），无编号的旧号回退到 createdAt
    const accounts = await queryBuilder
      .orderBy('account.accountNumber', 'ASC', 'NULLS LAST')
      .addOrderBy('account.createdAt', 'ASC')
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      accounts: accounts.map(account => this.toResponseDto(account)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 根据ID查找Facebook账号
   */
  async findOne(userId: string, id: string): Promise<FacebookAccountResponseDto> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`Facebook账号 ${id} 不存在`);
    }

    return this.toResponseDto(account);
  }

  /**
   * 根据Facebook ID查找账号
   */
  async findByFacebookId(userId: string, facebookId: string): Promise<FacebookAccountResponseDto> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { facebookId, userId },
    });

    if (!account) {
      throw new NotFoundException(`Facebook账号 ${facebookId} 不存在`);
    }

    return this.toResponseDto(account);
  }

  /**
   * 更新Facebook账号
   */
  async update(
    userId: string,
    id: string,
    updateFacebookAccountDto: UpdateFacebookAccountDto,
  ): Promise<FacebookAccountResponseDto> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`Facebook账号 ${id} 不存在`);
    }

    // 更新访问令牌（如果提供）
    if (updateFacebookAccountDto.accessToken) {
      account.accessToken = this.encryptData(updateFacebookAccountDto.accessToken);
    }

    // 更新刷新令牌（如果提供）
    if (updateFacebookAccountDto.refreshToken !== undefined) {
      account.refreshToken = updateFacebookAccountDto.refreshToken
        ? this.encryptData(updateFacebookAccountDto.refreshToken)
        : null;
    }

    // 更新其他字段
    if (updateFacebookAccountDto.accessTokenExpiresAt) {
      account.accessTokenExpiresAt = new Date(updateFacebookAccountDto.accessTokenExpiresAt);
    }

    // 更新其他可更新字段
    // Handle password update (encrypt if provided)
    if (updateFacebookAccountDto.facebookPassword) {
      account.facebookPassword = this.encryptData(updateFacebookAccountDto.facebookPassword);
    }

    const updatableFields = [
      'name',
      'email',
      'accountType',
      'status',
      'verified',
      'profilePicture',
      'coverPhoto',
      'followersCount',
      'followingCount',
      'syncStatus',
      'syncError',
      'config',
      'metadata',
      'remarks',
      'vpnConfigId',
      'messengerPin',
    ];

    updatableFields.forEach(field => {
      if (updateFacebookAccountDto[field] !== undefined) {
        account[field] = updateFacebookAccountDto[field];
      }
    });

    try {
      const updatedAccount = await this.facebookAccountsRepository.save(account);
      return this.toResponseDto(updatedAccount);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('更新失败，请检查数据唯一性');
      }
      throw new InternalServerErrorException('更新失败，请稍后重试');
    }
  }

  /**
   * 删除Facebook账号（软删除）
   */
  async remove(userId: string, id: string): Promise<void> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`Facebook账号 ${id} 不存在`);
    }

    // 软删除
    await this.facebookAccountsRepository.softDelete(id);
  }

  /**
   * v1.2.1 —— 出厂重置（Factory Reset）
   *
   * 场景：租户的某个 FB 账号完成养号后要「退役」，腾出 #编号槽给新号。
   *
   * 清除内容：
   * 1. 关闭活跃浏览器 session（如果开着）
   * 2. 删除浏览器 Profile 目录（cookies / localStorage / indexedDB 全清）
   * 3. 删除 warmup_progress 进度
   * 4. 删除 group_join_history 加群历史
   * 5. 删除该账号的所有 tasks + 执行日志
   * 6. 软删除账号本身 → #编号自动回收给下一个新号
   *
   * 返回每步的成功状态，前端可以显示详细结果。
   */
  async factoryReset(userId: string, accountId: string): Promise<{
    accountDeleted: boolean;
    profileDeleted: boolean;
    profilePath: string | null;
    warmupRowsDeleted: number;
    groupJoinRowsDeleted: number;
    tasksDeleted: number;
    recycledNumber: number | null;
  }> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { id: accountId, userId },
    });
    if (!account) {
      throw new NotFoundException(`Facebook账号 ${accountId} 不存在`);
    }

    const recycledNumber = account.accountNumber;
    const fs = await import('fs');
    const path = await import('path');

    // Step 1-2: 删除浏览器 Profile 目录
    let profileDeleted = false;
    let profilePath: string | null = null;
    try {
      const baseDir = process.env.BROWSER_DATA_DIR
        || path.resolve(process.cwd(), 'browser-profiles');
      profilePath = path.resolve(baseDir, accountId);
      if (fs.existsSync(profilePath)) {
        // Windows 可能因为浏览器还开着有文件锁 —— 重试 3 次
        for (let i = 0; i < 3; i++) {
          try {
            fs.rmSync(profilePath, { recursive: true, force: true });
            profileDeleted = true;
            break;
          } catch (err: any) {
            this.logger.warn(`[factoryReset] profile 删除失败（尝试 ${i + 1}/3）：${err.message}`);
            if (i < 2) await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`[factoryReset] profile 删除异常：${err.message}`);
    }

    // Step 3: 删 warmup_progress
    const warmupRes = await this.dataSource.query(
      `DELETE FROM warmup_progress WHERE "accountId" = $1`,
      [accountId],
    );

    // Step 4: 删 group_join_history
    const gjRes = await this.dataSource.query(
      `DELETE FROM group_join_history WHERE "accountId" = $1`,
      [accountId],
    );

    // Step 5: 删任务 + 执行日志
    // 先删 logs（外键），再删 tasks
    await this.dataSource.query(
      `DELETE FROM task_execution_logs
       WHERE "taskId" IN (SELECT id FROM tasks WHERE "accountId" = $1 AND "userId" = $2)`,
      [accountId, userId],
    );
    const taskRes = await this.dataSource.query(
      `DELETE FROM tasks WHERE "accountId" = $1 AND "userId" = $2`,
      [accountId, userId],
    );

    // Step 6: 软删除账号 —— 唯一索引带 WHERE deletedAt IS NULL，所以软删后 #编号自动释放
    await this.facebookAccountsRepository.softDelete(accountId);

    this.logger.log(
      `[factoryReset] 账号 #${recycledNumber ?? '?'} (${account.email ?? account.name}) 已出厂重置：` +
      `profile=${profileDeleted ? '✓' : '-'} warmup=${warmupRes[1] ?? 0} gj=${gjRes[1] ?? 0} tasks=${taskRes[1] ?? 0}`,
    );

    return {
      accountDeleted: true,
      profileDeleted,
      profilePath,
      warmupRowsDeleted: Array.isArray(warmupRes) ? (warmupRes[1] ?? 0) : 0,
      groupJoinRowsDeleted: Array.isArray(gjRes) ? (gjRes[1] ?? 0) : 0,
      tasksDeleted: Array.isArray(taskRes) ? (taskRes[1] ?? 0) : 0,
      recycledNumber,
    };
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(
    userId: string,
    id: string,
    newAccessToken: string,
    newExpiresAt: string,
    newRefreshToken?: string,
  ): Promise<FacebookAccountResponseDto> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`Facebook账号 ${id} 不存在`);
    }

    // 更新令牌
    account.accessToken = this.encryptData(newAccessToken);
    account.accessTokenExpiresAt = new Date(newExpiresAt);
    
    if (newRefreshToken) {
      account.refreshToken = this.encryptData(newRefreshToken);
    }

    // 更新状态
    account.status = 'active';
    account.syncStatus = 'success';
    account.syncError = null;

    const updatedAccount = await this.facebookAccountsRepository.save(account);
    return this.toResponseDto(updatedAccount);
  }

  /**
   * 同步账号信息
   */
  async syncAccount(userId: string, id: string): Promise<FacebookAccountResponseDto> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`Facebook账号 ${id} 不存在`);
    }

    // 检查令牌是否有效
    if (account.isTokenExpired()) {
      account.status = 'error';
      account.syncStatus = 'failed';
      account.syncError = '访问令牌已过期';
      await this.facebookAccountsRepository.save(account);
      
      throw new BadRequestException('访问令牌已过期，请重新授权');
    }

    try {
      // 这里应该调用Facebook API同步账号信息
      // 暂时模拟同步成功
      account.lastSyncedAt = new Date();
      account.syncStatus = 'success';
      account.syncError = null;

      const updatedAccount = await this.facebookAccountsRepository.save(account);
      return this.toResponseDto(updatedAccount);
    } catch (error) {
      account.syncStatus = 'failed';
      account.syncError = error.message || '同步失败';
      await this.facebookAccountsRepository.save(account);

      throw new InternalServerErrorException(`同步失败: ${error.message}`);
    }
  }

  /**
   * 获取即将过期的账号
   */
  async getExpiringAccounts(userId: string, thresholdHours = 24): Promise<FacebookAccountResponseDto[]> {
    const thresholdDate = new Date(Date.now() + thresholdHours * 60 * 60 * 1000);

    const accounts = await this.facebookAccountsRepository.find({
      where: {
        userId,
        status: 'active',
        accessTokenExpiresAt: LessThanOrEqual(thresholdDate),
        deletedAt: null,
      },
    });

    return accounts.map(account => this.toResponseDto(account));
  }

  /**
   * 获取账号统计信息
   */
  async getStats(userId: string): Promise<{
    totalAccounts: number;
    maxAccounts: number;
    plan: string;
    activeAccounts: number;
    expiredAccounts: number;
    pageAccounts: number;
    businessAccounts: number;
    verifiedAccounts: number;
    expiringSoon: number;
  }> {
    const queryBuilder = this.facebookAccountsRepository.createQueryBuilder('account');

    queryBuilder.where('account.userId = :userId', { userId });
    queryBuilder.andWhere('account.deletedAt IS NULL');

    const allAccounts = await queryBuilder.getMany();

    const thresholdDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 获取用户配额信息
    const [user] = await this.dataSource.query(
      `SELECT plan, max_accounts AS "maxAccounts" FROM users WHERE id = $1`,
      [userId],
    );

    return {
      totalAccounts: allAccounts.length,
      maxAccounts: user?.maxAccounts ?? 10,
      plan: user?.plan ?? 'basic',
      activeAccounts: allAccounts.filter(a => a.status === 'active').length,
      expiredAccounts: allAccounts.filter(a => a.status === 'error').length,
      pageAccounts: allAccounts.filter(a => a.accountType === 'page').length,
      businessAccounts: allAccounts.filter(a => a.accountType === 'business').length,
      verifiedAccounts: allAccounts.filter(a => a.verified).length,
      expiringSoon: allAccounts.filter(a =>
        a.status === 'active' && a.accessTokenExpiresAt <= thresholdDate
      ).length,
    };
  }

  // ─── v1.2.0 Phase 1 — 暖化分组 ──────────────────────────────────
  /**
   * 分配单个账号到分组（或取消分组）
   * groupNumber: 1-6 或 null
   * 注意：入参的 groupCount 不在这里校验，前端 UI 限制
   *       （若租户把 groupCount 从 6 改到 4，DB 里原有的 G5/G6 账号依旧保留 —— UI 会显示「未匹配组」标签）
   */
  async assignGroup(
    userId: string,
    accountId: string,
    groupNumber: number | null,
  ): Promise<FacebookAccountResponseDto> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { id: accountId, userId },
    });
    if (!account) {
      throw new NotFoundException(`Facebook账号 ${accountId} 不存在`);
    }
    account.warmupGroupNumber = groupNumber;
    const saved = await this.facebookAccountsRepository.save(account);
    this.logger.log(
      `[${account.accountNumber != null ? '#' + account.accountNumber : accountId}] 分组 → ${groupNumber ?? '未分组'}`,
    );
    return this.toResponseDto(saved);
  }

  /**
   * 批量分配分组（返回实际更新的账号数）
   */
  async batchAssignGroup(
    userId: string,
    accountIds: string[],
    groupNumber: number | null,
  ): Promise<number> {
    const result = await this.facebookAccountsRepository
      .createQueryBuilder()
      .update()
      .set({ warmupGroupNumber: groupNumber })
      .where('userId = :userId AND id IN (:...ids) AND "deletedAt" IS NULL', {
        userId,
        ids: accountIds,
      })
      .execute();
    this.logger.log(
      `[batch] 批量分组：${result.affected ?? 0} 个账号 → ${groupNumber ?? '未分组'}`,
    );
    return result.affected ?? 0;
  }

  /**
   * 每个分组的账号数 + 未分组账号数
   * 返回 { groupCount, groups: [{ group: 1, count: 5 }, ...], unassigned: 3 }
   */
  async getGroupStats(userId: string): Promise<{
    groupCount: number;
    groups: { group: number; count: number }[];
    unassigned: number;
    total: number;
  }> {
    // 读用户的 groupCount 设置（preferences.warmup.groupCount，默认 3）
    const [u] = await this.dataSource.query(
      `SELECT preferences FROM users WHERE id = $1`,
      [userId],
    );
    const groupCount = u?.preferences?.warmup?.groupCount ?? 3;

    const rows = await this.dataSource.query(
      `SELECT "warmupGroupNumber" AS group, COUNT(*)::int AS count
         FROM facebook_accounts
        WHERE "userId" = $1 AND "deletedAt" IS NULL
        GROUP BY "warmupGroupNumber"`,
      [userId],
    );
    const byGroup = new Map<number | null, number>();
    let total = 0;
    for (const r of rows) {
      const g = r.group == null ? null : Number(r.group);
      byGroup.set(g, Number(r.count));
      total += Number(r.count);
    }
    const groups: { group: number; count: number }[] = [];
    // v1.4.0：扩到 9 组（Enterprise 配套支持 9 组 × 6 号 = 54 ≥ 50）
    for (let i = 1; i <= 9; i++) {
      const c = byGroup.get(i) ?? 0;
      if (i <= groupCount || c > 0) {
        groups.push({ group: i, count: c });
      }
    }
    return {
      groupCount,
      groups,
      unassigned: byGroup.get(null) ?? 0,
      total,
    };
  }

  /**
   * 分配账号编号
   *
   * 规则：
   * - 每租户独立，从 #1 开始
   * - 删号后编号回收：找当前未用的最小正整数
   * - 例子：如果该租户已有 #1, #2, #4 → 新账号分配 #3；如果 #1, #2, #3 → 新账号分配 #4
   * - 软删除的账号不占号（migration 里的唯一索引带 WHERE "deletedAt" IS NULL 过滤）
   */
  private async allocateAccountNumber(userId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT "accountNumber" FROM facebook_accounts
       WHERE "userId" = $1 AND "deletedAt" IS NULL AND "accountNumber" IS NOT NULL
       ORDER BY "accountNumber" ASC`,
      [userId],
    );
    const used = new Set<number>(rows.map((r: any) => r.accountNumber as number));
    // 找最小未用正整数
    for (let i = 1; i <= used.size + 1; i++) {
      if (!used.has(i)) return i;
    }
    return used.size + 1; // fallback（理论上不会到这）
  }

  /**
   * 加密数据
   */
  private encryptData(data: string): string {
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
   * 解密数据
   */
  private decryptData(encryptedData: string): string {
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
   * 转换为响应DTO
   */
  private toResponseDto(account: FacebookAccount): FacebookAccountResponseDto {
    // 检查令牌是否即将过期（24小时内）
    const isTokenExpiring = account.needsRefresh();

    return {
      id: account.id,
      userId: account.userId,
      accountNumber: account.accountNumber ?? null,
      warmupGroupNumber: account.warmupGroupNumber ?? null,
      facebookId: account.facebookId,
      name: account.name,
      email: account.email,
      remarks: account.remarks,
      accountType: account.accountType,
      status: account.status,
      verified: account.verified,
      loginStatus: account.loginStatus,
      profilePicture: account.profilePicture,
      coverPhoto: account.coverPhoto,
      followersCount: account.followersCount,
      followingCount: account.followingCount,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      lastSyncedAt: account.lastSyncedAt,
      syncStatus: account.syncStatus,
      syncError: account.syncError,
      config: account.config,
      metadata: account.metadata,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      isTokenExpiring,
      isActive: account.isActive(),
      vpnConfigId: account.vpnConfigId || null,
      messengerPin: account.messengerPin || null,
    };
  }

  /**
   * 获取解密的访问令牌（仅限内部使用）
   */
  async getDecryptedAccessToken(userId: string, id: string): Promise<string> {
    const account = await this.facebookAccountsRepository.findOne({
      where: { id, userId },
    });

    if (!account) {
      throw new NotFoundException(`Facebook账号 ${id} 不存在`);
    }

    // 检查权限
    if (!account.hasPermission('pages_manage_posts')) {
      throw new ForbiddenException('账号没有发布内容的权限');
    }

    return this.decryptData(account.accessToken);
  }

  async getDecryptedPassword(userId: string, id: string): Promise<string> {
    const account = await this.facebookAccountsRepository.findOne({ where: { id, userId } });
    if (!account || !account.facebookPassword) throw new Error('账号不存在或未设置密码');
    try {
      return this.decryptData(account.facebookPassword);
    } catch {
      // If decryption fails, return raw (old plaintext password)
      return account.facebookPassword;
    }
  }
}