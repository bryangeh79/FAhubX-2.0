import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';

/**
 * SubscriptionGuard — 订阅/许可证过期校验（双模式）
 *
 * Cloud 模式：查数据库 users.subscriptionExpiry
 * Local 模式：查 LicenseService 缓存状态
 *
 * 用于写操作端点（创建账号、执行任务等）。
 * 到期后用户仍可登录查看数据，但不能执行任何写操作。
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const deployMode = process.env.DEPLOY_MODE || 'cloud';

    // ── Local 模式：检查 License 有效性 ──────────────────────────────────
    if (deployMode === 'local') {
      try {
        // 动态获取 LicenseService（避免 cloud 模式下的循环依赖）
        const { LicenseService } = await import('../../modules/license/license.service');
        const licenseService = this.moduleRef.get(LicenseService, { strict: false });
        if (licenseService && !licenseService.isValid()) {
          throw new ForbiddenException(
            licenseService.getError() || '许可证无效或已过期，请联系管理员。',
          );
        }
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        // LicenseModule not loaded — skip check
      }
      return true;
    }

    // ── Cloud 模式：查数据库（现有逻辑不变）─────────────────────────────
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;

    if (!userId) return true;
    if (request.user?.role === 'admin') return true;

    const [user] = await this.dataSource.query(
      `SELECT "subscriptionExpiry", role, status FROM users WHERE id = $1`,
      [userId],
    );

    if (!user) return true;
    if (user.role === 'admin') return true;
    if (!user.subscriptionExpiry) return true;

    if (new Date(user.subscriptionExpiry) < new Date()) {
      throw new ForbiddenException('订阅已过期，请联系管理员续期。您仍可查看现有数据，但无法执行操作。');
    }

    return true;
  }
}
