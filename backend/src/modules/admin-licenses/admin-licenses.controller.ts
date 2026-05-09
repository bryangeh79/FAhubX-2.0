import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Logger } from '@nestjs/common';
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
export class AdminLicensesController {
  private readonly logger = new Logger(AdminLicensesController.name);

  constructor(private readonly configService: ConfigService) {}

  private assertAdmin(req: any) {
    if (req.user?.role !== 'admin') {
      throw Object.assign(new Error('无权限，仅管理员可操作'), { status: 403 });
    }
  }

  private getServerConfig() {
    const url = this.configService.get('LICENSE_SERVER_URL', 'https://license.starbright-solutions.com');
    const key = this.configService.get('LICENSE_ADMIN_KEY', '');
    if (!key) throw Object.assign(new Error('LICENSE_ADMIN_KEY 未配置'), { status: 500 });
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
      throw Object.assign(new Error('License Server 连接失败'), { status: 502 });
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
      throw Object.assign(new Error('License Server 连接失败'), { status: 502 });
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
      throw Object.assign(new Error('解绑失败：' + err.message), { status: 502 });
    }
  }

  /** 修改 License（停用/启用、延期、改套餐） */
  @Patch(':id')
  @ApiOperation({ summary: '修改 License（Admin）' })
  async update(@Request() req, @Param('id') id: string, @Body() body: any) {
    this.assertAdmin(req);
    const { url, key } = this.getServerConfig();
    const { default: axios } = await import('axios');
    try {
      const res = await axios.patch(`${url}/admin/licenses/${id}`, body, {
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
      });
      this.logger.log(`✏️ License ${id} 已更新 (by admin ${req.user.email})`);
      return res.data;
    } catch (err: any) {
      throw Object.assign(new Error('更新失败：' + err.message), { status: 502 });
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
      throw Object.assign(new Error('删除失败：' + err.message), { status: 502 });
    }
  }
}
