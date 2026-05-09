import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WarmupProgress } from './entities/warmup-progress.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { Task, TaskStatus, TaskType } from '../task-scheduler/entities/task.entity';
import {
  findActiveWindow,
  findJustMissedWindow,
  getPackageInfo,
  getWarmupWindowHours,
  getWarmupWindowMinutes,
  isAccountTurnInWindow,
  localDateKey,
  pickWarmupActions,
  PackageInfo,
  PackageMode,
  WarmupAction,
} from './warmup-windows.util';
import { AccountWarmingService } from '../task-executor/integrations/account-warming.service';
import { FacebookChatService } from '../task-executor/integrations/facebook-chat.service';
import { FacebookPostService } from '../task-executor/integrations/facebook-post.service';
import { FacebookSocialService } from '../task-executor/integrations/facebook-social.service';
import { FacebookGroupJoinService } from '../task-executor/integrations/facebook-group-join.service';
import { SimpleTasksService, appendLog } from '../simple-tasks/simple-tasks.service';

const MISSED_RED_THRESHOLD = 6;

/**
 * v1.3.0 —— 暖化调度服务（重构版）
 *
 * 核心变化 vs v1.2.x：
 * 1. 不再为每个窗口创建新任务 —— 一个养号任务 = 一行（父任务），窗口动作的日志 append 进去
 * 2. 4 种 packageMode：P1 / P2 / P1+P2 / P3
 * 3. P1 或 P2 跑完自动转 P3（不让账号掉落到"暖化结束"真空期）
 * 4. 调度器直接调用 action services 执行，不走 task-auto-runner
 */
@Injectable()
export class WarmupService implements OnModuleInit {
  private readonly logger = new Logger(WarmupService.name);
  private tickInFlight = false;

  constructor(
    @InjectRepository(WarmupProgress)
    private readonly progressRepo: Repository<WarmupProgress>,
    @InjectRepository(FacebookAccount)
    private readonly accountRepo: Repository<FacebookAccount>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    // Action executors
    private readonly warmingService: AccountWarmingService,
    private readonly chatService: FacebookChatService,
    private readonly postService: FacebookPostService,
    private readonly socialService: FacebookSocialService,
    private readonly groupJoinService: FacebookGroupJoinService,
    private readonly simpleTasksService: SimpleTasksService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // 幂等 schema ensure —— 只建不删，升级自动加新列
      // 首次创建
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS warmup_progress (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" UUID NOT NULL,
          "accountId" UUID NOT NULL UNIQUE,
          "startedAt" TIMESTAMPTZ NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          "lastFiredWindow" VARCHAR(20),
          "lastCheckedAt" TIMESTAMPTZ,
          "missedToday" INT NOT NULL DEFAULT 0,
          "missedDateKey" VARCHAR(10),
          "missedTotal" INT NOT NULL DEFAULT 0,
          "firedTotal" INT NOT NULL DEFAULT 0,
          "retiredAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      // v1.3.0 新增字段（老 schema 升级兼容）
      await this.dataSource.query(`ALTER TABLE warmup_progress ADD COLUMN IF NOT EXISTS "taskId" UUID`);
      await this.dataSource.query(`ALTER TABLE warmup_progress ADD COLUMN IF NOT EXISTS "packageMode" VARCHAR(10) NOT NULL DEFAULT 'P1+P2'`);
      await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_warmup_progress_user_id ON warmup_progress ("userId")`);
      await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_warmup_progress_task_id ON warmup_progress ("taskId")`);
      await this.dataSource.query(`CREATE INDEX IF NOT EXISTS idx_warmup_progress_status ON warmup_progress (status)`);

      // 启动时自动清理孤儿 auto_warmup 任务 ——
      // 这些任务没有关联的 warmup_progress 记录（通常是旧版事务 bug 留下的残留）。
      // 打印到日志让运维知道。
      const orphans = await this.dataSource.query(`
        SELECT id, name FROM tasks
         WHERE "taskAction" = 'auto_warmup'
           AND status = 'running'
           AND id NOT IN (SELECT "taskId" FROM warmup_progress WHERE "taskId" IS NOT NULL)
      `);
      if (orphans.length > 0) {
        await this.dataSource.query(`
          UPDATE tasks
             SET status = 'cancelled',
                 "completedAt" = NOW(),
                 result = '{"success": false, "error": "孤儿养号任务，无关联的 warmup_progress 记录，启动时自动清理"}'::jsonb
           WHERE "taskAction" = 'auto_warmup'
             AND status = 'running'
             AND id NOT IN (SELECT "taskId" FROM warmup_progress WHERE "taskId" IS NOT NULL)
        `);
        this.logger.warn(`🧹 清理了 ${orphans.length} 个孤儿养号任务：${orphans.map((o: any) => o.name).join(', ')}`);
      }

      this.logger.log('✅ warmup_progress schema ensured (idempotent)');
    } catch (err: any) {
      this.logger.error(`warmup schema init failed: ${err.message}`);
    }
  }

  // ─── 对外 API ────────────────────────────────────────────────────

  /**
   * 启动单账号暖化：创建父任务 + warmup_progress
   */
  async startWarmup(
    userId: string,
    accountId: string,
    packageMode: PackageMode = 'P1+P2',
  ): Promise<{ progress: WarmupProgress; task: Task }> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException(`账号 ${accountId} 不存在`);
    if (account.warmupGroupNumber == null) {
      throw new BadRequestException('账号尚未分配分组，请先设置分组');
    }

    // 检查是否已经有 active 暖化
    const existing = await this.progressRepo.findOne({ where: { accountId } });
    if (existing && existing.status === 'active') {
      throw new BadRequestException(`账号 #${account.accountNumber} 已在暖化中`);
    }

    const accountTag = account.accountNumber != null
      ? `#${String(account.accountNumber).padStart(2, '0')}`
      : account.email ?? accountId.slice(0, 8);

    const packageLabel = this.getPackageLabel(packageMode);

    // ── 事务包裹：task + progress 要么都成，要么都回滚，避免孤儿任务 ──
    const result = await this.dataSource.transaction(async (manager) => {
      // 先删旧的 retired 记录（accountId UNIQUE 约束）
      if (existing) {
        await manager.delete(WarmupProgress, { id: existing.id });
      }

      // 1. 创建父任务
      const task = manager.create(Task, {
        name: `[养号] ${accountTag} ${packageLabel}`,
        description: `自动养号任务 · ${packageLabel} · G${account.warmupGroupNumber}`,
        type: TaskType.IMMEDIATE,
        status: TaskStatus.RUNNING,
        userId,
        taskAction: 'auto_warmup',
        accountId: account.id,
        executionData: {
          scriptId: 'auto_warmup',
          scriptType: 'browser',
          targets: [],
          parameters: {
            taskAction: 'auto_warmup',
            accountAId: account.id,
            accountName: accountTag,
            packageMode,
            groupNumber: account.warmupGroupNumber,
          },
        },
        priority: 3,
        maxRetries: 0,
        timeoutMinutes: 20160,
        scheduledAt: new Date(),
      } as Partial<Task>);
      const savedTask = await manager.save(task);

      // 2. 创建 warmup_progress
      const progress = manager.create(WarmupProgress, {
        userId,
        accountId,
        taskId: savedTask.id,
        packageMode,
        startedAt: new Date(),
        status: 'active',
      });
      const savedProgress = await manager.save(progress);

      return { task: savedTask, progress: savedProgress };
    });

    // 初始日志（事务外，不影响）
    appendLog(result.task.id, 'info',
      `🌱 养号启动 · ${packageLabel} · 账号 ${accountTag} (G${account.warmupGroupNumber}) · Day 1 开始`);

    return { progress: result.progress, task: result.task };
  }

  /**
   * 批量启动（按多个账号或整组）
   */
  async startWarmupBatch(
    userId: string,
    params: {
      accountIds?: string[];
      groupNumber?: number; // 或整组启动
      packageMode: PackageMode;
    },
  ): Promise<{
    started: Array<{ accountId: string; accountNumber: number | null; taskId: string }>;
    skipped: Array<{ accountId: string; accountNumber: number | null; reason: string }>;
  }> {
    let accountIds = params.accountIds ?? [];
    if (params.groupNumber != null) {
      // 查该组所有账号
      const accounts = await this.accountRepo.find({
        where: { userId, warmupGroupNumber: params.groupNumber },
      });
      accountIds = accounts.map(a => a.id);
    }
    if (accountIds.length === 0) {
      throw new BadRequestException('未提供任何账号');
    }

    const started: any[] = [];
    const skipped: any[] = [];
    for (const accountId of accountIds) {
      try {
        const r = await this.startWarmup(userId, accountId, params.packageMode);
        const acc = await this.accountRepo.findOne({ where: { id: accountId } });
        started.push({
          accountId,
          accountNumber: acc?.accountNumber ?? null,
          taskId: r.task.id,
        });
      } catch (err: any) {
        const acc = await this.accountRepo.findOne({ where: { id: accountId } });
        skipped.push({
          accountId,
          accountNumber: acc?.accountNumber ?? null,
          reason: err.message || '未知错误',
        });
      }
    }
    return { started, skipped };
  }

  async retireWarmup(userId: string, accountId: string): Promise<WarmupProgress> {
    const p = await this.progressRepo.findOne({ where: { accountId, userId } });
    if (!p) throw new NotFoundException(`账号尚未启动暖化`);
    p.status = 'retired';
    p.retiredAt = new Date();
    const saved = await this.progressRepo.save(p);
    // 父任务标记为已取消
    if (p.taskId) {
      await this.taskRepo.update(
        { id: p.taskId },
        {
          status: TaskStatus.CANCELLED as any,
          completedAt: new Date(),
          result: { success: false, error: '用户手动退役' } as any,
        } as any,
      );
      appendLog(p.taskId, 'warn', '⏹ 用户手动退役此账号，暖化已停止');
      await this.simpleTasksService.persistLogsToDb(p.taskId).catch(() => {});
    }
    return saved;
  }

  async resumeWarmup(userId: string, accountId: string): Promise<WarmupProgress> {
    const p = await this.progressRepo.findOne({ where: { accountId, userId } });
    if (!p) throw new NotFoundException(`账号尚未启动暖化`);
    p.status = 'active';
    p.retiredAt = null;
    const saved = await this.progressRepo.save(p);
    if (p.taskId) {
      await this.taskRepo.update(
        { id: p.taskId },
        { status: TaskStatus.RUNNING, completedAt: null as any } as any,
      );
      appendLog(p.taskId, 'info', '▶ 用户重新激活，暖化恢复');
    }
    return saved;
  }

  async getStatus(userId: string, accountId: string): Promise<{
    progress: WarmupProgress | null;
    packageInfo: PackageInfo | null;
    nextWindowHour: number | null;
    activeWindowIndex: number | null;
    missedThresholdReached: boolean;
  }> {
    const p = await this.progressRepo.findOne({ where: { accountId, userId } });
    if (!p) return {
      progress: null, packageInfo: null, nextWindowHour: null,
      activeWindowIndex: null, missedThresholdReached: false,
    };
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    const groupNumber = account?.warmupGroupNumber ?? 1;
    const groupCount = await this.getUserGroupCount(userId);
    const now = new Date();
    const packageInfo = getPackageInfo(p.startedAt, p.packageMode, now);
    const activeWindowIndex = findActiveWindow(groupNumber, now, groupCount);
    // 取分钟级窗口的整点 hour（前端展示用 —— 简化）
    const windowMinutes = getWarmupWindowMinutes(groupNumber, groupCount).sort((a, b) => a - b);
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const nextWindowMinute = windowMinutes.find(m => m > currentMin) ?? windowMinutes[0];
    const nextWindowHour = Math.floor(nextWindowMinute / 60);
    return {
      progress: p,
      packageInfo,
      nextWindowHour,
      activeWindowIndex: activeWindowIndex >= 0 ? activeWindowIndex : null,
      missedThresholdReached: p.missedToday >= MISSED_RED_THRESHOLD,
    };
  }

  async listForUser(userId: string): Promise<WarmupProgress[]> {
    return this.progressRepo.find({ where: { userId }, order: { startedAt: 'ASC' } });
  }

  // ─── 调度器 ─────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduleTick(): Promise<void> {
    if (this.tickInFlight) {
      this.logger.debug('Previous tick still running, skip');
      return;
    }
    this.tickInFlight = true;
    const now = new Date();
    try {
      const activeList = await this.progressRepo.find({ where: { status: 'active' } });
      if (activeList.length === 0) return;
      this.logger.debug(`Warmup tick: checking ${activeList.length} accounts`);

      // 并发执行（限制 3 个同时跑避免占资源）
      const batchSize = 3;
      for (let i = 0; i < activeList.length; i += batchSize) {
        const batch = activeList.slice(i, i + batchSize);
        await Promise.all(batch.map(p => this.tickOne(p, now).catch(err => {
          this.logger.warn(`[warmup:${p.accountId}] tick failed: ${err.message}`);
        })));
      }
    } finally {
      this.tickInFlight = false;
    }
  }

  private async tickOne(p: WarmupProgress, now: Date): Promise<void> {
    const account = await this.accountRepo.findOne({ where: { id: p.accountId } });
    if (!account || account.warmupGroupNumber == null) {
      p.status = 'retired';
      p.retiredAt = now;
      await this.progressRepo.save(p);
      if (p.taskId) {
        appendLog(p.taskId, 'warn', '⚠️ 账号被删除或分组清空，自动退役');
      }
      return;
    }

    const groupNumber = account.warmupGroupNumber;
    const todayKey = localDateKey(now);

    // v1.4.0 —— 取该租户的 groupCount + 组内账号位置（用于自适应矩阵 + 错峰）
    const groupCount = await this.getUserGroupCount(p.userId);
    const accountPosition = await this.getAccountPositionInGroup(p.userId, groupNumber, account.id);

    // 日期滚动 → 重置 missedToday
    if (p.missedDateKey !== todayKey) {
      p.missedDateKey = todayKey;
      p.missedToday = 0;
    }

    // 自动转 P3
    const info = getPackageInfo(p.startedAt, p.packageMode, now);
    if (info.shouldTransitionToP3) {
      const oldMode = p.packageMode;
      p.packageMode = 'P3';
      p.startedAt = now;
      p.lastFiredWindow = null;
      await this.progressRepo.save(p);
      if (p.taskId) {
        appendLog(p.taskId, 'success',
          `🎉 ${this.getPackageLabel(oldMode as PackageMode)} 已完成！自动进入 P3 运营维护模式（无限周期）`);
        await this.simpleTasksService.persistLogsToDb(p.taskId).catch(() => {});
      }
      return;
    }

    // 错过窗口检测
    const lastChecked = p.lastCheckedAt ?? new Date(now.getTime() - 6 * 60 * 1000);
    const missedIdx = findJustMissedWindow(groupNumber, lastChecked, now, groupCount);
    if (missedIdx >= 0) {
      const windowKey = `${todayKey}:${missedIdx}`;
      if (p.lastFiredWindow !== windowKey) {
        p.missedToday += 1;
        p.missedTotal += 1;
        if (p.taskId) {
          appendLog(p.taskId, 'warn',
            `⏭ 错过窗口 ${['早', '午', '晚'][missedIdx]}（今日累计错过 ${p.missedToday} 个）`);
        }
      }
    }

    // 当前窗口触发（含组内账号 5 分钟错峰）
    const activeIdx = findActiveWindow(groupNumber, now, groupCount);
    if (activeIdx >= 0) {
      const windowKey = `${todayKey}:${activeIdx}`;
      // 检查这个账号在 group 内的 5 分钟时间槽是否轮到
      const isMyTurn = isAccountTurnInWindow(accountPosition, groupNumber, now, groupCount);
      if (p.lastFiredWindow !== windowKey && isMyTurn) {
        // 先持久化触发标记，避免后续 cron tick 重复 fire
        p.lastFiredWindow = windowKey;
        p.firedTotal += 1;
        p.lastCheckedAt = now;
        await this.progressRepo.save(p);
        // Fire-and-forget: action 在后台跑（25 分钟），不阻塞 scheduleTick
        // 否则同组 position>0 的账号会因为 5 分钟 slot 早过而永远轮不到
        // BrowserSessionService 已有 per-account semaphore，并发安全
        const accountSnapshot = account;
        const progressSnapshot = p;
        void this.executeWindowAction(progressSnapshot, accountSnapshot, info, activeIdx as 0 | 1 | 2)
          .catch(err => this.logger.error(
            `[warmup:${progressSnapshot.accountId}] window action failed: ${err?.message ?? err}`,
          ));
        return;
      }
    }

    p.lastCheckedAt = now;
    await this.progressRepo.save(p);
  }

  /**
   * v1.4.0 —— 读用户的 groupCount 设置（默认 3）
   * 缓存 30 秒避免每次 tick 都打 DB
   */
  private groupCountCache = new Map<string, { count: number; ts: number }>();
  private async getUserGroupCount(userId: string): Promise<number> {
    const cached = this.groupCountCache.get(userId);
    if (cached && Date.now() - cached.ts < 30_000) return cached.count;
    try {
      const [row] = await this.dataSource.query(
        `SELECT preferences FROM users WHERE id = $1`, [userId],
      );
      const count = row?.preferences?.warmup?.groupCount ?? 3;
      this.groupCountCache.set(userId, { count, ts: Date.now() });
      return count;
    } catch {
      return 3;
    }
  }

  /**
   * v1.4.0 —— 算账号在该组内的 0-based 位置（按 accountNumber ASC 排序）
   * 用于组内 5 分钟错峰
   */
  private async getAccountPositionInGroup(
    userId: string, groupNumber: number, accountId: string,
  ): Promise<number> {
    try {
      const rows = await this.dataSource.query(
        `SELECT id FROM facebook_accounts
          WHERE "userId" = $1 AND "warmupGroupNumber" = $2 AND "deletedAt" IS NULL
          ORDER BY "accountNumber" ASC NULLS LAST, "createdAt" ASC`,
        [userId, groupNumber],
      );
      const idx = rows.findIndex((r: any) => r.id === accountId);
      return idx >= 0 ? idx : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 执行窗口动作 + append log 到父任务（不创建新任务）
   */
  private async executeWindowAction(
    p: WarmupProgress,
    account: FacebookAccount,
    info: PackageInfo,
    windowIndex: 0 | 1 | 2,
  ): Promise<void> {
    const parentTaskId = p.taskId;
    if (!parentTaskId) {
      this.logger.warn(`[warmup:${p.accountId}] 无关联父任务，跳过窗口`);
      return;
    }

    const candidates = pickWarmupActions(info.packageNumber, windowIndex);
    let action = candidates[Math.floor(Math.random() * candidates.length)];

    const accountTag = account.accountNumber != null
      ? `#${String(account.accountNumber).padStart(2, '0')}`
      : (account.email ?? account.id.slice(0, 8));
    const windowLabel = ['早', '午', '晚'][windowIndex];
    const dayLabel = `Day ${info.overallDay}`;

    // auto_chat 需要配对
    let partnerAccount: FacebookAccount | null = null;
    let sameIpWarning = false;
    if (action === 'auto_chat') {
      const pair = await this.findChatPartner(account);
      if (!pair) {
        appendLog(parentTaskId, 'warn',
          `${dayLabel} [${windowLabel}窗口] 同组无可配对账号 → 降级为被动浏览`);
        action = 'simulate_human_behavior';
      } else {
        partnerAccount = pair.partner;
        sameIpWarning = pair.sameIp;
      }
    }

    const actionLabel = this.getActionLabel(action);
    const partnerTag = partnerAccount && partnerAccount.accountNumber != null
      ? `#${String(partnerAccount.accountNumber).padStart(2, '0')}` : '';
    const ipWarn = sameIpWarning ? ' [⚠️同IP]' : '';
    appendLog(parentTaskId, 'info',
      `${dayLabel} [${windowLabel}窗口] 开始 · ${actionLabel}${partnerTag ? ` ↔ ${partnerTag}` : ''}${ipWarn}`);

    try {
      const result = await this.runAction(action, account, partnerAccount, p.userId);
      if (result.success) {
        appendLog(parentTaskId, 'success',
          `${dayLabel} [${windowLabel}窗口] ✓ 完成 · ${actionLabel}${result.summary ? ` (${result.summary})` : ''}`);
      } else {
        appendLog(parentTaskId, 'warn',
          `${dayLabel} [${windowLabel}窗口] ✗ ${actionLabel} 失败：${result.error ?? '未知错误'}`);
      }
    } catch (err: any) {
      appendLog(parentTaskId, 'error',
        `${dayLabel} [${windowLabel}窗口] ✗ ${actionLabel} 异常：${err.message}`);
    }

    // 持久化本次窗口的日志
    await this.simpleTasksService.persistLogsToDb(parentTaskId).catch(() => {});
  }

  /**
   * 调度实际动作（headless 模式，避免养号占用前台）
   */
  private async runAction(
    action: WarmupAction,
    account: FacebookAccount,
    partner: FacebookAccount | null,
    userId: string,
  ): Promise<{ success: boolean; error?: string; summary?: string }> {
    const headless = true;

    try {
      switch (action) {
        case 'simulate_human_behavior': {
          const r = await this.warmingService.execute({
            accountId: account.id,
            durationMinutes: 25,
            actions: ['scroll_feed', 'watch_video', 'like_post', 'view_profile', 'view_stories'],
            headless,
          });
          return { ...r, summary: `${r.actionsPerformed} 个动作` };
        }
        case 'auto_chat':
          if (!partner) return { success: false, error: '无聊天伙伴' };
          return await this.chatService.executeAutoChat({
            accountAId: account.id,
            accountBId: partner.id,
            scriptId: 'random',
            aiEnabled: false,
            userId,
            headless,
          });
        case 'auto_add_friend':
          return await this.socialService.executeAutoAddFriends({
            accountId: account.id,
            dailyLimit: 5,
            prioritizeMutual: true,
            delayMin: 60_000,
            delayMax: 240_000,
            headless,
          });
        case 'auto_accept_friend':
          return await this.socialService.executeAutoAcceptRequests({
            accountId: account.id,
            maxCount: 5,
            headless,
          });
        case 'auto_follow':
          return await this.socialService.executeAutoFollow({
            accountId: account.id,
            dailyLimit: 5,
            delayMin: 60_000,
            delayMax: 240_000,
            headless,
          });
        case 'auto_comment':
          return await this.socialService.executeAutoComment({
            accountId: account.id,
            comments: ['👍', '不错！', '赞！', '很精彩', '支持！'],
            dailyLimit: 5,
            delayMin: 60_000,
            delayMax: 180_000,
            headless,
          });
        case 'auto_join_group': {
          // 从用户设置读关键词
          const [row] = await this.dataSource.query(
            `SELECT preferences FROM users WHERE id = $1`, [userId],
          );
          const gj = row?.preferences?.warmup?.groupJoin;
          if (!gj?.keywords?.length) {
            return { success: true, summary: '未配置关键词，跳过（降级为无动作）' };
          }
          return await this.groupJoinService.executeAutoJoinGroup({
            userId,
            accountId: account.id,
            keywords: gj.keywords,
            dailyLimit: gj.dailyLimit ?? 3,
            strategy: gj.strategy ?? 'random',
            aiAnswerEnabled: !!gj.aiAnswerEnabled,
            aiAnswerPrompt: gj.aiAnswerPrompt ?? '',
            headless,
            logger: () => {}, // 日志统一走父任务，这里不重复写
          }).then(r => ({ ...r, summary: `加入 ${r.joined} / 跳过 ${r.skipped}` }));
        }
        case 'auto_post_image':
          return { success: true, summary: 'post_image 占位 — 后续版本实现' };
        case 'auto_post_video':
          return { success: true, summary: 'post_video 占位 — 后续版本实现' };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
    return { success: false, error: '未知动作类型' };
  }

  /**
   * 同组配对（v1.2.1 保留逻辑）
   */
  private async findChatPartner(
    selfAccount: FacebookAccount,
  ): Promise<{ partner: FacebookAccount; sameIp: boolean } | null> {
    if (selfAccount.warmupGroupNumber == null) return null;
    const candidates: FacebookAccount[] = await this.accountRepo
      .createQueryBuilder('a')
      .innerJoin('warmup_progress', 'w',
        'w."accountId" = a.id AND w.status = :warmupStatus',
        { warmupStatus: 'active' })
      .where('a."userId" = :userId', { userId: selfAccount.userId })
      .andWhere('a."warmupGroupNumber" = :g', { g: selfAccount.warmupGroupNumber })
      .andWhere('a.id != :selfId', { selfId: selfAccount.id })
      .andWhere('a."deletedAt" IS NULL')
      .getMany();
    if (candidates.length === 0) return null;
    const differentIp = candidates.filter(c => c.vpnConfigId !== selfAccount.vpnConfigId);
    if (differentIp.length > 0) {
      return { partner: differentIp[Math.floor(Math.random() * differentIp.length)], sameIp: false };
    }
    return { partner: candidates[Math.floor(Math.random() * candidates.length)], sameIp: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private getPackageLabel(mode: PackageMode): string {
    switch (mode) {
      case 'P1': return '孵化期 (Day 1-7)';
      case 'P2': return '激活期 (Day 1-7)';
      case 'P1+P2': return '完整养号 (Day 1-14)';
      case 'P3': return '维护模式 (∞)';
    }
  }

  private getActionLabel(action: WarmupAction): string {
    switch (action) {
      case 'simulate_human_behavior': return '被动浏览';
      case 'auto_chat': return '自动聊天';
      case 'auto_add_friend': return '加好友';
      case 'auto_accept_friend': return '接受好友申请';
      case 'auto_follow': return '关注';
      case 'auto_comment': return '评论';
      case 'auto_join_group': return '加群';
      case 'auto_post_image': return '发图帖';
      case 'auto_post_video': return '发视频';
    }
  }

  /**
   * 仪表板暖化统计（独立于普通任务统计）
   */
  async getWarmupStats(userId: string): Promise<{
    activeCount: number;
    maintenanceCount: number; // P3
    retiredCount: number;
  }> {
    const rows = await this.dataSource.query(
      `SELECT "packageMode", status, COUNT(*)::int AS count
         FROM warmup_progress
        WHERE "userId" = $1
        GROUP BY "packageMode", status`,
      [userId],
    );
    let activeCount = 0, maintenanceCount = 0, retiredCount = 0;
    for (const r of rows) {
      const c = Number(r.count);
      if (r.status === 'retired') retiredCount += c;
      else if (r.packageMode === 'P3') maintenanceCount += c;
      else activeCount += c;
    }
    return { activeCount, maintenanceCount, retiredCount };
  }
}
