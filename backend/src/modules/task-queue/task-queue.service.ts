import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Task, TaskPriority, TaskStatus } from '../task-scheduler/entities/task.entity';
import { AccountManagerService } from '../account-manager/account-manager.service';
import { TaskExecutorService } from '../task-executor/task-executor.service';

export interface TaskJobData {
  taskId: string;
  taskName: string;
  priority: TaskPriority;
  executionData: any;
  retryCount: number;
}

@Injectable()
@Processor('task-queue')
export class TaskQueueService implements OnModuleInit {
  private readonly logger = new Logger(TaskQueueService.name);
  private readonly QUEUE_NAME = 'task-queue';
  private readonly MAX_CONCURRENT_JOBS = 10;

  constructor(
    @InjectQueue('task-queue') private taskQueue: Queue,
    private accountManagerService: AccountManagerService,
    private taskExecutorService: TaskExecutorService,
  ) {}

  async onModuleInit() {
    this.logger.log('Task queue service initialized');
    
    // 清理旧的队列数据
    await this.cleanStaleJobs();
    
    // 启动队列处理
    await this.startQueueProcessing();
  }

  /**
   * 添加任务到队列
   */
  async addTaskToQueue(task: Task): Promise<Job> {
    const jobData: TaskJobData = {
      taskId: task.id,
      taskName: task.name,
      priority: task.priority,
      executionData: task.executionData,
      retryCount: task.retryCount,
    };

    const jobOptions = {
      jobId: task.id,
      priority: task.priority,
      attempts: task.maxRetries,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5秒
      },
      timeout: task.timeoutMinutes * 60 * 1000, // 转换为毫秒
      removeOnComplete: true,
      removeOnFail: false,
    };

    const job = await this.taskQueue.add(jobData, jobOptions);
    this.logger.log(`Task ${task.id} added to queue with priority ${task.priority}`);
    
    return job;
  }

  /**
   * 处理任务
   */
  @Process({
    concurrency: 10, // 最大并发数
  })
  async processTask(job: Job<TaskJobData>): Promise<any> {
    const { taskId, taskName, priority, executionData, retryCount } = job.data;
    
    this.logger.log(`Processing task ${taskId} - ${taskName} (priority: ${priority}, retry: ${retryCount})`);
    
    try {
      // 获取可用账号
      const account = await this.accountManagerService.acquireAccount();
      
      if (!account) {
        this.logger.warn(`No available accounts for task ${taskId}, delaying...`);
        throw new Error('No available accounts');
      }

      this.logger.log(`Assigned account ${account.id} to task ${taskId}`);

      // 执行任务
      const result = await this.taskExecutorService.executeTask(
        taskId,
        account.id,
        executionData
      );

      // 释放账号
      await this.accountManagerService.releaseAccount(account.id);

      return {
        success: true,
        taskId,
        accountId: account.id,
        result,
      };

    } catch (error) {
      this.logger.error(`Failed to process task ${taskId}:`, error);
      
      // 如果还有重试次数，抛出错误让Bull重试
      if (retryCount < job.opts.attempts - 1) {
        throw error;
      }
      
      // 最后一次重试失败，返回失败结果
      return {
        success: false,
        taskId,
        error: error.message,
        retryCount: retryCount + 1,
      };
    }
  }

  /**
   * 获取队列状态
   */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.taskQueue.getWaitingCount(),
      this.taskQueue.getActiveCount(),
      this.taskQueue.getCompletedCount(),
      this.taskQueue.getFailedCount(),
      this.taskQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }

  /**
   * 获取队列中的任务
   */
  async getQueuedJobs(): Promise<Job[]> {
    return this.taskQueue.getJobs(['waiting', 'active', 'delayed']);
  }

  /**
   * 清理旧的队列数据
   */
  private async cleanStaleJobs(): Promise<void> {
    try {
      // 清理超过7天的已完成任务
      await this.taskQueue.clean(1000 * 60 * 60 * 24 * 7, 'completed');
      
      // 清理超过30天的失败任务
      await this.taskQueue.clean(1000 * 60 * 60 * 24 * 30, 'failed');
      
      this.logger.log('Cleaned up stale queue jobs');
    } catch (error) {
      this.logger.error('Failed to clean stale jobs:', error);
    }
  }

  /**
   * 启动队列处理
   */
  private async startQueueProcessing(): Promise<void> {
    try {
      // 恢复暂停的队列
      await this.taskQueue.resume();
      
      // 设置队列事件监听
      this.setupQueueEventListeners();
      
      this.logger.log('Task queue processing started');
    } catch (error) {
      this.logger.error('Failed to start queue processing:', error);
    }
  }

  /**
   * 设置队列事件监听器
   */
  private setupQueueEventListeners(): void {
    this.taskQueue.on('completed', (job, result) => {
      this.logger.log(`Job ${job.id} completed: ${JSON.stringify(result)}`);
    });

    this.taskQueue.on('failed', (job, error) => {
      this.logger.error(`Job ${job.id} failed:`, error);
    });

    this.taskQueue.on('stalled', (job) => {
      this.logger.warn(`Job ${job.id} stalled`);
    });

    this.taskQueue.on('progress', (job, progress) => {
      this.logger.log(`Job ${job.id} progress: ${progress}%`);
    });
  }

  /**
   * 暂停队列处理
   */
  async pauseQueue(): Promise<void> {
    await this.taskQueue.pause();
    this.logger.log('Task queue paused');
  }

  /**
   * 恢复队列处理
   */
  async resumeQueue(): Promise<void> {
    await this.taskQueue.resume();
    this.logger.log('Task queue resumed');
  }

  /**
   * 清空队列
   */
  async emptyQueue(): Promise<void> {
    await this.taskQueue.empty();
    this.logger.log('Task queue emptied');
  }

  /**
   * 获取任务统计信息
   */
  async getQueueStats(): Promise<Record<string, any>> {
    const counts = await this.getQueueStatus();
    const jobs = await this.getQueuedJobs();
    
    const priorityCounts = {
      [TaskPriority.EMERGENCY]: 0,
      [TaskPriority.HIGH]: 0,
      [TaskPriority.MEDIUM]: 0,
      [TaskPriority.LOW]: 0,
    };

    for (const job of jobs) {
      const priority = job.data.priority || TaskPriority.MEDIUM;
      priorityCounts[priority]++;
    }

    return {
      counts,
      priorityCounts,
      totalJobs: jobs.length,
      timestamp: new Date().toISOString(),
    };
  }
}