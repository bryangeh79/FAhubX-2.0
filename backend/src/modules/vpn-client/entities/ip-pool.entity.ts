import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { VPNConfig } from './vpn-config.entity';

export enum IPType {
  RESIDENTIAL = 'residential',
  DATACENTER = 'datacenter',
  MOBILE = 'mobile',
  SHARED = 'shared',
}

export enum IPStatus {
  AVAILABLE = 'available',
  ASSIGNED = 'assigned',
  RESERVED = 'reserved',
  BLOCKED = 'blocked',
}

@Entity('ip_pools')
export class IPPool {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => VPNConfig, (vpnConfig) => vpnConfig.ipPools)
  @JoinColumn({ name: 'vpn_config_id' })
  vpnConfig: VPNConfig;

  @Column({ name: 'vpn_config_id' })
  vpnConfigId: string;

  @Column({ type: 'inet' })
  ipAddress: string;

  @Column({ type: 'int', nullable: true })
  port: number;

  @Column({ type: 'enum', enum: IPType, nullable: true })
  type: IPType;

  @Column({ type: 'varchar', length: 2, nullable: true })
  countryCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  isp: string;

  @Column({ 
    type: 'enum', 
    enum: IPStatus, 
    default: IPStatus.AVAILABLE 
  })
  status: IPStatus;

  @Column({ type: 'uuid', nullable: true })
  assignedTo: string;

  @Column({ type: 'int', default: 100 })
  healthScore: number;

  @Column({ type: 'timestamp', nullable: true })
  lastHealthCheck: Date;

  @Column({ type: 'int', default: 0 })
  totalConnections: number;

  @Column({ type: 'interval', default: '0 seconds' })
  totalDuration: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  averageLatency: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  packetLoss: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  bandwidth: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}