import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcryptjs';

@ApiTags('Admin - 用户管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  private readonly logger = new Logger(AdminUsersController.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  private assertAdmin(req: any) {
    if (req.user?.role !== 'admin') {
      throw Object.assign(new Error('无权限，仅管理员可操作'), { status: 403 });
    }
  }

  /** 获取所有租户列表 */
  @Get()
  @ApiOperation({ summary: '获取所有用户（Admin）' })
  async findAll(@Request() req, @Query('page') page = '1', @Query('limit') limit = '20') {
    this.assertAdmin(req);
    const [users, total] = await this.userRepo.findAndCount({
      order: { createdAt: 'DESC' },
      take: Math.min(parseInt(limit), 100),
      skip: (parseInt(page) - 1) * parseInt(limit),
      select: ['id', 'email', 'username', 'fullName', 'role', 'plan', 'maxAccounts', 'subscriptionExpiry', 'status', 'createdAt', 'emailVerified'],
    });
    return { users, total, page: parseInt(page), limit: parseInt(limit) };
  }

  /** 创建新租户 */
  @Post()
  @ApiOperation({ summary: '创建新租户账号（Admin）' })
  async create(@Request() req, @Body() body: {
    email: string;
    username: string;
    password: string;
    fullName?: string;
    role?: 'admin' | 'tenant';
    plan?: 'basic' | 'pro' | 'enterprise';
    subscriptionExpiry?: string | null;
  }) {
    this.assertAdmin(req);
    const existing = await this.userRepo.findOne({ where: [{ email: body.email }, { username: body.username }] });
    if (existing) throw Object.assign(new Error('邮箱或用户名已存在'), { status: 400 });

    const plan = body.plan || 'basic';
    const planDefaults = User.getPlanDefaults(plan);
    const maxAccounts = planDefaults.maxAccounts;
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = this.userRepo.create({
      email: body.email.toLowerCase().trim(),
      username: body.username.toLowerCase().trim(),
      passwordHash,
      fullName: body.fullName || body.username,
      role: body.role || 'tenant',
      plan,
      maxAccounts,
      maxTasks: planDefaults.maxTasks,
      maxScripts: planDefaults.maxScripts,
      subscriptionExpiry: body.subscriptionExpiry ? new Date(body.subscriptionExpiry) : null,
      status: 'active',
      emailVerified: true,
    } as any);
    const saved = await this.userRepo.save(user);
    const { passwordHash: _, ...result } = saved as any;

    // ── 自动在 License Server 创建对应的 License Key ───────────────────
    let licenseKey: string | null = null;
    try {
      const licenseServerUrl = this.configService.get('LICENSE_SERVER_URL', 'https://license.starbright-solutions.com');
      const adminApiKey = this.configService.get('LICENSE_ADMIN_KEY', '');
      if (adminApiKey) {
        const { default: axios } = await import('axios');
        const licenseRes = await axios.post(`${licenseServerUrl}/admin/licenses`, {
          tenantName: body.fullName || body.username,
          // v2: 传送完整租户信息，让本地激活时自动创建用户
          tenantEmail: body.email.toLowerCase().trim(),
          tenantUsername: body.username.toLowerCase().trim(),
          passwordHash,   // bcrypt 哈希，不是明文
          plan,
          maxScripts: planDefaults.maxScripts,
          subscriptionExpiry: body.subscriptionExpiry || null,
          expiresAt: body.subscriptionExpiry || null,
          notes: `Auto-created for user ${(saved as any).id} (${body.email})`,
        }, {
          headers: { Authorization: `Bearer ${adminApiKey}` },
          timeout: 10000,
        });
        licenseKey = licenseRes.data?.license?.licenseKey || null;
        this.logger.log(`🔑 License Key 已自动生成: ${licenseKey} (tenant: ${body.email})`);
      } else {
        this.logger.warn('⚠️ LICENSE_ADMIN_KEY 未配置，跳过 License Key 自动生成');
      }
    } catch (err: any) {
      this.logger.error(`⚠️ License Key 生成失败: ${err.message}（不影响租户创建）`);
    }

    return { ...result, licenseKey };
  }

  /** 修改用户状态 / 角色 */
  @Patch(':id')
  @ApiOperation({ summary: '更新用户（Admin）' })
  async update(@Request() req, @Param('id') id: string, @Body() body: {
    status?: 'active' | 'suspended';
    role?: 'admin' | 'tenant';
    fullName?: string;
    password?: string;
    plan?: 'basic' | 'pro' | 'enterprise';
    subscriptionExpiry?: string | null;
  }) {
    this.assertAdmin(req);
    const update: any = {};
    if (body.status) update.status = body.status;
    if (body.role) update.role = body.role;
    if (body.fullName) update.fullName = body.fullName;
    if (body.password) update.passwordHash = await bcrypt.hash(body.password, 12);
    if (body.plan) {
      update.plan = body.plan;
      const defaults = User.getPlanDefaults(body.plan);
      update.maxAccounts = defaults.maxAccounts;
      update.maxTasks = defaults.maxTasks;
      update.maxScripts = defaults.maxScripts;
    }
    if ('subscriptionExpiry' in body) update.subscriptionExpiry = body.subscriptionExpiry ? new Date(body.subscriptionExpiry) : null;
    await this.userRepo.update({ id }, update);

    // 同步到 License Server（密码/套餐/订阅到期变更时）
    try {
      const licenseServerUrl = this.configService.get('LICENSE_SERVER_URL', 'https://license.starbright-solutions.com');
      const adminApiKey = this.configService.get('LICENSE_ADMIN_KEY', '');
      if (adminApiKey && (body.password || body.plan || 'subscriptionExpiry' in body)) {
        const userAfter = await this.userRepo.findOne({ where: { id } });
        if (userAfter) {
          const { default: axios } = await import('axios');
          // 查找该用户的 License（通过 tenant_email）
          const listRes = await axios.get(`${licenseServerUrl}/admin/licenses`, {
            headers: { Authorization: `Bearer ${adminApiKey}` },
            timeout: 10000,
          });
          const licenses = listRes.data?.licenses || [];
          const myLicense = licenses.find((l: any) => l.tenant_email === userAfter.email);
          if (myLicense) {
            const patch: any = {};
            if (body.password) patch.passwordHash = update.passwordHash;
            if (body.plan) patch.plan = body.plan;
            if ('subscriptionExpiry' in body) {
              patch.subscriptionExpiry = body.subscriptionExpiry || null;
              patch.expiresAt = body.subscriptionExpiry || null;
            }
            if (Object.keys(patch).length > 0) {
              await axios.patch(`${licenseServerUrl}/admin/licenses/${myLicense.id}`, patch, {
                headers: { Authorization: `Bearer ${adminApiKey}` },
                timeout: 10000,
              });
              this.logger.log(`🔑 License ${myLicense.license_key} synced (tenant: ${userAfter.email})`);
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`⚠️ License Server 同步失败: ${err.message}（不影响本地更新）`);
    }

    return this.userRepo.findOne({ where: { id }, select: ['id', 'email', 'username', 'fullName', 'role', 'plan', 'maxAccounts', 'status', 'subscriptionExpiry', 'createdAt'] });
  }

  /** 删除用户 */
  @Delete(':id')
  @ApiOperation({ summary: '删除用户（Admin）' })
  async remove(@Request() req, @Param('id') id: string) {
    this.assertAdmin(req);
    if (id === req.user.id) throw Object.assign(new Error('不能删除自己的账号'), { status: 400 });
    await this.userRepo.delete({ id });
    return { success: true };
  }

  /** 获取系统概览统计 */
  @Get('stats/overview')
  @ApiOperation({ summary: '系统统计（Admin）' })
  async stats(@Request() req) {
    this.assertAdmin(req);
    const [totalUsers, activeUsers, adminCount, tenantCount] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { status: 'active' } }),
      this.userRepo.count({ where: { role: 'admin' } } as any),
      this.userRepo.count({ where: { role: 'tenant' } } as any),
    ]);
    return { totalUsers, activeUsers, adminCount, tenantCount };
  }
}
