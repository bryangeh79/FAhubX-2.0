import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ChatScriptsService } from './chat-scripts.service';
import { UpdateChatScriptDto } from './dto/update-chat-script.dto';
import { ImportScriptPackDto } from './dto/import-script-pack.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('聊天剧本')
@Controller('chat-scripts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatScriptsController {
  constructor(private readonly service: ChatScriptsService) {}

  @Get()
  @ApiOperation({ summary: '获取用户剧本列表（按语言筛选）' })
  @ApiQuery({ name: 'language', required: false, description: '语言代码: zh/en/vi（默认 zh）' })
  async findAll(@Request() req, @Query('language') language?: string) {
    return this.service.findAllByUser(req.user.id, language || 'zh');
  }

  @Get('language-stats')
  @ApiOperation({ summary: '按语言统计剧本数量（前端语言 tab 用）' })
  async languageStats(@Request() req) {
    return this.service.getLanguageStats(req.user.id);
  }

  @Post('import-pack')
  @ApiOperation({ summary: '导入剧本包 JSON（英文/越南语剧本包）' })
  async importPack(@Request() req, @Body() dto: ImportScriptPackDto) {
    return this.service.importPack(req.user.id, dto);
  }

  @Delete('by-language/:language')
  @ApiOperation({ summary: '按语言删除该用户的所有剧本（zh 不允许）' })
  async deleteByLanguage(@Request() req, @Param('language') language: string) {
    return this.service.deleteByLanguage(req.user.id, language);
  }

  @Post('reset-all')
  @ApiOperation({ summary: '重置所有中文剧本为最新模板（不影响其他语言）' })
  async resetAll(@Request() req) {
    const count = await this.service.resetToDefault(req.user.id);
    return { success: true, message: `已重置 ${count} 个剧本为最新模板`, count };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个剧本详情' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新剧本内容' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateChatScriptDto,
  ) {
    return this.service.update(req.user.id, id, dto);
  }
}
