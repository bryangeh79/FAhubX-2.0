import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsObject } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: '用户邮箱地址',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱地址不能为空' })
  email: string;

  @ApiProperty({
    description: '用户密码',
    example: 'Password123!',
  })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码长度不能少于8个字符' })
  password: string;

  @ApiProperty({
    description: '设备信息',
    example: {
      deviceId: 'device-123',
      deviceType: 'web',
      os: 'Windows 10',
      browser: 'Chrome 120',
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