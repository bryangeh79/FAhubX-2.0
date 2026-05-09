import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { VPNConfig } from './vpn-config.entity';
import { IPPool } from './ip-pool.entity';

export enum ConnectionType {
  FIXED = 'fixed',
  ROTATING = 'rotating',
  ON_DEMAND = 'on_demand',
}

export enum ConnectionStatus {
  ACTIVE = 'active',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

@Entity('account_ip_mappings')
export class AccountIPMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => IPPool)
  @JoinColumn({ name: 'ip_pool_id' })
  ipPool: IPPool;

  @Column({ name: 'ip_pool_id' })
  ipPoolId: string;

  @ManyToOne(() => VPNConfig)
  @JoinColumn({ name: 'vpn_config_id' })
  vpnConfig: VPNConfig;

  @Column({ name: 'vpn_config_id' })
  vpnConfigId: string;

  @Column({ 
    type: 'enum', 
    enum: ConnectionType 
  })
  connectionType: ConnectionType;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime: Date;

  @Column({ 
    type: 'enum', 
    enum: ConnectionStatus, 
    default: ConnectionStatus.ACTIVE 
  })
  status: ConnectionStatus;

  @Column({ type: 'jsonb', nullable: true })
  connectionStats: any;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  currentLatency: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  currentPacketLoss: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  currentBandwidth: number;

  @Column({ type: 'int', default: 0 })
  dataTransferred: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}