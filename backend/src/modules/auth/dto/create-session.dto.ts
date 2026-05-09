import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({
    description: '用户ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString({ message: '用户ID必须是字符串' })
  @IsNotEmpty({ message: '用户ID不能为空' })
  userId: string;

  @ApiProperty({
    description: '访问令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: '访问令牌必须是字符串' })
  @IsNotEmpty({ message: '访问令牌不能为空' })
  accessToken: string;

  @ApiProperty({
    description: '刷新令牌',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: '刷新令牌必须是字符串' })
  @IsNotEmpty({ message: '刷新令牌不能为空' })
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
    required: false,
  })
  @IsOptional()
  @IsObject()
  deviceInfo?: Record<string, any>;

  @ApiProperty({
    description: '用户代理',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiProperty({
    description: 'IP地址',
    example: '192.168.1.100',
    required: false,
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;
}