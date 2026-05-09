import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UserPreferencesDto {
  @ApiProperty({
    description: '通知偏好设置',
    example: {
      failures: true,
      warnings: false,
      successes: false,
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  notifications?: {
    failures?: boolean;
    warnings?: boolean;
    successes?: boolean;
  };

  @ApiProperty({
    description: 'UI偏好设置',
    example: {
      theme: 'light',
      density: 'comfortable',
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  ui?: {
    theme?: string;
    density?: string;
  };

  @ApiProperty({
    description: '隐私偏好设置',
    example: {
      dataRetention: '7days',
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  privacy?: {
    dataRetention?: string;
  };
}

export class CreateUserDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
    required: true,
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @MaxLength(255, { message: '邮箱地址不能超过255个字符' })
  email: string;

  @ApiProperty({
    description: '用户名',
    example: 'john_doe',
    required: true,
  })
  @IsString({ message: '用户名必须是字符串' })
  @MinLength(3, { message: '用户名至少需要3个字符' })
  @MaxLength(50, { message: '用户名不能超过50个字符' })
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: '用户名只能包含字母、数字、下划线、点和横线',
  })
  username: string;

  @ApiProperty({
    description: '密码',
    example: 'Password123!',
    required: true,
  })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(8, { message: '密码至少需要8个字符' })
  @MaxLength(100, { message: '密码不能超过100个字符' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: '密码必须包含至少一个大写字母、一个小写字母、一个数字和一个特殊字符',
  })
  password: string;

  @ApiProperty({
    description: '确认密码',
    example: 'Password123!',
    required: true,
  })
  @IsString({ message: '确认密码必须是字符串' })
  confirmPassword: string;

  @ApiProperty({
    description: '全名',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString({ message: '全名必须是字符串' })
  @MaxLength(200, { message: '全名不能超过200个字符' })
  fullName?: string;

  @ApiProperty({
    description: '时区',
    example: 'Asia/Kuala_Lumpur',
    required: false,
  })
  @IsOptional()
  @IsString({ message: '时区必须是字符串' })
  @MaxLength(50, { message: '时区不能超过50个字符' })
  timezone?: string;

  @ApiProperty({
    description: '语言',
    example: 'en',
    required: false,
  })
  @IsOptional()
  @IsString({ message: '语言必须是字符串' })
  @MaxLength(10, { message: '语言不能超过10个字符' })
  language?: string;

  @ApiProperty({
    description: '是否同意服务条款',
    example: true,
    required: true,
  })
  @IsBoolean({ message: '必须同意服务条款' })
  acceptTerms: boolean;

  @ApiProperty({
    description: '用户偏好设置',
    type: UserPreferencesDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserPreferencesDto)
  preferences?: UserPreferencesDto;
}