import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskType, TaskStatus } from '../task-scheduler/entities/task.entity';
import { TaskSchedulerService } from '../task-scheduler/task-scheduler.service';
import { ImportTasksDto, BatchActionDto } from '../task-scheduler/dto/batch-operations.dto';

export interface BatchTemplate {
  id: string;
  name: string;
  description: string;
  tasks: Partial<Task>[];
  variables: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchExecutionResult {
  batchId: string;
  totalTasks: number;
  successful: number;
  failed: number;
  results: Array<{
    taskId: string;
    success: boolean;
    message: string;
    error?: string;
  }>;
  startTime: Date;
  endTime: Date;
  duration: number;
}

@Injectable()
export class BatchOperationsService {
  private readonly logger = new Logger(BatchOperationsService.name);
  private templates: Map<string, BatchTemplate> = new Map();
  private batchExecutions: Map<string, BatchExecutionResult> = new Map();

  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private taskSchedulerService: TaskSchedulerService,
  ) {
    this.initializeSampleTemplates();
  }

  /**
   * 初始化示例模板
   */
  private initializeSampleTemplates(): void {
    // 示例：批量发帖模板
    const postBatchTemplate: BatchTemplate = {
      id: 'batch-post-template-v1',
      name: '批量发帖模板',
      description: '用于批量发布Facebook帖子的模板',
      tasks: [
        {
          name: '发帖任务 {{index}}',
          type: TaskType.IMMEDIATE,
          priority: 3,
          executionData: {
            scriptId: 'post-script',
            scriptType: 'browser',
            targets: ['{{target}}'],
            parameters: {
              content: '{{content}}',
              images: '{{images}}',
              privacy: '{{privacy}}',
            },
          },
          maxRetries: 3,
          timeoutMinutes: 30,
        },
      ],
      variables: {
        target: 'timeline',
        content: '这是示例帖子内容',
        images: [],
        privacy: 'public',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 示例：批量评论模板
    const commentBatchTemplate: BatchTemplate = {
      id: 'batch-comment-template-v1',
      name: '批量评论模板',
      description: '用于批量评论Facebook帖子的模板',
      tasks: [
        {
          name: '评论任务 {{index}}',
          type: TaskType.IMMEDIATE,
          priority: 3,
          executionData: {
            scriptId: 'comment-script',
            scriptType: 'browser',
            targets: ['{{postUrl}}'],
            parameters: {
              comment: '{{comment}}',
            },
          },
          maxRetries: 2,
          timeoutMinutes: 20,
        },
      ],
      variables: {
        postUrl: 'https://facebook.com/post/123',
        comment: '很好的帖子！',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(postBatchTemplate.id, postBatchTemplate);
    this.templates.set(commentBatchTemplate.id, commentBatchTemplate);

    this.logger.log(`Initialized ${this.templates.size} batch templates`);
  }

  /**
   * 批量创建任务
   */
  async createBatchTasks(
    tasks: Partial<Task>[],
    variables?: Record<string, any>
  ): Promise<BatchExecutionResult> {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    this.logger.log(`Starting batch creation: ${batchId}, tasks: ${tasks.length}`);

    const results: BatchExecutionResult['results'] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < tasks.length; i++) {
      const taskData = tasks[i];
      
      try {
        // 替换变量
        const processedTask = this.processTaskWithVariables(taskData, variables, i);
        
        // 创建任务
        const task = await this.taskSchedulerService.scheduleTask(processedTask);
        
        results.push({
          taskId: task.id,
          success: true,
          message: 'Task created successfully',
        });
        successful++;

        this.logger.log(`Created task ${task.id} in batch ${batchId}`);

      } catch (error) {
        results.push({
          taskId: `task-${i}`,
          success: false,
          message: 'Failed to create task',
          error: error.message,
        });
        failed++;

        this.logger.error(`Failed to create task ${i} in batch ${batchId}:`, error);
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const batchResult: BatchExecutionResult = {
      batchId,
      totalTasks: tasks.length,
      successful,
      failed,
      results,
      startTime,
      endTime,
      duration,
    };

    this.batchExecutions.set(batchId, batchResult);
    
    this.logger.log(`Batch ${batchId} completed: ${successful}/${tasks.length} successful`);

    return batchResult;
  }

  /**
   * 批量启动任务
   */
  async startBatchTasks(batchAction: BatchActionDto): Promise<BatchExecutionResult> {
    const batchId = `batch-start-${Date.now()}`;
    const startTime = new Date();

    this.logger.log(`Starting batch execution: ${batchId}, tasks: ${batchAction.taskIds.length}`);

    const results: BatchExecutionResult['results'] = [];
    let successful = 0;
    let failed = 0;

    for (const taskId of batchAction.taskIds) {
      try {
        const success = await this.taskSchedulerService.executeImmediately(taskId);
        
        results.push({
          taskId,
          success,
          message: success ? 'Task started successfully' : 'Failed to start task',
        });

        if (success) {
          successful++;
        } else {
          failed++;
        }

      } catch (error) {
        results.push({
          taskId,
          success: false,
          message: 'Failed to start task',
          error: error.message,
        });
        failed++;

        this.logger.error(`Failed to start task ${taskId}:`, error);
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const batchResult: BatchExecutionResult = {
      batchId,
      totalTasks: batchAction.taskIds.length,
      successful,
      failed,
      results,
      startTime,
      endTime,
      duration,
    };

    this.batchExecutions.set(batchId, batchResult);
    
    this.logger.log(`Batch execution ${batchId} completed: ${successful}/${batchAction.taskIds.length} successful`);

    return batchResult;
  }

  /**
   * 批量暂停任务
   */
  async pauseBatchTasks(batchAction: BatchActionDto): Promise<BatchExecutionResult> {
    const batchId = `batch-pause-${Date.now()}`;
    const startTime = new Date();

    const results: BatchExecutionResult['results'] = [];
    let successful = 0;
    let failed = 0;

    for (const taskId of batchAction.taskIds) {
      try {
        const success = await this.taskSchedulerService.pauseTask(taskId);
        
        results.push({
          taskId,
          success,
          message: success ? 'Task paused successfully' : 'Failed to pause task',
        });

        if (success) {
          successful++;
        } else {
          failed++;
        }

      } catch (error) {
        results.push({
          taskId,
          success: false,
          message: 'Failed to pause task',
          error: error.message,
        });
        failed++;
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const batchResult: BatchExecutionResult = {
      batchId,
      totalTasks: batchAction.taskIds.length,
      successful,
      failed,
      results,
      startTime,
      endTime,
      duration,
    };

    this.batchExecutions.set(batchId, batchResult);
    
    return batchResult;
  }

  /**
   * 批量取消任务
   */
  async cancelBatchTasks(batchAction: BatchActionDto): Promise<BatchExecutionResult> {
    const batchId = `batch-cancel-${Date.now()}`;
    const startTime = new Date();

    const results: BatchExecutionResult['results'] = [];
    let successful = 0;
    let failed = 0;

    for (const taskId of batchAction.taskIds) {
      try {
        const success = await this.taskSchedulerService.cancelTask(taskId);
        
        results.push({
          taskId,
          success,
          message: success ? 'Task cancelled successfully' : 'Failed to cancel task',
        });

        if (success) {
          successful++;
        } else {
          failed++;
        }

      } catch (error) {
        results.push({
          taskId,
          success: false,
          message: 'Failed to cancel task',
          error: error.message,
        });
        failed++;
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const batchResult: BatchExecutionResult = {
      batchId,
      totalTasks: batchAction.taskIds.length,
      successful,
      failed,
      results,
      startTime,
      endTime,
      duration,
    };

    this.batchExecutions.set(batchId, batchResult);
    
    return batchResult;
  }

  /**
   * 导入任务模板
   */
  async importTasks(importDto: ImportTasksDto): Promise<BatchExecutionResult> {
    const template = this.templates.get(importDto.templateId);
    
    if (!template) {
      throw new Error(`Template ${importDto.templateId} not found`);
    }

    // 合并变量
    const variables = {
      ...template.variables,
      ...importDto.variables,
    };

    // 为每个导入的任务创建实例
    const tasksToCreate: Partial<Task>[] = [];
    
    for (let i = 0; i < importDto.tasks.length; i++) {
      const importedTask = importDto.tasks[i];
      
      // 使用模板任务作为基础
      const baseTask = template.tasks[0] || {};
      
      // 合并导入的任务数据
      const mergedTask = {
        ...baseTask,
        ...importedTask,
        name: importedTask.name || baseTask.name?.replace('{{index}}', String(i + 1)),
      };

      tasksToCreate.push(mergedTask);
    }

    return this.createBatchTasks(tasksToCreate, variables);
  }

  /**
   * 处理任务变量
   */
  private processTaskWithVariables(
    task: Partial<Task>,
    variables: Record<string, any> = {},
    index: number
  ): Partial<Task> {
    const processedTask = { ...task };
    
    // 处理任务名称中的变量
    if (processedTask.name) {
      processedTask.name = this.replaceVariables(processedTask.name, { ...variables, index: index + 1 });
    }
    
    // 处理执行数据中的变量
    if (processedTask.executionData) {
      const processedExecutionData = { ...processedTask.executionData };
      
      // 处理目标
      if (Array.isArray(processedExecutionData.targets)) {
        processedExecutionData.targets = processedExecutionData.targets.map(target =>
          this.replaceVariables(target, variables)
        );
      }
      
      // 处理参数
      if (processedExecutionData.parameters) {
        processedExecutionData.parameters = this.processObjectVariables(processedExecutionData.parameters, variables);
      }
      
      processedTask.executionData = processedExecutionData;
    }
    
    return processedTask;
  }

  /**
   * 替换变量
   */
  private replaceVariables(text: string, variables: Record<string, any>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
      return variables[variableName] !== undefined ? String(variables[variableName]) : match;
    });
  }

  /**
   * 处理对象中的变量
   */
  private processObjectVariables(obj: any, variables: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.replaceVariables(obj, variables);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.processObjectVariables(item, variables));
    } else if (obj && typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const key in obj) {
        result[key] = this.processObjectVariables(obj[key], variables);
      }
      return result;
    }
    return obj;
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): BatchTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 获取模板详情
   */
  getTemplate(templateId: string): BatchTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * 创建新模板
   */
  createTemplate(template: Omit<BatchTemplate, 'id' | 'createdAt' | 'updatedAt'>): string {
    const templateId = `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newTemplate: BatchTemplate = {
      ...template,
      id: templateId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(templateId, newTemplate);
    
    this.logger.log(`Created new template: ${templateId} - ${template.name}`);
    
    return templateId;
  }

  /**
   * 更新模板
   */
  updateTemplate(templateId: string, updates: Partial<BatchTemplate>): boolean {
    const template = this.templates.get(templateId);
    
    if (!template) {
      return false;
    }

    const updatedTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date(),
    };

    this.templates.set(templateId, updatedTemplate);
    
    this.logger.log(`Updated template: ${templateId}`);
    
    return true;
  }

  /**
   * 删除模板
   */
  deleteTemplate(templateId: string): boolean {
    const deleted = this.templates.delete(templateId);
    
    if (deleted) {
      this.logger.log(`Deleted template: ${templateId}`);
    }
    
    return deleted;
  }

  /**
   * 获取批量执行结果
   */
  getBatchResult(batchId: string): BatchExecutionResult | null {
    return this.batchExecutions.get(batchId) || null;
  }

  /**
   * 获取所有批量执行结果
   */
  getAllBatchResults(limit: number = 50): BatchExecutionResult[] {
    const results = Array.from(this.batchExecutions.values());
    
    // 按开始时间倒序排序
    results.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    
    return results.slice(0, limit);
  }

  /**
   * 生成批量执行报告
   */
  generateBatchReport(batchId: string): {
    batchId: string;
    summary: {
      totalTasks: number;
      successful: number;
      failed: number;
      successRate: number;
      duration: number;
    };
    details: Array<{
      taskId: string;
      success: boolean;
      message: string;
      error?: string;
    }>;
    recommendations?: string[];
  } {
    const result = this.batchExecutions.get(batchId);
    
    if (!result) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const successRate = result.totalTasks > 0 
      ? (result.successful / result.totalTasks) * 100 
      : 0;

    const report = {
      batchId,
      summary: {
        totalTasks: result.totalTasks,
        successful: result.successful,
        failed: result.failed,
        successRate: parseFloat(successRate.toFixed(2)),
        duration: result.duration,
      },
      details: result.results,
    };

    // 添加建议
    const recommendations: string[] = [];
    
    if (successRate < 80) {
      recommendations.push('批量任务成功率较低，建议检查任务配置和账号状态');
    }
    
    if (result.failed > 0) {
      recommendations.push(`有 ${result.failed} 个任务失败，建议查看失败详情并重新执行`);
    }
    
    if (result.duration > 300000) { // 5分钟
      recommendations.push('批量执行时间较长，建议优化任务并发配置');
    }

    if (recommendations.length > 0) {
      return { ...report, recommendations };
    }

    return report;
  }
}