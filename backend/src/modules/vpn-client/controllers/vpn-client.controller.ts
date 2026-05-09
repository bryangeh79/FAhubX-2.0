import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { VPNClientService } from '../services/vpn-client.service';
import { CreateVPNConfigDto, UpdateVPNConfigDto } from '../dto/create-vpn-config.dto';
import { CreateIPPoolDto, UpdateIPPoolDto } from '../dto/create-ip-pool.dto';
import { AssignIPDto, ReleaseIPDto, RotateIPDto } from '../dto/assign-ip.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('VPN/IP Management')
@ApiBearerAuth()
@Controller('vpn-ip')
@UseGuards(JwtAuthGuard)
export class VPNClientController {
  constructor(private readonly vpnClientService: VPNClientService) {}

  // VPN配置管理
  @Post('configs')
  @ApiOperation({ summary: '创建VPN配置' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'VPN配置创建成功' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: '请求参数错误' })
  async createVPNConfig(@Body() createDto: CreateVPNConfigDto) {
    return this.vpnClientService['vpnConfigRepository'].save(createDto);
  }

  @Get('configs')
  @ApiOperation({ summary: '获取VPN配置列表' })
  @ApiQuery({ name: 'status', required: false, description: '过滤状态' })
  @ApiQuery({ name: 'type', required: false, description: '过滤类型' })
  async getVPNConfigs(
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;

    return this.vpnClientService['vpnConfigRepository'].find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  @Get('configs/:id')
  @ApiOperation({ summary: '获取VPN配置详情' })
  @ApiParam({ name: 'id', description: 'VPN配置ID' })
  async getVPNConfig(@Param('id') id: string) {
    return this.vpnClientService.getVPNConfigStatus(id);
  }

  @Put('configs/:id')
  @ApiOperation({ summary: '更新VPN配置' })
  @ApiParam({ name: 'id', description: 'VPN配置ID' })
  async updateVPNConfig(
    @Param('id') id: string,
    @Body() updateDto: UpdateVPNConfigDto,
  ) {
    await this.vpnClientService['vpnConfigRepository'].update(id, updateDto);
    return this.vpnClientService.getVPNConfigStatus(id);
  }

  @Delete('configs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除VPN配置' })
  @ApiParam({ name: 'id', description: 'VPN配置ID' })
  async deleteVPNConfig(@Param('id') id: string) {
    // 先断开连接
    await this.vpnClientService.disconnectVPN(id);
    // 删除配置
    await this.vpnClientService['vpnConfigRepository'].delete(id);
  }

  @Post('configs/:id/connect')
  @ApiOperation({ summary: '连接VPN' })
  @ApiParam({ name: 'id', description: 'VPN配置ID' })
  async connectVPN(@Param('id') id: string) {
    return this.vpnClientService.connectVPN(id);
  }

  @Post('configs/:id/disconnect')
  @ApiOperation({ summary: '断开VPN连接' })
  @ApiParam({ name: 'id', description: 'VPN配置ID' })
  async disconnectVPN(@Param('id') id: string) {
    return this.vpnClientService.disconnectVPN(id);
  }

  @Get('configs/:id/status')
  @ApiOperation({ summary: '获取VPN连接状态' })
  @ApiParam({ name: 'id', description: 'VPN配置ID' })
  async getVPNStatus(@Param('id') id: string) {
    const client = this.vpnClientService['vpnClients'].get(id);
    if (client) {
      return client.getStatus();
    }
    return { connected: false, status: 'not_initialized' };
  }

  // IP地址池管理
  @Post('ip-pools')
  @ApiOperation({ summary: '添加IP到地址池' })
  async createIPPool(@Body() createDto: CreateIPPoolDto) {
    return this.vpnClientService['ipPoolRepository'].save(createDto);
  }

  @Get('ip-pools')
  @ApiOperation({ summary: '获取IP地址池列表' })
  @ApiQuery({ name: 'status', required: false, description: '过滤状态' })
  @ApiQuery({ name: 'type', required: false, description: '过滤类型' })
  @ApiQuery({ name: 'countryCode', required: false, description: '过滤国家代码' })
  async getIPPools(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('countryCode') countryCode?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (countryCode) where.countryCode = countryCode;

    return this.vpnClientService['ipPoolRepository'].find({
      where,
      relations: ['vpnConfig'],
      order: { healthScore: 'DESC' },
    });
  }

  @Get('ip-pools/:id')
  @ApiOperation({ summary: '获取IP详情' })
  @ApiParam({ name: 'id', description: 'IP池ID' })
  async getIPPool(@Param('id') id: string) {
    return this.vpnClientService['ipPoolRepository'].findOne({
      where: { id },
      relations: ['vpnConfig'],
    });
  }

  @Put('ip-pools/:id')
  @ApiOperation({ summary: '更新IP信息' })
  @ApiParam({ name: 'id', description: 'IP池ID' })
  async updateIPPool(
    @Param('id') id: string,
    @Body() updateDto: UpdateIPPoolDto,
  ) {
    await this.vpnClientService['ipPoolRepository'].update(id, updateDto);
    return this.getIPPool(id);
  }

  @Delete('ip-pools/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '从地址池移除IP' })
  @ApiParam({ name: 'id', description: 'IP池ID' })
  async deleteIPPool(@Param('id') id: string) {
    await this.vpnClientService['ipPoolRepository'].delete(id);
  }

  @Post('ip-pools/:id/health-check')
  @ApiOperation({ summary: '执行IP健康检查' })
  @ApiParam({ name: 'id', description: 'IP池ID' })
  async checkIPHealth(@Param('id') id: string) {
    return this.vpnClientService.checkIPHealth(id);
  }

  // IP分配管理
  @Post('ip-pools/assign')
  @ApiOperation({ summary: '分配IP给账号' })
  async assignIP(@Body() assignDto: AssignIPDto) {
    return this.vpnClientService.allocateIP({
      accountId: assignDto.accountId,
      ipPoolId: assignDto.ipPoolId,
      countryCode: assignDto.countryCode,
      ipType: assignDto.ipType as any,
      taskType: assignDto.taskType,
      riskLevel: assignDto.riskLevel as any,
    });
  }

  @Post('ip-pools/release')
  @ApiOperation({ summary: '释放IP' })
  async releaseIP(@Body() releaseDto: ReleaseIPDto) {
    await this.vpnClientService.releaseIP(releaseDto.accountId, releaseDto.mappingId);
    return { success: true, message: 'IP released successfully' };
  }

  @Post('ip-pools/rotate')
  @ApiOperation({ summary: '轮换IP地址' })
  async rotateIP(@Body() rotateDto: RotateIPDto) {
    return this.vpnClientService.rotateIP(rotateDto.accountId, rotateDto.reason);
  }

  // 网络自动化
  @Post('network/auto-connect')
  @ApiOperation({ summary: '自动连接最佳VPN' })
  @ApiQuery({ name: 'accountId', required: true, description: '账号ID' })
  @ApiQuery({ name: 'taskType', required: false, description: '任务类型' })
  async autoConnect(
    @Query('accountId') accountId: string,
    @Query('taskType') taskType?: string,
  ) {
    // 查找最佳VPN配置
    const configs = await this.vpnClientService['vpnConfigRepository'].find({
      where: { status: 'active' },
      order: { healthScore: 'DESC' },
      take: 1,
    });

    if (configs.length === 0) {
      throw new Error('No active VPN config available');
    }

    const bestConfig = configs[0];
    
    // 连接VPN
    await this.vpnClientService.connectVPN(bestConfig.id);

    // 分配IP
    return this.vpnClientService.allocateIP({
      accountId,
      taskType,
    });
  }

  @Get('network/status/:accountId')
  @ApiOperation({ summary: '获取账号网络状态' })
  @ApiParam({ name: 'accountId', description: '账号ID' })
  async getNetworkStatus(@Param('accountId') accountId: string) {
    return this.vpnClientService.getAccountNetworkStatus(accountId);
  }

  // 网络监控
  @Get('network/monitor/metrics')
  @ApiOperation({ summary: '获取网络监控指标' })
  @ApiQuery({ name: 'timeRange', required: false, description: '时间范围 (1h, 24h, 7d, 30d)' })
  async getNetworkMetrics(@Query('timeRange') timeRange: string = '24h') {
    return this.vpnClientService.getNetworkMetrics(
      timeRange as '1h' | '24h' | '7d' | '30d'
    );
  }

  @Get('network/monitor/alerts')
  @ApiOperation({ summary: '获取网络告警列表' })
  @ApiQuery({ name: 'status', required: false, description: '过滤告警状态' })
  @ApiQuery({ name: 'limit', required: false, description: '返回数量限制' })
  async getNetworkAlerts(
    @Query('status') status?: string,
    @Query('limit') limit: string = '50',
  ) {
    const where: any = {};
    if (status) where.status = status;

    return this.vpnClientService['networkMonitorLogRepository'].find({
      where,
      order: { createdAt: 'DESC' },
      take: parseInt(limit),
    });
  }

  @Post('network/monitor/test')
  @ApiOperation({ summary: '执行网络测试' })
  @ApiQuery({ name: 'ipAddress', required: true, description: '测试的IP地址' })
  async runNetworkTest(@Query('ipAddress') ipAddress: string) {
    // 创建临时IP池记录进行测试
    const tempIP = {
      ipAddress,
      vpnConfigId: null,
      status: 'available',
    };

    const savedIP = await this.vpnClientService['ipPoolRepository'].save(tempIP);
    
    try {
      const result = await this.vpnClientService.checkIPHealth(savedIP.id);
      
      // 删除临时记录
      await this.vpnClientService['ipPoolRepository'].delete(savedIP.id);
      
      return result;
    } catch (error) {
      // 确保删除临时记录
      await this.vpnClientService['ipPoolRepository'].delete(savedIP.id);
      throw error;
    }
  }

  @Get('network/monitor/report')
  @ApiOperation({ summary: '生成网络监控报告' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期 (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期 (YYYY-MM-DD)' })
  async generateNetworkReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // 获取VPN配置统计
    const vpnConfigs = await this.vpnClientService['vpnConfigRepository'].find();
    
    // 获取IP池统计
    const ipPools = await this.vpnClientService['ipPoolRepository'].find();
    
    // 获取连接统计
    const connections = await this.vpnClientService['accountIPMappingRepository']
      .createQueryBuilder('mapping')
      .where('mapping.created_at BETWEEN :start AND :end', { start, end })
      .getMany();

    // 获取监控指标
    const metrics = await this.vpnClientService['networkMonitorLogRepository']
      .createQueryBuilder('log')
      .where('log.created_at BETWEEN :start AND :end', { start, end })
      .andWhere('log.metric_value IS NOT NULL')
      .select('log.metric_type', 'metricType')
      .addSelect('AVG(log.metric_value)', 'average')
      .addSelect('MIN(log.metric_value)', 'min')
      .addSelect('MAX(log.metric_value)', 'max')
      .groupBy('log.metric_type')
      .getRawMany();

    return {
      period: { start, end },
      summary: {
        vpnConfigs: vpnConfigs.length,
        ipPools: ipPools.length,
        activeConnections: connections.filter(c => c.status === 'active').length,
        totalConnections: connections.length,
        averageHealthScore: ipPools.reduce((sum, ip) => sum + ip.healthScore, 0) / ipPools.length || 0,
      },
      vpnConfigs: vpnConfigs.map(config => ({
        id: config.id,
        name: config.name,
        type: config.type,
        status: config.status,
        healthScore: config.healthScore,
        totalConnections: config.totalConnections,
      })),
      ipPoolStats: {
        byType: this.groupBy(ipPools, 'type'),
        byStatus: this.groupBy(ipPools, 'status'),
        byCountry: this.groupBy(ipPools, 'countryCode'),
      },
      connectionStats: {
        byType: this.groupBy(connections, 'connectionType'),
        byStatus: this.groupBy(connections, 'status'),
        averageDuration: this.calculateAverageDuration(connections),
      },
      metrics,
      recommendations: this.generateRecommendations(vpnConfigs, ipPools, metrics),
    };
  }

  // 工具方法
  private groupBy(items: any[], key: string): Record<string, number> {
    return items.reduce((acc, item) => {
      const value = item[key] || 'unknown';
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  private calculateAverageDuration(connections: any[]): number {
    const activeConnections = connections.filter(c => c.endTime && c.startTime);
    if (activeConnections.length === 0) return 0;

    const totalDuration = activeConnections.reduce((sum, conn) => {
      const duration = new Date(conn.endTime).getTime() - new Date(conn.startTime).getTime();
      return sum + duration;
    }, 0);

    return totalDuration / activeConnections.length;
  }

  private generateRecommendations(vpnConfigs: any[], ipPools: any[], metrics: any[]): string[] {
    const recommendations: string[] = [];

    // 检查低健康分数的VPN配置
    const lowHealthVPNs = vpnConfigs.filter(config => config.healthScore < 70);
    if (lowHealthVPNs.length > 0) {
      recommendations.push(
        `发现 ${lowHealthVPNs.length} 个VPN配置健康分数低于70，建议检查连接质量。`
      );
    }

    // 检查可用IP不足
    const availableIPs = ipPools.filter(ip => ip.status === 'available');
    const totalIPs = ipPools.length;
    const availableRatio = availableIPs.length / totalIPs;

    if (availableRatio < 0.2) {
      recommendations.push(
        `可用IP比例较低 (${(availableRatio * 100).toFixed(1)}%)，建议添加更多IP资源。`
      );
    }

    // 检查高延迟问题
    const latencyMetrics = metrics.find(m => m.metricType === 'latency');
    if (latencyMetrics && latencyMetrics.average > 300) {
      recommendations.push(
        `平均网络延迟较高 (${latencyMetrics.average.toFixed(1)}ms)，建议优化网络连接。`
      );
    }

    // 检查高丢包率
    const packetLossMetrics = metrics.find(m => m.metricType === 'packet_loss');
    if (packetLossMetrics && packetLossMetrics.average > 10) {
      recommendations.push(
        `平均丢包率较高 (${packetLossMetrics.average.toFixed(1)}%)，建议检查网络稳定性。`
      );
    }

    return recommendations;
  }
}