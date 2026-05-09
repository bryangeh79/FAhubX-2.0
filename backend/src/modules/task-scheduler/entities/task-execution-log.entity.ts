import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Task } from './task.entity';
import { FacebookAccount } from '../../facebook-accounts/entities/facebook-account.entity';

export enum LogStatus {
  STARTED = 'started',
  PROGRESS = 'progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRY = 'retry',
  CANCELLED = 'cancelled',
  WARNING = 'warning',
  INFO = 'info'
}

@Entity('task_execution_logs')
export class TaskExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @ManyToOne(() => Task, task => task.logs)
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @Column({ type: 'uuid', nullable: true })
  accountId: string;

  @ManyToOne(() => FacebookAccount, { nullable: true })
  @JoinColumn({ name: 'account_id' })
  account: FacebookAccount;

  @Column({ 
    type: 'enum', 
    enum: LogStatus
  })
  status: LogStatus;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({ type: 'int', nullable: true })
  progress: number;

  @CreateDateColumn()
  createdAt: Date;
}