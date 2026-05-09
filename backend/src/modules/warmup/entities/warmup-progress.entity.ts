import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * v1.3.0 Phase — 账号暖化进度（重构版）
 *
 * 每个账号的每个暖化任务对应一行。和 tasks 表的父任务 1:1 关联（通过 taskId）。
 * 账号被「退役」后保留记录但 status='retired'。
 */
export type PackageMode = 'P1' | 'P2' | 'P1+P2' | 'P3';

@Entity('warmup_progress')
export class WarmupProgress {
  @ApiProperty({ description: '进度ID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: '用户ID' })
  @Column({ type: 'uuid' })
  @Index('idx_warmup_progress_user_id')
  userId: string;

  @ApiProperty({ description: '账号ID（facebook_accounts.id）' })
  @Column({ type: 'uuid', unique: true })
  @Index('idx_warmup_progress_account_id')
  accountId: string;

  @ApiProperty({ description: '关联的父任务 ID（tasks.id）' })
  @Column({ type: 'uuid', nullable: true })
  @Index('idx_warmup_progress_task_id')
  taskId: string | null;

  @ApiProperty({ description: '暖化包模式', enum: ['P1', 'P2', 'P1+P2', 'P3'] })
  @Column({ type: 'varchar', length: 10, default: 'P1+P2', name: 'packageMode' })
  packageMode: PackageMode;

  @ApiProperty({ description: '暖化开始时间 = Day 1 00:00' })
  @Column({ type: 'timestamptz', name: 'startedAt' })
  startedAt: Date;

  @ApiProperty({ description: '状态', enum: ['active', 'retired'] })
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'retired';

  @ApiProperty({ description: '上次触发窗口的日期+窗口编号（YYYY-MM-DD:W，防止同窗口重复触发）' })
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'lastFiredWindow' })
  lastFiredWindow: string | null;

  @ApiProperty({ description: '上次调度器检查此账号的时间' })
  @Column({ type: 'timestamptz', nullable: true, name: 'lastCheckedAt' })
  lastCheckedAt: Date | null;

  @ApiProperty({ description: '今日错过的窗口数' })
  @Column({ type: 'int', default: 0, name: 'missedToday' })
  missedToday: number;

  @ApiProperty({ description: '今日统计对应的日期（YYYY-MM-DD）' })
  @Column({ type: 'varchar', length: 10, nullable: true, name: 'missedDateKey' })
  missedDateKey: string | null;

  @ApiProperty({ description: '累计错过窗口数' })
  @Column({ type: 'int', default: 0, name: 'missedTotal' })
  missedTotal: number;

  @ApiProperty({ description: '累计成功触发的窗口数' })
  @Column({ type: 'int', default: 0, name: 'firedTotal' })
  firedTotal: number;

  @ApiProperty({ description: '退役时间' })
  @Column({ type: 'timestamptz', nullable: true, name: 'retiredAt' })
  retiredAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
