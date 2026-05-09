import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

@Entity('user_sessions')
export class UserSession {
  @ApiProperty({ description: '会话ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ type: 'uuid' })
  @Index('idx_user_sessions_user_id')
  userId: string;

  @Exclude()
  @Column({ type: 'text' })
  @Index('idx_user_sessions_access_token')
  accessToken: string;

  @Exclude()
  @Column({ type: 'text' })
  @Index('idx_user_sessions_refresh_token')
  refreshToken: string;

  @ApiProperty({
    description: '设备信息',
    example: {
      deviceId: 'device-123',
      deviceType: 'web',
      os: 'Windows 10',
      browser: 'Chrome 120',
      screenResolution: '1920x1080',
    },
  })
  @Column({ type: 'jsonb', nullable: true })
  deviceInfo: Record<string, any>;

  @ApiProperty({
    description: '用户代理',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })
  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @ApiProperty({ description: 'IP地址', example: '192.168.1.100' })
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @ApiProperty({ description: '是否已撤销', example: false })
  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @ApiProperty({ description: '撤销时间', example: '2026-04-12T11:00:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date;

  @ApiProperty({ description: '过期时间', example: '2026-04-13T10:30:00Z' })
  @Column({ type: 'timestamptz' })
  @Index('idx_user_sessions_expires_at')
  expiresAt: Date;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:30:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_user_sessions_created_at')
  createdAt: Date;

  @ApiProperty({ description: '更新时间', example: '2026-04-12T10:35:00Z' })
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // 钩子函数
  @BeforeInsert()
  @BeforeUpdate()
  normalizeData() {
    // 清理设备信息中的敏感数据
    if (this.deviceInfo) {
      const { deviceId, ...safeInfo } = this.deviceInfo;
      this.deviceInfo = safeInfo;
    }
  }

  // 方法
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isValid(): boolean {
    return !this.revoked && !this.isExpired();
  }

  getDeviceType(): string {
    return this.deviceInfo?.deviceType || 'unknown';
  }

  getBrowserInfo(): string {
    if (!this.userAgent) return 'unknown';
    
    const ua = this.userAgent.toLowerCase();
    if (ua.includes('chrome')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';
    if (ua.includes('opera')) return 'Opera';
    
    return 'Other';
  }

  getOSInfo(): string {
    if (!this.userAgent) return 'unknown';
    
    const ua = this.userAgent.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('mac os')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('ios') || ua.includes('iphone')) return 'iOS';
    
    return 'Other';
  }

  getLocationInfo(): string {
    // 这里可以集成IP地理位置服务
    // 暂时返回IP地址
    return this.ipAddress || 'Unknown';
  }
}