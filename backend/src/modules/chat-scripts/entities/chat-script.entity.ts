import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export interface ScriptPhase {
  label: string;
  sender?: 'A' | 'B';   // 发送方：A=发起方账号，B=回应方账号（不填则按奇偶交替）
  messages: string[];
}

@Entity('chat_scripts')
export class ChatScript {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  scriptNumber: number;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'text', nullable: true })
  goal: string;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string;

  @Column({ type: 'jsonb', default: [] })
  phases: ScriptPhase[];

  @Column({ type: 'varchar', length: 20, default: '推广' })
  category: string;

  // 语言标识：zh（中文，默认）/ en（英文）/ vi（越南语）
  // 按需下载的剧本包导入时填对应语言；现有 zh 剧本不受影响
  @Column({ type: 'varchar', length: 10, default: 'zh' })
  language: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
