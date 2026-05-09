import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { AccountBatchService } from '../account-batch.service';

@Processor('batch-operations')
export class BatchProcessor {
  private readonly logger = new Logger(BatchProcessor.name);

  constructor(private readonly accountBatchService: AccountBatchService) {}

  @Process('process-batch')
  async handleBatchOperation(job: Job<{ operationId: string; userId: string }>): Promise<void> {
    const { operationId } = job.data;
    this.logger.log(`开始处理批量操作任务: ${operationId}, 任务ID: ${job.id}`);

    try {
      await this.accountBatchService.processBatchOperation(operationId);
      this.logger.log(`批量操作任务完成: ${operationId}, 任务ID: ${job.id}`);
    } catch (error) {
      this.logger.error(`批量操作任务失败: ${operationId}, 错误: ${error.message}`);
      throw error;
    }
  }

  @OnQueueActive()
  onActive(job: Job): void {
    this.logger.debug(`任务开始执行: ${job.id}, 类型: ${job.name}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any): void {
    this.logger.debug(`任务执行完成: ${job.id}, 结果: ${JSON.stringify(result)}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.error(`任务执行失败: ${job.id}, 错误: ${error.message}`);
  }
}