import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class SyncAccountDto {
  @ApiProperty({
    description: '是否强制同步',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}