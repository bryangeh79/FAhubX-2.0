import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AccountHealthService } from './account-health.service';
import { HealthAlert } from './entities/health-alert.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('健康监控')
@ApiBearerAuth()
@Controller('health')
@UseGuards(JwtAuthGuard)
export class AccountHealthController {
  constructor(private readonly accountHealthService: AccountHealthService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取健康监控概览' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getHealthOverview(@GetUser() user: User) {
    return this.accountHealthService.getUserHealthOverview(user.id);
  }

  @Get('accounts/:accountId')
  @ApiOperation({ summary: '获取账号健康详情' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '账号不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getAccountHealth(
    @GetUser() user: User,
    @Param('accountId') accountId: string,
  ) {
    return this.accountHealthService.getAccountHealth(user.id, accountId);
  }

  @Post('check')
  @ApiOperation({ summary: '手动触发健康检查' })
  @ApiQuery({ name: 'accountIds', required: false, type: [String], description: '指定账号ID列表，不指定则检查所有账号' })
  @ApiResponse({ status: 200, description: '检查完成' })
  @ApiResponse({ status: 401, description: '未授权' })
  async triggerHealthCheck(
    @GetUser() user: User,
    @Query('accountIds') accountIds?: string[],
  ) {
    const ids = accountIds ? (Array.isArray(accountIds) ? accountIds : [accountIds]) : undefined;
    return this.accountHealthService.triggerManualHealthCheck(user.id, ids);
  }

  @Get('alerts')
  @ApiOperation({ summary: '获取健康告警列表' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'resolved', 'acknowledged'], description: '告警状态过滤' })
  @ApiQuery({ name: 'severity', required: false, enum: ['info', 'warning', 'error', 'critical'], description: '告警严重程度过滤' })
  @ApiQuery({ name: 'type', required: false, enum: ['health', 'performance', 'security', 'system'], description: '告警类型过滤' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认为1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量，默认为20' })
  @ApiResponse({ status: 200, description: '获取成功', type: [HealthAlert] })
  @ApiResponse({ status: 401, description: '未授权' })
  async getAlerts(
    @GetUser() user: User,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('type') type?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    // 这里需要实现过滤逻辑
    // 暂时返回所有告警
    const alerts = await this.accountHealthService['healthAlertRepository'].find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
      skip: (parseInt(page as any) - 1) * parseInt(limit as any),
      take: parseInt(limit as any),
    });

    return alerts;
  }

  @Put('alerts/:alertId/acknowledge')
  @ApiOperation({ summary: '确认告警' })
  @ApiResponse({ status: 200, description: '确认成功', type: HealthAlert })
  @ApiResponse({ status: 404, description: '告警不存在' })
  @ApiResponse({ status: 400, description: '告警已解决' })
  @ApiResponse({ status: 401, description: '未授权' })
  async acknowledgeAlert(
    @GetUser() user: User,
    @Param('alertId') alertId: string,
  ) {
    return this.accountHealthService.acknowledgeAlert(user.id, alertId);
  }

  @Put('alerts/:alertId/resolve')
  @ApiOperation({ summary: '解决告警' })
  @ApiResponse({ status: 200, description: '解决成功', type: HealthAlert })
  @ApiResponse({ status: 404, description: '告警不存在' })
  @ApiResponse({ status: 400, description: '告警已解决' })
  @ApiResponse({ status: 401, description: '未授权' })
  async resolveAlert(
    @GetUser() user: User,
    @Param('alertId') alertId: string,
    @Body('resolutionDescription') resolutionDescription: string,
  ) {
    return this.accountHealthService.resolveAlert(user.id, alertId, resolutionDescription);
  }

  @Get('reports/daily')
  @ApiOperation({ summary: '生成每日健康报告' })
  @ApiQuery({ name: 'date', required: false, type: Date, description: '报告日期，默认为今天' })
  @ApiResponse({ status: 200, description: '报告生成成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async generateDailyReport(
    @GetUser() user: User,
    @Query('date') date?: Date,
  ) {
    const reportDate = date || new Date();
    const reportDateStr = reportDate.toISOString().split('T')[0];

    // 获取当天的健康数据
    const startDate = new Date(reportDateStr);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const healthData = await this.accountHealthService.getUserHealthOverview(user.id);

    return {
      date: reportDateStr,
      summary: {
        totalAccounts: healthData.totalAccounts,
        healthyAccounts: healthData.healthyAccounts,
        warningAccounts: healthData.warningAccounts,
        criticalAccounts: healthData.criticalAccounts,
        avgHealthScore: healthData.avgHealthScore,
      },
      alerts: healthData.recentAlerts.filter(alert => {
        const alertDate = new Date(alert.createdAt).toISOString().split('T')[0];
        return alertDate === reportDateStr;
      }),
      recommendations: this.generateRecommendations(healthData),
      generatedAt: new Date().toISOString(),
    };
  }

  private generateRecommendations(healthData: any): string[] {
    const recommendations: string[] = [];

    if (healthData.criticalAccounts > 0) {
      recommendations.push(`有 ${healthData.criticalAccounts} 个账号处于严重异常状态，建议立即处理`);
    }

    if (healthData.warningAccounts > 0) {
      recommendations.push(`有 ${healthData.warningAccounts} 个账号处于警告状态，建议检查并修复`);
    }

    if (healthData.avgHealthScore < 80) {
      recommendations.push(`平均健康评分较低 (${healthData.avgHealthScore}分)，建议优化账号配置`);
    }

    if (healthData.recentAlerts.length > 5) {
      recommendations.push(`最近告警数量较多 (${healthData.recentAlerts.length}个)，建议检查系统稳定性`);
    }

    if (recommendations.length === 0) {
      recommendations.push('所有账号健康状态良好，继续保持');
    }

    return recommendations;
  }
}