import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type RecoveryStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
export type RecoveryType = 'reconnect' | 'refresh_token' | 'switch_account' | 'restart' | 'fallback';
export type FailureType = 'login_failed' | 'token_expired' | 'network_error' | 'api_error' | 'resource_exhausted';

@Entity('recovery_logs')
export class RecoveryLog {
  @ApiProperty({ description: '日志ID', example: 'recovery-log-123456' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ type: 'uuid' })
  @Index('idx_recovery_logs_user_id')
  userId: string;

  @ApiProperty({ description: '账号ID', example: 'acc-123456' })
  @Column({ type: 'uuid' })
  @Index('idx_recovery_logs_account_id')
  accountId: string;

  @ApiProperty({ description: '恢复类型', example: 'reconnect', enum: ['reconnect', 'refresh_token', 'switch_account', 'restart', 'fallback'] })
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_recovery_logs_type')
  recoveryType: RecoveryType;

  @ApiProperty({ description: '恢复状态', example: 'success', enum: ['pending', 'running', 'success', 'failed', 'cancelled'] })
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  @Index('idx_recovery_logs_status')
  status: RecoveryStatus;

  @ApiProperty({ description: '故障类型', example: 'login_failed', enum: ['login_failed', 'token_expired', 'network_error', 'api_error', 'resource_exhausted'] })
  @Column({ type: 'varchar', length: 30 })
  @Index('idx_recovery_logs_failure_type')
  failureType: FailureType;

  @ApiProperty({ description: '故障描述', example: '登录失败: 无效的访问令牌' })
  @Column({ type: 'text' })
  failureDescription: string;

  @ApiProperty({ description: '恢复详情', example: { attempts: 3, newToken: 'EAAG...' } })
  @Column({ type: 'jsonb' })
  recoveryDetails: Record<string, any>;

  @ApiProperty({ description: '错误信息', example: '重连失败: 网络超时', required: false })
  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @ApiProperty({ description: '恢复开始时间', example: '2026-04-12T10:30:00Z' })
  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @ApiProperty({ description: '恢复完成时间', example: '2026-04-12T10:35:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date;

  @ApiProperty({ description: '恢复耗时(毫秒)', example: 5000, required: false })
  @Column({ type: 'int', nullable: true })
  duration: number;

  @ApiProperty({ description: '恢复策略', example: 'auto_reconnect_with_fallback' })
  @Column({ type: 'varchar', length: 50 })
  recoveryStrategy: string;

  @ApiProperty({ description: '备用账号ID', example: 'acc-789012', required: false })
  @Column({ type: 'uuid', nullable: true })
  fallbackAccountId: string;

  @ApiProperty({ description: '是否自动恢复', example: true })
  @Column({ type: 'boolean', default: true })
  autoRecovery: boolean;

  @ApiProperty({ description: '恢复尝试次数', example: 3 })
  @Column({ type: 'int', default: 1 })
  attemptCount: number;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:30:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_recovery_logs_created_at')
  createdAt: Date;

  // 方法
  isCompleted(): boolean {
    return this.status === 'success' || this.status === 'failed' || this.status === 'cancelled';
  }

  isSuccessful(): boolean {
    return this.status === 'success';
  }

  markAsRunning(): void {
    this.status = 'running';
    this.startedAt = new Date();
  }

  markAsSuccess(details?: Record<string, any>): void {
    this.status = 'success';
    this.completedAt = new Date();
    this.duration = this.completedAt.getTime() - this.startedAt.getTime();
    if (details) {
      this.recoveryDetails = { ...this.recoveryDetails, ...details };
    }
  }

  markAsFailed(error: string, details?: Record<string, any>): void {
    this.status = 'failed';
    this.completedAt = new Date();
    this.duration = this.completedAt.getTime() - this.startedAt.getTime();
    this.errorMessage = error;
    if (details) {
      this.recoveryDetails = { ...this.recoveryDetails, ...details };
    }
  }

  incrementAttempt(): void {
    this.attemptCount += 1;
  }

  getRecoverySummary(): string {
    const typeMap = {
      reconnect: '重新连接',
      refresh_token: '刷新令牌',
      switch_account: '切换账号',
      restart: '重启服务',
      fallback: '备用方案',
    };

    const statusMap = {
      pending: '等待中',
      running: '进行中',
      success: '成功',
      failed: '失败',
      cancelled: '已取消',
    };

    return `${typeMap[this.recoveryType]} - ${statusMap[this.status]}`;
  }

  getDetailsAsString(): string {
    return JSON.stringify(this.recoveryDetails, null, 2);
  }
}