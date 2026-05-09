import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Task, TaskStatus } from '../task-scheduler/entities/task.entity';
import { SimpleTasksService, appendLog, clearLogs } from './simple-tasks.service';
import { BrowserSessionService } from '../facebook-accounts/browser-session.service';
import { FacebookAccountsService } from '../facebook-accounts/facebook-accounts.service';
import { AccountWarmingService } from '../task-executor/integrations/account-warming.service';
import { FacebookChatService } from '../task-executor/integrations/facebook-chat.service';
import { FacebookPostService } from '../task-executor/integrations/facebook-post.service';
import { FacebookSocialService } from '../task-executor/integrations/facebook-social.service';
import { FacebookGroupJoinService } from '../task-executor/integrations/facebook-group-join.service';
import { DataSource } from 'typeorm';

@Injectable()
export class TaskAutoRunnerService implements OnModuleInit {
  private readonly logger = new Logger(TaskAutoRunnerService.name);
  /** Track which taskIds are currently executing to avoid duplicates */
  private readonly running = new Set<string>();

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    private readonly browserSessionService: BrowserSessionService,
    private readonly facebookAccountsService: FacebookAccountsService,
    private readonly warmingService: AccountWarmingService,
    private readonly chatService: FacebookChatService,
    private readonly postService: FacebookPostService,
    private readonly socialService: FacebookSocialService,
    private readonly groupJoinService: FacebookGroupJoinService,
    private readonly simpleTasksService: SimpleTasksService,
    private readonly dataSource: DataSource,
  ) {}

  /** On startup: reset any tasks stuck in RUNNING (e.g. from a previous crashed backend)
   *  v1.3.0：排除 auto_warmup 任务 —— 养号任务跨 7-14 天是合法的 running 状态
   */
  async onModuleInit() {
    try {
      const stuck = await this.taskRepo.find({
        where: { status: TaskStatus.RUNNING },
      });
      // 只清理非养号的 running 任务
      const nonWarmupStuck = stuck.filter(t => t.taskAction !== 'auto_warmup');
      if (nonWarmupStuck.length > 0) {
        await this.dataSource.query(
          `UPDATE tasks SET status = 'failed' WHERE status = 'running' AND "taskAction" != 'auto_warmup'`,
        );
        this.logger.warn(
          `⚠️ 启动时发现 ${nonWarmupStuck.length} 个卡住的任务（非养号），已标记为失败（可手动重新执行）`,
        );
      }
      const warmupRunning = stuck.length - nonWarmupStuck.length;
      if (warmupRunning > 0) {
        this.logger.log(`ℹ️ 保留 ${warmupRunning} 个养号任务的 running 状态（这是正常的 7-14 天进度）`);
      }
    } catch (e) {
      this.logger.error('启动检查失败', e);
    }
  }

  /** Runs every 30 seconds — picks up any PENDING task whose scheduledAt has passed */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkAndRunDueTasks() {
    const now = new Date();
    const dueTasks = await this.taskRepo.find({
      where: {
        status: TaskStatus.PENDING,
        scheduledAt: LessThanOrEqual(now),
      },
    });

    for (const task of dueTasks) {
      if (this.running.has(task.id)) continue;

      // ── Claim this task immediately to prevent race conditions ─────────────
      // Add to running set BEFORE any async checks so concurrent cron ticks
      // cannot pick up the same task.
      this.running.add(task.id);

      // Skip tasks whose scheduledAt is more than 24h in the past
      // (these are stale — user probably forgot about them, don't auto-run)
      const ageMs = now.getTime() - new Date(task.scheduledAt).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        this.logger.warn(`⏭ 跳过过期超过24小时的任务: ${task.name}`);
        await this.saveTaskResult(task.id, false, '任务已超时 24 小时，自动取消');
        this.running.delete(task.id);
        continue;
      }

      const params = task.executionData?.parameters || {};

      // ── Batch chunk guard ──────────────────────────────────────────────────
      // If this task belongs to batch group > 0, wait until all tasks in the
      // previous group(s) are done (completed / failed / cancelled).
      if (params.batchId && typeof params.batchGroup === 'number' && params.batchGroup > 0) {
        const [{ count }] = await this.dataSource.query(
          `SELECT COUNT(*) AS count FROM tasks
           WHERE "executionData"->'parameters'->>'batchId' = $1
             AND CAST("executionData"->'parameters'->>'batchGroup' AS int) < $2
             AND status NOT IN ('completed', 'failed', 'cancelled')`,
          [params.batchId, params.batchGroup],
        );
        if (parseInt(count, 10) > 0) {
          this.logger.debug(`Batch wait: task ${task.id} group ${params.batchGroup} — prior group not done`);
          this.running.delete(task.id);
          continue;
        }
      }

      // ── Subscription / License expiry guard ──────────────────────────────
      if (process.env.DEPLOY_MODE === 'local') {
        // Local 模式：检查 License 缓存
        try {
          const cachePath = require('path').join(process.cwd(), 'license-cache.json');
          const cache = JSON.parse(require('fs').readFileSync(cachePath, 'utf8'));
          if (!cache.valid) {
            this.logger.warn(`⏭ 跳过任务: ${task.name} — 许可证无效`);
            await this.saveTaskResult(task.id, false, cache.error || '许可证无效，任务无法执行');
            this.running.delete(task.id);
            continue;
          }
        } catch {}
      } else if (task.userId) {
        // Cloud 模式：检查用户订阅
        const [owner] = await this.dataSource.query(
          `SELECT role, "subscription_expiry" AS "subscriptionExpiry" FROM users WHERE id = $1`,
          [task.userId],
        );
        if (owner && owner.role !== 'admin' && owner.subscriptionExpiry &&
            new Date(owner.subscriptionExpiry) < now) {
          this.logger.warn(`⏭ 跳过任务: ${task.name} — 用户订阅已过期`);
          await this.saveTaskResult(task.id, false, '订阅已过期，任务无法执行，请联系管理员续期');
          this.running.delete(task.id);
          continue;
        }
      }

      const headless: boolean = params.headless !== undefined ? Boolean(params.headless) : true;
      const taskAction = params.taskAction || task.taskAction;

      this.logger.log(`⏰ 定时触发任务: ${task.name} (id=${task.id})`);

      // Mark as RUNNING immediately
      await this.taskRepo.update({ id: task.id }, { status: TaskStatus.RUNNING });
      clearLogs(task.id);
      appendLog(task.id, 'info', `⏰ 定时自动触发：${task.name}`);
      appendLog(task.id, 'info', `任务类型：${taskAction}`);

      this.executeTask(task.userId, task.id, taskAction, params, task, headless)
        .then(() => this.rescheduleIfRecurring(task))
        .finally(() => this.running.delete(task.id));
    }
  }

  /** If task has a repeat cycle, reset it to PENDING with the next scheduled time */
  private async rescheduleIfRecurring(task: Task) {
    const cycle = task.scheduleConfig?.recurringType || task.executionData?.parameters?.repeatCycle;
    if (!cycle || cycle === 'once') return;

    const base = task.scheduledAt ? new Date(task.scheduledAt) : new Date();
    let next: Date;
    if (cycle === 'daily') {
      next = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    } else if (cycle === 'weekly') {
      next = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (cycle === 'monthly') {
      next = new Date(base);
      next.setMonth(next.getMonth() + 1);
    } else {
      return;
    }

    await this.taskRepo.update(
      { id: task.id },
      { status: TaskStatus.PENDING, scheduledAt: next },
    );
    this.logger.log(`🔁 任务 "${task.name}" 已重新计划，下次执行：${next.toLocaleString()}`);
  }

  /**
   * Persist the task final status + result to DB.
   * Always writes completedAt and result so the frontend error tooltip works.
   * Also persists in-memory logs to the DB for later retrieval.
   */
  private async saveTaskResult(taskId: string, success: boolean, error?: string) {
    await this.taskRepo.update(
      { id: taskId },
      {
        status: success ? TaskStatus.COMPLETED : TaskStatus.FAILED,
        completedAt: new Date(),
        result: success
          ? { success: true }
          : { success: false, error: error || '任务执行失败' },
      } as any,
    );
    // Persist in-memory execution logs to DB (same as updateStatus does)
    await this.simpleTasksService.persistLogsToDb(taskId).catch(() => {});
  }

  private async executeTask(
    userId: string,
    taskId: string,
    taskAction: string,
    params: any,
    task: any,
    headless = true,
  ) {
    try {
      if (taskAction === 'auto_simulate') {
        const accountId = params.accountAId || task.accountId;
        if (!accountId) {
          appendLog(taskId, 'error', '❌ 未找到目标账号ID');
          await this.saveTaskResult(taskId, false, '未找到目标账号ID');
          return;
        }

        const [acc] = await this.dataSource.query(
          `SELECT email, "loginStatus" FROM facebook_accounts WHERE id = $1`,
          [accountId],
        );
        if (!acc) {
          appendLog(taskId, 'error', `❌ 账号不存在 (id: ${accountId})`);
          await this.saveTaskResult(taskId, false, `账号不存在 (id: ${accountId})`);
          return;
        }

        appendLog(taskId, 'info', `👤 目标账号：${acc.email}`);
        const duration = params.durationMinutes || 30;
        const actions = params.warmingActions || ['scroll_feed', 'watch_video', 'like_post'];
        appendLog(taskId, 'info', `⏱ 模拟时长：${duration} 分钟`);
        appendLog(taskId, 'info', `🎯 执行动作：${actions.join(', ')}`);

        const result = await this.runWarmingWithLogs(taskId, accountId, duration, actions, headless);
        if (result.success) {
          appendLog(taskId, 'success', `✅ 模拟完成！共执行了 ${result.actionsPerformed} 个操作`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 执行失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_chat') {
        appendLog(taskId, 'info', '💬 正在启动自动聊天...');
        const result = await this.chatService.executeAutoChat({
          accountAId: params.accountAId,
          accountBId: params.accountBId,
          scriptId: params.scriptId,
          aiEnabled: params.aiEnabled || false,
          userId,
          headless,
        });
        if (result.success) {
          appendLog(taskId, 'success', `✅ 聊天完成，共发送 ${result.messagesSent} 条消息`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 聊天失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_post_image') {
        appendLog(taskId, 'info', '🖼️ 正在发图片帖子...');
        const result = await this.postService.executeAutoPostImage({
          accountId: params.accountAId,
          content: params.content || '',
          imageUrls: params.imageUrls,
          headless,
        });
        if (result.success) {
          appendLog(taskId, 'success', '✅ 帖子发布成功');
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 发帖失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_post_video') {
        appendLog(taskId, 'info', '🎬 正在发视频帖子...');
        const result = await this.postService.executeAutoPostVideo({
          accountId: params.accountAId,
          description: params.description || params.content || '',
          videoUrl: params.videoUrl,
          headless,
        });
        if (result.success) {
          appendLog(taskId, 'success', '✅ 视频发布成功');
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 发视频失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_call') {
        appendLog(taskId, 'info', '📞 正在启动自动拨号...');
        const result = await this.chatService.executeAutoCall({
          accountAId: params.accountAId,
          accountBId: params.accountBId,
          callDuration: params.callDuration || 30,
          userId,
          headless,
        });
        if (result.success) {
          appendLog(taskId, 'success', `✅ 通话完成，时长 ${params.callDuration || 30} 秒`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 拨号失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_add_friends') {
        appendLog(taskId, 'info', '👤 正在自动加好友...');
        const result = await this.socialService.executeAutoAddFriends({
          accountId: params.accountAId,
          dailyLimit: Math.min(params.dailyLimit || 5, 6),
          prioritizeMutual: params.prioritizeMutual !== false,
          delayMin: (params.delayMin || 60) * 1000,
          delayMax: (params.delayMax || 240) * 1000,
          headless,
        });
        if (result.success) {
          appendLog(taskId, 'success', `✅ 完成！本次发送好友申请 ${result.added} 个`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_accept_requests') {
        appendLog(taskId, 'info', '✅ 正在接受好友申请...');
        const result = await this.socialService.executeAutoAcceptRequests({
          accountId: params.accountAId,
          maxCount: params.maxCount || 10,
          headless,
        });
        if (result.success) {
          appendLog(taskId, 'success', `✅ 完成！本次接受 ${result.accepted} 个好友申请`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_comment') {
        appendLog(taskId, 'info', '💬 正在自动留言...');
        const result = await this.socialService.executeAutoComment({
          accountId: params.accountAId,
          comments: params.comments || ['👍', '非常棒！', '赞！', '很精彩！', '支持！'],
          dailyLimit: params.dailyLimit || 10,
          delayMin: (params.delayMin || 60) * 1000,
          delayMax: (params.delayMax || 120) * 1000,
          headless,
        });
        if (result.success) {
          appendLog(taskId, 'success', `✅ 完成！本次发布评论 ${result.commented} 条`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_follow') {
        appendLog(taskId, 'info', '❤️ 正在自动 Follow...');
        const result = await this.socialService.executeAutoFollow({
          accountId: params.accountAId,
          dailyLimit: params.dailyLimit || 10,
          delayMin: (params.delayMin || 60) * 1000,
          delayMax: (params.delayMax || 240) * 1000,
          headless,
        });
        if (result.success) {
          appendLog(taskId, 'success', `✅ 完成！本次 Follow ${result.followed} 个`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_join_group') {
        // v1.3.1 —— Puppeteer 自动加群（任务级配置）
        appendLog(taskId, 'info', '👥 正在启动自动加群...');

        // 1) 优先读 task.parameters 里的 per-task 配置（v1.3.1 新格式）
        const keywords: string[] = Array.isArray(params.joinKeywords) ? params.joinKeywords.filter(Boolean) : [];
        const joinCount: number = Number(params.joinCount) || 3;
        const delayMin: number = Number(params.joinDelayMin) || 120;
        const delayMax: number = Number(params.joinDelayMax) || 300;
        const aiAnswer: boolean = !!params.joinAiAnswer;
        const aiProvider: 'claude' | 'openai' | 'deepseek' = params.joinAiProvider || 'deepseek';
        const aiApiKey: string = String(params.joinAiApiKey || '');
        const aiPrompt: string = String(params.joinAiPrompt || '你是一个礼貌、简短、友善的新人，回答群管理员的问题以便通过审核。');

        if (!keywords.length) {
          appendLog(taskId, 'error', '❌ 未配置加群关键词');
          await this.saveTaskResult(taskId, false, '未配置加群关键词');
          return;
        }
        if (aiAnswer && !aiApiKey) {
          appendLog(taskId, 'error', '❌ 开启了 AI 答问但未填入 API Key');
          await this.saveTaskResult(taskId, false, 'AI Key 未配置');
          return;
        }

        appendLog(taskId, 'info',
          `📋 关键词：${keywords.join(', ')} · 本次 ${joinCount} 群 · 间隔 ${delayMin}-${delayMax}s · AI ${aiAnswer ? '开启(' + aiProvider + ')' : '关闭'}`);

        const result = await this.groupJoinService.executeAutoJoinGroup({
          userId,
          accountId: params.accountAId || task.accountId,
          keywords,
          dailyLimit: joinCount,
          strategy: 'random',
          delayMinMs: delayMin * 1000,
          delayMaxMs: delayMax * 1000,
          aiAnswerEnabled: aiAnswer,
          aiAnswerPrompt: aiPrompt,
          aiProviderOverride: aiAnswer ? aiProvider : undefined,
          aiApiKeyOverride: aiAnswer ? aiApiKey : undefined,
          headless,
          logger: (level, msg) => appendLog(taskId, level, msg),
        });
        if (result.success) {
          appendLog(taskId, 'success',
            `✅ 完成！加入 ${result.joined} 个群（跳过 ${result.skipped}，AI 回答 ${result.aiAnswered} 次）`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'error', `❌ 加群失败：${result.error}`);
          await this.saveTaskResult(taskId, false, result.error);
        }

      } else if (taskAction === 'auto_combo') {
        appendLog(taskId, 'info', '🗂️ 正在执行组合任务...');
        const comboActions: any[] = params.comboActions || [];
        appendLog(taskId, 'info', `共 ${comboActions.length} 个动作：${comboActions.map((a: any) => a.type).join(' → ')}`);
        const result = await this.socialService.executeComboTask({
          accountId: params.accountAId,
          headless,
          actions: comboActions,
        });

        // 详细统计：每个动作的具体数量
        const actionLabels: Record<string, { label: string; key: string; unit: string }> = {
          auto_add_friends:       { label: '自动加好友',   key: 'added',     unit: '人' },
          auto_accept_requests:   { label: '接受好友申请', key: 'accepted',  unit: '人' },
          auto_follow:            { label: '自动关注',     key: 'followed',  unit: '人' },
          auto_comment:           { label: '自动评论',     key: 'commented', unit: '条' },
        };

        let totalDone = 0;
        for (const [type, r] of Object.entries(result.results)) {
          const meta = actionLabels[type];
          const res: any = r;
          const count = meta ? (res[meta.key] ?? 0) : 0;
          totalDone += count;
          if (res.success) {
            appendLog(taskId, 'success',
              `  ✅ ${meta?.label || type}: 完成 ${count} ${meta?.unit || '个'}`);
          } else {
            appendLog(taskId, 'warn',
              `  ⚠️ ${meta?.label || type}: ${count > 0 ? `完成 ${count} ${meta?.unit || '个'} 后 ` : ''}失败 - ${res.error || '未知错误'}`);
          }
        }

        const summaryLine = `📊 本次共执行 ${totalDone} 次操作`;
        if (result.success) {
          appendLog(taskId, 'success', `✅ 组合任务完成！${summaryLine}`);
          await this.saveTaskResult(taskId, true);
        } else {
          appendLog(taskId, 'warn', `⚠️ 组合任务部分完成：${summaryLine}`);
          await this.saveTaskResult(taskId, true);
        }

      } else {
        appendLog(taskId, 'warn', `⚠️ 未知任务类型 "${taskAction}"，跳过`);
        await this.saveTaskResult(taskId, false, `未知任务类型 "${taskAction}"`);
      }
    } catch (err: any) {
      appendLog(taskId, 'error', `❌ 执行异常：${err.message}`);
      await this.saveTaskResult(taskId, false, err.message);
    }
  }

  private async ensureLoggedIn(page: any, accountId: string, taskId: string): Promise<boolean> {
    const randomDelay = (min: number, max: number) =>
      new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

    // Step 1: Check if already logged in
    const url = page.url();
    const onLoginPage = url.includes('/login') || url.includes('login.php');
    if (!onLoginPage) {
      const hasLoginForm = await page.$('input[name="pass"]');
      if (!hasLoginForm) { appendLog(taskId, 'success', '✅ 账号已登录'); return true; }
    }

    appendLog(taskId, 'warn', '⚠️ 账号未登录，正在注入已保存的 Cookie...');
    const [acc] = await this.dataSource.query(
      `SELECT email, "facebookPassword", cookies FROM facebook_accounts WHERE id = $1`, [accountId],
    );

    // Step 2: Try cookie injection
    if (acc?.cookies) {
      try {
        // cookies 列是 JSONB，TypeORM 可能返回对象或字符串
        const cookieList = typeof acc.cookies === 'string'
          ? JSON.parse(acc.cookies)
          : acc.cookies;
        if (Array.isArray(cookieList) && cookieList.length > 0) {
          appendLog(taskId, 'info', `🍪 注入 ${cookieList.length} 个已保存的 Cookie...`);
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
          for (const c of cookieList) {
            try { await page.setCookie({ name: c.name, value: c.value, domain: c.domain || '.facebook.com', path: c.path || '/' }); } catch {}
          }
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await randomDelay(2000, 3000);
          if (!page.url().includes('/login')) {
            appendLog(taskId, 'success', '✅ Cookie 注入成功，已自动登录！');
            return true;
          }
          appendLog(taskId, 'warn', '⚠️ Cookie 已过期，尝试密码登录...');
        }
      } catch {}
    }

    // Step 3: Credential login
    if (!acc?.email || !acc?.facebookPassword) {
      appendLog(taskId, 'error', '❌ 无可用 Cookie 或密码，请在账号管理中重新登录');
      return false;
    }
    // 解密密码（AES-256-GCM，格式 iv:cipher:authTag）
    let plainPassword: string;
    try {
      const [row] = await this.dataSource.query(
        `SELECT "userId" FROM facebook_accounts WHERE id = $1`, [accountId],
      );
      plainPassword = await this.facebookAccountsService.getDecryptedPassword(row.userId, accountId);
    } catch (e: any) {
      appendLog(taskId, 'error', `❌ 密码解密失败（加密密钥可能已变动，请编辑账号重新输入密码）：${e.message}`);
      return false;
    }
    try {
      appendLog(taskId, 'info', `🔑 正在使用密码登录：${acc.email}`);
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await randomDelay(1500, 2500);
      await page.type('input[name="email"]', acc.email, { delay: 60 });
      await randomDelay(400, 800);
      await page.type('input[name="pass"]', plainPassword, { delay: 60 });
      await randomDelay(400, 800);
      await page.keyboard.press('Enter');
      try { await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
      await randomDelay(2000, 3000);
      const afterUrl = page.url();
      if (afterUrl.includes('checkpoint') || afterUrl.includes('two_step')) {
        appendLog(taskId, 'error', '❌ 需要安全验证，请手动处理后重试'); return false;
      }
      if (afterUrl.includes('/login')) {
        appendLog(taskId, 'error', '❌ 密码登录失败，请检查密码'); return false;
      }
      appendLog(taskId, 'success', '✅ 登录成功！');
      await this.dataSource.query(`UPDATE facebook_accounts SET "loginStatus" = true WHERE id = $1`, [accountId]);
      return true;
    } catch (err: any) {
      appendLog(taskId, 'error', `❌ 登录异常：${err.message}`); return false;
    }
  }

  private async runWarmingWithLogs(
    taskId: string,
    accountId: string,
    durationMinutes: number,
    actions: string[],
    headless = true,
  ): Promise<{ success: boolean; actionsPerformed: number; error?: string }> {
    const randomDelay = (min: number, max: number) =>
      new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

    let page: any = null;
    let actionsPerformed = 0;

    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless });
      appendLog(taskId, 'success', `✅ 浏览器启动成功（${headless ? '无头模式' : '显示窗口'}）`);
      page = await this.browserSessionService.newPage(accountId);

      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      appendLog(taskId, 'info', '📄 已打开 Facebook 首页');
      await randomDelay(2000, 4000);

      // ── Auto-login if needed ─────────────────────────────────────────────
      const loggedIn = await this.ensureLoggedIn(page, accountId, taskId);
      if (!loggedIn) {
        await page.close().catch(() => {});
        return { success: false, actionsPerformed: 0, error: '账号未登录且自动登录失败' };
      }
      await randomDelay(1500, 3000);

      const endTime = Date.now() + durationMinutes * 60 * 1000;
      const actionLabels: Record<string, string> = {
        scroll_feed: '📰 滚动浏览新闻 Feed',
        watch_video: '🎬 停留观看视频',
        like_post: '👍 点赞帖子',
        view_profile: '👤 浏览好友主页',
        view_stories: '📷 查看 Stories',
      };

      while (Date.now() < endTime) {
        // Check for cancellation
        const cur = await this.dataSource.query(`SELECT status FROM tasks WHERE id = $1`, [taskId]);
        if (cur[0]?.status === 'cancelled') {
          appendLog(taskId, 'warn', '⏹ 收到停止信号，正在关闭浏览器...');
          break;
        }

        const weighted: string[] = [];
        for (const a of actions) {
          const w = a === 'scroll_feed' ? 4 : a === 'watch_video' ? 3 : 1;
          for (let i = 0; i < w; i++) weighted.push(a);
        }
        const action = weighted[Math.floor(Math.random() * weighted.length)];
        const remaining = Math.round((endTime - Date.now()) / 1000);

        try {
          if (action === 'scroll_feed') {
            const scrolls = Math.floor(Math.random() * 4) + 2;
            for (let i = 0; i < scrolls; i++) {
              const amount = Math.floor(Math.random() * 400) + 200;
              await page.evaluate((n: number) => window.scrollBy({ top: n, behavior: 'smooth' }), amount);
              await randomDelay(1500, 3500);
            }
            appendLog(taskId, 'info', `${actionLabels.scroll_feed}（${scrolls} 次）— 剩余 ${remaining}s`);
            actionsPerformed++;
          } else if (action === 'watch_video') {
            const video = await page.$('video');
            if (video) {
              await video.click().catch(() => {});
              const watchTime = Math.floor(Math.random() * 15) + 8;
              appendLog(taskId, 'info', `${actionLabels.watch_video}（${watchTime} 秒）— 剩余 ${remaining}s`);
              await randomDelay(watchTime * 1000, watchTime * 1000 + 2000);
              actionsPerformed++;
            }
          } else if (action === 'like_post') {
            const likeButtons = await page.$$('[aria-label="Like"], [data-testid="fb-ufi-likelink"]');
            if (likeButtons.length > 0) {
              const idx = Math.floor(Math.random() * Math.min(likeButtons.length, 5));
              await likeButtons[idx].click();
              appendLog(taskId, 'success', `${actionLabels.like_post} — 剩余 ${remaining}s`);
              actionsPerformed++;
              await randomDelay(500, 1500);
            }
          } else if (action === 'view_profile') {
            const links = await page.$$('a[href*="/profile.php"]');
            if (links.length > 0) {
              appendLog(taskId, 'info', `${actionLabels.view_profile} — 剩余 ${remaining}s`);
              await links[0].click().catch(() => {});
              await randomDelay(4000, 8000);
              await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
              actionsPerformed++;
            }
          } else if (action === 'view_stories') {
            const storyBtn = await page.$('[aria-label="Stories"]');
            if (storyBtn) {
              await storyBtn.click();
              appendLog(taskId, 'info', `${actionLabels.view_stories} — 剩余 ${remaining}s`);
              await randomDelay(4000, 8000);
              await page.keyboard.press('Escape');
              actionsPerformed++;
            }
          }
        } catch (_) { /* ignore action errors */ }

        await randomDelay(3000, 10000);

        if (Math.random() < 0.25) {
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await randomDelay(1500, 3000);
        }
      }

      appendLog(taskId, 'success', `🏁 模拟结束，共执行 ${actionsPerformed} 个操作`);
      const finalCheck = await this.dataSource.query(`SELECT status FROM tasks WHERE id = $1`, [taskId]);
      if (finalCheck[0]?.status === 'cancelled') {
        return { success: false, actionsPerformed, error: 'cancelled' };
      }
      return { success: true, actionsPerformed };

    } catch (err: any) {
      appendLog(taskId, 'error', `❌ 浏览器操作失败：${err.message}`);
      return { success: false, actionsPerformed, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }
}
