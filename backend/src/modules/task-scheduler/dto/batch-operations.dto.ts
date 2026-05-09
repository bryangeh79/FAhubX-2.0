import { IsArray, ValidateNested, IsOptional, IsString, IsEnum, IsInt, Min, Max, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskType, TaskPriority } from '../entities/task.entity';

export class BatchTaskData {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TaskType)
  type: TaskType;

  @IsOptional()
  @IsObject()
  scheduleConfig?: {
    scheduledAt?: Date;
    recurringType?: 'daily' | 'weekly' | 'monthly';
    recurringTime?: string;
    cronExpression?: string;
    timezone?: string;
  };

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsObject()
  executionData: {
    scriptId: string;
    scriptType: 'browser' | 'dialogue';
    targets: string[];
    parameters: Record<string, any>;
  };

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxRetries?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  timeoutMinutes?: number;
}

export class BatchOperationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchTaskData)
  tasks: BatchTaskData[];
}

export class BatchActionDto {
  @IsArray()
  @IsString({ each: true })
  taskIds: string[];
}

export class ImportTasksDto {
  @IsString()
  templateId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchTaskData)
  tasks: BatchTaskData[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;
}