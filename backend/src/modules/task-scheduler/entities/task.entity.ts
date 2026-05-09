import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { FacebookAccount } from '../../facebook-accounts/entities/facebook-account.entity';
import { TaskExecutionLog } from './task-execution-log.entity';

export enum TaskType {
  IMMEDIATE = 'immediate',
  SCHEDULED = 'scheduled',
  RECURRING = 'recurring',
  CRON = 'cron'
}

export enum TaskPriority {
  EMERGENCY = 1,
  HIGH = 2,
  MEDIUM = 3,
  LOW = 4
}

export enum TaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ 
    type: 'enum', 
    enum: TaskType,
    default: TaskType.IMMEDIATE
  })
  type: TaskType;

  @Column({ type: 'jsonb', nullable: true })
  scheduleConfig: {
    scheduledAt?: Date;
    recurringType?: 'daily' | 'weekly' | 'monthly';
    recurringTime?: string;
    cronExpression?: string;
    timezone?: string;
  };

  @Column({ type: 'int', default: TaskPriority.MEDIUM })
  priority: TaskPriority;

  @Column({ 
    type: 'enum', 
    enum: TaskStatus,
    default: TaskStatus.PENDING
  })
  status: TaskStatus;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  taskAction: string;

  @Column({ type: 'uuid', nullable: true })
  accountId: string;

  @ManyToOne(() => FacebookAccount, { nullable: true })
  @JoinColumn({ name: 'account_id' })
  account: FacebookAccount;

  @Column({ type: 'jsonb' })
  executionData: {
    scriptId: string;
    scriptType: 'browser' | 'dialogue';
    targets: string[];
    parameters: Record<string, any>;
  };

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @Column({ type: 'int', default: 30 })
  timeoutMinutes: number;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  result: {
    success: boolean;
    message?: string;
    data?: Record<string, any>;
    error?: string;
    executionTime?: number;
  };

  @OneToMany(() => TaskExecutionLog, log => log.task)
  logs: TaskExecutionLog[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}