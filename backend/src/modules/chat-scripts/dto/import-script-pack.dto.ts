import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 剧本包 JSON 格式，租户从你那买了英文/越南语剧本包后上传这个结构。
 * 一个包里可以有 1-50 个剧本。scriptNumber 1-50，同 (userId, language, scriptNumber) 唯一。
 */

export class ScriptPhaseDto {
  @IsString() @IsNotEmpty()
  label: string;

  @IsOptional() @IsIn(['A', 'B'])
  sender?: 'A' | 'B';

  @IsArray() @IsString({ each: true })
  messages: string[];
}

export class ScriptPackItemDto {
  @IsInt()
  scriptNumber: number;  // 1-50

  @IsString() @IsNotEmpty()
  title: string;

  @IsOptional() @IsString()
  goal?: string;

  @IsOptional() @IsString()
  systemPrompt?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => ScriptPhaseDto)
  phases: ScriptPhaseDto[];
}

export class ImportScriptPackDto {
  @ApiProperty({ description: '剧本包名称', example: 'FAhubX English Chat Scripts v1.0' })
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '语言代码', example: 'en', enum: ['en', 'vi', 'zh'] })
  @IsString() @IsIn(['en', 'vi', 'zh'])
  language: string;

  @ApiProperty({ description: '包版本', example: '1.0' })
  @IsOptional() @IsString()
  version?: string;

  @ApiProperty({ description: '剧本列表（1-50 条）', type: [ScriptPackItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScriptPackItemDto)
  scripts: ScriptPackItemDto[];

  @ApiProperty({ description: '冲突处理策略：overwrite = 覆盖同语言同编号的旧剧本；skip = 跳过已存在的', required: false })
  @IsOptional() @IsIn(['overwrite', 'skip'])
  conflictMode?: 'overwrite' | 'skip';
}
