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

@Entity('facebook_accounts')
export class FacebookAccount {
  @ApiProperty({ description: '账号ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ type: 'uuid' })
  @Index('idx_facebook_accounts_user_id')
  userId: string;

  @ApiProperty({ description: 'Facebook账号ID（登录后自动获取）', required: false })
  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  @Index('idx_facebook_accounts_facebook_id')
  facebookId: string;

  @ApiProperty({ description: '账号编号（每租户独立，#01 起，删号后回收）', example: 1, required: false })
  @Column({ type: 'int', nullable: true, name: 'accountNumber' })
  accountNumber: number | null;

  @ApiProperty({ description: '暖化分组编号 1-6，null=未分组', example: 1, required: false })
  @Column({ type: 'int', nullable: true, name: 'warmupGroupNumber' })
  @Index('idx_facebook_accounts_warmup_group')
  warmupGroupNumber: number | null;

  @ApiProperty({ description: 'Facebook账号显示名称', example: 'John Doe' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ description: 'Facebook登录邮箱/手机号', example: 'john.doe@example.com' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @ApiProperty({ description: 'Facebook登录密码（加密存储）' })
  @Exclude()
  @Column({ type: 'text', nullable: true })
  facebookPassword: string;

  @ApiProperty({ description: '访问令牌（登录后自动获取）', required: false })
  @Exclude()
  @Column({ type: 'text', nullable: true })
  accessToken: string;

  @ApiProperty({ description: '访问令牌过期时间', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  accessTokenExpiresAt: Date;

  @ApiProperty({ description: '刷新令牌', required: false })
  @Exclude()
  @Column({ type: 'text', nullable: true })
  refreshToken: string;

  @ApiProperty({ description: '备注说明', required: false })
  @Column({ type: 'text', nullable: true })
  remarks: string;

  @ApiProperty({ description: '账号类型', example: 'user', enum: ['user', 'page', 'business'] })
  @Column({ type: 'varchar', length: 20, default: 'user' })
  accountType: 'user' | 'page' | 'business';

  @ApiProperty({ description: '账号状态', example: 'active', enum: ['active', 'idle', 'error', 'disabled', 'banned'] })
  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index('idx_facebook_accounts_status')
  status: 'active' | 'idle' | 'error' | 'disabled' | 'banned';

  @ApiProperty({ description: '是否已验证', example: true })
  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @ApiProperty({ description: '头像URL', example: 'https://graph.facebook.com/123456789012345/picture', required: false })
  @Column({ type: 'text', nullable: true })
  profilePicture: string;

  @ApiProperty({ description: '封面照片URL', example: 'https://example.com/cover.jpg', required: false })
  @Column({ type: 'text', nullable: true })
  coverPhoto: string;

  @ApiProperty({ description: '粉丝/好友数量', example: 1000, required: false })
  @Column({ type: 'int', nullable: true })
  followersCount: number;

  @ApiProperty({ description: '关注数量', example: 500, required: false })
  @Column({ type: 'int', nullable: true })
  followingCount: number;

  @ApiProperty({ description: '最后同步时间', example: '2026-04-12T10:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date;

  @ApiProperty({ description: '同步状态', example: 'success', enum: ['pending', 'success', 'failed'], required: false })
  @Column({ type: 'varchar', length: 20, nullable: true })
  syncStatus: 'pending' | 'success' | 'failed';

  @ApiProperty({ description: '同步错误信息', example: 'Invalid access token', required: false })
  @Column({ type: 'text', nullable: true })
  syncError: string;

  // 批量操作相关字段
  @ApiProperty({ description: '批量操作ID', example: 'batch-123', required: false })
  @Column({ type: 'varchar', length: 100, nullable: true })
  @Index('idx_facebook_accounts_batch_operation_id')
  batchOperationId: string;

  @ApiProperty({ description: '批量操作状态', example: 'pending', enum: ['pending', 'running', 'completed', 'failed'], required: false })
  @Column({ type: 'varchar', length: 20, nullable: true })
  batchOperationStatus: 'pending' | 'running' | 'completed' | 'failed';

  // 健康监控相关字段
  @ApiProperty({ description: '健康评分', example: 95, required: false })
  @Column({ type: 'int', nullable: true })
  healthScore: number;

  @ApiProperty({ description: '最后健康检查时间', example: '2026-04-12T10:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  lastHealthCheckAt: Date;

  @ApiProperty({ description: '登录状态', example: true, required: false })
  @Column({ type: 'boolean', nullable: true })
  loginStatus: boolean;

  @ApiProperty({ description: '会话过期时间', example: '2026-04-12T12:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  sessionExpiresAt: Date;

  @ApiProperty({ description: '任务成功率', example: 0.95, required: false })
  @Column({ type: 'float', nullable: true })
  taskSuccessRate: number;

  @ApiProperty({ description: '平均响应时间(ms)', example: 150, required: false })
  @Column({ type: 'int', nullable: true })
  avgResponseTime: number;

  @ApiProperty({ description: '资源使用情况', example: { cpu: 30, memory: 256 }, required: false })
  @Column({ type: 'jsonb', nullable: true })
  resourceUsage: { cpu: number; memory: number };

  // 分组管理相关字段
  @ApiProperty({ description: '分组ID', example: 'group-123', required: false })
  @Column({ type: 'varchar', length: 100, nullable: true })
  @Index('idx_facebook_accounts_group_id')
  groupId: string;

  @ApiProperty({ description: '分组名称', example: '营销账号组', required: false })
  @Column({ type: 'varchar', length: 100, nullable: true })
  groupName: string;

  // Messenger PIN
  @ApiProperty({ description: 'Messenger 聊天室 PIN（4-6位数字）', required: false })
  @Column({ type: 'varchar', length: 10, nullable: true, name: 'messenger_pin' })
  messengerPin: string;

  // VPN/IP相关字段
  @ApiProperty({ description: 'VPN配置ID', example: 'vpn-123', required: false })
  @Column({ type: 'varchar', length: 100, nullable: true })
  vpnConfigId: string;

  @ApiProperty({ description: '浏览器配置文件目录（持久化Session）', required: false })
  @Column({ type: 'varchar', length: 500, nullable: true })
  userDataDir: string;

  @ApiProperty({ description: '当前IP地址', example: '192.168.1.100', required: false })
  @Column({ type: 'varchar', length: 50, nullable: true })
  currentIp: string;

  @ApiProperty({ description: 'IP地址池ID', example: 'ip-pool-123', required: false })
  @Column({ type: 'varchar', length: 100, nullable: true })
  ipPoolId: string;

  @ApiProperty({ description: '网络质量评分', example: 85, required: false })
  @Column({ type: 'int', nullable: true })
  networkQuality: number;

  // 恢复相关字段
  @ApiProperty({ description: '恢复尝试次数', example: 2, required: false })
  @Column({ type: 'int', default: 0 })
  recoveryAttempts: number;

  @ApiProperty({ description: '最后恢复时间', example: '2026-04-12T10:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  lastRecoveryAt: Date;

  @ApiProperty({ description: '恢复策略', example: 'auto_reconnect', required: false })
  @Column({ type: 'varchar', length: 50, nullable: true })
  recoveryStrategy: string;

  @ApiProperty({ description: '账号配置', example: { autoPost: true, autoReply: false }, required: false })
  @Column({ type: 'jsonb', default: {} })
  config: Record<string, any>;

  @ApiProperty({ description: '元数据', example: { permissions: ['pages_manage_posts'], scopes: ['email'] }, required: false })
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:00:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_facebook_accounts_created_at')
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
  normalizeData() {
    if (this.email) {
      this.email = this.email.toLowerCase().trim();
    }
  }

  // 方法
  isActive(): boolean {
    return this.status === 'active' && !this.deletedAt;
  }

  isTokenExpired(): boolean {
    if (!this.accessTokenExpiresAt) return false;
    return new Date() > this.accessTokenExpiresAt;
  }

  needsRefresh(): boolean {
    if (!this.accessTokenExpiresAt) return false;
    const refreshThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return this.accessTokenExpiresAt < refreshThreshold;
  }

  getPermissions(): string[] {
    return this.metadata?.permissions || [];
  }

  hasPermission(permission: string): boolean {
    return this.getPermissions().includes(permission);
  }

  getConfigValue(key: string, defaultValue?: any): any {
    return this.config?.[key] ?? defaultValue;
  }

  setConfigValue(key: string, value: any): void {
    if (!this.config) {
      this.config = {};
    }
    this.config[key] = value;
  }

  // 加密访问令牌（在实际应用中应该加密存储）
  encryptAccessToken(): void {
    // 这里应该实现加密逻辑
    // 暂时留空，实际应用中应该加密敏感数据
  }

  // 解密访问令牌
  decryptAccessToken(): string {
    // 这里应该实现解密逻辑
    // 暂时返回原始令牌
    return this.accessToken;
  }
}