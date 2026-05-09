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

export type VpnProtocol = 'openvpn' | 'wireguard' | 'ikev2' | 'l2tp';
export type VpnStatus = 'active' | 'inactive' | 'error' | 'testing';

@Entity('vpn_configs')
export class VpnConfig {
  @ApiProperty({ description: '配置ID', example: 'vpn-config-123456' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @Column({ type: 'uuid' })
  @Index('idx_vpn_configs_user_id')
  userId: string;

  @ApiProperty({ description: '配置名称', example: '美国节点1' })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ApiProperty({ description: 'VPN协议', example: 'openvpn', enum: ['openvpn', 'wireguard', 'ikev2', 'l2tp'] })
  @Column({ type: 'varchar', length: 20 })
  @Index('idx_vpn_configs_protocol')
  protocol: VpnProtocol;

  @ApiProperty({ description: '服务器地址', example: 'vpn.example.com' })
  @Column({ type: 'varchar', length: 255 })
  server: string;

  @ApiProperty({ description: '服务器端口', example: 1194 })
  @Column({ type: 'int' })
  port: number;

  @ApiProperty({ description: '用户名', example: 'vpn_user' })
  @Column({ type: 'varchar', length: 100 })
  username: string;

  @ApiProperty({ description: '密码', example: 'encrypted_password' })
  @Column({ type: 'text' })
  password: string;

  @ApiProperty({ description: '配置文件内容', example: 'client\ndev tun\nproto udp\n...' })
  @Column({ type: 'text', nullable: true })
  configFile: string;

  @ApiProperty({ description: 'CA证书', example: '-----BEGIN CERTIFICATE-----\n...', required: false })
  @Column({ type: 'text', nullable: true })
  caCert: string;

  @ApiProperty({ description: '客户端证书', example: '-----BEGIN CERTIFICATE-----\n...', required: false })
  @Column({ type: 'text', nullable: true })
  clientCert: string;

  @ApiProperty({ description: '客户端密钥', example: '-----BEGIN PRIVATE KEY-----\n...', required: false })
  @Column({ type: 'text', nullable: true })
  clientKey: string;

  @ApiProperty({ description: 'WireGuard公钥', example: 'base64_public_key', required: false })
  @Column({ type: 'text', nullable: true })
  publicKey: string;

  @ApiProperty({ description: 'WireGuard私钥', example: 'base64_private_key', required: false })
  @Column({ type: 'text', nullable: true })
  privateKey: string;

  @ApiProperty({ description: 'WireGuard端点', example: '198.51.100.1:51820', required: false })
  @Column({ type: 'varchar', length: 100, nullable: true })
  endpoint: string;

  @ApiProperty({ description: '允许的IP地址', example: '0.0.0.0/0', required: false })
  @Column({ type: 'text', nullable: true })
  allowedIps: string;

  @ApiProperty({ description: 'DNS服务器', example: '8.8.8.8,8.8.4.4', required: false })
  @Column({ type: 'varchar', length: 100, nullable: true })
  dns: string;

  @ApiProperty({ description: '出口IP地址', example: '103.12.34.56', required: false })
  @Column({ type: 'varchar', length: 50, nullable: true })
  ipAddress: string;

  @ApiProperty({ description: '国家/地区', example: 'US' })
  @Column({ type: 'varchar', length: 10 })
  country: string;

  @ApiProperty({ description: '城市', example: 'New York', required: false })
  @Column({ type: 'varchar', length: 50, nullable: true })
  city: string;

  @ApiProperty({ description: '提供商', example: 'NordVPN', required: false })
  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string;

  @ApiProperty({ description: '连接状态', example: 'active', enum: ['active', 'inactive', 'error', 'testing'] })
  @Column({ type: 'varchar', length: 20, default: 'inactive' })
  @Index('idx_vpn_configs_status')
  status: VpnStatus;

  @ApiProperty({ description: '是否启用', example: true })
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @ApiProperty({ description: '是否默认配置', example: false })
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @ApiProperty({ description: '连接质量评分', example: 85, required: false })
  @Column({ type: 'int', nullable: true })
  qualityScore: number;

  @ApiProperty({ description: '最后连接时间', example: '2026-04-12T10:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  lastConnectedAt: Date;

  @ApiProperty({ description: '最后测试时间', example: '2026-04-12T10:30:00Z', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  lastTestedAt: Date;

  @ApiProperty({ description: '平均连接时间(毫秒)', example: 1500, required: false })
  @Column({ type: 'int', nullable: true })
  avgConnectTime: number;

  @ApiProperty({ description: '成功率', example: 0.95, required: false })
  @Column({ type: 'float', nullable: true })
  successRate: number;

  @ApiProperty({ description: '带宽限制(Mbps)', example: 100, required: false })
  @Column({ type: 'int', nullable: true })
  bandwidthLimit: number;

  @ApiProperty({ description: '并发连接数限制', example: 5, required: false })
  @Column({ type: 'int', nullable: true })
  concurrentLimit: number;

  @ApiProperty({ description: '配置参数', example: { compression: true, cipher: 'AES-256-GCM' }, required: false })
  @Column({ type: 'jsonb', default: {} })
  parameters: Record<string, any>;

  @ApiProperty({ description: '元数据', example: { latency: 50, jitter: 10 }, required: false })
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ApiProperty({ description: '创建时间', example: '2026-04-12T10:00:00Z' })
  @CreateDateColumn({ type: 'timestamptz' })
  @Index('idx_vpn_configs_created_at')
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

  canConnect(): boolean {
    return this.enabled && !this.deletedAt;
  }

  updateQualityScore(score: number): void {
    this.qualityScore = score;
    this.lastTestedAt = new Date();
    this.updatedAt = new Date();
  }

  recordConnection(success: boolean, connectTime?: number): void {
    if (success) {
      this.status = 'active';
      this.lastConnectedAt = new Date();
      
      if (connectTime) {
        // 更新平均连接时间
        if (!this.avgConnectTime) {
          this.avgConnectTime = connectTime;
        } else {
          this.avgConnectTime = Math.round((this.avgConnectTime * 0.7) + (connectTime * 0.3));
        }
      }
    } else {
      this.status = 'error';
    }

    // 更新成功率
    const totalTests = (this.metadata?.totalTests || 0) + 1;
    const successfulTests = (this.metadata?.successfulTests || 0) + (success ? 1 : 0);
    
    this.metadata = {
      ...this.metadata,
      totalTests,
      successfulTests,
    };
    
    this.successRate = successfulTests / totalTests;
    this.updatedAt = new Date();
  }

  getConnectionString(): string {
    switch (this.protocol) {
      case 'openvpn':
        return `${this.protocol}://${this.server}:${this.port}`;
      case 'wireguard':
        return `${this.protocol}://${this.endpoint}`;
      case 'ikev2':
      case 'l2tp':
        return `${this.protocol}://${this.server}`;
      default:
        return `${this.server}:${this.port}`;
    }
  }

  getConfigSummary(): string {
    return `${this.name} (${this.protocol} @ ${this.server}:${this.port}) - ${this.country}`;
  }

  encryptSensitiveData(): void {
    // 这里应该实现加密逻辑
    // 暂时留空，实际应用中应该加密敏感数据
  }

  decryptSensitiveData(): void {
    // 这里应该实现解密逻辑
    // 暂时留空，实际应用中应该解密敏感数据
  }
}