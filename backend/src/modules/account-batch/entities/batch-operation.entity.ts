import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type BatchOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type BatchOperationType = 'start' | 'pause' | 'stop' | 'test' | 'export' | 'delete' | 'import';

@Entity('batch_operations')
export class BatchOperation {
  @ApiProperty({ description: '操作ID', example: 'batch-123456' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ type: 'uuid' })
  @Index('idx_batch_operations_user_id')
  userId: string;

  @ApiProperty({ description: '操作类型', example: 'start', enum: ['start', 'pause', 'stop', 'test', 'export', 'delete', 'import'] })
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_batch_operations_type')
  type: BatchOperationType;

  @ApiProperty({ description: '操作状态', example: 'running', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] })
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  @Index('idx_batch_operations_status')
  status: BatchOperationStatus;

  @ApiProperty({ description: '目标账号ID列表', example: ['acc-1', 'acc-2', 'acc-3'] })
  @Column({ type: 'jsonb' })
  targetAccountIds: string[];

  @ApiProperty({ description: '成功账号ID列表', example: ['acc-1', 'acc-2'], required: false })
  @Column({ type: 'jsonb', nullable: true })
  successAccountIds: string[];

  @ApiProperty({ description: '失败账号ID列表', example: ['acc-3'], required: false })
  @Column({ type: 'jsonb', nullable: true })
  failedAccountIds: string[];

  @ApiProperty({ description: '跳过账号ID列表', example: ['acc-4'], required: false })
  @Column({ type: 'jsonb', nullable: true })
  skippedAccountIds: string[];

  @ApiProperty({ description: '总账号数', example: 10 })
  @Column({ type: 'int' })
  totalAccounts: number;

  @ApiProperty({ description: '成功数', example: 8, required: false })
  @Column({ type: 'int', nullable: true })
  successCount: number;

  @ApiProperty({ description: '失败数', example: 2, required: false })
  @Column({ type: 'int', nullable: true })
  failedCount: number;

  @ApiProperty({ description: '跳过数', example: 0, required: false })
  @Column({ type: 'int', nullable: true })
  skippedCount: number;

  @ApiProperty({ description: '进度百分比', example: 80 })
  @Column({ type: 'int', default: 0 })
  progress: number;

  @ApiProperty({ description: '开始时间', example: '2026-04-12T10:00:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date;

  @ApiProperty({ description: '完成时间', example: '2026-04-12T10:05:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date;

  @ApiProperty({ description: '错误信息', example: '连接超时', required: false })
  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @ApiProperty({ description: '详细结果', example: { 'acc-1': 'success', 'acc-2': 'failed: timeout' }, required: false })
  @Column({ type: 'jsonb', nullable: true })
  detailedResults: Record<string, string>;

  @ApiProperty({ description: '操作参数', example: { timeout: 30000, retryCount: 3 }, required: false })
  @Column({ type: 'jsonb', nullable: true })
  parameters: Record<string, any>;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:00:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_batch_operations_created_at')
  createdAt: Date;

  @ApiProperty({ description: '更新时间', example: '2026-04-12T10:05:00Z' })
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // 方法
  isCompleted(): boolean {
    return this.status === 'completed' || this.status === 'failed' || this.status === 'cancelled';
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  updateProgress(current: number, total: number): void {
    this.progress = Math.round((current / total) * 100);
  }

  addSuccess(accountId: string, result?: string): void {
    if (!this.successAccountIds) {
      this.successAccountIds = [];
    }
    this.successAccountIds.push(accountId);
    this.successCount = this.successAccountIds.length;

    if (!this.detailedResults) {
      this.detailedResults = {};
    }
    this.detailedResults[accountId] = result || 'success';
  }

  addFailed(accountId: string, error: string): void {
    if (!this.failedAccountIds) {
      this.failedAccountIds = [];
    }
    this.failedAccountIds.push(accountId);
    this.failedCount = this.failedAccountIds.length;

    if (!this.detailedResults) {
      this.detailedResults = {};
    }
    this.detailedResults[accountId] = `failed: ${error}`;
  }

  addSkipped(accountId: string, reason: string): void {
    if (!this.skippedAccountIds) {
      this.skippedAccountIds = [];
    }
    this.skippedAccountIds.push(accountId);
    this.skippedCount = this.skippedAccountIds.length;

    if (!this.detailedResults) {
      this.detailedResults = {};
    }
    this.detailedResults[accountId] = `skipped: ${reason}`;
  }

  getSuccessRate(): number {
    if (this.totalAccounts === 0) return 0;
    return (this.successCount || 0) / this.totalAccounts;
  }

  getDuration(): number | null {
    if (!this.startedAt || !this.completedAt) return null;
    return this.completedAt.getTime() - this.startedAt.getTime();
  }
}