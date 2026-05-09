import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { AccountStatusEntity, AccountStatus } from './entities/account-status.entity';
import { Task } from '../task-scheduler/entities/task.entity';

@Injectable()
export class AccountManagerService implements OnModuleInit {
  private readonly logger = new Logger(AccountManagerService.name);
  private readonly MAX_CONCURRENT_ACCOUNTS = 10;
  private accountPool: Map<string, AccountStatusEntity> = new Map();

  constructor(
    @InjectRepository(FacebookAccount)
    private facebookAccountRepository: Repository<FacebookAccount>,
    @InjectRepository(AccountStatusEntity)
    private accountStatusRepository: Repository<AccountStatusEntity>,
  ) {}

  async onModuleInit() {
    this.logger.log('Account manager service initialized');
    await this.initializeAccountPool();
    await this.startHealthMonitoring();
  }

  /**
   * 初始化账号池
   */
  private async initializeAccountPool(): Promise<void> {
    try {
      const accounts = await this.facebookAccountRepository.find({
        where: { isActive: true },
      });

      for (const account of accounts) {
        let status = await this.accountStatusRepository.findOne({
          where: { accountId: account.id },
        });

        if (!status) {
          status = this.accountStatusRepository.create({
            accountId: account.id,
            status: AccountStatus.IDLE,
            healthScore: 100,
            healthDetails: {
              lastCheck: new Date(),
              browserStatus: 'unknown',
              loginStatus: 'unknown',
              errorCount: 0,
            },
          });
          await this.accountStatusRepository.save(status);
        }

        this.accountPool.set(account.id, status);
      }

      this.logger.log(`Initialized account pool with ${accounts.length} accounts`);
    } catch (error) {
      this.logger.error('Failed to initialize account pool:', error);
    }
  }

  /**
   * 获取可用账号
   */
  async acquireAccount(): Promise<FacebookAccount | null> {
    try {
      // 查找空闲且健康的账号
      const availableAccounts = await this.accountStatusRepository
        .createQueryBuilder('status')
        .leftJoinAndSelect('status.account', 'account')
        .where('status.status = :status', { status: AccountStatus.IDLE })
        .andWhere('status.healthScore >= :minHealth', { minHealth: 70 })
        .andWhere('account.isActive = :isActive', { isActive: true })
        .orderBy('status.healthScore', 'DESC')
        .addOrderBy('status.totalTasksCompleted', 'ASC') // 优先使用任务少的账号
        .limit(this.MAX_CONCURRENT_ACCOUNTS)
        .getMany();

      if (availableAccounts.length === 0) {
        this.logger.warn('No available accounts in pool');
        return null;
      }

      // 选择最合适的账号
      const selectedStatus = availableAccounts[0];
      const account = selectedStatus.account;

      // 更新账号状态
      selectedStatus.status = AccountStatus.BUSY;
      selectedStatus.lastHeartbeat = new Date();
      await this.accountStatusRepository.save(selectedStatus);

      // 更新内存中的状态
      this.accountPool.set(account.id, selectedStatus);

      this.logger.log(`Acquired account ${account.id} - ${account.username}`);
      return account;

    } catch (error) {
      this.logger.error('Failed to acquire account:', error);
      return null;
    }
  }

  /**
   * 释放账号
   */
  async releaseAccount(accountId: string): Promise<boolean> {
    try {
      const status = await this.accountStatusRepository.findOne({
        where: { accountId },
      });

      if (!status) {
        this.logger.warn(`Account status not found for ${accountId}`);
        return false;
      }

      status.status = AccountStatus.IDLE;
      status.currentTaskId = null;
      status.lastHeartbeat = new Date();
      await this.accountStatusRepository.save(status);

      // 更新内存中的状态
      this.accountPool.set(accountId, status);

      this.logger.log(`Released account ${accountId}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to release account ${accountId}:`, error);
      return false;
    }
  }

  /**
   * 分配任务给账号
   */
  async assignTaskToAccount(taskId: string, accountId: string): Promise<boolean> {
    try {
      const status = await this.accountStatusRepository.findOne({
        where: { accountId },
      });

      if (!status) {
        throw new Error(`Account status not found for ${accountId}`);
      }

      if (status.status !== AccountStatus.IDLE) {
        throw new Error(`Account ${accountId} is not idle (status: ${status.status})`);
      }

      status.status = AccountStatus.BUSY;
      status.currentTaskId = taskId;
      status.lastHeartbeat = new Date();
      await this.accountStatusRepository.save(status);

      // 更新内存中的状态
      this.accountPool.set(accountId, status);

      this.logger.log(`Assigned task ${taskId} to account ${accountId}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to assign task to account:`, error);
      return false;
    }
  }

  /**
   * 获取账号状态
   */
  async getAccountStatus(accountId: string): Promise<AccountStatusEntity | null> {
    return this.accountStatusRepository.findOne({
      where: { accountId },
      relations: ['account', 'currentTask'],
    });
  }

  /**
   * 获取所有账号状态
   */
  async getAllAccountStatus(): Promise<AccountStatusEntity[]> {
    return this.accountStatusRepository.find({
      relations: ['account', 'currentTask'],
      order: { healthScore: 'DESC' },
    });
  }

  /**
   * 获取可用账号数量
   */
  async getAvailableAccountCount(): Promise<number> {
    return this.accountStatusRepository.count({
      where: { 
        status: AccountStatus.IDLE,
        healthScore: { $gte: 70 },
      },
    });
  }

  /**
   * 获取忙碌账号数量
   */
  async getBusyAccountCount(): Promise<number> {
    return this.accountStatusRepository.count({
      where: { status: AccountStatus.BUSY },
    });
  }

  /**
   * 更新账号健康状态
   */
  async updateAccountHealth(
    accountId: string, 
    healthScore: number, 
    details: Partial<AccountStatusEntity['healthDetails']>
  ): Promise<boolean> {
    try {
      const status = await this.accountStatusRepository.findOne({
        where: { accountId },
      });

      if (!status) {
        throw new Error(`Account status not found for ${accountId}`);
      }

      status.healthScore = Math.max(0, Math.min(100, healthScore));
      status.healthDetails = {
        ...status.healthDetails,
        ...details,
        lastCheck: new Date(),
      };

      // 如果健康分数过低，标记为错误状态
      if (healthScore < 30 && status.status !== AccountStatus.MAINTENANCE) {
        status.status = AccountStatus.ERROR;
        this.logger.warn(`Account ${accountId} marked as ERROR due to low health score: ${healthScore}`);
      }

      await this.accountStatusRepository.save(status);

      // 更新内存中的状态
      this.accountPool.set(accountId, status);

      return true;

    } catch (error) {
      this.logger.error(`Failed to update account health for ${accountId}:`, error);
      return false;
    }
  }

  /**
   * 标记账号为维护状态
   */
  async markAccountForMaintenance(accountId: string): Promise<boolean> {
    try {
      const status = await this.accountStatusRepository.findOne({
        where: { accountId },
      });

      if (!status) {
        throw new Error(`Account status not found for ${accountId}`);
      }

      status.status = AccountStatus.MAINTENANCE;
      status.currentTaskId = null;
      await this.accountStatusRepository.save(status);

      // 更新内存中的状态
      this.accountPool.set(accountId, status);

      this.logger.log(`Account ${accountId} marked for maintenance`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to mark account for maintenance:`, error);
      return false;
    }
  }

  /**
   * 恢复账号到空闲状态
   */
  async restoreAccountToIdle(accountId: string): Promise<boolean> {
    try {
      const status = await this.accountStatusRepository.findOne({
        where: { accountId },
      });

      if (!status) {
        throw new Error(`Account status not found for ${accountId}`);
      }

      status.status = AccountStatus.IDLE;
      status.healthScore = Math.min(100, status.healthScore + 20); // 恢复一些健康分数
      await this.accountStatusRepository.save(status);

      // 更新内存中的状态
      this.accountPool.set(accountId, status);

      this.logger.log(`Account ${accountId} restored to idle`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to restore account to idle:`, error);
      return false;
    }
  }

  /**
   * 定期健康检查
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async performHealthChecks(): Promise<void> {
    try {
      const allStatuses = await this.accountStatusRepository.find({
        relations: ['account'],
      });

      for (const status of allStatuses) {
        await this.checkAccountHealth(status);
      }

      this.logger.log(`Performed health checks for ${allStatuses.length} accounts`);
    } catch (error) {
      this.logger.error('Failed to perform health checks:', error);
    }
  }

  /**
   * 检查单个账号健康状态
   */
  private async checkAccountHealth(status: AccountStatusEntity): Promise<void> {
    try {
      // 模拟健康检查逻辑
      // 实际应该检查浏览器连接、登录状态等
      const healthScore = Math.floor(Math.random() * 30) + 70; // 模拟70-100的健康分数

      const healthDetails = {
        browserStatus: 'healthy' as const,
        loginStatus: 'logged_in' as const,
        errorCount: 0,
        lastError: null,
      };

      await this.updateAccountHealth(
        status.accountId,
        healthScore,
        healthDetails
      );

    } catch (error) {
      this.logger.error(`Failed to check health for account ${status.accountId}:`, error);
      
      // 健康检查失败，降低健康分数
      await this.updateAccountHealth(
        status.accountId,
        Math.max(0, status.healthScore - 20),
        {
          browserStatus: 'unhealthy',
          loginStatus: 'unknown',
          errorCount: (status.healthDetails?.errorCount || 0) + 1,
          lastError: error.message,
        }
      );
    }
  }

  /**
   * 启动健康监控
   */
  private async startHealthMonitoring(): Promise<void> {
    this.logger.log('Account health monitoring started');
  }

  /**
   * 获取账号使用统计
   */
  async getAccountStatistics(): Promise<{
    totalAccounts: number;
    availableAccounts: number;
    busyAccounts: number;
    errorAccounts: number;
    maintenanceAccounts: number;
    averageHealthScore: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
  }> {
    const allStatuses = await this.getAllAccountStatus();
    
    const totalAccounts = allStatuses.length;
    const availableAccounts = allStatuses.filter(s => s.status === AccountStatus.IDLE).length;
    const busyAccounts = allStatuses.filter(s => s.status === AccountStatus.BUSY).length;
    const errorAccounts = allStatuses.filter(s => s.status === AccountStatus.ERROR).length;
    const maintenanceAccounts = allStatuses.filter(s => s.status === AccountStatus.MAINTENANCE).length;
    
    const averageHealthScore = allStatuses.length > 0 
      ? allStatuses.reduce((sum, s) => sum + s.healthScore, 0) / allStatuses.length
      : 0;
    
    const totalTasksCompleted = allStatuses.reduce((sum, s) => sum + s.totalTasksCompleted, 0);
    const totalTasksFailed = allStatuses.reduce((sum, s) => sum + s.totalTasksFailed, 0);

    return {
      totalAccounts,
      availableAccounts,
      busyAccounts,
      errorAccounts,
      maintenanceAccounts,
      averageHealthScore,
      totalTasksCompleted,
      totalTasksFailed,
    };
  }
}