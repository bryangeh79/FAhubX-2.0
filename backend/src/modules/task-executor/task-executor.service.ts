import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus } from '../task-scheduler/entities/task.entity';
import { TaskExecutionLog, LogStatus } from '../task-scheduler/entities/task-execution-log.entity';
import { BrowserAutomationService } from './integrations/browser-automation.service';
import { DialogueScriptService } from './integrations/dialogue-script.service';
import { FacebookChatService } from './integrations/facebook-chat.service';
import { FacebookPostService } from './integrations/facebook-post.service';
import { AccountWarmingService } from './integrations/account-warming.service';
import { FacebookSocialService } from './integrations/facebook-social.service';
import { ITaskExecutionResult } from '../task-scheduler/interfaces/task-scheduler.interface';

@Injectable()
export class TaskExecutorService {
  private readonly logger = new Logger(TaskExecutorService.name);

  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(TaskExecutionLog)
    private logRepository: Repository<TaskExecutionLog>,
    private browserAutomationService: BrowserAutomationService,
    private dialogueScriptService: DialogueScriptService,
    private facebookChatService: FacebookChatService,
    private facebookPostService: FacebookPostService,
    private accountWarmingService: AccountWarmingService,
    private facebookSocialService: FacebookSocialService,
  ) {}

  /**
   * 执行任务
   */
  async executeTask(
    taskId: string,
    accountId: string,
    executionData: any
  ): Promise<ITaskExecutionResult> {
    const startTime = Date.now();
    
    try {
      // 更新任务状态为运行中
      await this.updateTaskStatus(taskId, TaskStatus.RUNNING, accountId);
      
      // 记录开始日志
      await this.createLog(taskId, accountId, LogStatus.STARTED, 'Task execution started', null, 0);

      let result: any;
      const taskAction = executionData?.parameters?.taskAction;

      // Dispatch by taskAction first (new task types)
      if (taskAction === 'auto_chat') {
        result = await this.facebookChatService.executeAutoChat({
          accountAId: executionData.parameters.accountAId || accountId,
          accountBId: executionData.parameters.accountBId,
          scriptId: executionData.parameters.scriptId,
          aiEnabled: executionData.parameters.aiEnabled || false,
          userId: executionData.parameters.userId || '',
        });
      } else if (taskAction === 'auto_post_image') {
        result = await this.facebookPostService.executeAutoPostImage({
          accountId: executionData.parameters.accountAId || accountId,
          content: executionData.parameters.content || '',
          imageUrls: executionData.parameters.imageUrls,
        });
      } else if (taskAction === 'auto_post_video') {
        result = await this.facebookPostService.executeAutoPostVideo({
          accountId: executionData.parameters.accountAId || accountId,
          description: executionData.parameters.description || '',
          videoUrl: executionData.parameters.videoUrl,
        });
      } else if (taskAction === 'auto_call') {
        result = await this.facebookChatService.executeAutoCall({
          accountAId: executionData.parameters.accountAId || accountId,
          accountBId: executionData.parameters.accountBId,
          callDuration: executionData.parameters.callDuration || 30,
          userId: executionData.parameters.userId || '',
        });
      } else if (taskAction === 'auto_simulate') {
        result = await this.accountWarmingService.execute({
          accountId: executionData.parameters.accountAId || accountId,
          durationMinutes: executionData.parameters.durationMinutes || 30,
          actions: executionData.parameters.warmingActions || ['scroll_feed', 'watch_video', 'like_post'],
        });
      } else if (taskAction === 'auto_add_friends') {
        result = await this.facebookSocialService.executeAutoAddFriends({
          accountId: executionData.parameters.accountAId || accountId,
          dailyLimit: Math.min(executionData.parameters.dailyLimit || 5, 6), // hard cap 6/day
          prioritizeMutual: executionData.parameters.prioritizeMutual !== false,
          delayMin: (executionData.parameters.delayMin || 30) * 1000,
          delayMax: (executionData.parameters.delayMax || 180) * 1000,
        });
      } else if (taskAction === 'auto_accept_requests') {
        result = await this.facebookSocialService.executeAutoAcceptRequests({
          accountId: executionData.parameters.accountAId || accountId,
          maxCount: executionData.parameters.maxCount || 999,
        });
      } else if (taskAction === 'auto_comment') {
        result = await this.facebookSocialService.executeAutoComment({
          accountId: executionData.parameters.accountAId || accountId,
          comments: executionData.parameters.comments || ['👍', '非常棒！', '赞！', '很精彩！', '支持！'],
          dailyLimit: executionData.parameters.dailyLimit || 20,
          delayMin: (executionData.parameters.delayMin || 20) * 1000,
          delayMax: (executionData.parameters.delayMax || 120) * 1000,
        });
      } else if (taskAction === 'auto_follow') {
        result = await this.facebookSocialService.executeAutoFollow({
          accountId: executionData.parameters.accountAId || accountId,
          dailyLimit: executionData.parameters.dailyLimit || 40,
          delayMin: (executionData.parameters.delayMin || 10) * 1000,
          delayMax: (executionData.parameters.delayMax || 60) * 1000,
        });
      } else if (taskAction === 'auto_combo') {
        result = await this.facebookSocialService.executeComboTask({
          accountId: executionData.parameters.accountAId || accountId,
          actions: executionData.parameters.comboActions || [],
        });
      } else if (executionData.scriptType === 'browser') {
        result = await this.executeBrowserTask(taskId, accountId, executionData);
      } else if (executionData.scriptType === 'dialogue') {
        result = await this.executeDialogueTask(taskId, accountId, executionData);
      } else {
        throw new Error(`Unknown task action or script type: ${taskAction || executionData.scriptType}`);
      }

      const executionTime = Date.now() - startTime;

      // 记录完成日志
      await this.createLog(
        taskId, 
        accountId, 
        LogStatus.COMPLETED, 
        'Task execution completed successfully',
        { result, executionTime },
        100
      );

      return {
        success: true,
        taskId,
        accountId,
        message: 'Task executed successfully',
        data: result,
        executionTime,
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // 记录失败日志
      await this.createLog(
        taskId,
        accountId,
        LogStatus.FAILED,
        `Task execution failed: ${error.message}`,
        { error: error.message, stack: error.stack },
        0
      );

      return {
        success: false,
        taskId,
        accountId,
        error: error.message,
        executionTime,
      };
    }
  }

  /**
   * 执行浏览器自动化任务
   */
  private async executeBrowserTask(
    taskId: string,
    accountId: string,
    executionData: any
  ): Promise<any> {
    this.logger.log(`Executing browser task ${taskId} for account ${accountId}`);
    
    const { scriptId, targets, parameters } = executionData;
    
    try {
      // 更新进度
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Starting browser automation', null, 10);

      // 初始化浏览器
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Initializing browser', null, 20);
      const browser = await this.browserAutomationService.initializeBrowser(accountId);
      
      if (!browser) {
        throw new Error('Failed to initialize browser');
      }

      // 登录Facebook
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Logging into Facebook', null, 30);
      const loggedIn = await this.browserAutomationService.loginToFacebook(accountId, browser);
      
      if (!loggedIn) {
        throw new Error('Failed to login to Facebook');
      }

      // 执行脚本
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Executing browser script', null, 50);
      const scriptResult = await this.browserAutomationService.executeScript(
        scriptId,
        targets,
        parameters,
        browser
      );

      // 更新进度
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Browser script executed', { result: scriptResult }, 80);

      // 关闭浏览器
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Closing browser', null, 90);
      await this.browserAutomationService.closeBrowser(browser);

      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Browser task completed', null, 100);

      return {
        scriptId,
        targets,
        result: scriptResult,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error(`Browser task execution failed:`, error);
      throw error;
    }
  }

  /**
   * 执行对话剧本任务
   */
  private async executeDialogueTask(
    taskId: string,
    accountId: string,
    executionData: any
  ): Promise<any> {
    this.logger.log(`Executing dialogue task ${taskId} for account ${accountId}`);
    
    const { scriptId, targets, parameters } = executionData;
    
    try {
      // 更新进度
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Starting dialogue script', null, 10);

      // 加载对话剧本
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Loading dialogue script', null, 30);
      const script = await this.dialogueScriptService.loadScript(scriptId);
      
      if (!script) {
        throw new Error(`Dialogue script ${scriptId} not found`);
      }

      // 执行对话剧本
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Executing dialogue script', null, 50);
      const dialogueResult = await this.dialogueScriptService.executeScript(
        script,
        accountId,
        targets,
        parameters
      );

      // 更新进度
      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Dialogue script executed', { result: dialogueResult }, 80);

      await this.createLog(taskId, accountId, LogStatus.PROGRESS, 'Dialogue task completed', null, 100);

      return {
        scriptId,
        targets,
        result: dialogueResult,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error(`Dialogue task execution failed:`, error);
      throw error;
    }
  }

  /**
   * 更新任务状态
   */
  private async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    accountId: string
  ): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.status = status;
    task.accountId = accountId;
    
    if (status === TaskStatus.RUNNING) {
      task.startedAt = new Date();
    }
    
    await this.taskRepository.save(task);
  }

  /**
   * 创建执行日志
   */
  private async createLog(
    taskId: string,
    accountId: string,
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
      progress,
    });

    const savedLog = await this.logRepository.save(log);
    
    // 实时推送日志（通过WebSocket）
    // this.monitorGateway.broadcastLog(savedLog);
    
    return savedLog;
  }

  /**
   * 获取任务执行日志
   */
  async getTaskLogs(taskId: string): Promise<TaskExecutionLog[]> {
    return this.logRepository.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 获取账号的任务执行历史
   */
  async getAccountTaskHistory(accountId: string, limit: number = 50): Promise<TaskExecutionLog[]> {
    return this.logRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * 清理旧的执行日志
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.logRepository
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} old execution logs`);
    return result.affected || 0;
  }
}