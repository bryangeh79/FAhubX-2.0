import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsDateString, IsOptional } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: '新的访问令牌',
    example: 'EAAG...',
  })
  @IsString({ message: '新的访问令牌必须是字符串' })
  @IsNotEmpty({ message: '新的访问令牌不能为空' })
  newAccessToken: string;

  @ApiProperty({
    description: '新的过期时间',
    example: '2026-06-12T10:30:00Z',
  })
  @IsDateString({}, { message: '新的过期时间必须是有效的日期字符串' })
  @IsNotEmpty({ message: '新的过期时间不能为空' })
  newExpiresAt: string;

  @ApiProperty({
    description: '新的刷新令牌',
    example: 'EAAG...',
    required: false,
  })
  @IsOptional()
  @IsString()
  newRefreshToken?: string;
}