import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
  IsOptional,
  IsObject,
  IsBoolean,
  IsIn,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: '用户邮箱地址',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱地址不能为空' })
  email: string;

  @ApiProperty({
    description: '用户名',
    example: 'john_doe',
  })
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: '用户名只能包含字母、数字和下划线',
  })
  @MinLength(3, { message: '用户名长度不能少于3个字符' })
  username: string;

  @ApiProperty({
    description: '用户密码',
    example: 'Password123!',
  })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码长度不能少于8个字符' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: '密码必须包含至少一个大写字母、一个小写字母、一个数字和一个特殊字符',
  })
  password: string;

  @ApiProperty({
    description: '确认密码',
    example: 'Password123!',
  })
  @IsString({ message: '确认密码必须是字符串' })
  @IsNotEmpty({ message: '确认密码不能为空' })
  confirmPassword: string;

  @ApiProperty({
    description: '用户全名',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({
    description: '时区',
    example: 'Asia/Kuala_Lumpur',
    required: false,
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({
    description: '语言',
    example: 'en',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'zh', 'ms', 'id', 'th', 'vi'], {
    message: '语言必须是支持的语言之一: en, zh, ms, id, th, vi',
  })
  language?: string;

  @ApiProperty({
    description: '是否接受服务条款',
    example: true,
  })
  @IsBoolean({ message: '必须接受服务条款' })
  @ValidateIf(o => o.acceptTerms === true, {
    message: '必须接受服务条款才能注册',
  })
  acceptTerms: boolean;

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
      },
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, any>;

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