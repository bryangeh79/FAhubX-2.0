import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty, IsString, IsOptional, IsIn, IsBoolean, IsObject,
} from 'class-validator';

export class CreateFacebookAccountDto {
  @ApiProperty({ description: '账号显示名称', example: '营销账号1' })
  @IsString()
  @IsNotEmpty({ message: '显示名称不能为空' })
  name: string;

  @ApiProperty({ description: 'Facebook登录邮箱或手机号', example: 'john@example.com' })
  @IsString()
  @IsNotEmpty({ message: '登录邮箱/手机号不能为空' })
  email: string;

  @ApiProperty({ description: 'Facebook登录密码' })
  @IsString()
  @IsNotEmpty({ message: '登录密码不能为空' })
  facebookPassword: string;

  @ApiProperty({ description: '账号类型', example: 'user', enum: ['user', 'page', 'business'] })
  @IsOptional()
  @IsString()
  @IsIn(['user', 'page', 'business'])
  accountType?: 'user' | 'page' | 'business';

  @ApiProperty({ description: '备注说明', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ description: '是否已验证', required: false })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiProperty({ description: '账号配置', required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiProperty({ description: '元数据', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional() @IsString() messengerPin?: string;

  // VPN 配置 ID（可选：指定专属 VPN；不填则用默认 VPN）
  @IsOptional() @IsString() vpnConfigId?: string;

  // 以下字段保留兼容性（浏览器登录后可自动填充）
  @IsOptional() @IsString() facebookId?: string;
  @IsOptional() @IsString() accessToken?: string;
  @IsOptional() @IsString() accessTokenExpiresAt?: string;
  @IsOptional() @IsString() refreshToken?: string;
  @IsOptional() @IsString() profilePicture?: string;
}
