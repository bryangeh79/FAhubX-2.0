import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HealthCheckLog, HealthCheckStatus, HealthCheckType } from './entities/health-check-log.entity';
import { HealthAlert, AlertStatus, AlertSeverity, AlertType } from './entities/health-alert.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';

@Injectable()
export class AccountHealthService implements OnModuleInit {
  private readonly logger = new Logger(AccountHealthService.name);
  private readonly healthCheckConfig = {
    defaultInterval: 5 * 60 * 1000, // 5分钟
    criticalThreshold: 70, // 严重阈值
    warningThreshold: 85, // 警告阈值
    maxFailedAttempts: 3, // 最大失败尝试次数
    retentionDays: 30, // 数据保留天数
  };

  constructor(
    @InjectRepository(HealthCheckLog)
    private readonly healthCheckLogRepository: Repository<HealthCheckLog>,
    @InjectRepository(HealthAlert)
    private readonly healthAlertRepository: Repository<HealthAlert>,
    @InjectRepository(FacebookAccount)
    private readonly facebookAccountRepository: Repository<FacebookAccount>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.logger.log('账号健康监控服务已启动');
  }

  /**
   * 定时健康检查任务
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledHealthCheck(): Promise<void> {
    this.logger.log('开始定时健康检查');

    try {
      // 获取所有活跃账号
      const accounts = await this.facebookAccountRepository.find({
        where: {
          status: 'active',
          deletedAt: null,
        },
        take: 10, // 最多10个账号
      });

      if (accounts.length === 0) {
        this.logger.log('没有活跃账号需要检查');
        return;
      }

      // 并发执行健康检查
      const checkPromises = accounts.map(account => 
        this.performHealthCheck(account.userId, account.id)
      );

      await Promise.allSettled(checkPromises);

      this.logger.log(`定时健康检查完成，检查了 ${accounts.length} 个账号`);

    } catch (error) {
      this.logger.error(`定时健康检查失败: ${error.message}`);
    }
  }

  /**
   * 执行账号健康检查
   */
  async performHealthCheck(userId: string, accountId: string): Promise<void> {
    const account = await this.facebookAccountRepository.findOne({
      where: { id: accountId, userId },
    });

    if (!account) {
      this.logger.warn(`账号不存在: ${accountId}`);
      return;
    }

    try {
      // 执行各项检查
      const checks = await Promise.allSettled([
        this.checkLoginStatus(account),
        this.checkSessionValidity(account),
        this.checkApiResponse(account),
        this.checkNetworkConnection(account),
        this.checkResourceUsage(account),
      ]);

      // 计算总体健康评分
      let totalScore = 0;
      let healthyChecks = 0;
      const checkResults: any[] = [];

      checks.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const checkResult = result.value;
          checkResults.push(checkResult);
          totalScore += checkResult.score;
          if (checkResult.status === 'healthy') {
            healthyChecks++;
          }

          // 保存检查日志
          this.saveHealthCheckLog(userId, accountId, checkResult);
        } else {
          this.logger.error(`健康检查失败: ${result.reason}`);
        }
      });

      const overallScore = Math.round(totalScore / checks.length);
      const overallStatus = this.getHealthStatus(overallScore);

      // 更新账号健康状态
      await this.updateAccountHealth(account, {
        healthScore: overallScore,
        lastHealthCheckAt: new Date(),
        loginStatus: checkResults[0]?.status === 'healthy',
        sessionExpiresAt: checkResults[1]?.details?.expiresAt || account.sessionExpiresAt,
        taskSuccessRate: checkResults[2]?.details?.successRate || account.taskSuccessRate,
        avgResponseTime: checkResults[2]?.details?.avgResponseTime || account.avgResponseTime,
        resourceUsage: checkResults[4]?.details || account.resourceUsage,
      });

      // 检查是否需要触发告警
      if (overallStatus !== 'healthy') {
        await this.checkAndCreateAlert(userId, accountId, overallStatus, overallScore, checkResults);
      }

      this.logger.debug(`账号健康检查完成: ${accountId}, 评分: ${overallScore}, 状态: ${overallStatus}`);

    } catch (error) {
      this.logger.error(`账号健康检查异常: ${accountId}, 错误: ${error.message}`);
    }
  }

  /**
   * 检查登录状态
   */
  private async checkLoginStatus(account: FacebookAccount): Promise<{
    type: HealthCheckType;
    status: HealthCheckStatus;
    score: number;
    details: any;
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      // 模拟检查登录状态（实际应该调用Facebook API）
      await new Promise(resolve => setTimeout(resolve, 100));

      const isLoggedIn = !account.isTokenExpired();
      const score = isLoggedIn ? 100 : 0;
      const status = this.getHealthStatus(score);

      return {
        type: 'login',
        status,
        score,
        details: {
          loggedIn: isLoggedIn,
          tokenExpired: account.isTokenExpired(),
          needsRefresh: account.needsRefresh(),
        },
        responseTime: Date.now() - startTime,
      };

    } catch (error) {
      return {
        type: 'login',
        status: 'critical',
        score: 0,
        details: {
          error: error.message,
          loggedIn: false,
        },
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查会话有效性
   */
  private async checkSessionValidity(account: FacebookAccount): Promise<{
    type: HealthCheckType;
    status: HealthCheckStatus;
    score: number;
    details: any;
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      // 检查会话过期时间
      const expiresAt = account.accessTokenExpiresAt;
      const now = new Date();
      const timeLeft = expiresAt.getTime() - now.getTime();
      const hoursLeft = timeLeft / (1000 * 60 * 60);

      let score = 100;
      if (hoursLeft < 1) {
        score = 30; // 1小时内过期
      } else if (hoursLeft < 24) {
        score = 70; // 24小时内过期
      }

      const status = this.getHealthStatus(score);

      return {
        type: 'session',
        status,
        score,
        details: {
          expiresAt,
          hoursLeft: Math.round(hoursLeft * 10) / 10,
          needsRefresh: hoursLeft < 24,
        },
        responseTime: Date.now() - startTime,
      };

    } catch (error) {
      return {
        type: 'session',
        status: 'critical',
        score: 0,
        details: {
          error: error.message,
        },
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查API响应
   */
  private async checkApiResponse(account: FacebookAccount): Promise<{
    type: HealthCheckType;
    status: HealthCheckStatus;
    score: number;
    details: any;
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      // 模拟API调用测试（实际应该调用Facebook API）
      await new Promise(resolve => setTimeout(resolve, 200));

      const responseTime = Math.random() * 200 + 50; // 50-250ms
      const successRate = 0.95 + Math.random() * 0.04; // 95-99%

      let score = 100;
      if (responseTime > 500) score -= 30;
      if (responseTime > 1000) score -= 40;
      if (successRate < 0.9) score -= 20;
      if (successRate < 0.8) score -= 30;

      score = Math.max(0, score);
      const status = this.getHealthStatus(score);

      return {
        type: 'api',
        status,
        score,
        details: {
          responseTime: Math.round(responseTime),
          successRate: Math.round(successRate * 100) / 100,
          lastSync: account.lastSyncedAt,
          syncStatus: account.syncStatus,
        },
        responseTime: Date.now() - startTime,
      };

    } catch (error) {
      return {
        type: 'api',
        status: 'critical',
        score: 0,
        details: {
          error: error.message,
        },
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查网络连接
   */
  private async checkNetworkConnection(account: FacebookAccount): Promise<{
    type: HealthCheckType;
    status: HealthCheckStatus;
    score: number;
    details: any;
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      // 模拟网络连接测试
      await new Promise(resolve => setTimeout(resolve, 150));

      const networkQuality = 80 + Math.random() * 20; // 80-100
      const score = networkQuality;
      const status = this.getHealthStatus(score);

      return {
        type: 'network',
        status,
        score,
        details: {
          networkQuality: Math.round(networkQuality),
          currentIp: account.currentIp || '未知',
          vpnConfig: account.vpnConfigId || '未配置',
        },
        responseTime: Date.now() - startTime,
      };

    } catch (error) {
      return {
        type: 'network',
        status: 'critical',
        score: 0,
        details: {
          error: error.message,
        },
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查资源使用
   */
  private async checkResourceUsage(account: FacebookAccount): Promise<{
    type: HealthCheckType;
    status: HealthCheckStatus;
    score: number;
    details: any;
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      // 模拟资源使用检查
      await new Promise(resolve => setTimeout(resolve, 50));

      const cpuUsage = 10 + Math.random() * 40; // 10-50%
      const memoryUsage = 100 + Math.random() * 200; // 100-300MB

      let score = 100;
      if (cpuUsage > 80) score -= 30;
      if (cpuUsage > 95) score -= 40;
      if (memoryUsage > 500) score -= 20;
      if (memoryUsage > 1000) score -= 30;

      score = Math.max(0, score);
      const status = this.getHealthStatus(score);

      return {
        type: 'resource',
        status,
        score,
        details: {
          cpuUsage: Math.round(cpuUsage * 10) / 10,
          memoryUsage: Math.round(memoryUsage),
          unit: 'MB',
        },
        responseTime: Date.now() - startTime,
      };

    } catch (error) {
      return {
        type: 'resource',
        status: 'critical',
        score: 0,
        details: {
          error: error.message,
        },
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 根据评分获取健康状态
   */
  private getHealthStatus(score: number): HealthCheckStatus {
    if (score >= this.healthCheckConfig.warningThreshold) {
      return 'healthy';
    } else if (score >= this.healthCheckConfig.criticalThreshold) {
      return 'warning';
    } else {
      return 'critical';
    }
  }

  /**
   * 保存健康检查日志
   */
  private async saveHealthCheckLog(
    userId: string,
    accountId: string,
    checkResult: {
      type: HealthCheckType;
      status: HealthCheckStatus;
      score: number;
      details: any;
      responseTime: number;
    },
  ): Promise<void> {
    const log = this.healthCheckLogRepository.create({
      userId,
      accountId,
      checkType: checkResult.type,
      status: checkResult.status,
      score: checkResult.score,
      details: checkResult.details,
      responseTime: checkResult.responseTime,
      checkedAt: new Date(),
    });

    await this.healthCheckLogRepository.save(log);
  }

  /**
   * 更新账号健康状态
   */
  private async updateAccountHealth(
    account: FacebookAccount,
    healthData: {
      healthScore: number;
      lastHealthCheckAt: Date;
      loginStatus: boolean;
      sessionExpiresAt?: Date;
      taskSuccessRate?: number;
      avgResponseTime?: number;
      resourceUsage?: { cpu: number; memory: number };
    },
  ): Promise<void> {
    account.healthScore = healthData.healthScore;
    account.lastHealthCheckAt = healthData.lastHealthCheckAt;
    account.loginStatus = healthData.loginStatus;

    if (healthData.sessionExpiresAt) {
      account.sessionExpiresAt = healthData.sessionExpiresAt;
    }

    if (healthData.taskSuccessRate !== undefined) {
      account.taskSuccessRate = healthData.taskSuccessRate;
    }

    if (healthData.avgResponseTime !== undefined) {
      account.avgResponseTime = healthData.avgResponseTime;
    }

    if (healthData.resourceUsage) {
      account.resourceUsage = healthData.resourceUsage;
    }

    // 根据健康评分更新账号状态
    if (healthData.healthScore < this.healthCheckConfig.criticalThreshold) {
      account.status = 'error';
    } else if (healthData.healthScore < this.healthCheckConfig.warningThreshold) {
      // 保持当前状态，但标记为需要关注
    }

    await this.facebookAccountRepository.save(account);
  }

  /**
   * 检查并创建告警
   */
  private async checkAndCreateAlert(
    userId: string,
    accountId: string,
    status: HealthCheckStatus,
    score: number,
    checkResults: any[],
  ): Promise<void> {
    // 检查最近是否有相同告警
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingAlert = await this.healthAlertRepository.findOne({
      where: {
        userId,
        accountId,
        status: 'active',
        createdAt: MoreThanOrEqual(oneHourAgo),
      },
    });

    if (existingAlert) {
      // 更新现有告警
      existingAlert.details = { ...existingAlert.details, latestScore: score, checkResults };
      existingAlert.updatedAt = new Date();
      await this.healthAlertRepository.save(existingAlert);
      return;
    }

    // 创建新告警
    const severity = status === 'critical' ? 'critical' : 'warning';
    const alert = this.healthAlertRepository.create({
      userId,
      accountId,
      type: 'health',
      severity,
      status: 'active',
      title: this.getAlertTitle(status, score),
      description: this.getAlertDescription(status, score, checkResults),
      details: { score, checkResults },
      triggerCondition: `健康评分低于${status === 'critical' ? this.healthCheckConfig.criticalThreshold : this.healthCheckConfig.warningThreshold}`,
      suggestedAction: this.getSuggestedAction(status, checkResults),
      notified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.healthAlertRepository.save(alert);

    // 触发告警事件
    this.eventEmitter.emit('health.alert.created', alert);

    this.logger.warn(`创建健康告警: ${alert.title}, 账号: ${accountId}, 评分: ${score}`);
  }

  /**
   * 获取告警标题
   */
  private getAlertTitle(status: HealthCheckStatus, score: number): string {
    if (status === 'critical') {
      return `账号健康状态严重异常 (${score}分)`;
    } else {
      return `账号健康状态警告 (${score}分)`;
    }
  }

  /**
   * 获取告警描述
   */
  private getAlertDescription(status: HealthCheckStatus, score: number, checkResults: any[]): string {
    const failedChecks = checkResults.filter(r => r.status !== 'healthy');
    const failedTypes = failedChecks.map(r => r.type).join('、');

    if (status === 'critical') {
      return `账号健康评分${score}分，处于严重异常状态。失败检查项: ${failedTypes || '未知'}。请立即处理。`;
    } else {
      return `账号健康评分${score}分，处于警告状态。异常检查项: ${failedTypes || '未知'}。建议检查并修复。`;
    }
  }

  /**
   * 获取建议操作
   */
  private getSuggestedAction(status: HealthCheckStatus, checkResults: any[]): string {
    const actions: string[] = [];

    checkResults.forEach(result => {
      if (result.status !== 'healthy') {
        switch (result.type) {
          case 'login':
            actions.push('检查登录状态，尝试重新登录');
            break;
          case 'session':
            actions.push('刷新访问令牌');
            break;
          case 'api':
            actions.push('检查API连接，验证权限');
            break;
          case 'network':
            actions.push('检查网络连接和VPN配置');
            break;
          case 'resource':
            actions.push('优化资源使用，考虑升级配置');
            break;
        }
      }
    });

    if (actions.length === 0) {
      actions.push('检查账号配置和网络连接');
    }

    if (status === 'critical') {
      actions.unshift('立即处理！');
    }

    return actions.join('；');
  }

  /**
   * 获取账号健康状态
   */
  async getAccountHealth(userId: string, accountId: string): Promise<{
    account: FacebookAccount;
    healthScore: number;
    status: HealthCheckStatus;
    lastCheck: Date;
    checkResults: any[];
    alerts: HealthAlert[];
  }> {
    const account = await this.facebookAccountRepository.findOne({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new Error('账号不存在');
    }

    // 获取最近的健康检查日志
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentLogs = await this.healthCheckLogRepository.find({
      where: {
        userId,
        accountId,
        checkedAt: MoreThanOrEqual(oneHourAgo),
      },
      order: { checkedAt: 'DESC' },
      take: 5,
    });

    // 获取活跃告警
    const activeAlerts = await this.healthAlertRepository.find({
      where: {
        userId,
        accountId,
        status: 'active',
      },
      order: { createdAt: 'DESC' },
    });

    // 组织检查结果
    const checkResults = recentLogs.map(log => ({
      type: log.checkType,
      status: log.status,
      score: log.score,
      checkedAt: log.checkedAt,
      details: log.details,
    }));

    return {
      account,
      healthScore: account.healthScore || 0,
      status: this.getHealthStatus(account.healthScore || 0),
      lastCheck: account.lastHealthCheckAt,
      checkResults,
      alerts: activeAlerts,
    };
  }

  /**
   * 获取用户所有账号的健康概览
   */
  async getUserHealthOverview(userId: string): Promise<{
    totalAccounts: number;
    healthyAccounts: number;
    warningAccounts: number;
    criticalAccounts: number;
    avgHealthScore: number;
    recentAlerts: HealthAlert[];
    healthTrend: { date: string; score: number }[];
  }> {
    const accounts = await this.facebookAccountRepository.find({
      where: {
        userId,
        deletedAt: null,
      },
    });

    let healthyCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    let totalScore = 0;

    accounts.forEach(account => {
      const score = account.healthScore || 0;
      const status = this.getHealthStatus(score);
      
      totalScore += score;
      
      switch (status) {
        case 'healthy':
          healthyCount++;
          break;
        case 'warning':
          warningCount++;
          break;
        case 'critical':
          criticalCount++;
          break;
      }
    });

    // 获取最近7天的告警
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentAlerts = await this.healthAlertRepository.find({
      where: {
        userId,
        createdAt: MoreThanOrEqual(sevenDaysAgo),
      },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    // 获取健康趋势（最近7天）
    const healthTrend = await this.getHealthTrend(userId, 7);

    return {
      totalAccounts: accounts.length,
      healthyAccounts: healthyCount,
      warningAccounts: warningCount,
      criticalAccounts: criticalCount,
      avgHealthScore: accounts.length > 0 ? Math.round(totalScore / accounts.length) : 0,
      recentAlerts,
      healthTrend,
    };
  }

  /**
   * 获取健康趋势数据
   */
  private async getHealthTrend(userId: string, days: number): Promise<{ date: string; score: number }[]> {
    const trend: { date: string; score: number }[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      // 获取当天的平均健康评分
      const logs = await this.healthCheckLogRepository
        .createQueryBuilder('log')
        .select('AVG(log.score)', 'avgScore')
        .where('log.userId = :userId', { userId })
        .andWhere('log.checkedAt >= :start', { start: date })
        .andWhere('log.checkedAt < :end', { end: nextDate })
        .getRawOne();

      const avgScore = logs?.avgScore ? Math.round(parseFloat(logs.avgScore)) : 0;

      trend.push({
        date: date.toISOString().split('T')[0],
        score: avgScore,
      });
    }

    return trend;
  }

  /**
   * 手动触发健康检查
   */
  async triggerManualHealthCheck(userId: string, accountIds?: string[]): Promise<{
    success: boolean;
    checkedAccounts: number;
    failedAccounts: string[];
  }> {
    let accounts: FacebookAccount[];

    if (accountIds && accountIds.length > 0) {
      accounts = await this.facebookAccountRepository.find({
        where: {
          id: accountIds,
          userId,
          deletedAt: null,
        },
      });
    } else {
      accounts = await this.facebookAccountRepository.find({
        where: {
          userId,
          deletedAt: null,
        },
        take: 10,
      });
    }

    if (accounts.length === 0) {
      return {
        success: false,
        checkedAccounts: 0,
        failedAccounts: [],
      };
    }

    const failedAccounts: string[] = [];
    const checkPromises = accounts.map(async (account) => {
      try {
        await this.performHealthCheck(userId, account.id);
        return { success: true, accountId: account.id };
      } catch (error) {
        failedAccounts.push(account.id);
        return { success: false, accountId: account.id, error: error.message };
      }
    });

    const results = await Promise.allSettled(checkPromises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    return {
      success: successCount > 0,
      checkedAccounts: accounts.length,
      failedAccounts,
    };
  }

  /**
   * 确认告警
   */
  async acknowledgeAlert(userId: string, alertId: string): Promise<HealthAlert> {
    const alert = await this.healthAlertRepository.findOne({
      where: { id: alertId, userId },
    });

    if (!alert) {
      throw new Error('告警不存在');
    }

    if (alert.isResolved()) {
      throw new Error('告警已解决');
    }

    alert.acknowledge(userId);
    await this.healthAlertRepository.save(alert);

    this.eventEmitter.emit('health.alert.acknowledged', alert);

    return alert;
  }

  /**
   * 解决告警
   */
  async resolveAlert(userId: string, alertId: string, resolutionDescription: string): Promise<HealthAlert> {
    const alert = await this.healthAlertRepository.findOne({
      where: { id: alertId, userId },
    });

    if (!alert) {
      throw new Error('告警不存在');
    }

    if (alert.isResolved()) {
      throw new Error('告警已解决');
    }

    alert.resolve(resolutionDescription);
    await this.healthAlertRepository.save(alert);

    this.eventEmitter.emit('health.alert.resolved', alert);

    return alert;
  }

  /**
   * 清理过期的健康检查日志
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async cleanupOldHealthLogs(): Promise<void> {
    const retentionDays = this.healthCheckConfig.retentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.healthCheckLogRepository
      .createQueryBuilder()
      .delete()
      .where('checkedAt < :date', { date: cutoffDate })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`清理了 ${result.affected} 条过期的健康检查日志`);
    }
  }

  /**
   * 清理已解决的旧告警
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupResolvedAlerts(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.healthAlertRepository
      .createQueryBuilder()
      .delete()
      .where('status = :status', { status: 'resolved' })
      .andWhere('resolvedAt < :date', { date: thirtyDaysAgo })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`清理了 ${result.affected} 条已解决的旧告警`);
    }
  }
}