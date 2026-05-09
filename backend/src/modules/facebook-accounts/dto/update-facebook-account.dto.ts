import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsIn,
  IsBoolean,
  IsObject,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';

export class UpdateFacebookAccountDto {
  @ApiProperty({
    description: 'Facebook账号名称',
    example: 'John Doe Updated',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: '访问令牌',
    example: 'EAAG...',
    required: false,
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiProperty({
    description: '访问令牌过期时间',
    example: '2026-06-12T10:30:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString({}, { message: '令牌过期时间必须是有效的日期字符串' })
  accessTokenExpiresAt?: string;

  @ApiProperty({
    description: '刷新令牌',
    example: 'EAAG...',
    required: false,
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiProperty({
    description: 'Facebook邮箱',
    example: 'john.updated@example.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    description: '账号类型',
    example: 'page',
    enum: ['user', 'page', 'business'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['user', 'page', 'business'], {
    message: '账号类型必须是 user, page 或 business',
  })
  accountType?: 'user' | 'page' | 'business';

  @ApiProperty({
    description: '账号状态',
    example: 'active',
    enum: ['active', 'expired', 'revoked', 'error'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'expired', 'revoked', 'error'], {
    message: '账号状态必须是 active, expired, revoked 或 error',
  })
  status?: 'active' | 'expired' | 'revoked' | 'error';

  @ApiProperty({
    description: '是否已验证',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiProperty({
    description: '头像URL',
    example: 'https://graph.facebook.com/123456789012345/picture?type=large',
    required: false,
  })
  @IsOptional()
  @IsString()
  profilePicture?: string;

  @ApiProperty({
    description: '封面照片URL',
    example: 'https://example.com/new-cover.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  coverPhoto?: string;

  @ApiProperty({
    description: '粉丝/好友数量',
    example: 1200,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  followersCount?: number;

  @ApiProperty({
    description: '关注数量',
    example: 600,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  followingCount?: number;

  @ApiProperty({
    description: '同步状态',
    example: 'success',
    enum: ['pending', 'success', 'failed'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'success', 'failed'], {
    message: '同步状态必须是 pending, success 或 failed',
  })
  syncStatus?: 'pending' | 'success' | 'failed';

  @ApiProperty({
    description: '同步错误信息',
    example: 'Invalid access token',
    required: false,
  })
  @IsOptional()
  @IsString()
  syncError?: string;

  @ApiProperty({
    description: '账号配置',
    example: {
      autoPost: true,
      autoReply: true,
      postSchedule: '9:00,13:00,18:00,21:00',
      replyTemplates: ['谢谢关注！', '请查看我们的网站了解更多信息。', '有问题请随时联系我们。'],
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiProperty({
    description: '元数据',
    example: {
      permissions: ['pages_manage_posts', 'pages_read_engagement', 'pages_manage_metadata'],
      scopes: ['email', 'public_profile', 'pages_show_list'],
      lastApiCall: '2026-04-12T11:00:00Z',
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({ description: '备注', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ description: 'Facebook登录密码', required: false })
  @IsOptional()
  @IsString()
  facebookPassword?: string;

  @ApiProperty({ description: 'VPN配置ID', required: false })
  @IsOptional()
  @IsString()
  vpnConfigId?: string;

  @ApiProperty({ description: 'Messenger 聊天室 PIN（4-6位数字）', required: false })
  @IsOptional()
  @IsString()
  messengerPin?: string;
}