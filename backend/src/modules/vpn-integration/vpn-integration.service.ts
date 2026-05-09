import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VpnConfig, VpnStatus } from './entities/vpn-config.entity';
import { IpPool, IpPoolStatus } from './entities/ip-pool.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class VpnIntegrationService {
  private readonly logger = new Logger(VpnIntegrationService.name);

  constructor(
    @InjectRepository(VpnConfig)
    private readonly vpnConfigRepository: Repository<VpnConfig>,
    @InjectRepository(IpPool)
    private readonly ipPoolRepository: Repository<IpPool>,
    @InjectRepository(FacebookAccount)
    private readonly facebookAccountRepository: Repository<FacebookAccount>,
  ) {}

  /**
   * 获取用户的所有VPN配置
   */
  async getUserVpnConfigs(userId: string): Promise<VpnConfig[]> {
    return this.vpnConfigRepository.find({
      where: { userId, deletedAt: null },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * 获取用户的所有IP地址池
   */
  async getUserIpPools(userId: string): Promise<IpPool[]> {
    return this.ipPoolRepository.find({
      where: { userId, deletedAt: null },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 为账号分配IP地址
   */
  async allocateIpForAccount(
    userId: string,
    accountId: string,
    ipPoolId?: string,
  ): Promise<{ success: boolean; ip?: string; error?: string }> {
    try {
      const account = await this.facebookAccountRepository.findOne({
        where: { id: accountId, userId },
      });

      if (!account) {
        return { success: false, error: '账号不存在' };
      }

      // 查找可用的IP地址池
      let ipPool: IpPool | null = null;
      
      if (ipPoolId) {
        ipPool = await this.ipPoolRepository.findOne({
          where: { id: ipPoolId, userId, deletedAt: null },
        });
      } else {
        // 查找用户默认或可用的IP池
        const pools = await this.ipPoolRepository.find({
          where: { userId, status: 'active', deletedAt: null },
          order: { avgQualityScore: 'DESC' },
        });

        for (const pool of pools) {
          if (pool.hasAvailableIps()) {
            ipPool = pool;
            break;
          }
        }
      }

      if (!ipPool) {
        return { success: false, error: '无可用IP地址池' };
      }

      if (!ipPool.hasAvailableIps()) {
        return { success: false, error: 'IP地址池已耗尽' };
      }

      // 分配IP地址
      const ip = ipPool.allocateIp(accountId);
      if (!ip) {
        return { success: false, error: 'IP地址分配失败' };
      }

      await this.ipPoolRepository.save(ipPool);

      // 更新账号的IP信息
      account.currentIp = ip;
      account.ipPoolId = ipPool.id;
      account.networkQuality = ipPool.avgQualityScore || 80;
      await this.facebookAccountRepository.save(account);

      this.logger.log(`为账号 ${accountId} 分配IP地址: ${ip}, 来自IP池: ${ipPool.name}`);

      return { success: true, ip };

    } catch (error) {
      this.logger.error(`分配IP地址失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 轮换账号的IP地址
   */
  async rotateIpForAccount(
    userId: string,
    accountId: string,
  ): Promise<{ success: boolean; newIp?: string; error?: string }> {
    try {
      const account = await this.facebookAccountRepository.findOne({
        where: { id: accountId, userId },
      });

      if (!account) {
        return { success: false, error: '账号不存在' };
      }

      if (!account.ipPoolId) {
        return { success: false, error: '账号未分配IP地址池' };
      }

      const ipPool = await this.ipPoolRepository.findOne({
        where: { id: account.ipPoolId, userId, deletedAt: null },
      });

      if (!ipPool) {
        return { success: false, error: 'IP地址池不存在' };
      }

      if (ipPool.ipType !== 'rotating') {
        return { success: false, error: 'IP地址池不支持轮换' };
      }

      // 轮换IP地址
      const newIp = ipPool.rotateIp(accountId);
      if (!newIp) {
        return { success: false, error: 'IP地址轮换失败' };
      }

      await this.ipPoolRepository.save(ipPool);

      // 更新账号的IP信息
      const oldIp = account.currentIp;
      account.currentIp = newIp;
      account.networkQuality = ipPool.avgQualityScore || 80;
      await this.facebookAccountRepository.save(account);

      this.logger.log(`账号 ${accountId} IP地址轮换: ${oldIp} -> ${newIp}`);

      return { success: true, newIp };

    } catch (error) {
      this.logger.error(`轮换IP地址失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 测试VPN连接
   */
  async testVpnConnection(
    userId: string,
    vpnConfigId: string,
  ): Promise<{ success: boolean; latency?: number; error?: string }> {
    try {
      const vpnConfig = await this.vpnConfigRepository.findOne({
        where: { id: vpnConfigId, userId, deletedAt: null },
      });

      if (!vpnConfig) {
        return { success: false, error: 'VPN配置不存在' };
      }

      // 模拟VPN连接测试
      await new Promise(resolve => setTimeout(resolve, 2000));

      const success = Math.random() > 0.2; // 80%成功率
      const latency = Math.random() * 100 + 50; // 50-150ms

      if (success) {
        vpnConfig.status = 'active';
        vpnConfig.lastTestedAt = new Date();
        vpnConfig.qualityScore = Math.max(0, 100 - latency);
        vpnConfig.recordConnection(true, 2000);
        await this.vpnConfigRepository.save(vpnConfig);

        this.logger.log(`VPN连接测试成功: ${vpnConfig.name}, 延迟: ${latency.toFixed(1)}ms`);

        return { success: true, latency };
      } else {
        vpnConfig.status = 'error';
        vpnConfig.lastTestedAt = new Date();
        vpnConfig.recordConnection(false);
        await this.vpnConfigRepository.save(vpnConfig);

        this.logger.warn(`VPN连接测试失败: ${vpnConfig.name}`);

        return { success: false, error: '连接测试失败' };
      }

    } catch (error) {
      this.logger.error(`VPN连接测试异常: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 定时IP地址轮换任务
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledIpRotation(): Promise<void> {
    this.logger.log('开始定时IP地址轮换');

    try {
      // 查找需要轮换的账号
      const accounts = await this.facebookAccountRepository.find({
        where: {
          status: 'active',
          ipPoolId: { $not: null } as any,
          deletedAt: null,
        },
        take: 10, // 最多10个账号
      });

      if (accounts.length === 0) {
        return;
      }

      let rotatedCount = 0;

      for (const account of accounts) {
        const ipPool = await this.ipPoolRepository.findOne({
          where: { id: account.ipPoolId, deletedAt: null },
        });

        if (ipPool && ipPool.needsRotation()) {
          const result = await this.rotateIpForAccount(account.userId, account.id);
          if (result.success) {
            rotatedCount++;
          }
        }
      }

      if (rotatedCount > 0) {
        this.logger.log(`定时IP地址轮换完成，轮换了 ${rotatedCount} 个账号`);
      }

    } catch (error) {
      this.logger.error(`定时IP地址轮换失败: ${error.message}`);
    }
  }

  /**
   * 定时VPN连接测试
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledVpnTest(): Promise<void> {
    this.logger.log('开始定时VPN连接测试');

    try {
      // 查找活跃的VPN配置
      const vpnConfigs = await this.vpnConfigRepository.find({
        where: {
          enabled: true,
          deletedAt: null,
        },
        take: 5, // 最多测试5个配置
      });

      if (vpnConfigs.length === 0) {
        return;
      }

      let testedCount = 0;
      let successCount = 0;

      for (const vpnConfig of vpnConfigs) {
        const result = await this.testVpnConnection(vpnConfig.userId, vpnConfig.id);
        testedCount++;
        if (result.success) {
          successCount++;
        }
      }

      this.logger.log(`定时VPN连接测试完成，测试了 ${testedCount} 个配置，成功 ${successCount} 个`);

    } catch (error) {
      this.logger.error(`定时VPN连接测试失败: ${error.message}`);
    }
  }

  /**
   * 获取网络状态概览
   */
  async getNetworkOverview(userId: string): Promise<{
    vpnConfigs: { total: number; active: number; error: number };
    ipPools: { total: number; active: number; depleted: number };
    accounts: { total: number; withIp: number; withoutIp: number };
    avgNetworkQuality: number;
  }> {
    const vpnConfigs = await this.vpnConfigRepository.find({
      where: { userId, deletedAt: null },
    });

    const ipPools = await this.ipPoolRepository.find({
      where: { userId, deletedAt: null },
    });

    const accounts = await this.facebookAccountRepository.find({
      where: { userId, deletedAt: null },
    });

    const vpnStats = {
      total: vpnConfigs.length,
      active: vpnConfigs.filter(c => c.status === 'active').length,
      error: vpnConfigs.filter(c => c.status === 'error').length,
    };

    const ipPoolStats = {
      total: ipPools.length,
      active: ipPools.filter(p => p.status === 'active').length,
      depleted: ipPools.filter(p => p.status === 'depleted').length,
    };

    const accountStats = {
      total: accounts.length,
      withIp: accounts.filter(a => a.currentIp).length,
      withoutIp: accounts.filter(a => !a.currentIp).length,
    };

    // 计算平均网络质量
    const accountsWithQuality = accounts.filter(a => a.networkQuality);
    const avgNetworkQuality = accountsWithQuality.length > 0
      ? accountsWithQuality.reduce((sum, a) => sum + (a.networkQuality || 0), 0) / accountsWithQuality.length
      : 0;

    return {
      vpnConfigs: vpnStats,
      ipPools: ipPoolStats,
      accounts: accountStats,
      avgNetworkQuality: Math.round(avgNetworkQuality),
    };
  }
}