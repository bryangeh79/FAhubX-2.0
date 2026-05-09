import { IsString, IsOptional, IsEnum, IsInt, Min, Max, IsObject, ValidateNested, IsDateString, IsArray, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskType, TaskPriority } from '../entities/task.entity';

export class ScheduleConfigDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: Date;

  @IsOptional()
  @IsEnum(['daily', 'weekly', 'monthly'])
  recurringType?: 'daily' | 'weekly' | 'monthly';

  @IsOptional()
  @IsString()
  recurringTime?: string;

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class ExecutionDataDto {
  @IsString()
  scriptId: string;

  @IsEnum(['browser', 'dialogue'])
  scriptType: 'browser' | 'dialogue';

  @IsArray()
  @IsString({ each: true })
  targets: string[];

  @IsObject()
  parameters: Record<string, any>;
}

export class CreateTaskDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TaskType)
  type: TaskType;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleConfigDto)
  scheduleConfig?: ScheduleConfigDto;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  accountBId?: string;

  @IsOptional()
  @IsString()
  taskAction?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutionDataDto)
  executionData?: ExecutionDataDto;

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