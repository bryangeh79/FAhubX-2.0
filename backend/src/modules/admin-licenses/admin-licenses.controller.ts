import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Logger, ForbiddenException, ServiceUnavailableException, BadGatewayException, OnApplicationBootstrap } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Admin License 管理控制器
 * 代理转发 License Server 的 admin API，让前端能通过 JWT 认证访问
 * 所有请求都需要 admin 角色
 */
@ApiTags('Admin - License 管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/licenses')
export class AdminLicensesController implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminLicensesController.name);

  constructor(private readonly configService: ConfigService) {}

  onApplicationBootstrap() {
    const key = this.configService.get('LICENSE_ADMIN_KEY', '');
    const configured = Boolean(key);
    if (configured) {
      this.logger.log('License Server admin key: configured ✅');
    } else {
      this.logger.warn(
        'License Server admin key: NOT configured ⚠️ — ' +
        'add LICENSE_ADMIN_KEY=<key> to backend/.env and restart FAhubX.',
      );
    }
  }

  private assertAdmin(req: any) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Access denied: admin role required.');
    }
  }

  private getServerConfig() {
    const url = this.configService.get('LICENSE_SERVER_URL', 'https://license.starbright-solutions.com');
    const key = this.configService.get('LICENSE_ADMIN_KEY', '');
    if (!key) {
      throw new ServiceUnavailableException(
        'LICENSE_ADMIN_KEY is not configured. ' +
        'Add LICENSE_ADMIN_KEY=<your-admin-key> to backend/.env and restart the backend.',
      );
    }
    return { url, key };
  }

  /** 获取所有 License 列表 */
  @Get()
  @ApiOperation({ summary: '获取所有 License（Admin）' })
  async list(@Request() req) {
    this.assertAdmin(req);
    const { url, key } = this.getServerConfig();
    const { default: axios } = await import('axios');
    try {
      const res = await axios.get(`${url}/admin/licenses`, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      });
      return res.data;
    } catch (err: any) {
      this.logger.error(`获取 License 列表失败: ${err.message}`);
      throw new BadGatewayException('Cannot reach License Server: ' + err.message);
    }
  }

  /** 获取 Dashboard 统计 */
  @Get('dashboard')
  @ApiOperation({ summary: '获取 License 统计概览（Admin）' })
  async dashboard(@Request() req) {
    this.assertAdmin(req);
    const { url, key } = this.getServerConfig();
    const { default: axios } = await import('axios');
    try {
      const res = await axios.get(`${url}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      });
      return res.data;
    } catch (err: any) {
      throw new BadGatewayException('Cannot reach License Server: ' + err.message);
    }
  }

  /** 创建新 License（发授权给客户） */
  @Post()
  @ApiOperation({ summary: '创建新 License（Admin）' })
  async create(@Request() req, @Body() body: any) {
    this.assertAdmin(req);
    const { url, key } = this.getServerConfig();
    const { default: axios } = await import('axios');
    // Whitelist — only forward expected fields; never pass arbitrary body to Cloudflare
    const payload: Record<string, any> = {};
    if (body.tenantName)        payload.tenantName        = String(body.tenantName).slice(0, 200);
    if (body.tenantEmail)       payload.tenantEmail       = String(body.tenantEmail).slice(0, 255);
    if (body.tenantUsername)    payload.tenantUsername    = String(body.tenantUsername).slice(0, 100);
    if (body.plan)              payload.plan              = String(body.plan).slice(0, 20);
    if (body.expiresAt)         payload.expiresAt         = body.expiresAt;
    if (body.subscriptionExpiry) payload.subscriptionExpiry = body.subscriptionExpiry;
    if (body.notes)             payload.notes             = String(body.notes).slice(0, 500);
    try {
      const res = await axios.post(`${url}/admin/licenses`, payload, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      });
      this.logger.log(`🔑 New license created (by admin ${req.user.email}): plan=${payload.plan || '?'}`);
      return res.data;
    } catch (err: any) {
      const status = err.response?.status;
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      this.logger.error(`创建 License 失败: HTTP ${status}`);
      // Return actionable message; do not expose internal URL/token/stack
      throw new BadGatewayException(
        status === 400 && serverMsg
          ? `Validation error: ${serverMsg}`
          : 'License Server returned an error. Check your configuration and try again.',
      );
    }
  }

  /** 解绑机器（租户换电脑时用） */
  @Post(':id/unbind')
  @ApiOperation({ summary: '解绑 License 的机器绑定（Admin）' })
  async unbind(@Request() req, @Param('id') id: string) {
    this.assertAdmin(req);
    const { url, key } = this.getServerConfig();
    const { default: axios } = await import('axios');
    try {
      const res = await axios.post(`${url}/admin/licenses/${id}/unbind`, {}, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      });
      this.logger.log(`🔓 License ${id} 机器已解绑 (by admin ${req.user.email})`);
      return res.data;
    } catch (err: any) {
      this.logger.error(`Unbind License ${id} 失败: HTTP ${err.response?.status}`);
      throw new BadGatewayException('Unbind failed. Check License Server connectivity.');
    }
  }

  /** 修改 License（停用/启用、延期、改套餐） */
  @Patch(':id')
  @ApiOperation({ summary: '修改 License（Admin）' })
  async update(@Request() req, @Param('id') id: string, @Body() body: any) {
    this.assertAdmin(req);
    const { url, key } = this.getServerConfig();
    const { default: axios } = await import('axios');
    // Whitelist — only forward expected update fields
    const payload: Record<string, any> = {};
    if (body.active !== undefined)          payload.active              = Boolean(body.active);
    if (body.plan)                          payload.plan                = String(body.plan).slice(0, 20);
    if (body.tenantName)                    payload.tenantName          = String(body.tenantName).slice(0, 200);
    if (body.tenantEmail !== undefined)     payload.tenantEmail         = body.tenantEmail;
    if (body.tenantUsername !== undefined)  payload.tenantUsername      = body.tenantUsername;
    if ('expiresAt' in body)               payload.expiresAt           = body.expiresAt;
    if ('subscriptionExpiry' in body)       payload.subscriptionExpiry  = body.subscriptionExpiry;
    if (body.notes !== undefined)           payload.notes               = body.notes ? String(body.notes).slice(0, 500) : body.notes;
    try {
      const res = await axios.patch(`${url}/admin/licenses/${id}`, payload, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      });
      this.logger.log(`✏️ License ${id} 已更新 (by admin ${req.user.email})`);
      return res.data;
    } catch (err: any) {
      this.logger.error(`更新 License ${id} 失败: HTTP ${err.response?.status}`);
      throw new BadGatewayException('Update failed. Check License Server connectivity.');
    }
  }

  /** 删除 License */
  @Delete(':id')
  @ApiOperation({ summary: '删除 License（Admin）' })
  async remove(@Request() req, @Param('id') id: string) {
    this.assertAdmin(req);
    const { url, key } = this.getServerConfig();
    const { default: axios } = await import('axios');
    try {
      const res = await axios.delete(`${url}/admin/licenses/${id}`, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      });
      this.logger.log(`🗑️ License ${id} 已删除 (by admin ${req.user.email})`);
      return res.data;
    } catch (err: any) {
      this.logger.error(`删除 License ${id} 失败: HTTP ${err.response?.status}`);
      throw new BadGatewayException('Delete failed. Check License Server connectivity.');
    }
  }
}
