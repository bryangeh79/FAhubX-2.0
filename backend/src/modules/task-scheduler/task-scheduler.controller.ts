import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TaskSchedulerService } from './task-scheduler.service';
import { CreateTaskDto, UpdateTaskDto } from './dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { Task, TaskStatus } from './entities/task.entity';
import { TaskExecutionLog } from './entities/task-execution-log.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BatchOperationsDto } from './dto/batch-operations.dto';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TaskSchedulerController {
  constructor(private readonly taskSchedulerService: TaskSchedulerService) {}

  @Post()
  @ApiOperation({ summary: '创建新任务' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '任务创建成功',
    type: TaskResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: '请求参数错误',
  })
  async createTask(@Request() req, @Body() createTaskDto: CreateTaskDto): Promise<TaskResponseDto> {
    const taskData: any = { ...createTaskDto, userId: req.user.id };
    // Build default executionData if not provided
    if (!taskData.executionData) {
      taskData.executionData = {
        scriptId: taskData.taskAction || 'unknown',
        scriptType: 'dialogue',
        targets: [],
        parameters: { ...taskData },
      };
    }
    const task = await this.taskSchedulerService.scheduleTask(taskData);
    return this.mapToResponseDto(task);
  }

  @Post('batch')
  @ApiOperation({ summary: '批量创建任务' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '批量任务创建成功',
    type: [TaskResponseDto],
  })
  async createTasksBatch(@Body() batchDto: BatchOperationsDto): Promise<TaskResponseDto[]> {
    const tasks: Task[] = [];
    
    for (const taskData of batchDto.tasks) {
      const task = await this.taskSchedulerService.scheduleTask(taskData as any);
      tasks.push(task);
    }
    
    return tasks.map(task => this.mapToResponseDto(task));
  }

  @Get()
  @ApiOperation({ summary: '获取任务列表' })
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus })
  @ApiQuery({ name: 'type', required: false, description: '任务类型' })
  @ApiQuery({ name: 'accountId', required: false, description: '账号ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取任务列表成功',
    type: [TaskResponseDto],
  })
  async getTasks(
    @Request() req,
    @Query('status') status?: TaskStatus,
    @Query('type') type?: string,
    @Query('accountId') accountId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<{
    tasks: TaskResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const allTasks = await this.taskSchedulerService.getTasksByUser(req.user.id, { status, type, accountId });

    const startIndex = (page - 1) * limit;
    const paginatedTasks = allTasks.slice(startIndex, startIndex + Number(limit));

    return {
      tasks: paginatedTasks.map(task => this.mapToResponseDto(task)),
      total: allTasks.length,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(allTasks.length / limit),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取任务详情' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取任务详情成功',
    type: TaskResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '任务不存在',
  })
  async getTask(@Param('id') id: string): Promise<TaskResponseDto> {
    // 这里应该从数据库获取任务详情
    // 简化处理：返回模拟数据
    const task = {
      id,
      name: '示例任务',
      type: 'immediate',
      status: TaskStatus.PENDING,
      priority: 3,
      executionData: { scriptId: 'test', scriptType: 'browser', targets: [], parameters: {} },
    } as Task;
    
    return this.mapToResponseDto(task);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新任务' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务更新成功',
    type: TaskResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '任务不存在',
  })
  async updateTask(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    // 这里应该实现任务更新逻辑
    // 简化处理：返回模拟数据
    const task = {
      id,
      ...updateTaskDto,
      updatedAt: new Date(),
    } as Task;
    
    return this.mapToResponseDto(task);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除任务' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: '任务删除成功',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: '任务不存在',
  })
  async deleteTask(@Request() req, @Param('id') id: string): Promise<void> {
    await this.taskSchedulerService.deleteTask(req.user.id, id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: '手动启动任务' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务启动成功',
  })
  async startTask(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    const success = await this.taskSchedulerService.executeImmediately(id);
    return {
      success,
      message: success ? '任务已启动' : '任务启动失败',
    };
  }

  @Post(':id/pause')
  @ApiOperation({ summary: '暂停任务' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务暂停成功',
  })
  async pauseTask(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    const success = await this.taskSchedulerService.pauseTask(id);
    return {
      success,
      message: success ? '任务已暂停' : '任务暂停失败',
    };
  }

  @Post(':id/resume')
  @ApiOperation({ summary: '恢复任务' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务恢复成功',
  })
  async resumeTask(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    const success = await this.taskSchedulerService.resumeTask(id);
    return {
      success,
      message: success ? '任务已恢复' : '任务恢复失败',
    };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消任务' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '任务取消成功',
  })
  async cancelTask(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    const success = await this.taskSchedulerService.cancelTask(id);
    return {
      success,
      message: success ? '任务已取消' : '任务取消失败',
    };
  }

  @Get(':id/logs')
  @ApiOperation({ summary: '获取任务执行日志' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取日志成功',
    type: [TaskExecutionLog],
  })
  async getTaskLogs(@Param('id') id: string): Promise<TaskExecutionLog[]> {
    // 这里应该从数据库获取任务日志
    // 简化处理：返回模拟数据
    return [
      {
        id: 'log-1',
        taskId: id,
        status: 'started',
        message: '任务开始执行',
        createdAt: new Date(),
      } as TaskExecutionLog,
    ];
  }

  @Post('batch/start')
  @ApiOperation({ summary: '批量启动任务' })
  async startTasksBatch(@Body() batchDto: { taskIds: string[] }): Promise<{
    success: boolean;
    results: Array<{ taskId: string; success: boolean; message: string }>;
  }> {
    const results = [];
    
    for (const taskId of batchDto.taskIds) {
      try {
        const success = await this.taskSchedulerService.executeImmediately(taskId);
        results.push({
          taskId,
          success,
          message: success ? '启动成功' : '启动失败',
        });
      } catch (error) {
        results.push({
          taskId,
          success: false,
          message: error.message,
        });
      }
    }
    
    const allSuccess = results.every(r => r.success);
    
    return {
      success: allSuccess,
      results,
    };
  }

  @Post('batch/pause')
  @ApiOperation({ summary: '批量暂停任务' })
  async pauseTasksBatch(@Body() batchDto: { taskIds: string[] }): Promise<{
    success: boolean;
    results: Array<{ taskId: string; success: boolean; message: string }>;
  }> {
    const results = [];
    
    for (const taskId of batchDto.taskIds) {
      try {
        const success = await this.taskSchedulerService.pauseTask(taskId);
        results.push({
          taskId,
          success,
          message: success ? '暂停成功' : '暂停失败',
        });
      } catch (error) {
        results.push({
          taskId,
          success: false,
          message: error.message,
        });
      }
    }
    
    const allSuccess = results.every(r => r.success);
    
    return {
      success: allSuccess,
      results,
    };
  }

  @Post('batch/cancel')
  @ApiOperation({ summary: '批量取消任务' })
  async cancelTasksBatch(@Body() batchDto: { taskIds: string[] }): Promise<{
    success: boolean;
    results: Array<{ taskId: string; success: boolean; message: string }>;
  }> {
    const results = [];
    
    for (const taskId of batchDto.taskIds) {
      try {
        const success = await this.taskSchedulerService.cancelTask(taskId);
        results.push({
          taskId,
          success,
          message: success ? '取消成功' : '取消失败',
        });
      } catch (error) {
        results.push({
          taskId,
          success: false,
          message: error.message,
        });
      }
    }
    
    const allSuccess = results.every(r => r.success);
    
    return {
      success: allSuccess,
      results,
    };
  }

  @Get('stats/summary')
  @ApiOperation({ summary: '获取任务统计摘要' })
  async getTaskStats(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    successRate: number;
    averageExecutionTime: number;
  }> {
    // 这里应该从数据库计算统计信息
    // 简化处理：返回模拟数据
    return {
      total: 100,
      pending: 10,
      running: 5,
      completed: 75,
      failed: 5,
      cancelled: 5,
      successRate: 85.5,
      averageExecutionTime: 125.3,
    };
  }

  /**
   * 将Task实体映射到Response DTO
   */
  private mapToResponseDto(task: Task): TaskResponseDto & { taskAction?: string } {
    return {
      id: task.id,
      name: task.name,
      description: task.description,
      type: task.type,
      taskAction: (task as any).taskAction,
      scheduleConfig: task.scheduleConfig,
      priority: task.priority,
      status: task.status,
      accountId: task.accountId,
      executionData: task.executionData,
      retryCount: task.retryCount,
      maxRetries: task.maxRetries,
      timeoutMinutes: task.timeoutMinutes,
      scheduledAt: task.scheduledAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      result: task.result,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}