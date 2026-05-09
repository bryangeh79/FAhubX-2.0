import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { IPPool } from './ip-pool.entity';

export enum VPNType {
  OPENVPN = 'openvpn',
  WIREGUARD = 'wireguard',
  PROXY = 'proxy',
}

export enum VPNStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
}

@Entity('vpn_configs')
export class VPNConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'enum', enum: VPNType })
  type: VPNType;

  @Column({ type: 'jsonb' })
  config: any;

  @Column({ 
    type: 'enum', 
    enum: VPNStatus, 
    default: VPNStatus.INACTIVE 
  })
  status: VPNStatus;

  @Column({ type: 'int', default: 100 })
  healthScore: number;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  serverLocation: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  countryCode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider: string;

  @Column({ type: 'int', default: 0 })
  totalConnections: number;

  @Column({ type: 'interval', default: '0 seconds' })
  totalDuration: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  averageLatency: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  successRate: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @OneToMany(() => IPPool, (ipPool) => ipPool.vpnConfig)
  ipPools: IPPool[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}