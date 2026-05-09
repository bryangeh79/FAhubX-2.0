import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AccountBatchService } from './account-batch.service';
import { CreateBatchOperationDto } from './dto/create-batch-operation.dto';
import { BatchOperation } from './entities/batch-operation.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('批量操作')
@ApiBearerAuth()
@Controller('batch')
@UseGuards(JwtAuthGuard)
export class AccountBatchController {
  constructor(private readonly accountBatchService: AccountBatchService) {}

  @Post()
  @ApiOperation({ summary: '创建批量操作' })
  @ApiResponse({ status: 201, description: '批量操作创建成功', type: BatchOperation })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  @ApiResponse({ status: 401, description: '未授权' })
  async createBatchOperation(
    @GetUser() user: User,
    @Body() createDto: CreateBatchOperationDto,
  ): Promise<BatchOperation> {
    return this.accountBatchService.createBatchOperation(user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: '获取批量操作列表' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认为1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量，默认为20' })
  @ApiQuery({ name: 'type', required: false, enum: ['start', 'pause', 'stop', 'test', 'export', 'delete', 'import'], description: '操作类型过滤' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], description: '操作状态过滤' })
  @ApiQuery({ name: 'startDate', required: false, type: Date, description: '开始日期过滤' })
  @ApiQuery({ name: 'endDate', required: false, type: Date, description: '结束日期过滤' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getBatchOperations(
    @GetUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ): Promise<{ operations: BatchOperation[]; total: number }> {
    const filters: any = {};
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    return this.accountBatchService.getBatchOperations(
      user.id,
      parseInt(page as any),
      parseInt(limit as any),
      filters,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取批量操作详情' })
  @ApiResponse({ status: 200, description: '获取成功', type: BatchOperation })
  @ApiResponse({ status: 404, description: '批量操作不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getBatchOperation(
    @GetUser() user: User,
    @Param('id') id: string,
  ): Promise<BatchOperation> {
    return this.accountBatchService.getBatchOperation(user.id, id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: '获取批量操作进度' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 404, description: '批量操作不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getOperationProgress(
    @GetUser() user: User,
    @Param('id') id: string,
  ): Promise<{
    progress: number;
    status: string;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    estimatedTimeRemaining?: number;
  }> {
    // 验证操作属于当前用户
    await this.accountBatchService.getBatchOperation(user.id, id);
    return this.accountBatchService.getOperationProgress(id);
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: '取消批量操作' })
  @ApiResponse({ status: 200, description: '取消成功', type: BatchOperation })
  @ApiResponse({ status: 400, description: '操作无法取消' })
  @ApiResponse({ status: 404, description: '批量操作不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async cancelBatchOperation(
    @GetUser() user: User,
    @Param('id') id: string,
  ): Promise<BatchOperation> {
    return this.accountBatchService.cancelBatchOperation(user.id, id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: '重试失败的批量操作' })
  @ApiResponse({ status: 201, description: '重试操作创建成功', type: BatchOperation })
  @ApiResponse({ status: 400, description: '操作无法重试' })
  @ApiResponse({ status: 404, description: '批量操作不存在' })
  @ApiResponse({ status: 401, description: '未授权' })
  async retryBatchOperation(
    @GetUser() user: User,
    @Param('id') id: string,
  ): Promise<BatchOperation> {
    return this.accountBatchService.retryBatchOperation(user.id, id);
  }

  @Get('statistics/summary')
  @ApiOperation({ summary: '获取批量操作统计摘要' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未授权' })
  async getBatchStatistics(
    @GetUser() user: User,
  ): Promise<{
    totalOperations: number;
    successRate: number;
    avgDuration: number;
    operationsByType: Record<string, number>;
    operationsByStatus: Record<string, number>;
  }> {
    return this.accountBatchService.getBatchStatistics(user.id);
  }

  @Get('health/check')
  @ApiOperation({ summary: '检查批量操作健康状态' })
  @ApiResponse({ status: 200, description: '检查完成' })
  @ApiResponse({ status: 401, description: '未授权' })
  async checkBatchHealth(
    @GetUser() user: User,
  ): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    return this.accountBatchService.checkBatchHealth(user.id);
  }

  @Delete('cleanup')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '手动清理过期的批量操作记录' })
  @ApiResponse({ status: 204, description: '清理完成' })
  @ApiResponse({ status: 401, description: '未授权' })
  async cleanupOldOperations(@GetUser() user: User): Promise<void> {
    // 注意：这里实际调用的是定时任务，只是提供手动触发接口
    await this.accountBatchService.cleanupOldOperations();
  }
}