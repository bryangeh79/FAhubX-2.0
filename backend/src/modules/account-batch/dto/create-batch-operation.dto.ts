import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsObject, IsNumber, Min, Max } from 'class-validator';

export type BatchOperationType = 'start' | 'pause' | 'stop' | 'test' | 'export' | 'delete' | 'import';

export class CreateBatchOperationDto {
  @ApiProperty({ 
    description: '操作类型', 
    example: 'start', 
    enum: ['start', 'pause', 'stop', 'test', 'export', 'delete', 'import'] 
  })
  @IsEnum(['start', 'pause', 'stop', 'test', 'export', 'delete', 'import'])
  type: BatchOperationType;

  @ApiProperty({ 
    description: '目标账号ID列表', 
    example: ['acc-1', 'acc-2', 'acc-3'] 
  })
  @IsArray()
  @IsString({ each: true })
  targetAccountIds: string[];

  @ApiProperty({ 
    description: '操作参数', 
    example: { timeout: 30000, retryCount: 3 },
    required: false 
  })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @ApiProperty({ 
    description: '并发数限制', 
    example: 5,
    required: false 
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  concurrencyLimit?: number;

  @ApiProperty({ 
    description: '超时时间(毫秒)', 
    example: 30000,
    required: false 
  })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(300000)
  timeout?: number;

  @ApiProperty({ 
    description: '重试次数', 
    example: 3,
    required: false 
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  retryCount?: number;

  @ApiProperty({ 
    description: '是否跳过异常账号', 
    example: true,
    required: false 
  })
  @IsOptional()
  skipOnError?: boolean;

  @ApiProperty({ 
    description: '是否发送通知', 
    example: true,
    required: false 
  })
  @IsOptional()
  sendNotification?: boolean;

  @ApiProperty({ 
    description: '分组ID（按组操作时使用）', 
    example: 'group-123',
    required: false 
  })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiProperty({ 
    description: '自定义标签', 
    example: 'daily-maintenance',
    required: false 
  })
  @IsOptional()
  @IsString()
  tag?: string;
}