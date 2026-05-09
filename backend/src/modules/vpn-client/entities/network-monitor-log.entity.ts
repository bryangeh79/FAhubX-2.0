import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { VPNConfig } from './vpn-config.entity';
import { IPPool } from './ip-pool.entity';

export enum MetricType {
  LATENCY = 'latency',
  BANDWIDTH = 'bandwidth',
  PACKET_LOSS = 'packet_loss',
  CONNECTION_STATUS = 'connection_status',
  HEALTH_SCORE = 'health_score',
  ERROR = 'error',
}

export enum MetricStatus {
  NORMAL = 'normal',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

@Entity('network_monitor_logs')
export class NetworkMonitorLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => VPNConfig)
  @JoinColumn({ name: 'vpn_config_id' })
  vpnConfig: VPNConfig;

  @Column({ name: 'vpn_config_id', nullable: true })
  vpnConfigId: string;

  @ManyToOne(() => IPPool)
  @JoinColumn({ name: 'ip_pool_id' })
  ipPool: IPPool;

  @Column({ name: 'ip_pool_id', nullable: true })
  ipPoolId: string;

  @Column({ type: 'uuid', nullable: true })
  accountId: string;

  @Column({ type: 'enum', enum: MetricType })
  metricType: MetricType;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  metricValue: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unit: string;

  @Column({ 
    type: 'enum', 
    enum: MetricStatus,
    nullable: true 
  })
  status: MetricStatus;

  @Column({ type: 'jsonb', nullable: true })
  details: any;

  @CreateDateColumn()
  createdAt: Date;
}