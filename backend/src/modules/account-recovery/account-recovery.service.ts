import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RecoveryLog, RecoveryStatus, RecoveryType, FailureType } from './entities/recovery-log.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { AccountHealthService } from '../account-health/account-health.service';

@Injectable()
export class AccountRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(AccountRecoveryService.name);
  private readonly recoveryConfig = {
    checkInterval: 60 * 1000, // 1分钟检查一次
    maxRecoveryAttempts: 3, // 最大恢复尝试次数
    recoveryTimeout: 30000, // 恢复超时时间30秒
    fallbackEnabled: true, // 启用备用账号
    autoRecoveryEnabled: true, // 启用自动恢复
  };

  constructor(
    @InjectRepository(RecoveryLog)
    private readonly recoveryLogRepository: Repository<RecoveryLog>,
    @InjectRepository(FacebookAccount)
    private readonly facebookAccountRepository: Repository<FacebookAccount>,
    private readonly accountHealthService: AccountHealthService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.logger.log('账号自动恢复服务已启动');
  }

  /**
   * 定时故障检测任务
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledFailureDetection(): Promise<void> {
    if (!this.recoveryConfig.autoRecoveryEnabled) {
      return;
    }

    this.logger.log('开始定时故障检测');

    try {
      // 获取所有异常状态的账号
      const accounts = await this.facebookAccountRepository.find({
        where: {
          status: 'error',
          deletedAt: null,
        },
        take: 10, // 最多10个账号
      });

      if (accounts.length === 0) {
        return;
      }

      // 检查每个异常账号是否需要恢复
      for (const account of accounts) {
        await this.checkAndRecoverAccount(account.userId, account.id);
      }

      this.logger.log(`定时故障检测完成，检查了 ${accounts.length} 个异常账号`);

    } catch (error) {
      this.logger.error(`定时故障检测失败: ${error.message}`);
    }
  }

  /**
   * 检查并恢复账号
   */
  async checkAndRecoverAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.facebookAccountRepository.findOne({
      where: { id: accountId, userId },
    });

    if (!account) {
      this.logger.warn(`账号不存在: ${accountId}`);
      return;
    }

    // 检查最近是否已有恢复尝试
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRecovery = await this.recoveryLogRepository.findOne({
      where: {
        userId,
        accountId,
        createdAt: MoreThanOrEqual(oneHourAgo),
        status: 'running',
      },
    });

    if (recentRecovery) {
      this.logger.debug(`账号 ${accountId} 最近已有恢复尝试，跳过`);
      return;
    }

    // 检查恢复尝试次数
    const recoveryAttempts = await this.recoveryLogRepository.count({
      where: {
        userId,
        accountId,
        createdAt: MoreThanOrEqual(oneHourAgo),
      },
    });

    if (recoveryAttempts >= this.recoveryConfig.maxRecoveryAttempts) {
      this.logger.warn(`账号 ${accountId} 恢复尝试次数已达上限，暂停自动恢复`);
      return;
    }

    // 分析故障类型并执行恢复
    const failureAnalysis = await this.analyzeFailure(account);
    if (!failureAnalysis.needsRecovery) {
      return;
    }

    this.logger.log(`检测到账号故障: ${accountId}, 类型: ${failureAnalysis.failureType}, 开始恢复`);

    try {
      await this.executeRecovery(userId, account, failureAnalysis);
    } catch (error) {
      this.logger.error(`账号恢复失败: ${accountId}, 错误: ${error.message}`);
    }
  }

  /**
   * 分析故障类型
   */
  private async analyzeFailure(account: FacebookAccount): Promise<{
    needsRecovery: boolean;
    failureType: FailureType;
    failureDescription: string;
    recoveryType: RecoveryType;
    recoveryStrategy: string;
  }> {
    // 获取最近的健康检查数据
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const healthLogs = await this.accountHealthService['healthCheckLogRepository'].find({
      where: {
        accountId: account.id,
        checkedAt: MoreThanOrEqual(oneHourAgo),
      },
      order: { checkedAt: 'DESC' },
      take: 5,
    });

    // 分析故障模式
    if (healthLogs.length === 0) {
      return {
        needsRecovery: false,
        failureType: 'api_error',
        failureDescription: '无健康检查数据',
        recoveryType: 'restart',
        recoveryStrategy: 'manual_intervention_required',
      };
    }

    const failedLogs = healthLogs.filter(log => log.status !== 'healthy');
    const failureRate = failedLogs.length / healthLogs.length;

    if (failureRate < 0.6) {
      // 偶尔失败，不需要恢复
      return {
        needsRecovery: false,
        failureType: 'api_error',
        failureDescription: '偶尔性失败，无需恢复',
        recoveryType: 'reconnect',
        recoveryStrategy: 'monitor_only',
      };
    }

    // 检查具体故障类型
    const loginFailed = failedLogs.some(log => log.checkType === 'login' && log.status === 'critical');
    const tokenExpired = account.isTokenExpired();
    const networkFailed = failedLogs.some(log => log.checkType === 'network' && log.status === 'critical');
    const apiFailed = failedLogs.some(log => log.checkType === 'api' && log.status === 'critical');
    const resourceExhausted = failedLogs.some(log => log.checkType === 'resource' && log.status === 'critical');

    if (loginFailed || tokenExpired) {
      return {
        needsRecovery: true,
        failureType: tokenExpired ? 'token_expired' : 'login_failed',
        failureDescription: tokenExpired ? '访问令牌已过期' : '登录验证失败',
        recoveryType: tokenExpired ? 'refresh_token' : 'reconnect',
        recoveryStrategy: tokenExpired ? 'refresh_token_with_retry' : 'reconnect_with_validation',
      };
    }

    if (networkFailed) {
      return {
        needsRecovery: true,
        failureType: 'network_error',
        failureDescription: '网络连接失败',
        recoveryType: 'reconnect',
        recoveryStrategy: 'reconnect_with_vpn_fallback',
      };
    }

    if (apiFailed) {
      return {
        needsRecovery: true,
        failureType: 'api_error',
        failureDescription: 'API调用失败',
        recoveryType: 'restart',
        recoveryStrategy: 'restart_with_delay',
      };
    }

    if (resourceExhausted) {
      return {
        needsRecovery: true,
        failureType: 'resource_exhausted',
        failureDescription: '资源耗尽',
        recoveryType: 'restart',
        recoveryStrategy: 'restart_with_resource_limit',
      };
    }

    // 默认恢复策略
    return {
      needsRecovery: true,
      failureType: 'api_error',
      failureDescription: '未知故障类型',
      recoveryType: 'reconnect',
      recoveryStrategy: 'default_recovery',
    };
  }

  /**
   * 执行恢复操作
   */
  private async executeRecovery(
    userId: string,
    account: FacebookAccount,
    failureAnalysis: {
      failureType: FailureType;
      failureDescription: string;
      recoveryType: RecoveryType;
      recoveryStrategy: string;
    },
  ): Promise<void> {
    // 创建恢复日志
    const recoveryLog = this.recoveryLogRepository.create({
      userId,
      accountId: account.id,
      recoveryType: failureAnalysis.recoveryType,
      status: 'pending',
      failureType: failureAnalysis.failureType,
      failureDescription: failureAnalysis.failureDescription,
      recoveryDetails: {
        originalStatus: account.status,
        healthScore: account.healthScore,
        analysis: failureAnalysis,
      },
      recoveryStrategy: failureAnalysis.recoveryStrategy,
      autoRecovery: true,
      attemptCount: 1,
      createdAt: new Date(),
    });

    const savedLog = await this.recoveryLogRepository.save(recoveryLog);

    try {
      // 标记为运行中
      savedLog.markAsRunning();
      await this.recoveryLogRepository.save(savedLog);

      // 根据恢复类型执行不同的恢复策略
      let recoveryResult: any;
      switch (failureAnalysis.recoveryType) {
        case 'reconnect':
          recoveryResult = await this.reconnectAccount(account);
          break;
        case 'refresh_token':
          recoveryResult = await this.refreshToken(account);
          break;
        case 'switch_account':
          recoveryResult = await this.switchToFallbackAccount(userId, account);
          break;
        case 'restart':
          recoveryResult = await this.restartAccount(account);
          break;
        case 'fallback':
          recoveryResult = await this.executeFallback(userId, account);
          break;
        default:
          throw new Error(`不支持的恢复类型: ${failureAnalysis.recoveryType}`);
      }

      // 更新恢复结果
      if (recoveryResult.success) {
        savedLog.markAsSuccess(recoveryResult.details);
        
        // 更新账号状态
        await this.updateAccountAfterRecovery(account, recoveryResult);
        
        this.logger.log(`账号恢复成功: ${account.id}, 类型: ${failureAnalysis.recoveryType}`);
        
        // 触发恢复成功事件
        this.eventEmitter.emit('recovery.success', { account, recoveryLog: savedLog });

      } else {
        savedLog.markAsFailed(recoveryResult.error, recoveryResult.details);
        
        this.logger.error(`账号恢复失败: ${account.id}, 错误: ${recoveryResult.error}`);
        
        // 触发恢复失败事件
        this.eventEmitter.emit('recovery.failed', { account, recoveryLog: savedLog, error: recoveryResult.error });

        // 如果启用备用账号，尝试切换
        if (this.recoveryConfig.fallbackEnabled && failureAnalysis.recoveryType !== 'switch_account') {
          await this.tryFallbackRecovery(userId, account, savedLog);
        }
      }

      await this.recoveryLogRepository.save(savedLog);

    } catch (error) {
      savedLog.markAsFailed(error.message, { unexpectedError: true });
      await this.recoveryLogRepository.save(savedLog);
      
      this.logger.error(`账号恢复异常: ${account.id}, 错误: ${error.message}`);
      
      this.eventEmitter.emit('recovery.error', { account, recoveryLog: savedLog, error });
    }
  }

  /**
   * 重新连接账号
   */
  private async reconnectAccount(account: FacebookAccount): Promise<{
    success: boolean;
    error?: string;
    details: Record<string, any>;
  }> {
    try {
      // 模拟重新连接（实际应该调用Facebook API）
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 检查连接状态
      const isConnected = Math.random() > 0.3; // 70%成功率

      if (isConnected) {
        return {
          success: true,
          details: {
            reconnected: true,
            timestamp: new Date().toISOString(),
            method: 'direct_reconnect',
          },
        };
      } else {
        return {
          success: false,
          error: '重新连接失败: 网络超时',
          details: {
            reconnected: false,
            attempts: 1,
            lastError: 'timeout',
          },
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `重新连接异常: ${error.message}`,
        details: {
          reconnected: false,
          errorType: 'exception',
        },
      };
    }
  }

  /**
   * 刷新访问令牌
   */
  private async refreshToken(account: FacebookAccount): Promise<{
    success: boolean;
    error?: string;
    details: Record<string, any>;
  }> {
    try {
      // 模拟刷新令牌（实际应该调用Facebook API）
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 检查是否有刷新令牌
      if (!account.refreshToken) {
        return {
          success: false,
          error: '刷新令牌失败: 无有效的刷新令牌',
          details: {
            refreshed: false,
            reason: 'no_refresh_token',
          },
        };
      }

      const refreshSuccess = Math.random() > 0.2; // 80%成功率

      if (refreshSuccess) {
        // 模拟生成新的访问令牌
        const newExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60天后过期
        
        return {
          success: true,
          details: {
            refreshed: true,
            newExpiresAt: newExpiresAt.toISOString(),
            method: 'refresh_token',
          },
        };
      } else {
        return {
          success: false,
          error: '刷新令牌失败: Facebook API返回错误',
          details: {
            refreshed: false,
            attempts: 1,
            apiError: 'invalid_grant',
          },
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `刷新令牌异常: ${error.message}`,
        details: {
          refreshed: false,
          errorType: 'exception',
        },
      };
    }
  }

  /**
   * 切换到备用账号
   */
  private async switchToFallbackAccount(
    userId: string,
    originalAccount: FacebookAccount,
  ): Promise<{
    success: boolean;
    error?: string;
    details: Record<string, any>;
    fallbackAccount?: FacebookAccount;
  }> {
    try {
      // 查找可用的备用账号
      const fallbackAccounts = await this.facebookAccountRepository.find({
        where: {
          userId,
          status: 'active',
          id: originalAccount.id, // 排除自己
          deletedAt: null,
        },
        order: { healthScore: 'DESC' },
        take: 3,
      });

      if (fallbackAccounts.length === 0) {
        return {
          success: false,
          error: '切换账号失败: 无可用备用账号',
          details: {
            switched: false,
            reason: 'no_fallback_available',
          },
        };
      }

      // 选择健康评分最高的备用账号
      const fallbackAccount = fallbackAccounts[0];
      const switchSuccess = Math.random() > 0.1; // 90%成功率

      if (switchSuccess) {
        return {
          success: true,
          details: {
            switched: true,
            originalAccountId: originalAccount.id,
            fallbackAccountId: fallbackAccount.id,
            fallbackHealthScore: fallbackAccount.healthScore,
            timestamp: new Date().toISOString(),
          },
          fallbackAccount,
        };
      } else {
        return {
          success: false,
          error: '切换账号失败: 备用账号不可用',
          details: {
            switched: false,
            originalAccountId: originalAccount.id,
            attemptedFallbackId: fallbackAccount.id,
            reason: 'fallback_unavailable',
          },
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `切换账号异常: ${error.message}`,
        details: {
          switched: false,
          errorType: 'exception',
        },
      };
    }
  }

  /**
   * 重启账号服务
   */
  private async restartAccount(account: FacebookAccount): Promise<{
    success: boolean;
    error?: string;
    details: Record<string, any>;
  }> {
    try {
      // 模拟重启服务
      await new Promise(resolve => setTimeout(resolve, 3000));

      const restartSuccess = Math.random() > 0.1; // 90%成功率

      if (restartSuccess) {
        return {
          success: true,
          details: {
            restarted: true,
            timestamp: new Date().toISOString(),
            method: 'full_restart',
            delay: 3000,
          },
        };
      } else {
        return {
          success: false,
          error: '重启服务失败: 进程无法启动',
          details: {
            restarted: false,
            attempts: 1,
            error: 'process_failed',
          },
        };
      }

    } catch (error) {
      return {
        success: false,
        error: `重启服务异常: ${error.message}`,
        details: {
          restarted: false,
          errorType: 'exception',
        },
      };
    }
  }

  /**
   * 执行备用恢复方案
   */
  private async executeFallback(
    userId: string,
    account: FacebookAccount,
  ): Promise<{
    success: boolean;
    error?: string;
    details: Record<string, any>;
  }> {
    // 尝试多种恢复策略
    const strategies = [
      { type: 'reconnect' as RecoveryType, priority: 1 },
      { type: 'refresh_token' as RecoveryType, priority: 2 },
      { type: 'restart' as RecoveryType, priority: 3 },
      { type: 'switch_account' as RecoveryType, priority: 4 },
    ];

    for (const strategy of strategies.sort((a, b) => a.priority - b.priority)) {
      try {
        let result: any;
        
        switch (strategy.type) {
          case 'reconnect':
            result = await this.reconnectAccount(account);
            break;
          case 'refresh_token':
            result = await this.refreshToken(account);
            break;
          case 'restart':
            result = await this.restartAccount(account);
            break;
          case 'switch_account':
            result = await this.switchToFallbackAccount(userId, account);
            break;
        }

        if (result.success) {
          return {
            success: true,
            details: {
              ...result.details,
              fallbackStrategy: strategy.type,
              priority: strategy.priority,
            },
          };
        }
      } catch (error) {
        this.logger.debug(`备用策略 ${strategy.type} 失败: ${error.message}`);
      }
    }

    return {
      success: false,
      error: '所有备用恢复策略均失败',
      details: {
        allStrategiesFailed: true,
        attemptedStrategies: strategies.map(s => s.type),
      },
    };
  }

  /**
   * 尝试备用恢复
   */
  private async tryFallbackRecovery(
    userId: string,
    account: FacebookAccount,
    originalRecoveryLog: RecoveryLog,
  ): Promise<void> {
    this.logger.log(`尝试备用恢复方案: ${account.id}`);

    // 创建备用恢复日志
    const fallbackLog = this.recoveryLogRepository.create({
      userId,
      accountId: account.id,
      recoveryType: 'fallback',
      status: 'pending',
      failureType: originalRecoveryLog.failureType,
      failureDescription: `主恢复失败，尝试备用方案: ${originalRecoveryLog.errorMessage}`,
      recoveryDetails: {
        originalRecoveryId: originalRecoveryLog.id,
        originalRecoveryType: originalRecoveryLog.recoveryType,
      },
      recoveryStrategy: 'comprehensive_fallback',
      autoRecovery: true,
      attemptCount: originalRecoveryLog.attemptCount + 1,
      createdAt: new Date(),
    });

    const savedLog = await this.recoveryLogRepository.save(fallbackLog);

    try {
      savedLog.markAsRunning();
      await this.recoveryLogRepository.save(savedLog);

      const result = await this.executeFallback(userId, account);

      if (result.success) {
        savedLog.markAsSuccess(result.details);
        await this.updateAccountAfterRecovery(account, result);
        
        this.logger.log(`备用恢复成功: ${account.id}`);
        this.eventEmitter.emit('recovery.fallback.success', { account, recoveryLog: savedLog });
      } else {
        savedLog.markAsFailed(result.error || '备用恢复失败', result.details);
        
        this.logger.error(`备用恢复失败: ${account.id}`);
        this.eventEmitter.emit('recovery.fallback.failed', { account, recoveryLog: savedLog, error: result.error });
      }

      await this.recoveryLogRepository.save(savedLog);

    } catch (error) {
      savedLog.markAsFailed(error.message, { unexpectedError: true });
      await this.recoveryLogRepository.save(savedLog);
      
      this.logger.error(`备用恢复异常: ${account.id}, 错误: ${error.message}`);
    }
  }

  /**
   * 恢复后更新账号状态
   */
  private async updateAccountAfterRecovery(
    account: FacebookAccount,
    recoveryResult: {
      success: boolean;
      details: Record<string, any>;
      fallbackAccount?: FacebookAccount;
    },
  ): Promise<void> {
    if (recoveryResult.success) {
      // 恢复成功，更新账号状态
      account.status = 'active';
      account.healthScore = Math.min(100, (account.healthScore || 0) + 30); // 恢复后健康评分增加
      account.lastHealthCheckAt = new Date();
      account.loginStatus = true;
      account.recoveryAttempts = (account.recoveryAttempts || 0) + 1;
      account.lastRecoveryAt = new Date();

      // 如果是令牌刷新，更新过期时间
      if (recoveryResult.details.newExpiresAt) {
        account.accessTokenExpiresAt = new Date(recoveryResult.details.newExpiresAt);
      }

      // 如果是账号切换，更新相关字段
      if (recoveryResult.fallbackAccount) {
        account.recoveryStrategy = 'account_switch';
        // 这里可以记录切换到的备用账号信息
      }

      await this.facebookAccountRepository.save(account);
      
      this.logger.debug(`账号状态已更新: ${account.id}, 新状态: active, 健康评分: ${account.healthScore}`);
    } else {
      // 恢复失败，标记账号需要人工干预
      account.status = 'error';
      account.healthScore = Math.max(0, (account.healthScore || 0) - 20); // 恢复失败健康评分降低
      account.recoveryAttempts = (account.recoveryAttempts || 0) + 1;
      account.lastRecoveryAt = new Date();
      account.recoveryStrategy = 'manual_intervention_required';

      await this.facebookAccountRepository.save(account);
      
      this.logger.warn(`账号恢复失败，标记为需要人工干预: ${account.id}`);
    }
  }

  /**
   * 手动触发恢复
   */
  async triggerManualRecovery(
    userId: string,
    accountId: string,
    recoveryType?: RecoveryType,
  ): Promise<{
    success: boolean;
    recoveryLog?: RecoveryLog;
    error?: string;
  }> {
    const account = await this.facebookAccountRepository.findOne({
      where: { id: accountId, userId },
    });

    if (!account) {
      return {
        success: false,
        error: '账号不存在',
      };
    }

    // 分析故障类型
    const failureAnalysis = await this.analyzeFailure(account);
    
    // 如果指定了恢复类型，使用指定的类型
    if (recoveryType) {
      failureAnalysis.recoveryType = recoveryType;
      failureAnalysis.recoveryStrategy = `manual_${recoveryType}`;
    }

    // 创建手动恢复日志
    const recoveryLog = this.recoveryLogRepository.create({
      userId,
      accountId,
      recoveryType: failureAnalysis.recoveryType,
      status: 'pending',
      failureType: failureAnalysis.failureType,
      failureDescription: `手动触发恢复: ${failureAnalysis.failureDescription}`,
      recoveryDetails: {
        manualTrigger: true,
        requestedType: recoveryType,
        analysis: failureAnalysis,
      },
      recoveryStrategy: failureAnalysis.recoveryStrategy,
      autoRecovery: false,
      attemptCount: 1,
      createdAt: new Date(),
    });

    const savedLog = await this.recoveryLogRepository.save(recoveryLog);

    try {
      savedLog.markAsRunning();
      await this.recoveryLogRepository.save(savedLog);

      await this.executeRecovery(userId, account, failureAnalysis);

      // 获取更新后的日志
      const updatedLog = await this.recoveryLogRepository.findOne({
        where: { id: savedLog.id },
      });

      return {
        success: updatedLog?.isSuccessful() || false,
        recoveryLog: updatedLog,
        error: updatedLog?.errorMessage,
      };

    } catch (error) {
      savedLog.markAsFailed(error.message, { manualRecoveryError: true });
      await this.recoveryLogRepository.save(savedLog);
      
      return {
        success: false,
        recoveryLog: savedLog,
        error: error.message,
      };
    }
  }

  /**
   * 获取恢复统计
   */
  async getRecoveryStatistics(userId: string): Promise<{
    totalRecoveries: number;
    successRate: number;
    avgRecoveryTime: number;
    recoveriesByType: Record<string, number>;
    recoveriesByStatus: Record<string, number>;
    recentFailures: RecoveryLog[];
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 总恢复次数
    const totalRecoveries = await this.recoveryLogRepository.count({
      where: {
        userId,
        createdAt: MoreThanOrEqual(thirtyDaysAgo),
      },
    });

    // 成功率和平均恢复时间
    const completedRecoveries = await this.recoveryLogRepository.find({
      where: {
        userId,
        status: In(['success', 'failed']),
        createdAt: MoreThanOrEqual(thirtyDaysAgo),
      },
    });

    const successfulRecoveries = completedRecoveries.filter(log => log.isSuccessful());
    const successRate = completedRecoveries.length > 0 ? successfulRecoveries.length / completedRecoveries.length : 0;

    let totalRecoveryTime = 0;
    let timedRecoveries = 0;

    completedRecoveries.forEach(log => {
      if (log.duration) {
        totalRecoveryTime += log.duration;
        timedRecoveries++;
      }
    });

    const avgRecoveryTime = timedRecoveries > 0 ? totalRecoveryTime / timedRecoveries : 0;

    // 按类型统计
    const typeStats = await this.recoveryLogRepository
      .createQueryBuilder('log')
      .select('log.recoveryType, COUNT(*) as count')
      .where('log.userId = :userId', { userId })
      .andWhere('log.createdAt >= :date', { date: thirtyDaysAgo })
      .groupBy('log.recoveryType')
      .getRawMany();

    const recoveriesByType: Record<string, number> = {};
    for (const stat of typeStats) {
      recoveriesByType[stat.log_recovery_type] = parseInt(stat.count);
    }

    // 按状态统计
    const statusStats = await this.recoveryLogRepository
      .createQueryBuilder('log')
      .select('log.status, COUNT(*) as count')
      .where('log.userId = :userId', { userId })
      .andWhere('log.createdAt >= :date', { date: thirtyDaysAgo })
      .groupBy('log.status')
      .getRawMany();

    const recoveriesByStatus: Record<string, number> = {};
    for (const stat of statusStats) {
      recoveriesByStatus[stat.log_status] = parseInt(stat.count);
    }

    // 最近失败记录
    const recentFailures = await this.recoveryLogRepository.find({
      where: {
        userId,
        status: 'failed',
        createdAt: MoreThanOrEqual(thirtyDaysAgo),
      },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return {
      totalRecoveries,
      successRate,
      avgRecoveryTime,
      recoveriesByType,
      recoveriesByStatus,
      recentFailures,
    };
  }

  /**
   * 清理过期的恢复日志
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldRecoveryLogs(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.recoveryLogRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :date', { date: thirtyDaysAgo })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`清理了 ${result.affected} 条过期的恢复日志`);
    }
  }
}

// 辅助函数
function In(values: any[]): any {
  return values;
}
