import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchOperation, BatchOperationStatus, BatchOperationType } from './entities/batch-operation.entity';
import { CreateBatchOperationDto } from './dto/create-batch-operation.dto';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class AccountBatchService {
  private readonly logger = new Logger(AccountBatchService.name);

  constructor(
    @InjectRepository(BatchOperation)
    private readonly batchOperationRepository: Repository<BatchOperation>,
    @InjectRepository(FacebookAccount)
    private readonly facebookAccountRepository: Repository<FacebookAccount>,
    @InjectQueue('batch-operations')
    private readonly batchQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 创建批量操作
   */
  async createBatchOperation(
    userId: string,
    createDto: CreateBatchOperationDto,
  ): Promise<BatchOperation> {
    const { type, targetAccountIds, parameters = {} } = createDto;

    // 验证账号是否存在且属于该用户
    const accounts = await this.facebookAccountRepository
      .createQueryBuilder('account')
      .where('account.id IN (:...ids)', { ids: targetAccountIds })
      .andWhere('account.userId = :userId', { userId })
      .andWhere('account.deletedAt IS NULL')
      .getMany();

    if (accounts.length !== targetAccountIds.length) {
      throw new BadRequestException('部分账号不存在或不属于当前用户');
    }

    // 创建批量操作记录
    const batchOperation = this.batchOperationRepository.create({
      userId,
      type,
      targetAccountIds,
      totalAccounts: targetAccountIds.length,
      parameters: {
        timeout: createDto.timeout || 30000,
        retryCount: createDto.retryCount || 3,
        concurrencyLimit: createDto.concurrencyLimit || 5,
        skipOnError: createDto.skipOnError || false,
        ...parameters,
      },
      status: 'pending',
      progress: 0,
    });

    const savedOperation = await this.batchOperationRepository.save(batchOperation);

    // 添加到队列
    await this.batchQueue.add('process-batch', {
      operationId: savedOperation.id,
      userId,
    });

    this.logger.log(`批量操作创建成功: ${savedOperation.id}, 类型: ${type}, 账号数: ${targetAccountIds.length}`);

    // 触发事件
    this.eventEmitter.emit('batch.operation.created', savedOperation);

    return savedOperation;
  }

  /**
   * 获取批量操作列表
   */
  async getBatchOperations(
    userId: string,
    page = 1,
    limit = 20,
    filters?: {
      type?: BatchOperationType;
      status?: BatchOperationStatus;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{ operations: BatchOperation[]; total: number }> {
    const query = this.batchOperationRepository
      .createQueryBuilder('operation')
      .where('operation.userId = :userId', { userId });

    if (filters?.type) {
      query.andWhere('operation.type = :type', { type: filters.type });
    }

    if (filters?.status) {
      query.andWhere('operation.status = :status', { status: filters.status });
    }

    if (filters?.startDate) {
      query.andWhere('operation.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      query.andWhere('operation.createdAt <= :endDate', { endDate: filters.endDate });
    }

    query.orderBy('operation.createdAt', 'DESC');

    const [operations, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { operations, total };
  }

  /**
   * 获取批量操作详情
   */
  async getBatchOperation(userId: string, operationId: string): Promise<BatchOperation> {
    const operation = await this.batchOperationRepository.findOne({
      where: { id: operationId, userId },
    });

    if (!operation) {
      throw new NotFoundException('批量操作不存在');
    }

    return operation;
  }

  /**
   * 取消批量操作
   */
  async cancelBatchOperation(userId: string, operationId: string): Promise<BatchOperation> {
    const operation = await this.getBatchOperation(userId, operationId);

    if (operation.isCompleted()) {
      throw new BadRequestException('操作已完成，无法取消');
    }

    if (!operation.isRunning()) {
      throw new BadRequestException('只有运行中的操作可以取消');
    }

    operation.status = 'cancelled';
    operation.completedAt = new Date();

    const updated = await this.batchOperationRepository.save(operation);

    this.logger.log(`批量操作已取消: ${operationId}`);

    // 触发事件
    this.eventEmitter.emit('batch.operation.cancelled', updated);

    return updated;
  }

  /**
   * 重试失败的批量操作
   */
  async retryBatchOperation(userId: string, operationId: string): Promise<BatchOperation> {
    const operation = await this.getBatchOperation(userId, operationId);

    if (operation.status !== 'failed') {
      throw new BadRequestException('只有失败的操作可以重试');
    }

    // 创建新的批量操作，只重试失败的账号
    const failedAccountIds = operation.failedAccountIds || [];
    if (failedAccountIds.length === 0) {
      throw new BadRequestException('没有失败的账号可以重试');
    }

    const retryOperation = this.batchOperationRepository.create({
      userId,
      type: operation.type,
      targetAccountIds: failedAccountIds,
      totalAccounts: failedAccountIds.length,
      parameters: operation.parameters,
      status: 'pending',
      progress: 0,
    });

    const savedOperation = await this.batchOperationRepository.save(retryOperation);

    // 添加到队列
    await this.batchQueue.add('process-batch', {
      operationId: savedOperation.id,
      userId,
    });

    this.logger.log(`批量操作重试创建: ${savedOperation.id}, 重试账号数: ${failedAccountIds.length}`);

    return savedOperation;
  }

  /**
   * 处理批量操作（队列处理器）
   */
  async processBatchOperation(operationId: string): Promise<void> {
    const operation = await this.batchOperationRepository.findOne({
      where: { id: operationId },
    });

    if (!operation) {
      this.logger.error(`批量操作不存在: ${operationId}`);
      return;
    }

    if (operation.isCompleted()) {
      this.logger.warn(`批量操作已完成: ${operationId}`);
      return;
    }

    // 更新状态为运行中
    operation.status = 'running';
    operation.startedAt = new Date();
    await this.batchOperationRepository.save(operation);

    this.logger.log(`开始处理批量操作: ${operationId}, 类型: ${operation.type}, 账号数: ${operation.totalAccounts}`);

    try {
      // 根据操作类型执行不同的处理逻辑
      switch (operation.type) {
        case 'start':
          await this.processBatchStart(operation);
          break;
        case 'pause':
          await this.processBatchPause(operation);
          break;
        case 'stop':
          await this.processBatchStop(operation);
          break;
        case 'test':
          await this.processBatchTest(operation);
          break;
        case 'export':
          await this.processBatchExport(operation);
          break;
        case 'delete':
          await this.processBatchDelete(operation);
          break;
        case 'import':
          await this.processBatchImport(operation);
          break;
        default:
          throw new Error(`不支持的操作类型: ${operation.type}`);
      }

      // 标记为完成
      operation.status = 'completed';
      operation.completedAt = new Date();
      await this.batchOperationRepository.save(operation);

      this.logger.log(`批量操作完成: ${operationId}, 成功率: ${operation.getSuccessRate() * 100}%`);

      // 触发事件
      this.eventEmitter.emit('batch.operation.completed', operation);

    } catch (error) {
      this.logger.error(`批量操作失败: ${operationId}, 错误: ${error.message}`);

      operation.status = 'failed';
      operation.errorMessage = error.message;
      operation.completedAt = new Date();
      await this.batchOperationRepository.save(operation);

      // 触发事件
      this.eventEmitter.emit('batch.operation.failed', operation);
    }
  }

  /**
   * 处理批量启动
   */
  private async processBatchStart(operation: BatchOperation): Promise<void> {
    const { targetAccountIds, parameters } = operation;
    const concurrencyLimit = parameters?.concurrencyLimit || 5;

    // 分批处理，控制并发数
    for (let i = 0; i < targetAccountIds.length; i += concurrencyLimit) {
      const batch = targetAccountIds.slice(i, i + concurrencyLimit);
      const promises = batch.map(accountId => this.startAccount(accountId, operation));

      await Promise.allSettled(promises);

      // 更新进度
      operation.updateProgress(i + batch.length, targetAccountIds.length);
      await this.batchOperationRepository.save(operation);
    }
  }

  /**
   * 启动单个账号
   */
  private async startAccount(accountId: string, operation: BatchOperation): Promise<void> {
    try {
      const account = await this.facebookAccountRepository.findOne({
        where: { id: accountId },
      });

      if (!account) {
        operation.addSkipped(accountId, '账号不存在');
        return;
      }

      // 检查账号状态
      if (account.status === 'banned') {
        operation.addSkipped(accountId, '账号被封禁');
        return;
      }

      if (account.status === 'disabled') {
        operation.addSkipped(accountId, '账号已禁用');
        return;
      }

      // 模拟启动账号（实际应该调用Facebook API）
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 更新账号状态
      account.status = 'active';
      account.batchOperationId = operation.id;
      account.batchOperationStatus = 'completed';
      await this.facebookAccountRepository.save(account);

      operation.addSuccess(accountId, '启动成功');

      this.logger.debug(`账号启动成功: ${accountId}`);

    } catch (error) {
      this.logger.error(`账号启动失败: ${accountId}, 错误: ${error.message}`);
      operation.addFailed(accountId, error.message);
    }
  }

  /**
   * 处理批量暂停
   */
  private async processBatchPause(operation: BatchOperation): Promise<void> {
    // 实现暂停逻辑
    for (const accountId of operation.targetAccountIds) {
      try {
        const account = await this.facebookAccountRepository.findOne({
          where: { id: accountId },
        });

        if (account) {
          account.status = 'idle';
          account.batchOperationId = operation.id;
          account.batchOperationStatus = 'completed';
          await this.facebookAccountRepository.save(account);

          operation.addSuccess(accountId, '暂停成功');
        } else {
          operation.addSkipped(accountId, '账号不存在');
        }
      } catch (error) {
        operation.addFailed(accountId, error.message);
      }
    }
  }

  /**
   * 处理批量停止
   */
  private async processBatchStop(operation: BatchOperation): Promise<void> {
    // 实现停止逻辑
    for (const accountId of operation.targetAccountIds) {
      try {
        const account = await this.facebookAccountRepository.findOne({
          where: { id: accountId },
        });

        if (account) {
          account.status = 'idle';
          account.batchOperationId = operation.id;
          account.batchOperationStatus = 'completed';
          await this.facebookAccountRepository.save(account);

          operation.addSuccess(accountId, '停止成功');
        } else {
          operation.addSkipped(accountId, '账号不存在');
        }
      } catch (error) {
        operation.addFailed(accountId, error.message);
      }
    }
  }

  /**
   * 处理批量测试
   */
  private async processBatchTest(operation: BatchOperation): Promise<void> {
    // 实现测试逻辑
    for (const accountId of operation.targetAccountIds) {
      try {
        const account = await this.facebookAccountRepository.findOne({
          where: { id: accountId },
        });

        if (account) {
          // 模拟测试连接
          await new Promise(resolve => setTimeout(resolve, 500));

          // 更新健康状态
          account.healthScore = 95;
          account.lastHealthCheckAt = new Date();
          account.loginStatus = true;
          account.sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          account.taskSuccessRate = 0.98;
          account.avgResponseTime = 150;
          account.batchOperationId = operation.id;
          account.batchOperationStatus = 'completed';
          await this.facebookAccountRepository.save(account);

          operation.addSuccess(accountId, '测试通过');
        } else {
          operation.addSkipped(accountId, '账号不存在');
        }
      } catch (error) {
        operation.addFailed(accountId, error.message);
      }
    }
  }

  /**
   * 处理批量导出
   */
  private async processBatchExport(operation: BatchOperation): Promise<void> {
    // 实现导出逻辑
    for (const accountId of operation.targetAccountIds) {
      try {
        const account = await this.facebookAccountRepository.findOne({
          where: { id: accountId },
        });

        if (account) {
          // 模拟导出数据
          await new Promise(resolve => setTimeout(resolve, 300));

          operation.addSuccess(accountId, '导出成功');
        } else {
          operation.addSkipped(accountId, '账号不存在');
        }
      } catch (error) {
        operation.addFailed(accountId, error.message);
      }
    }
  }

  /**
   * 处理批量删除
   */
  private async processBatchDelete(operation: BatchOperation): Promise<void> {
    // 实现删除逻辑
    for (const accountId of operation.targetAccountIds) {
      try {
        const account = await this.facebookAccountRepository.findOne({
          where: { id: accountId },
        });

        if (account) {
          // 软删除账号
          await this.facebookAccountRepository.softDelete(accountId);

          operation.addSuccess(accountId, '删除成功');
        } else {
          operation.addSkipped(accountId, '账号不存在');
        }
      } catch (error) {
        operation.addFailed(accountId, error.message);
      }
    }
  }

  /**
   * 处理批量导入
   */
  private async processBatchImport(operation: BatchOperation): Promise<void> {
    // 实现导入逻辑
    // 这里需要根据实际情况实现
    operation.addSkipped('all', '导入功能待实现');
  }

  /**
   * 清理过期的批量操作记录
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldOperations(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.batchOperationRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :date', { date: thirtyDaysAgo })
      .andWhere('status IN (:...statuses)', { statuses: ['completed', 'failed', 'cancelled'] })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`清理了 ${result.affected} 条过期的批量操作记录`);
    }
  }

  /**
   * 获取批量操作统计
   */
  async getBatchStatistics(userId: string): Promise<{
    totalOperations: number;
    successRate: number;
    avgDuration: number;
    operationsByType: Record<string, number>;
    operationsByStatus: Record<string, number>;
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 总操作数
    const totalOperations = await this.batchOperationRepository.count({
      where: {
        userId,
        createdAt: { $gte: thirtyDaysAgo } as any,
      },
    });

    // 成功率和平均时长
    const completedOperations = await this.batchOperationRepository.find({
      where: {
        userId,
        status: 'completed',
        createdAt: { $gte: thirtyDaysAgo } as any,
      },
    });

    let totalSuccessRate = 0;
    let totalDuration = 0;
    let completedCount = 0;

    for (const op of completedOperations) {
      totalSuccessRate += op.getSuccessRate();
      const duration = op.getDuration();
      if (duration) {
        totalDuration += duration;
        completedCount++;
      }
    }

    const successRate = completedOperations.length > 0 ? totalSuccessRate / completedOperations.length : 0;
    const avgDuration = completedCount > 0 ? totalDuration / completedCount : 0;

    // 按类型统计
    const typeStats = await this.batchOperationRepository
      .createQueryBuilder('operation')
      .select('operation.type, COUNT(*) as count')
      .where('operation.userId = :userId', { userId })
      .andWhere('operation.createdAt >= :date', { date: thirtyDaysAgo })
      .groupBy('operation.type')
      .getRawMany();

    const operationsByType: Record<string, number> = {};
    for (const stat of typeStats) {
      operationsByType[stat.operation_type] = parseInt(stat.count);
    }

    // 按状态统计
    const statusStats = await this.batchOperationRepository
      .createQueryBuilder('operation')
      .select('operation.status, COUNT(*) as count')
      .where('operation.userId = :userId', { userId })
      .andWhere('operation.createdAt >= :date', { date: thirtyDaysAgo })
      .groupBy('operation.status')
      .getRawMany();

    const operationsByStatus: Record<string, number> = {};
    for (const stat of statusStats) {
      operationsByStatus[stat.operation_status] = parseInt(stat.count);
    }

    return {
      totalOperations,
      successRate,
      avgDuration,
      operationsByType,
      operationsByStatus,
    };
  }

  /**
   * 获取实时操作进度
   */
  async getOperationProgress(operationId: string): Promise<{
    progress: number;
    status: BatchOperationStatus;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    estimatedTimeRemaining?: number;
  }> {
    const operation = await this.batchOperationRepository.findOne({
      where: { id: operationId },
    });

    if (!operation) {
      throw new NotFoundException('批量操作不存在');
    }

    let estimatedTimeRemaining: number | undefined;
    
    if (operation.isRunning() && operation.startedAt) {
      const elapsed = Date.now() - operation.startedAt.getTime();
      if (operation.progress > 0) {
        const estimatedTotal = elapsed / (operation.progress / 100);
        estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsed);
      }
    }

    return {
      progress: operation.progress,
      status: operation.status,
      successCount: operation.successCount || 0,
      failedCount: operation.failedCount || 0,
      skippedCount: operation.skippedCount || 0,
      estimatedTimeRemaining,
    };
  }

  /**
   * 批量操作健康检查
   */
  async checkBatchHealth(userId: string): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 检查是否有长时间运行的操作
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const longRunningOps = await this.batchOperationRepository.find({
      where: {
        userId,
        status: 'running',
        startedAt: { $lt: oneHourAgo } as any,
      },
    });

    if (longRunningOps.length > 0) {
      issues.push(`有 ${longRunningOps.length} 个批量操作运行时间超过1小时`);
      recommendations.push('检查长时间运行的操作，考虑取消或优化');
    }

    // 检查失败率
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOps = await this.batchOperationRepository.find({
      where: {
        userId,
        createdAt: { $gte: thirtyDaysAgo } as any,
      },
    });

    const failedOps = recentOps.filter(op => op.status === 'failed');
    const failureRate = recentOps.length > 0 ? failedOps.length / recentOps.length : 0;

    if (failureRate > 0.3) {
      issues.push(`批量操作失败率过高: ${(failureRate * 100).toFixed(1)}%`);
      recommendations.push('检查账号状态和网络连接，调整操作参数');
    }

    // 检查并发数配置
    const runningOps = await this.batchOperationRepository.count({
      where: {
        userId,
        status: 'running',
      },
    });

    if (runningOps > 3) {
      issues.push(`并发批量操作过多: ${runningOps} 个`);
      recommendations.push('减少并发操作数量，避免系统资源紧张');
    }

    return {
      healthy: issues.length === 0,
      issues,
      recommendations,
    };
  }
}
