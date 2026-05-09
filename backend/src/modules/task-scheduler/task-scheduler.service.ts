import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Task, TaskType, TaskPriority, TaskStatus } from './entities/task.entity';
import { TaskExecutionLog, LogStatus } from './entities/task-execution-log.entity';
import { AccountManagerService } from '../account-manager/account-manager.service';
import { TaskQueueService } from '../task-queue/task-queue.service';
import { ITaskScheduler, IScheduleConfig, ITaskExecutionResult } from './interfaces/task-scheduler.interface';

@Injectable()
export class TaskSchedulerService implements ITaskScheduler, OnModuleInit {
  private readonly logger = new Logger(TaskSchedulerService.name);
  private readonly MAX_CONCURRENT_ACCOUNTS = 10;

  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskExecutionLog)
    private logRepository: Repository<TaskExecutionLog>,
    private accountManagerService: AccountManagerService,
    private taskQueueService: TaskQueueService,
  ) {}

  async onModuleInit() {
    this.logger.log('Task scheduler service initialized');
    await this.recoverPendingTasks();
  }

  /**
   * 恢复系统重启时未完成的任务
   */
  private async recoverPendingTasks() {
    try {
      const pendingTasks = await this.taskRepository.find({
        where: { status: TaskStatus.RUNNING },
      });

      for (const task of pendingTasks) {
        this.logger.warn(`Recovering task ${task.id} that was running before restart`);
        task.status = TaskStatus.FAILED;
        task.result = {
          success: false,
          error: 'System restart interrupted execution',
          executionTime: 0,
        };
        await this.taskRepository.save(task);

        await this.createLog(task.id, null, LogStatus.FAILED, 'Task interrupted by system restart');
      }

      this.logger.log(`Recovered ${pendingTasks.length} interrupted tasks`);
    } catch (error) {
      this.logger.error('Failed to recover pending tasks', error);
    }
  }

  async scheduleTask(taskData: Partial<Task>): Promise<Task> {
    const task = this.taskRepository.create(taskData);
    
    // 设置调度时间
    if (task.type === TaskType.IMMEDIATE) {
      task.scheduledAt = new Date();
      task.status = TaskStatus.QUEUED;
    } else if (task.type === TaskType.SCHEDULED && task.scheduleConfig?.scheduledAt) {
      task.scheduledAt = new Date(task.scheduleConfig.scheduledAt);
      task.status = TaskStatus.PENDING;
    } else if (task.type === TaskType.RECURRING || task.type === TaskType.CRON) {
      task.status = TaskStatus.PENDING;
      // 计算下一次执行时间
      task.scheduledAt = this.calculateNextExecution(task);
    }

    const savedTask = await this.taskRepository.save(task);

    // 立即执行的任务加入队列
    if (task.type === TaskType.IMMEDIATE) {
      await this.taskQueueService.addTaskToQueue(savedTask);
    }

    // 创建日志
    await this.createLog(savedTask.id, null, LogStatus.INFO, `Task created: ${savedTask.name}`);

    this.logger.log(`Task scheduled: ${savedTask.id} - ${savedTask.name}`);
    return savedTask;
  }

  async executeImmediately(taskId: string): Promise<boolean> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status === TaskStatus.RUNNING) {
      throw new Error(`Task ${taskId} is already running`);
    }

    task.status = TaskStatus.QUEUED;
    task.scheduledAt = new Date();
    await this.taskRepository.save(task);

    await this.taskQueueService.addTaskToQueue(task);
    await this.createLog(taskId, null, LogStatus.INFO, 'Task queued for immediate execution');

    return true;
  }

  async pauseTask(taskId: string): Promise<boolean> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== TaskStatus.RUNNING && task.status !== TaskStatus.QUEUED) {
      throw new Error(`Task ${taskId} cannot be paused in status ${task.status}`);
    }

    const previousStatus = task.status;
    task.status = TaskStatus.PAUSED;
    await this.taskRepository.save(task);

    // 如果任务正在运行，通知执行器暂停
    if (previousStatus === TaskStatus.RUNNING) {
      // TODO: 通知执行器暂停任务
    }

    await this.createLog(taskId, null, LogStatus.INFO, 'Task paused');
    return true;
  }

  async resumeTask(taskId: string): Promise<boolean> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== TaskStatus.PAUSED) {
      throw new Error(`Task ${taskId} is not paused`);
    }

    task.status = TaskStatus.QUEUED;
    await this.taskRepository.save(task);

    await this.taskQueueService.addTaskToQueue(task);
    await this.createLog(taskId, null, LogStatus.INFO, 'Task resumed and queued');

    return true;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
      throw new Error(`Task ${taskId} is already finished`);
    }

    const previousStatus = task.status;
    task.status = TaskStatus.CANCELLED;
    task.completedAt = new Date();
    await this.taskRepository.save(task);

    // 如果任务正在运行，通知执行器取消
    if (previousStatus === TaskStatus.RUNNING) {
      // TODO: 通知执行器取消任务
    }

    await this.createLog(taskId, null, LogStatus.CANCELLED, 'Task cancelled');
    return true;
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const task = await this.taskRepository.findOne({ 
      where: { id: taskId },
      select: ['status']
    });
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    return task.status;
  }

  async getTasksByUser(userId: string, filters: { status?: string; type?: string; accountId?: string } = {}): Promise<Task[]> {
    const qb = this.taskRepository.createQueryBuilder('task')
      .where('task."userId" = :userId', { userId })
      .orderBy('task."createdAt"', 'DESC');

    if (filters.status) qb.andWhere('task.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('task.type = :type', { type: filters.type });
    if (filters.accountId) qb.andWhere('task."accountId" = :accountId', { accountId: filters.accountId });

    return qb.getMany();
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    await this.taskRepository.delete({ id: taskId, userId });
  }

  async getPendingTasks(): Promise<Task[]> {
    return this.taskRepository.find({
      where: { 
        status: TaskStatus.PENDING 
      },
      order: { scheduledAt: 'ASC' }
    });
  }

  async getRunningTasks(): Promise<Task[]> {
    return this.taskRepository.find({
      where: { 
        status: TaskStatus.RUNNING 
      },
      relations: ['account']
    });
  }

  async cleanupCompletedTasks(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.taskRepository
      .createQueryBuilder()
      .delete()
      .where('status IN (:...statuses)', { 
        statuses: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED] 
      })
      .andWhere('completed_at < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} completed tasks older than ${daysToKeep} days`);
    return result.affected || 0;
  }

  /**
   * 计算下一次执行时间
   */
  private calculateNextExecution(task: Task): Date {
    const now = new Date();
    const config = task.scheduleConfig;

    if (!config) {
      return now;
    }

    if (task.type === TaskType.RECURRING) {
      if (config.recurringType === 'daily' && config.recurringTime) {
        const [hours, minutes] = config.recurringTime.split(':').map(Number);
        const next = new Date();
        next.setHours(hours, minutes, 0, 0);
        
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        
        return next;
      }
      // 每周和每月重复的逻辑类似，这里简化处理
    } else if (task.type === TaskType.CRON && config.cronExpression) {
      // 这里简化处理，实际应该使用cron解析器
      // 返回当前时间加1小时作为示例
      const next = new Date(now.getTime() + 60 * 60 * 1000);
      return next;
    }

    return now;
  }

  /**
   * 定期检查待调度任务
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledTasks() {
    try {
      const now = new Date();
      const tasksToSchedule = await this.taskRepository.find({
        where: {
          status: TaskStatus.PENDING,
          scheduledAt: { $lte: now }
        }
      });

      for (const task of tasksToSchedule) {
        task.status = TaskStatus.QUEUED;
        await this.taskRepository.save(task);
        await this.taskQueueService.addTaskToQueue(task);
        await this.createLog(task.id, null, LogStatus.INFO, 'Task scheduled for execution');
      }

      if (tasksToSchedule.length > 0) {
        this.logger.log(`Scheduled ${tasksToSchedule.length} tasks for execution`);
      }
    } catch (error) {
      this.logger.error('Failed to check scheduled tasks', error);
    }
  }

  /**
   * 创建执行日志
   */
  private async createLog(
    taskId: string, 
    accountId: string | null, 
    status: LogStatus, 
    message: string,
    details?: Record<string, any>,
    progress?: number
  ): Promise<TaskExecutionLog> {
    const log = this.logRepository.create({
      taskId,
      accountId,
      status,
      message,
      details,
      progress
    });

    return this.logRepository.save(log);
  }

  /**
   * 处理任务执行结果
   */
  async handleTaskResult(result: ITaskExecutionResult): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { id: result.taskId } });
    
    if (!task) {
      this.logger.error(`Task ${result.taskId} not found for result handling`);
      return;
    }

    task.completedAt = new Date();
    task.result = {
      success: result.success,
      message: result.message,
      data: result.data,
      error: result.error,
      executionTime: result.executionTime
    };

    if (result.success) {
      task.status = TaskStatus.COMPLETED;
    } else if (result.retryCount && result.retryCount < task.maxRetries) {
      // 重试逻辑
      task.status = TaskStatus.PENDING;
      task.retryCount = result.retryCount + 1;
      
      // 指数退避重试
      const retryDelay = Math.pow(2, task.retryCount) * 5000; // 5s, 10s, 20s
      task.scheduledAt = new Date(Date.now() + retryDelay);
      
      await this.createLog(
        task.id, 
        result.accountId, 
        LogStatus.RETRY, 
        `Task failed, scheduling retry ${task.retryCount}/${task.maxRetries} in ${retryDelay/1000}s`,
        { error: result.error, retryCount: task.retryCount }
      );
    } else {
      task.status = TaskStatus.FAILED;
    }

    await this.taskRepository.save(task);

    // 释放账号资源
    if (result.accountId) {
      await this.accountManagerService.releaseAccount(result.accountId);
    }

    // 记录最终日志
    await this.createLog(
      task.id,
      result.accountId,
      result.success ? LogStatus.COMPLETED : LogStatus.FAILED,
      result.success ? 'Task completed successfully' : `Task failed: ${result.error}`,
      result
    );

    this.logger.log(`Task ${task.id} ${result.success ? 'completed' : 'failed'}: ${result.message}`);
  }
}