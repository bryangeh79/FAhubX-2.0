import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type AlertStatus = 'active' | 'resolved' | 'acknowledged';
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertType = 'health' | 'performance' | 'security' | 'system';

@Entity('health_alerts')
export class HealthAlert {
  @ApiProperty({ description: '告警ID', example: 'alert-123456' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ type: 'uuid' })
  @Index('idx_health_alerts_user_id')
  userId: string;

  @ApiProperty({ description: '账号ID', example: 'acc-123456', required: false })
  @Column({ type: 'uuid', nullable: true })
  @Index('idx_health_alerts_account_id')
  accountId: string;

  @ApiProperty({ description: '告警类型', example: 'health', enum: ['health', 'performance', 'security', 'system'] })
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_health_alerts_type')
  type: AlertType;

  @ApiProperty({ description: '告警严重程度', example: 'error', enum: ['info', 'warning', 'error', 'critical'] })
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_health_alerts_severity')
  severity: AlertSeverity;

  @ApiProperty({ description: '告警状态', example: 'active', enum: ['active', 'resolved', 'acknowledged'] })
  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index('idx_health_alerts_status')
  status: AlertStatus;

  @ApiProperty({ description: '告警标题', example: '账号登录失败' })
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @ApiProperty({ description: '告警描述', example: '账号连续3次登录失败，可能被封禁' })
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({ description: '告警详情', example: { failedAttempts: 3, lastError: 'Invalid token' } })
  @Column({ type: 'jsonb' })
  details: Record<string, any>;

  @ApiProperty({ description: '触发条件', example: '连续3次健康检查失败' })
  @Column({ type: 'text' })
  triggerCondition: string;

  @ApiProperty({ description: '建议操作', example: '检查访问令牌有效性，尝试重新登录' })
  @Column({ type: 'text' })
  suggestedAction: string;

  @ApiProperty({ description: '是否已通知', example: true })
  @Column({ type: 'boolean', default: false })
  notified: boolean;

  @ApiProperty({ description: '通知时间', example: '2026-04-12T10:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  notifiedAt: Date;

  @ApiProperty({ description: '确认用户ID', example: 'user-123', required: false })
  @Column({ type: 'uuid', nullable: true })
  acknowledgedBy: string;

  @ApiProperty({ description: '确认时间', example: '2026-04-12T10:35:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date;

  @ApiProperty({ description: '解决时间', example: '2026-04-12T10:40:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date;

  @ApiProperty({ description: '解决描述', example: '重新登录成功', required: false })
  @Column({ type: 'text', nullable: true })
  resolutionDescription: string;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:30:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_health_alerts_created_at')
  createdAt: Date;

  @ApiProperty({ description: '更新时间', example: '2026-04-12T10:35:00Z' })
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // 方法
  isActive(): boolean {
    return this.status === 'active';
  }

  isResolved(): boolean {
    return this.status === 'resolved';
  }

  isCritical(): boolean {
    return this.severity === 'critical';
  }

  acknowledge(userId: string): void {
    this.status = 'acknowledged';
    this.acknowledgedBy = userId;
    this.acknowledgedAt = new Date();
    this.updatedAt = new Date();
  }

  resolve(description: string): void {
    this.status = 'resolved';
    this.resolutionDescription = description;
    this.resolvedAt = new Date();
    this.updatedAt = new Date();
  }

  markAsNotified(): void {
    this.notified = true;
    this.notifiedAt = new Date();
    this.updatedAt = new Date();
  }

  getAlertSummary(): string {
    const severityMap = {
      info: '信息',
      warning: '警告',
      error: '错误',
      critical: '严重',
    };

    const statusMap = {
      active: '活跃',
      resolved: '已解决',
      acknowledged: '已确认',
    };

    return `[${severityMap[this.severity]}] ${this.title} - ${statusMap[this.status]}`;
  }

  shouldNotify(): boolean {
    return !this.notified && (this.severity === 'error' || this.severity === 'critical');
  }

  getDetailsAsString(): string {
    return JSON.stringify(this.details, null, 2);
  }
}