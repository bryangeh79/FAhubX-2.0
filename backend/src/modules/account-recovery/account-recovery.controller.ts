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
  ApiQuery,
} from '@nestjs/swagger';
import { AccountRecoveryService } from './account-recovery.service';
import { RecoveryLog } from './entities/recovery-log.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('自动恢复')
@ApiBearerAuth()
@Controller('recovery')
@UseGuards(JwtAuthGuard)
export class AccountRecoveryController {
  constructor(private readonly accountRecoveryService: AccountRecoveryService) {}

  @Post('accounts/:accountId/trigger')
  @ApiOperation({ summary: '手动触发账号恢复' })
  @ApiQuery({ name: 'type', required: false, enum: ['reconnect', 'refresh_token', 'switch_account', 'restart', 'fallback'], description: '指定恢复类型' })
  @ApiResponse({ status: 200, description: '恢复触发成功' })
  @ApiResponse({ status: 404, description: '账号不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async triggerRecovery(
    @GetUser() user: User,
    @Param('accountId') accountId: string,
    @Query('type') type?: string,
  ) {
    return this.accountRecoveryService.triggerManualRecovery(
      user.id,
      accountId,
      type as any,
    );
  }

  @Get('logs')
  @ApiOperation({ summary: '获取恢复日志列表' })
  @ApiQuery({ name: 'accountId', required: false, type: String, description: '按账号ID过滤' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'running', 'success', 'failed', 'cancelled'], description: '按状态过滤' })
  @ApiQuery({ name: 'type', required: false, enum: ['reconnect', 'refresh_token', 'switch_account', 'restart', 'fallback'], description: '按恢复类型过滤' })
  @ApiQuery({ name: 'startDate', required: false, type: Date, description: '开始日期过滤' })
  @ApiQuery({ name: 'endDate', required: false, type: Date, description: '结束日期过滤' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认为1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量，默认为20' })
  @ApiResponse({ status: 200, description: '获取成功', type: [RecoveryLog] })
  @ApiResponse({ status: 401, description: '未授权' })
  async getRecoveryLogs(
    @GetUser() user: User,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    // 这里需要实现过滤逻辑
    // 暂时返回所有日志
    const where: any = { userId: user.id };
    
    if (accountId) where.accountId = accountId;
    if (status) where.status = status;
    if (type) where.recoveryType = type;

    const logs = await this.accountRecoveryService['recoveryLogRepository'].find({
      where,
      order: { createdAt: 'DESC' },
      skip: (parseInt(page as any) - 1) * parseInt(limit as any),
      take: parseInt(limit as any),
    });

    return logs;
  }

  @Get('statistics')
  @ApiOperation({ summary: '获取恢复统计信息' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getRecoveryStatistics(@GetUser() user: User) {
    return this.accountRecoveryService.getRecoveryStatistics(user.id);
  }

  @Get('config')
  @ApiOperation({ summary: '获取恢复配置' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getRecoveryConfig() {
    return {
      checkInterval: 60000, // 1分钟
      maxRecoveryAttempts: 3,
      recoveryTimeout: 30000, // 30秒
      fallbackEnabled: true,
      autoRecoveryEnabled: true,
      description: '自动恢复系统配置',
    };
  }

  @Get('status/:accountId')
  @ApiOperation({ summary: '获取账号恢复状态' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '账号不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getAccountRecoveryStatus(
    @GetUser() user: User,
    @Param('accountId') accountId: string,
  ) {
    const account = await this.accountRecoveryService['facebookAccountRepository'].findOne({
      where: { id: accountId, userId: user.id },
    });

    if (!account) {
      throw new Error('账号不存在');
    }

    // 获取最近的恢复尝试
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentRecoveries = await this.accountRecoveryService['recoveryLogRepository'].find({
      where: {
        userId: user.id,
        accountId,
        createdAt: new Date(oneDayAgo) as any,
      },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    // 分析恢复状态
    const lastRecovery = recentRecoveries[0];
    const recoveryInProgress = recentRecoveries.some(log => log.status === 'running');
    const recentSuccess = recentRecoveries.some(log => 
      log.status === 'success' && 
      new Date(log.createdAt).getTime() > Date.now() - 30 * 60 * 1000 // 30分钟内
    );

    return {
      accountId,
      currentStatus: account.status,
      healthScore: account.healthScore,
      recoveryAttempts: account.recoveryAttempts || 0,
      lastRecoveryAt: account.lastRecoveryAt,
      recoveryStrategy: account.recoveryStrategy,
      recoveryInProgress,
      recentSuccess,
      lastRecovery: lastRecovery ? {
        id: lastRecovery.id,
        type: lastRecovery.recoveryType,
        status: lastRecovery.status,
        createdAt: lastRecovery.createdAt,
        duration: lastRecovery.duration,
        error: lastRecovery.errorMessage,
      } : null,
      recommendations: this.generateRecommendations(account, recentRecoveries),
    };
  }

  private generateRecommendations(account: FacebookAccount, recentRecoveries: RecoveryLog[]): string[] {
    const recommendations: string[] = [];

    if (account.status === 'error') {
      if (account.recoveryAttempts && account.recoveryAttempts >= 3) {
        recommendations.push('恢复尝试次数已达上限，建议人工干预');
      } else if (recentRecoveries.length === 0) {
        recommendations.push('检测到异常状态，建议立即触发恢复');
      } else {
        const lastFailed = recentRecoveries.find(log => log.status === 'failed');
        if (lastFailed) {
          recommendations.push(`上次恢复失败: ${lastFailed.errorMessage || '未知错误'}`);
        }
      }
    }

    if (account.healthScore && account.healthScore < 50) {
      recommendations.push('健康评分过低，建议检查账号配置');
    }

    if (account.recoveryAttempts && account.recoveryAttempts > 5) {
      recommendations.push('频繁恢复尝试，可能存在系统性问题');
    }

    if (recommendations.length === 0) {
      recommendations.push('账号状态正常，无需恢复操作');
    }

    return recommendations;
  }
}