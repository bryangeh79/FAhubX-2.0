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
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { BatchOperationsService } from './batch-operations.service';
import { ImportTasksDto, BatchActionDto } from '../task-scheduler/dto/batch-operations.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BatchTemplate, BatchExecutionResult } from './batch-operations.service';

@ApiTags('batch-operations')
@Controller('batch-operations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BatchOperationsController {
  constructor(private readonly batchOperationsService: BatchOperationsService) {}

  @Post('import')
  @ApiOperation({ summary: '导入任务模板' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '任务导入成功',
  })
  async importTasks(@Body() importDto: ImportTasksDto): Promise<BatchExecutionResult> {
    return this.batchOperationsService.importTasks(importDto);
  }

  @Post('start')
  @ApiOperation({ summary: '批量启动任务' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '批量启动成功',
  })
  async startBatchTasks(@Body() batchAction: BatchActionDto): Promise<BatchExecutionResult> {
    return this.batchOperationsService.startBatchTasks(batchAction);
  }

  @Post('pause')
  @ApiOperation({ summary: '批量暂停任务' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '批量暂停成功',
  })
  async pauseBatchTasks(@Body() batchAction: BatchActionDto): Promise<BatchExecutionResult> {
    return this.batchOperationsService.pauseBatchTasks(batchAction);
  }

  @Post('cancel')
  @ApiOperation({ summary: '批量取消任务' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '批量取消成功',
  })
  async cancelBatchTasks(@Body() batchAction: BatchActionDto): Promise<BatchExecutionResult> {
    return this.batchOperationsService.cancelBatchTasks(batchAction);
  }

  @Get('templates')
  @ApiOperation({ summary: '获取所有模板' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取模板列表成功',
    type: [Object],
  })
  async getTemplates(): Promise<BatchTemplate[]> {
    return this.batchOperationsService.getAllTemplates();
  }

  @Get('templates/:id')
  @ApiOperation({ summary: '获取模板详情' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取模板详情成功',
    type: Object,
  })
  async getTemplate(@Param('id') id: string): Promise<BatchTemplate | null> {
    return this.batchOperationsService.getTemplate(id);
  }

  @Post('templates')
  @ApiOperation({ summary: '创建新模板' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: '模板创建成功',
  })
  async createTemplate(
    @Body() templateData: Omit<BatchTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ templateId: string }> {
    const templateId = this.batchOperationsService.createTemplate(templateData);
    return { templateId };
  }

  @Put('templates/:id')
  @ApiOperation({ summary: '更新模板' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '模板更新成功',
  })
  async updateTemplate(
    @Param('id') id: string,
    @Body() updates: Partial<BatchTemplate>
  ): Promise<{ success: boolean }> {
    const success = this.batchOperationsService.updateTemplate(id, updates);
    return { success };
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: '删除模板' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '模板删除成功',
  })
  async deleteTemplate(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = this.batchOperationsService.deleteTemplate(id);
    return { success };
  }

  @Get('results')
  @ApiOperation({ summary: '获取批量执行结果' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回结果数量限制' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取执行结果成功',
    type: [Object],
  })
  async getBatchResults(@Query('limit') limit: number = 50): Promise<BatchExecutionResult[]> {
    return this.batchOperationsService.getAllBatchResults(limit);
  }

  @Get('results/:id')
  @ApiOperation({ summary: '获取批量执行详情' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '获取执行详情成功',
    type: Object,
  })
  async getBatchResult(@Param('id') id: string): Promise<BatchExecutionResult | null> {
    return this.batchOperationsService.getBatchResult(id);
  }

  @Get('reports/:id')
  @ApiOperation({ summary: '生成批量执行报告' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '生成报告成功',
    type: Object,
  })
  async generateBatchReport(@Param('id') id: string): Promise<any> {
    return this.batchOperationsService.generateBatchReport(id);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取批量操作统计' })
  async getBatchStats(): Promise<{
    totalTemplates: number;
    totalBatches: number;
    totalTasksExecuted: number;
    averageSuccessRate: number;
    recentBatches: Array<{
      batchId: string;
      successRate: number;
      duration: number;
      timestamp: Date;
    }>;
  }> {
    const templates = this.batchOperationsService.getAllTemplates();
    const batches = this.batchOperationsService.getAllBatchResults(100);
    
    let totalTasksExecuted = 0;
    let totalSuccessRate = 0;
    
    const recentBatches = batches.slice(0, 10).map(batch => {
      const successRate = batch.totalTasks > 0 
        ? (batch.successful / batch.totalTasks) * 100 
        : 0;
      
      totalTasksExecuted += batch.totalTasks;
      totalSuccessRate += successRate;
      
      return {
        batchId: batch.batchId,
        successRate: parseFloat(successRate.toFixed(2)),
        duration: batch.duration,
        timestamp: batch.startTime,
      };
    });
    
    const averageSuccessRate = batches.length > 0 
      ? parseFloat((totalSuccessRate / batches.length).toFixed(2))
      : 0;
    
    return {
      totalTemplates: templates.length,
      totalBatches: batches.length,
      totalTasksExecuted,
      averageSuccessRate,
      recentBatches,
    };
  }
}