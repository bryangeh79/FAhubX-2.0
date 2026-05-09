import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type HealthCheckStatus = 'healthy' | 'warning' | 'critical';
export type HealthCheckType = 'login' | 'session' | 'api' | 'network' | 'resource';

@Entity('health_check_logs')
export class HealthCheckLog {
  @ApiProperty({ description: '日志ID', example: 'health-log-123456' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ type: 'uuid' })
  @Index('idx_health_check_logs_user_id')
  userId: string;

  @ApiProperty({ description: '账号ID', example: 'acc-123456' })
  @Column({ type: 'uuid' })
  @Index('idx_health_check_logs_account_id')
  accountId: string;

  @ApiProperty({ description: '检查类型', example: 'login', enum: ['login', 'session', 'api', 'network', 'resource'] })
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_health_check_logs_type')
  checkType: HealthCheckType;

  @ApiProperty({ description: '检查状态', example: 'healthy', enum: ['healthy', 'warning', 'critical'] })
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_health_check_logs_status')
  status: HealthCheckStatus;

  @ApiProperty({ description: '健康评分', example: 95 })
  @Column({ type: 'int' })
  score: number;

  @ApiProperty({ description: '检查详情', example: { loginSuccess: true, responseTime: 150 } })
  @Column({ type: 'jsonb' })
  details: Record<string, any>;

  @ApiProperty({ description: '错误信息', example: '登录失败: 无效的访问令牌', required: false })
  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @ApiProperty({ description: '响应时间(毫秒)', example: 150 })
  @Column({ type: 'int' })
  responseTime: number;

  @ApiProperty({ description: '检查时间', example: '2026-04-12T10:30:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_health_check_logs_created_at')
  checkedAt: Date;

  // 方法
  isHealthy(): boolean {
    return this.status === 'healthy';
  }

  isCritical(): boolean {
    return this.status === 'critical';
  }

  getCheckSummary(): string {
    const typeMap = {
      login: '登录检查',
      session: '会话检查',
      api: 'API检查',
      network: '网络检查',
      resource: '资源检查',
    };

    const statusMap = {
      healthy: '正常',
      warning: '警告',
      critical: '严重',
    };

    return `${typeMap[this.checkType]}: ${statusMap[this.status]} (${this.score}分)`;
  }

  getDetailsAsString(): string {
    return JSON.stringify(this.details, null, 2);
  }
}