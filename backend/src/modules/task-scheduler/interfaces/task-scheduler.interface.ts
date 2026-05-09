import { Task, TaskType, TaskPriority, TaskStatus } from '../entities/task.entity';

export interface ITaskScheduler {
  /**
   * 创建并调度任务
   */
  scheduleTask(taskData: Partial<Task>): Promise<Task>;

  /**
   * 立即执行任务
   */
  executeImmediately(taskId: string): Promise<boolean>;

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): Promise<boolean>;

  /**
   * 恢复任务
   */
  resumeTask(taskId: string): Promise<boolean>;

  /**
   * 取消任务
   */
  cancelTask(taskId: string): Promise<boolean>;

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): Promise<TaskStatus>;

  /**
   * 获取待执行任务列表
   */
  getPendingTasks(): Promise<Task[]>;

  /**
   * 获取运行中任务列表
   */
  getRunningTasks(): Promise<Task[]>;

  /**
   * 清理已完成任务
   */
  cleanupCompletedTasks(daysToKeep?: number): Promise<number>;
}

export interface IScheduleConfig {
  type: TaskType;
  scheduledAt?: Date;
  recurringType?: 'daily' | 'weekly' | 'monthly';
  recurringTime?: string;
  cronExpression?: string;
  timezone?: string;
}

export interface ITaskExecutionResult {
  success: boolean;
  taskId: string;
  accountId?: string;
  message?: string;
  data?: Record<string, any>;
  error?: string;
  executionTime?: number;
  retryCount?: number;
}