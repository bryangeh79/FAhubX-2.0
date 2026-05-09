import { IsOptional, IsString, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

// 必须是 class（而非 interface），ValidationPipe 才能正确处理嵌套对象
export class ScriptPhaseDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  @IsIn(['A', 'B'])
  sender?: 'A' | 'B';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  messages?: string[];
}

export class UpdateChatScriptDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScriptPhaseDto)
  phases?: ScriptPhaseDto[];

  @IsOptional()
  @IsString()
  category?: string;
}
