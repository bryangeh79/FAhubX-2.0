import { TaskType, TaskPriority, TaskStatus } from '../entities/task.entity';

export class TaskResponseDto {
  id: string;
  name: string;
  description?: string;
  type: TaskType;
  scheduleConfig?: {
    scheduledAt?: Date;
    recurringType?: 'daily' | 'weekly' | 'monthly';
    recurringTime?: string;
    cronExpression?: string;
    timezone?: string;
  };
  priority: TaskPriority;
  status: TaskStatus;
  accountId?: string;
  executionData: {
    scriptId: string;
    scriptType: 'browser' | 'dialogue';
    targets: string[];
    parameters: Record<string, any>;
  };
  retryCount: number;
  maxRetries: number;
  timeoutMinutes: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: {
    success: boolean;
    message?: string;
    data?: Record<string, any>;
    error?: string;
    executionTime?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}