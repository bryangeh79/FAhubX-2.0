import {
  Controller, Get, Post, Param, Body, UseGuards, Request, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WarmupService } from './warmup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PackageMode } from './entities/warmup-progress.entity';

@ApiTags('账号暖化 (Warmup v1.3)')
@Controller('warmup')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WarmupController {
  constructor(private readonly warmupService: WarmupService) {}

  @Get('progress')
  @ApiOperation({ summary: '当前用户所有账号的暖化进度' })
  async listForUser(@Request() req) {
    return this.warmupService.listForUser(req.user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: '暖化统计（仪表板用）' })
  async getStats(@Request() req) {
    return this.warmupService.getWarmupStats(req.user.id);
  }

  @Get('status/:accountId')
  @ApiOperation({ summary: '单账号的暖化状态' })
  async getStatus(@Request() req, @Param('accountId') accountId: string) {
    return this.warmupService.getStatus(req.user.id, accountId);
  }

  /**
   * 启动单账号暖化 —— 简化端点，默认 P1+P2 完整养号
   * 账号管理页的「一键养号」按钮用这个
   */
  @Post('start/:accountId')
  @ApiOperation({ summary: '一键启动暖化（默认 P1+P2 完整养号）' })
  async start(
    @Request() req,
    @Param('accountId') accountId: string,
    @Body() body?: { packageMode?: PackageMode },
  ) {
    const mode = (body?.packageMode ?? 'P1+P2') as PackageMode;
    if (!['P1', 'P2', 'P1+P2', 'P3'].includes(mode)) {
      throw new BadRequestException('packageMode 必须是 P1 / P2 / P1+P2 / P3');
    }
    return this.warmupService.startWarmup(req.user.id, accountId, mode);
  }

  /**
   * 批量启动（任务调度页创建养号任务用）
   * 接受 accountIds 数组 或 groupNumber（整组）
   */
  @Post('batch')
  @ApiOperation({ summary: '批量启动暖化（按账号列表或整组）' })
  async batch(
    @Request() req,
    @Body() body: {
      packageMode?: PackageMode;
      accountIds?: string[];
      groupNumber?: number;
    },
  ) {
    const mode = (body?.packageMode ?? 'P1+P2') as PackageMode;
    if (!['P1', 'P2', 'P1+P2', 'P3'].includes(mode)) {
      throw new BadRequestException('packageMode 必须是 P1 / P2 / P1+P2 / P3');
    }
    if ((!body?.accountIds || body.accountIds.length === 0) && body?.groupNumber == null) {
      throw new BadRequestException('必须提供 accountIds 或 groupNumber 之一');
    }
    return this.warmupService.startWarmupBatch(req.user.id, {
      packageMode: mode,
      accountIds: body.accountIds,
      groupNumber: body.groupNumber,
    });
  }

  @Post('retire/:accountId')
  @ApiOperation({ summary: '退役账号（停止暖化）' })
  async retire(@Request() req, @Param('accountId') accountId: string) {
    return this.warmupService.retireWarmup(req.user.id, accountId);
  }

  @Post('resume/:accountId')
  @ApiOperation({ summary: '重新激活退役账号' })
  async resume(@Request() req, @Param('accountId') accountId: string) {
    return this.warmupService.resumeWarmup(req.user.id, accountId);
  }
}
