import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VpnIntegrationService } from './vpn-integration.service';
import { VpnConfig } from './entities/vpn-config.entity';
import { IpPool } from './entities/ip-pool.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('VPN/IP集成')
@ApiBearerAuth()
@Controller('vpn')
@UseGuards(JwtAuthGuard)
export class VpnIntegrationController {
  constructor(private readonly vpnIntegrationService: VpnIntegrationService) {}

  @Get('configs')
  @ApiOperation({ summary: '获取VPN配置列表' })
  @ApiResponse({ status: 200, description: '获取成功', type: [VpnConfig] })
  @ApiResponse({ status: 401, description: '未授权' })
  async getVpnConfigs(@GetUser() user: User) {
    return this.vpnIntegrationService.getUserVpnConfigs(user.id);
  }

  @Get('ip-pools')
  @ApiOperation({ summary: '获取IP地址池列表' })
  @ApiResponse({ status: 200, description: '获取成功', type: [IpPool] })
  @ApiResponse({ status: 401, description: '未授权' })
  async getIpPools(@GetUser() user: User) {
    return this.vpnIntegrationService.getUserIpPools(user.id);
  }

  @Post('accounts/:accountId/allocate-ip')
  @ApiOperation({ summary: '为账号分配IP地址' })
  @ApiResponse({ status: 200, description: '分配成功' })
  @ApiResponse({ status: 404, description: '账号不存在' })
  @ApiResponse({ status: 400, description: '分配失败' })
  @ApiResponse({ status: 401, description: '未授权' })
  async allocateIpForAccount(
    @GetUser() user: User,
    @Param('accountId') accountId: string,
    @Query('ipPoolId') ipPoolId?: string,
  ) {
    return this.vpnIntegrationService.allocateIpForAccount(user.id, accountId, ipPoolId);
  }

  @Post('accounts/:accountId/rotate-ip')
  @ApiOperation({ summary: '轮换账号的IP地址' })
  @ApiResponse({ status: 200, description: '轮换成功' })
  @ApiResponse({ status: 404, description: '账号不存在' })
  @ApiResponse({ status: 400, description: '轮换失败' })
  @ApiResponse({ status: 401, description: '未授权' })
  async rotateIpForAccount(
    @GetUser() user: User,
    @Param('accountId') accountId: string,
  ) {
    return this.vpnIntegrationService.rotateIpForAccount(user.id, accountId);
  }

  @Post('configs/:configId/test')
  @ApiOperation({ summary: '测试VPN连接' })
  @ApiResponse({ status: 200, description: '测试完成' })
  @ApiResponse({ status: 404, description: 'VPN配置不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async testVpnConnection(
    @GetUser() user: User,
    @Param('configId') configId: string,
  ) {
    return this.vpnIntegrationService.testVpnConnection(user.id, configId);
  }

  @Get('overview')
  @ApiOperation({ summary: '获取网络状态概览' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getNetworkOverview(@GetUser() user: User) {
    return this.vpnIntegrationService.getNetworkOverview(user.id);
  }

  @Post('rotate-all')
  @ApiOperation({ summary: '轮换所有需要轮换的账号IP' })
  @ApiResponse({ status: 200, description: '轮换完成' })
  @ApiResponse({ status: 401, description: '未授权' })
  async rotateAllIps(@GetUser() user: User) {
    // 获取用户的所有账号
    const accounts = await this.vpnIntegrationService['facebookAccountRepository'].find({
      where: { userId: user.id, status: 'active', ipPoolId: { $not: null } as any },
    });

    let rotatedCount = 0;
    let failedCount = 0;

    for (const account of accounts) {
      const result = await this.vpnIntegrationService.rotateIpForAccount(user.id, account.id);
      if (result.success) {
        rotatedCount++;
      } else {
        failedCount++;
      }
    }

    return {
      success: true,
      message: `IP地址轮换完成`,
      stats: {
        totalAccounts: accounts.length,
        rotatedCount,
        failedCount,
      },
    };
  }

  @Get('status')
  @ApiOperation({ summary: '获取VPN/IP系统状态' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getSystemStatus(@GetUser() user: User) {
    const overview = await this.vpnIntegrationService.getNetworkOverview(user.id);
    
    // 获取最近的VPN测试结果
    const vpnConfigs = await this.vpnIntegrationService.getUserVpnConfigs(user.id);
    const recentTests = vpnConfigs
      .filter(config => config.lastTestedAt)
      .sort((a, b) => new Date(b.lastTestedAt!).getTime() - new Date(a.lastTestedAt!).getTime())
      .slice(0, 5)
      .map(config => ({
        name: config.name,
        status: config.status,
        lastTested: config.lastTestedAt,
        qualityScore: config.qualityScore,
      }));

    // 获取IP池使用情况
    const ipPools = await this.vpnIntegrationService.getUserIpPools(user.id);
    const poolUsage = ipPools.map(pool => ({
      name: pool.name,
      utilization: pool.getUtilizationRate(),
      available: pool.availableCount,
      allocated: pool.allocatedCount,
      status: pool.status,
    }));

    return {
      overview,
      recentTests,
      poolUsage,
      systemStatus: this.calculateSystemStatus(overview, recentTests, poolUsage),
      lastUpdated: new Date().toISOString(),
    };
  }

  private calculateSystemStatus(
    overview: any,
    recentTests: any[],
    poolUsage: any[],
  ): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 检查VPN配置
    if (overview.vpnConfigs.error > 0) {
      issues.push(`有 ${overview.vpnConfigs.error} 个VPN配置处于错误状态`);
      recommendations.push('检查并修复错误的VPN配置');
    }

    if (overview.vpnConfigs.total === 0) {
      issues.push('未配置任何VPN连接');
      recommendations.push('添加VPN配置以提高账号安全性');
    }

    // 检查IP池
    if (overview.ipPools.depleted > 0) {
      issues.push(`有 ${overview.ipPools.depleted} 个IP地址池已耗尽`);
      recommendations.push('添加更多IP地址或清理已分配的IP');
    }

    if (overview.ipPools.total === 0) {
      issues.push('未配置任何IP地址池');
      recommendations.push('配置IP地址池以支持IP轮换');
    }

    // 检查账号IP分配
    if (overview.accounts.withoutIp > 0) {
      issues.push(`有 ${overview.accounts.withoutIp} 个账号未分配IP地址`);
      recommendations.push('为未分配IP的账号分配IP地址');
    }

    // 检查网络质量
    if (overview.avgNetworkQuality < 70) {
      issues.push(`平均网络质量较低: ${overview.avgNetworkQuality}分`);
      recommendations.push('优化网络连接，考虑更换VPN节点');
    }

    // 确定系统状态
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (issues.length === 0) {
      status = 'healthy';
      recommendations.push('系统运行正常，继续保持');
    } else if (issues.some(issue => issue.includes('错误') || issue.includes('耗尽') || overview.avgNetworkQuality < 50)) {
      status = 'critical';
    } else {
      status = 'warning';
    }

    return {
      status,
      issues,
      recommendations,
    };
  }
}