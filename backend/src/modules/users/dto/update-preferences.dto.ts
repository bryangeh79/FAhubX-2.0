import { IsOptional, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ description: '用户偏好设置对象' })
  @IsOptional()
  @IsObject()
  preferences?: Record<string, any>;
}
