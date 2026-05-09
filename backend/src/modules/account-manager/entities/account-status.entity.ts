import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { FacebookAccount } from '../../facebook-accounts/entities/facebook-account.entity';
import { Task } from '../../task-scheduler/entities/task.entity';

export enum AccountStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
  MAINTENANCE = 'maintenance',
  OFFLINE = 'offline'
}

@Entity('account_status')
export class AccountStatusEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  accountId: string;

  @OneToOne(() => FacebookAccount)
  @JoinColumn({ name: 'account_id' })
  account: FacebookAccount;

  @Column({ 
    type: 'enum', 
    enum: AccountStatus,
    default: AccountStatus.IDLE
  })
  status: AccountStatus;

  @Column({ type: 'uuid', nullable: true })
  currentTaskId: string;

  @OneToOne(() => Task, { nullable: true })
  @JoinColumn({ name: 'current_task_id' })
  currentTask: Task;

  @Column({ type: 'timestamp', nullable: true })
  lastHeartbeat: Date;

  @Column({ type: 'int', default: 100 })
  healthScore: number;

  @Column({ type: 'jsonb', nullable: true })
  healthDetails: {
    lastCheck: Date;
    browserStatus: 'healthy' | 'unhealthy' | 'unknown';
    loginStatus: 'logged_in' | 'logged_out' | 'unknown';
    errorCount: number;
    lastError?: string;
  };

  @Column({ type: 'int', default: 0 })
  totalTasksCompleted: number;

  @Column({ type: 'int', default: 0 })
  totalTasksFailed: number;

  @Column({ type: 'float', default: 0 })
  averageExecutionTime: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}