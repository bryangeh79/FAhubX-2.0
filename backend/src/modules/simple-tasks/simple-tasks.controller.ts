import {
  Controller, Get, Post, Delete, Body, Param, Query,
  UseGuards, Request, HttpCode, HttpStatus, Inject, forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SimpleTasksService, appendLog, clearLogs } from './simple-tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { TaskStatus } from '../task-scheduler/entities/task.entity';
import { BrowserSessionService } from '../facebook-accounts/browser-session.service';
import { FacebookAccountsService } from '../facebook-accounts/facebook-accounts.service';
import { AccountWarmingService } from '../task-executor/integrations/account-warming.service';
import { FacebookChatService } from '../task-executor/integrations/facebook-chat.service';
import { FacebookPostService } from '../task-executor/integrations/facebook-post.service';
import { FacebookSocialService } from '../task-executor/integrations/facebook-social.service';
import { DataSource } from 'typeorm';
import { ChatScriptsService } from '../chat-scripts/chat-scripts.service';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SimpleTasksController {
  /** Track monitoring browsers opened via "查看窗口", keyed by taskId */
  private readonly monitorBrowsers = new Map<string, any[]>();

  constructor(
    private readonly service: SimpleTasksService,
    private readonly browserSessionService: BrowserSessionService,
    private readonly facebookAccountsService: FacebookAccountsService,
    private readonly warmingService: AccountWarmingService,
    private readonly chatService: FacebookChatService,
    private readonly postService: FacebookPostService,
    private readonly socialService: FacebookSocialService,
    private readonly chatScriptsService: ChatScriptsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Close all monitoring browsers for a given task */
  private closeMonitorBrowsers(taskId: string) {
    const browsers = this.monitorBrowsers.get(taskId);
    if (browsers) {
      for (const browser of browsers) {
        browser.close().catch(() => {});
      }
      this.monitorBrowsers.delete(taskId);
    }
  }

  @Post()
  @UseGuards(SubscriptionGuard)
  @ApiOperation({ summary: '创建任务' })
  async create(@Request() req, @Body() body: any) {
    return this.service.create(req.user.id, body);
  }

  @Post('batch')
  @UseGuards(SubscriptionGuard)
  @ApiOperation({ summary: '批量创建任务（分批执行）' })
  async batchCreate(@Request() req, @Body() body: { tasks: any[] }) {
    const created: any[] = [];
    for (const taskBody of (body.tasks || [])) {
      created.push(await this.service.create(req.user.id, taskBody));
    }
    return { created, count: created.length };
  }

  @Get()
  @ApiOperation({ summary: '获取任务列表' })
  async findAll(@Request() req, @Query() query: any) {
    const { tasks, total } = await this.service.findAll(req.user.id, query);
    const limit = parseInt(query.limit || '50', 10);
    const page = parseInt(query.page || '1', 10);
    return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard 用：任务统计（总数/执行中/成功/失败）' })
  async getStats(@Request() req) {
    return this.service.getTaskStats(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取任务详情' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: '获取任务执行日志' })
  async getLogs(@Request() req, @Param('id') id: string) {
    const logs = await this.service.getExecutionLogs(id);
    const task = await this.service.findOne(req.user.id, id);
    return {
      logs,
      status: task?.status,
      errorReason: task?.result?.error || null,
      completedAt: task?.completedAt || null,
      startedAt: task?.startedAt || null,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除任务' })
  async remove(@Request() req, @Param('id') id: string) {
    await this.service.remove(req.user.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消任务' })
  async cancel(@Request() req, @Param('id') id: string) {
    const task = await this.service.updateStatus(req.user.id, id, TaskStatus.CANCELLED);
    return { success: true, task };
  }

  @Post(':id/execute')
  @UseGuards(SubscriptionGuard)
  @ApiOperation({ summary: '立即执行任务' })
  async execute(@Request() req, @Param('id') id: string) {
    const task = await this.service.findOne(req.user.id, id);
    if (!task) return { success: false, message: '任务不存在' };
    if (task.status === TaskStatus.RUNNING) return { success: false, message: '任务已在运行中' };

    const params = task.executionData?.parameters || {};
    const taskAction = params.taskAction || task.taskAction;

    // Mark running
    await this.service.updateStatus(req.user.id, id, TaskStatus.RUNNING);
    clearLogs(id);
    appendLog(id, 'info', `▶ 开始执行任务：${task.name}`);
    appendLog(id, 'info', `任务类型：${taskAction}`);

    // Run async (don't await — return immediately so frontend can poll logs)
    this.runTask(req.user.id, id, taskAction, params, task).catch((err) => {
      appendLog(id, 'error', `❌ 任务执行未捕获异常：${err?.message || err}`);
      this.service.updateStatus(req.user.id, id, TaskStatus.FAILED, err?.message || '未知异常').catch(() => {});
    });

    return { success: true, message: '任务已开始执行，请查看实时日志' };
  }

  private async runTask(userId: string, taskId: string, taskAction: string, params: any, task: any) {
    const headless: boolean = params.headless !== undefined ? Boolean(params.headless) : true;
    try {
      if (taskAction === 'auto_simulate') {
        const accountId = params.accountAId || task.accountId;
        if (!accountId) {
          appendLog(taskId, 'error', '❌ 未找到目标账号ID');
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED);
          return;
        }

        // Resolve VPN proxy for this account
        const [acc] = await this.dataSource.query(
          `SELECT email, "vpnConfigId", "loginStatus" FROM facebook_accounts WHERE id = $1`,
          [accountId],
        );
        if (!acc) {
          appendLog(taskId, 'error', `❌ 账号不存在 (id: ${accountId})`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED);
          return;
        }

        appendLog(taskId, 'info', `👤 目标账号：${acc.email}`);
        if (!acc.loginStatus) appendLog(taskId, 'warn', '⚠️ 账号未登录，将尝试使用已保存的 Session');

        appendLog(taskId, 'info', '🌐 正在启动浏览器...');

        // Patch AccountWarmingService to use our log function
        const duration = params.durationMinutes || 30;
        const actions = params.warmingActions || ['scroll_feed', 'watch_video', 'like_post'];
        appendLog(taskId, 'info', `⏱ 模拟时长：${duration} 分钟`);
        appendLog(taskId, 'info', `🎯 执行动作：${actions.join(', ')}`);

        // Override warming service logger to capture logs
        const originalExecute = this.warmingService.execute.bind(this.warmingService);

        // Proxy the warming service to capture internal logs
        const patchedWarmingService = {
          execute: async (p: any) => {
            // We'll intercept by polling the NestJS logger — instead, use a wrapper
            appendLog(taskId, 'info', '🖥️ Chrome 浏览器已打开，正在导航到 Facebook...');

            // Run with progress callbacks via monkey-patching the session
            const result = await this.runWarmingWithLogs(taskId, accountId, duration, actions, headless);
            return result;
          }
        };

        const result = await patchedWarmingService.execute({
          accountId, durationMinutes: duration, actions,
        });

        if (result.success) {
          appendLog(taskId, 'success', `✅ 模拟完成！共执行了 ${result.actionsPerformed} 个操作`);
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else if (result.error !== 'cancelled') {
          const reason = result.error || '未知错误';
          appendLog(taskId, 'error', `❌ 执行失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          const reason = result.error || '聊天执行失败';
          appendLog(taskId, 'error', `❌ 聊天失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          const reason = result.error || '发帖失败';
          appendLog(taskId, 'error', `❌ 发帖失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          const reason = result.error || '发视频失败';
          appendLog(taskId, 'error', `❌ 发视频失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          const reason = result.error || '拨号失败';
          appendLog(taskId, 'error', `❌ 拨号失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          const reason = result.error || '加好友失败';
          appendLog(taskId, 'error', `❌ 失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          const reason = result.error || '接受申请失败';
          appendLog(taskId, 'error', `❌ 失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          const reason = result.error || '留言失败';
          appendLog(taskId, 'error', `❌ 失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          const reason = result.error || 'Follow 失败';
          appendLog(taskId, 'error', `❌ 失败：${reason}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
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
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        } else {
          appendLog(taskId, 'warn', `⚠️ 组合任务部分完成：${summaryLine}`);
          await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
        }

      } else {
        appendLog(taskId, 'warn', `⚠️ 任务类型 "${taskAction}" 的执行功能开发中`);
        await this.service.updateStatus(userId, taskId, TaskStatus.COMPLETED);
      }

    } catch (err: any) {
      const reason = err.message || '未知异常';
      appendLog(taskId, 'error', `❌ 执行异常：${reason}`);
      await this.service.updateStatus(userId, taskId, TaskStatus.FAILED, reason);
    } finally {
      // 任务结束后自动关闭"查看窗口"打开的监控浏览器
      this.closeMonitorBrowsers(taskId);
    }
  }

  /** Ensure logged into Facebook — tries cookie injection first, then credential login */
  private async ensureLoggedIn(page: any, accountId: string, taskId: string): Promise<boolean> {
    const randomDelay = (min: number, max: number) =>
      new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

    // ── Step 1: Check current URL ──────────────────────────────────────────
    const url = page.url();
    const onLoginPage = url.includes('/login') || url.includes('login.php');

    if (!onLoginPage) {
      // Check for profile icon (only visible when logged in)
      const loggedInIndicator = await page.$('[aria-label="Your profile"], [data-testid="royal_login_button"], div[role="navigation"]');
      const hasLoginForm = await page.$('input[name="pass"]');
      if (loggedInIndicator || !hasLoginForm) {
        appendLog(taskId, 'success', '✅ 账号已登录');
        return true;
      }
    }

    appendLog(taskId, 'warn', '⚠️ 账号未登录，正在尝试注入已保存的 Cookie...');

    // ── Step 2: Try injecting saved cookies from DB ────────────────────────
    const [acc] = await this.dataSource.query(
      `SELECT email, "facebookPassword", cookies FROM facebook_accounts WHERE id = $1`,
      [accountId],
    );

    if (acc?.cookies) {
      try {
        // JSONB 可能返回对象或字符串
        const cookieList = typeof acc.cookies === 'string'
          ? JSON.parse(acc.cookies)
          : acc.cookies;
        if (Array.isArray(cookieList) && cookieList.length > 0) {
          appendLog(taskId, 'info', `🍪 注入 ${cookieList.length} 个已保存的 Cookie...`);

          // Navigate to facebook.com first so cookies apply to the right domain
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });

          // Inject cookies
          for (const cookie of cookieList) {
            try {
              await page.setCookie({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain || '.facebook.com',
                path: cookie.path || '/',
                httpOnly: cookie.httpOnly || false,
                secure: cookie.secure || true,
              });
            } catch {}
          }

          // Reload to apply cookies
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await randomDelay(2000, 3000);

          const afterUrl = page.url();
          const stillOnLogin = afterUrl.includes('/login') || afterUrl.includes('login.php');
          if (!stillOnLogin) {
            appendLog(taskId, 'success', '✅ Cookie 注入成功，已自动登录！');
            return true;
          }
          appendLog(taskId, 'warn', '⚠️ Cookie 已过期，尝试使用密码登录...');
        }
      } catch (e: any) {
        appendLog(taskId, 'warn', `⚠️ Cookie 解析失败：${e.message}，尝试密码登录...`);
      }
    }

    // ── Step 3: Credential login as last resort ────────────────────────────
    if (!acc?.email || !acc?.facebookPassword) {
      appendLog(taskId, 'error', '❌ 无可用的 Cookie 或密码，请在账号管理中重新登录');
      return false;
    }

    // 解密密码
    let plainPassword: string;
    try {
      const [row] = await this.dataSource.query(
        `SELECT "userId" FROM facebook_accounts WHERE id = $1`, [accountId],
      );
      plainPassword = await this.facebookAccountsService.getDecryptedPassword(row.userId, accountId);
    } catch (e: any) {
      appendLog(taskId, 'error', `❌ 密码解密失败（加密密钥已变动，请重新编辑账号输入密码）：${e.message}`);
      return false;
    }

    try {
      appendLog(taskId, 'info', `🔑 正在使用密码登录账号：${acc.email}`);
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await randomDelay(1500, 2500);

      await page.type('input[name="email"]', acc.email, { delay: 60 });
      await randomDelay(400, 800);
      await page.type('input[name="pass"]', plainPassword, { delay: 60 });
      await randomDelay(400, 800);

      // Press Enter (most reliable)
      await page.keyboard.press('Enter');

      // Wait for navigation with a longer timeout and fallback
      try {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch {
        // If timeout, check URL anyway — might have navigated but event missed
      }

      await randomDelay(2000, 3000);
      const finalUrl = page.url();

      if (finalUrl.includes('checkpoint') || finalUrl.includes('two_step') || finalUrl.includes('help')) {
        appendLog(taskId, 'error', '❌ Facebook 需要安全验证（双因子验证/手机确认），请手动处理后重试');
        return false;
      }
      if (finalUrl.includes('/login')) {
        appendLog(taskId, 'error', '❌ 密码登录失败，请检查密码是否正确');
        return false;
      }

      appendLog(taskId, 'success', '✅ 密码登录成功！');
      await this.dataSource.query(
        `UPDATE facebook_accounts SET "loginStatus" = true WHERE id = $1`, [accountId],
      );
      return true;
    } catch (err: any) {
      appendLog(taskId, 'error', `❌ 登录异常：${err.message}`);
      return false;
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

      // ── Auto-login if needed ──────────────────────────────────────────────
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
        // Check if task was cancelled
        const current = await this.dataSource.query(
          `SELECT status FROM tasks WHERE id = $1`, [taskId],
        );
        if (current[0]?.status === 'cancelled') {
          appendLog(taskId, 'warn', '⏹ 收到停止信号，正在关闭浏览器...');
          break;
        }

        // Pick random action
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

        // Occasionally reload feed
        if (Math.random() < 0.25) {
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await randomDelay(1500, 3000);
        }
      }

      appendLog(taskId, 'success', `🏁 模拟结束，共执行 ${actionsPerformed} 个操作`);
      // Check if cancelled — don't overwrite with completed
      const finalStatus = await this.dataSource.query(`SELECT status FROM tasks WHERE id = $1`, [taskId]);
      if (finalStatus[0]?.status === 'cancelled') {
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

  @Post(':id/show-browser')
  @ApiOperation({ summary: '为运行中的任务弹出独立监控浏览器窗口（桌面调试用，不影响正在运行的任务）' })
  async showBrowser(@Request() req, @Param('id') id: string) {
    const task = await this.service.findOne(req.user.id, id);
    if (!task) return { success: false, message: '任务不存在' };

    const params = task.executionData?.parameters || {};

    // 收集所有涉及的账号 ID（聊天/通话任务有 A+B 两个账号）
    const accountIds: string[] = [];
    if (params.accountAId) accountIds.push(params.accountAId);
    if (params.accountBId && params.accountBId !== params.accountAId) {
      accountIds.push(params.accountBId);
    }
    if (accountIds.length === 0 && task.accountId) accountIds.push(task.accountId);
    if (accountIds.length === 0) return { success: false, message: '无法确定账号 ID' };

    const puppeteer = await import('puppeteer');
    const opened: string[] = [];

    // 为每个账号各自独立启动一个监控浏览器（不影响任务正在使用的 BrowserSession）
    for (const accountId of accountIds) {
      try {
        const [acc] = await this.dataSource.query(
          `SELECT name FROM facebook_accounts WHERE id = $1`, [accountId],
        );

        const browser = await (puppeteer as any).default.launch({
          headless: false,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
          defaultViewport: null,
        });
        const page = await browser.newPage();

        // 复用 ensureLoggedIn 完整流程：cookie 注入 → 失效则用账号密码自动登录
        try {
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          const loggedIn = await this.ensureLoggedIn(page, accountId, id);
          if (!loggedIn) {
            appendLog(id, 'warn', `⚠️ 监控窗口：账号 ${acc?.name || accountId} 自动登录失败，请在窗口中手动输入密码`);
          }
        } catch (e: any) {
          appendLog(id, 'error', `⚠️ 监控窗口登录异常（${acc?.name || accountId}）：${e.message}`);
        }

        // 存入 Map，任务完成时自动关闭；15 分钟兜底关闭
        if (!this.monitorBrowsers.has(id)) this.monitorBrowsers.set(id, []);
        this.monitorBrowsers.get(id)!.push(browser);
        setTimeout(() => {
          browser.close().catch(() => {});
          // 清理 Map 中对应的引用
          const list = this.monitorBrowsers.get(id);
          if (list) {
            const idx = list.indexOf(browser);
            if (idx >= 0) list.splice(idx, 1);
            if (list.length === 0) this.monitorBrowsers.delete(id);
          }
        }, 15 * 60 * 1000);
        opened.push(acc?.name || accountId);
      } catch { /* 单个账号失败不影响其他账号 */ }
    }

    if (opened.length === 0) return { success: false, message: '无法打开浏览器窗口' };

    return {
      success: true,
      message: `已打开 ${opened.length} 个监控窗口：${opened.join('、')}（独立窗口，任务完成后自动关闭）`,
    };
  }

  @Post(':id/start')
  @ApiOperation({ summary: '手动启动任务（同 execute）' })
  async start(@Request() req, @Param('id') id: string) {
    return this.execute(req, id);
  }

  @Post(':id/reset')
  @ApiOperation({ summary: '重置卡住的任务回到待执行状态' })
  async reset(@Request() req, @Param('id') id: string) {
    clearLogs(id);
    const task = await this.service.updateStatus(req.user.id, id, TaskStatus.PENDING);
    return { success: true, task };
  }
}
