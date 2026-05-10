import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/**
 * SubscriptionGuard — 许可证有效性校验（Local 模式）
 *
 * 检查 LicenseService 缓存状态，许可证无效时阻止写操作。
 * 用于写操作端点（创建账号、执行任务等）。
 * 到期后用户仍可登录查看数据，但不能执行任何写操作。
 *
 * Phase 5C: removed cloud DB subscription check (DEPLOY_MODE=cloud path).
 * FAhubX 2.0 is local-only; cloud subscription logic is not needed.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // 动态获取 LicenseService（避免循环依赖）
      const { LicenseService } = await import('../../modules/license/license.service');
      const licenseService = this.moduleRef.get(LicenseService, { strict: false });
      if (licenseService && !licenseService.isValid()) {
        const err = licenseService.getError() || '许可证无效';
        // Surface a clear, actionable message — do not expose raw internal errors
        const isKeyError = err.includes('Invalid license key') || err.includes('Machine mismatch');
        throw new ForbiddenException(
          isKeyError
            ? '许可证密钥无效或已失效，请重新打开应用完成激活 (License key invalid — reload to re-activate).'
            : `许可证验证失败: ${err}`,
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      // LicenseModule not loaded — skip check
    }
    return true;
  }
}
