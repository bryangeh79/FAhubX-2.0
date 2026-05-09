import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type IpPoolStatus = 'active' | 'inactive' | 'depleted' | 'maintenance';
export type IpType = 'static' | 'dynamic' | 'rotating';

@Entity('ip_pools')
export class IpPool {
  @ApiProperty({ description: 'IP池ID', example: 'ip-pool-123456' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ type: 'uuid' })
  @Index('idx_ip_pools_user_id')
  userId: string;

  @ApiProperty({ description: 'IP池名称', example: '美国IP池1' })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ApiProperty({ description: 'IP类型', example: 'rotating', enum: ['static', 'dynamic', 'rotating'] })
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_ip_pools_type')
  ipType: IpType;

  @ApiProperty({ description: 'IP地址范围', example: '192.168.1.0/24' })
  @Column({ type: 'varchar', length: 50 })
  ipRange: string;

  @ApiProperty({ description: '可用IP地址列表', example: ['192.168.1.100', '192.168.1.101'] })
  @Column({ type: 'jsonb' })
  availableIps: string[];

  @ApiProperty({ description: '已分配IP地址列表', example: { 'acc-123': '192.168.1.100' } })
  @Column({ type: 'jsonb', default: {} })
  allocatedIps: Record<string, string>;

  @ApiProperty({ description: '黑名单IP地址列表', example: ['192.168.1.200'], required: false })
  @Column({ type: 'jsonb', nullable: true })
  blacklistedIps: string[];

  @ApiProperty({ description: '总IP数量', example: 100 })
  @Column({ type: 'int' })
  totalIps: number;

  @ApiProperty({ description: '可用IP数量', example: 95 })
  @Column({ type: 'int' })
  availableCount: number;

  @ApiProperty({ description: '已分配IP数量', example: 5 })
  @Column({ type: 'int' })
  allocatedCount: number;

  @ApiProperty({ description: 'IP池状态', example: 'active', enum: ['active', 'inactive', 'depleted', 'maintenance'] })
  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index('idx_ip_pools_status')
  status: IpPoolStatus;

  @ApiProperty({ description: '是否启用', example: true })
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @ApiProperty({ description: '国家/地区', example: 'US' })
  @Column({ type: 'varchar', length: 10 })
  country: string;

  @ApiProperty({ description: '城市', example: 'New York', required: false })
  @Column({ type: 'varchar', length: 50, nullable: true })
  city: string;

  @ApiProperty({ description: 'ISP提供商', example: 'Comcast', required: false })
  @Column({ type: 'varchar', length: 50, nullable: true })
  isp: string;

  @ApiProperty({ description: '轮换间隔(分钟)', example: 30, required: false })
  @Column({ type: 'int', nullable: true })
  rotationInterval: number;

  @ApiProperty({ description: '最后轮换时间', example: '2026-04-12T10:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  lastRotatedAt: Date;

  @ApiProperty({ description: '平均IP质量评分', example: 85, required: false })
  @Column({ type: 'int', nullable: true })
  avgQualityScore: number;

  @ApiProperty({ description: 'IP使用统计', example: { dailyUsage: 50, monthlyUsage: 1500 }, required: false })
  @Column({ type: 'jsonb', default: {} })
  usageStats: Record<string, any>;

  @ApiProperty({ description: '配置参数', example: { maxAllocationsPerAccount: 3, autoRotation: true }, required: false })
  @Column({ type: 'jsonb', default: {} })
  parameters: Record<string, any>;

  @ApiProperty({ description: '关联的VPN配置ID', example: 'vpn-config-123', required: false })
  @Column({ type: 'uuid', nullable: true })
  @Index('idx_ip_pools_vpn_config_id')
  vpnConfigId: string;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:00:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_ip_pools_created_at')
  createdAt: Date;

  @ApiProperty({ description: '更新时间', example: '2026-04-12T10:30:00Z' })
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ApiProperty({ description: '删除时间', example: '2026-04-12T10:30:00Z', required: false })
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date;

  // 方法
  isActive(): boolean {
    return this.status === 'active' && this.enabled && !this.deletedAt;
  }

  hasAvailableIps(): boolean {
    return this.availableCount > 0 && this.isActive();
  }

  allocateIp(accountId: string): string | null {
    if (!this.hasAvailableIps() || this.availableIps.length === 0) {
      return null;
    }

    // 获取一个可用的IP
    const ip = this.availableIps.shift()!;
    
    // 更新分配记录
    this.allocatedIps[accountId] = ip;
    this.allocatedCount += 1;
    this.availableCount -= 1;
    
    // 更新使用统计
    this.updateUsageStats();
    
    this.updatedAt = new Date();
    
    return ip;
  }

  releaseIp(accountId: string): boolean {
    const ip = this.allocatedIps[accountId];
    if (!ip) {
      return false;
    }

    // 检查IP是否在黑名单中
    if (this.blacklistedIps?.includes(ip)) {
      // 黑名单IP不回收
      delete this.allocatedIps[accountId];
      this.allocatedCount -= 1;
      this.updatedAt = new Date();
      return true;
    }

    // 回收IP
    delete this.allocatedIps[accountId];
    this.availableIps.push(ip);
    this.allocatedCount -= 1;
    this.availableCount += 1;
    
    this.updatedAt = new Date();
    
    return true;
  }

  rotateIp(accountId: string): string | null {
    const oldIp = this.allocatedIps[accountId];
    if (!oldIp) {
      return this.allocateIp(accountId);
    }

    // 释放旧IP
    this.releaseIp(accountId);
    
    // 分配新IP
    const newIp = this.allocateIp(accountId);
    
    if (newIp) {
      this.lastRotatedAt = new Date();
      this.updatedAt = new Date();
    }
    
    return newIp;
  }

  addToBlacklist(ip: string): void {
    if (!this.blacklistedIps) {
      this.blacklistedIps = [];
    }
    
    if (!this.blacklistedIps.includes(ip)) {
      this.blacklistedIps.push(ip);
      
      // 从可用IP中移除
      const index = this.availableIps.indexOf(ip);
      if (index > -1) {
        this.availableIps.splice(index, 1);
        this.availableCount -= 1;
      }
      
      // 从已分配IP中移除
      for (const [accId, allocatedIp] of Object.entries(this.allocatedIps)) {
        if (allocatedIp === ip) {
          delete this.allocatedIps[accId];
          this.allocatedCount -= 1;
        }
      }
      
      this.updatedAt = new Date();
    }
  }

  removeFromBlacklist(ip: string): void {
    if (this.blacklistedIps?.includes(ip)) {
      this.blacklistedIps = this.blacklistedIps.filter(i => i !== ip);
      
      // 如果IP在范围内且未被使用，加回可用IP
      if (this.isIpInRange(ip) && !this.isIpAllocated(ip)) {
        this.availableIps.push(ip);
        this.availableCount += 1;
      }
      
      this.updatedAt = new Date();
    }
  }

  isIpInRange(ip: string): boolean {
    // 简化实现，实际应该检查IP是否在范围内
    return this.availableIps.includes(ip) || Object.values(this.allocatedIps).includes(ip);
  }

  isIpAllocated(ip: string): boolean {
    return Object.values(this.allocatedIps).includes(ip);
  }

  updateQualityScore(score: number): void {
    // 更新平均质量评分
    if (!this.avgQualityScore) {
      this.avgQualityScore = score;
    } else {
      this.avgQualityScore = Math.round((this.avgQualityScore * 0.8) + (score * 0.2));
    }
    
    this.updatedAt = new Date();
  }

  private updateUsageStats(): void {
    const today = new Date().toISOString().split('T')[0];
    
    if (!this.usageStats.dailyUsage) {
      this.usageStats.dailyUsage = {};
    }
    
    if (!this.usageStats.dailyUsage[today]) {
      this.usageStats.dailyUsage[today] = 0;
    }
    
    this.usageStats.dailyUsage[today] += 1;
    
    // 更新月度统计
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    if (!this.usageStats.monthlyUsage) {
      this.usageStats.monthlyUsage = {};
    }
    
    if (!this.usageStats.monthlyUsage[month]) {
      this.usageStats.monthlyUsage[month] = 0;
    }
    
    this.usageStats.monthlyUsage[month] += 1;
  }

  getUtilizationRate(): number {
    if (this.totalIps === 0) return 0;
    return (this.allocatedCount / this.totalIps) * 100;
  }

  needsRotation(): boolean {
    if (!this.rotationInterval || this.ipType !== 'rotating') {
      return false;
    }
    
    if (!this.lastRotatedAt) {
      return true;
    }
    
    const timeSinceLastRotation = Date.now() - this.lastRotatedAt.getTime();
    return timeSinceLastRotation >= this.rotationInterval * 60 * 1000;
  }

  getPoolSummary(): string {
    return `${this.name} (${this.ipType} - ${this.country}) - ${this.allocatedCount}/${this.totalIps} 已分配 (${this.getUtilizationRate().toFixed(1)}%)`;
  }
}