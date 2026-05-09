import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LicenseService } from './license.service';

/**
 * License Controller — public endpoints (no auth required)
 * Only active in DEPLOY_MODE=local
 *
 * Used by the frontend activation page to:
 * 1. Check if system is activated
 * 2. Activate with a license key
 * 3. Get current license status
 */
@ApiTags('License')
@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Get('status')
  @ApiOperation({ summary: '获取 License 状态' })
  async getStatus() {
    const state = this.licenseService.getState();
    return {
      activated: this.licenseService.isActivated(),
      valid: this.licenseService.isValid(),
      plan: state.plan,
      maxAccounts: state.maxAccounts,
      maxTasks: state.maxTasks,
      expiresAt: state.expiresAt,
      error: state.error,
      isLocal: this.licenseService.isLocalDeployment(),
    };
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '激活 License Key' })
  async activate(@Body() body: { licenseKey: string }) {
    if (!body.licenseKey) {
      return { success: false, error: '请输入 License Key' };
    }
    return this.licenseService.activate(body.licenseKey);
  }
}
