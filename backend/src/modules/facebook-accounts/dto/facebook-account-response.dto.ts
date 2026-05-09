import { ApiProperty } from '@nestjs/swagger';

export class FacebookAccountResponseDto {
  @ApiProperty({ description: '账号ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ description: 'Facebook账号ID', example: '123456789012345' })
  facebookId: string;

  @ApiProperty({ description: '账号编号（每租户独立 #01 起，删号后回收）', example: 1, required: false })
  accountNumber?: number | null;

  @ApiProperty({ description: '暖化分组编号 1-6，null=未分组', example: 1, required: false })
  warmupGroupNumber?: number | null;

  @ApiProperty({ description: 'Facebook账号名称', example: 'John Doe' })
  name: string;

  @ApiProperty({ description: 'Facebook邮箱', example: 'john.doe@example.com', required: false })
  email?: string;

  @ApiProperty({ description: '账号类型', example: 'user', enum: ['user', 'page', 'business'] })
  accountType: 'user' | 'page' | 'business';

  @ApiProperty({ description: '账号状态', example: 'active', enum: ['active', 'expired', 'revoked', 'error'] })
  status: 'active' | 'idle' | 'error' | 'disabled' | 'banned';

  @ApiProperty({ description: '是否已验证', example: true })
  verified: boolean;

  @ApiProperty({ description: '备注说明', required: false })
  remarks?: string;

  @ApiProperty({ description: '登录状态', required: false })
  loginStatus?: boolean;

  @ApiProperty({ description: '头像URL', required: false })
  profilePicture?: string;

  @ApiProperty({ description: '封面照片URL', example: 'https://example.com/cover.jpg', required: false })
  coverPhoto?: string;

  @ApiProperty({ description: '粉丝/好友数量', example: 1000, required: false })
  followersCount?: number;

  @ApiProperty({ description: '关注数量', example: 500, required: false })
  followingCount?: number;

  @ApiProperty({ description: '访问令牌过期时间', example: '2026-05-12T10:30:00Z' })
  accessTokenExpiresAt: Date;

  @ApiProperty({ description: '最后同步时间', example: '2026-04-12T10:30:00Z', required: false })
  lastSyncedAt?: Date;

  @ApiProperty({ description: '同步状态', example: 'success', enum: ['pending', 'success', 'failed'], required: false })
  syncStatus?: 'pending' | 'success' | 'failed';

  @ApiProperty({ description: '同步错误信息', example: 'Invalid access token', required: false })
  syncError?: string;

  @ApiProperty({
    description: '账号配置',
    example: {
      autoPost: true,
      autoReply: false,
      postSchedule: '9:00,13:00,18:00',
    },
  })
  config: Record<string, any>;

  @ApiProperty({
    description: '元数据',
    example: {
      permissions: ['pages_manage_posts'],
      scopes: ['email'],
    },
  })
  metadata: Record<string, any>;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:00:00Z' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间', example: '2026-04-12T10:30:00Z' })
  updatedAt: Date;

  @ApiProperty({ description: '令牌是否即将过期', example: false })
  isTokenExpiring: boolean;

  @ApiProperty({ description: '账号是否活跃', example: true })
  isActive: boolean;

  @ApiProperty({ description: '绑定的 VPN 配置 ID（未绑定则为 null）', required: false })
  vpnConfigId?: string | null;

  @ApiProperty({ description: 'Messenger PIN', required: false })
  messengerPin?: string | null;
}