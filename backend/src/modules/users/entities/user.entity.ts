import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

@Entity('users')
export class User {
  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '邮箱地址', example: 'user@example.com' })
  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_users_email')
  email: string;

  @ApiProperty({ description: '用户名', example: 'john_doe' })
  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @ApiProperty({ description: '用户角色', example: 'tenant', enum: ['admin', 'tenant'] })
  @Column({ type: 'varchar', length: 20, default: 'tenant' })
  role: 'admin' | 'tenant';

  @ApiProperty({ description: '订阅套餐', example: 'basic', enum: ['basic', 'pro', 'enterprise', 'admin'] })
  @Column({ type: 'varchar', length: 20, default: 'basic' })
  plan: 'basic' | 'pro' | 'enterprise' | 'admin';

  @ApiProperty({ description: '最大Facebook账号数', example: 10 })
  @Column({ type: 'int', default: 10, name: 'max_accounts' })
  maxAccounts: number;

  @ApiProperty({ description: '订阅到期日', required: false })
  @Column({ type: 'timestamptz', nullable: true, name: 'subscription_expiry' })
  subscriptionExpiry: Date | null;

  @ApiProperty({ description: '最大任务数', example: 50 })
  @Column({ type: 'int', default: 50, name: 'max_tasks' })
  maxTasks: number;

  @ApiProperty({ description: '最大剧本数', example: 10 })
  @Column({ type: 'int', default: 10, name: 'max_scripts' })
  maxScripts: number;

  @ApiProperty({ description: '用户状态', example: 'active', enum: ['active', 'suspended', 'deleted'] })
  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index('idx_users_status')
  status: 'active' | 'suspended' | 'deleted';

  @ApiProperty({ description: '邮箱是否已验证', example: true })
  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @ApiProperty({ description: '是否启用双因素认证', example: false })
  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @ApiProperty({ description: '全名', example: 'John Doe', required: false })
  @Column({ type: 'varchar', length: 200, nullable: true })
  fullName: string;

  @ApiProperty({ description: '头像URL', example: 'https://example.com/avatar.jpg', required: false })
  @Column({ type: 'text', nullable: true })
  avatarUrl: string;

  @ApiProperty({ description: '时区', example: 'Asia/Kuala_Lumpur' })
  @Column({ type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  @ApiProperty({ description: '语言', example: 'en' })
  @Column({ type: 'varchar', length: 10, default: 'en' })
  language: string;

  @ApiProperty({
    description: '用户偏好设置',
    example: {
      notifications: {
        failures: true,
        warnings: false,
        successes: false,
      },
      ui: {
        theme: 'light',
        density: 'comfortable',
      },
      privacy: {
        dataRetention: '7days',
      },
    },
  })
  @Column({ type: 'jsonb', default: {} })
  preferences: Record<string, any>;

  @ApiProperty({ description: '总登录次数', example: 42 })
  @Column({ type: 'int', default: 0 })
  totalLogins: number;

  @ApiProperty({ description: '最后登录时间', example: '2026-04-12T10:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:00:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_users_created_at')
  createdAt: Date;

  @ApiProperty({ description: '更新时间', example: '2026-04-12T10:30:00Z' })
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Exclude()
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date;

  // 钩子函数
  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail() {
    if (this.email) {
      this.email = this.email.toLowerCase().trim();
    }
  }

  @BeforeInsert()
  @BeforeUpdate()
  normalizeUsername() {
    if (this.username) {
      this.username = this.username.toLowerCase().trim();
    }
  }

  // 方法
  incrementLoginCount() {
    this.totalLogins += 1;
    this.lastLoginAt = new Date();
  }

  isActive(): boolean {
    return this.status === 'active' && !this.deletedAt;
  }

  isSuspended(): boolean {
    return this.status === 'suspended';
  }

  isDeleted(): boolean {
    return !!this.deletedAt;
  }

  // 偏好设置辅助方法
  getNotificationPreference(type: 'failures' | 'warnings' | 'successes'): boolean {
    return this.preferences?.notifications?.[type] ?? true;
  }

  getTheme(): string {
    return this.preferences?.ui?.theme ?? 'light';
  }

  getDataRetention(): string {
    return this.preferences?.privacy?.dataRetention ?? '7days';
  }

  isSubscriptionExpired(): boolean {
    if (this.role === 'admin') return false;
    if (!this.subscriptionExpiry) return false; // null = 永久有效
    return new Date() > this.subscriptionExpiry;
  }

  /** 配套默认值映射 */
  static getPlanDefaults(plan: 'basic' | 'pro' | 'enterprise' | 'admin'): {
    maxAccounts: number;
    maxTasks: number;
    maxScripts: number;
  } {
    switch (plan) {
      case 'pro':         return { maxAccounts: 30,   maxTasks: 200,  maxScripts: 50  };
      case 'enterprise':  return { maxAccounts: 50,   maxTasks: 300,  maxScripts: 100 };
      case 'admin':       return { maxAccounts: 9999, maxTasks: 9999, maxScripts: 9999 };
      case 'basic':
      default:            return { maxAccounts: 10,   maxTasks: 50,   maxScripts: 10  };
    }
  }
}