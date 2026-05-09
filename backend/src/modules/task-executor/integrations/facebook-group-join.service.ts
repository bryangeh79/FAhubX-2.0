import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BrowserSessionService } from '../../facebook-accounts/browser-session.service';
import { UsersService } from '../../users/users.service';
import { AiClientService, AiProvider } from './ai-client.service';

const randomDelay = (min: number, max: number) =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

export interface GroupJoinParams {
  userId: string;
  accountId: string;
  keywords: string[];
  dailyLimit: number;
  strategy: 'random' | 'sequential' | 'weighted';
  aiAnswerEnabled: boolean;
  aiAnswerPrompt: string;
  /** v1.3.1 —— 任务级 AI 配置（override 全局）*/
  aiProviderOverride?: AiProvider;
  aiApiKeyOverride?: string;
  /** v1.3.1 —— 加群之间的随机间隔范围（毫秒）*/
  delayMinMs?: number;
  delayMaxMs?: number;
  headless?: boolean;
  logger: (level: 'info' | 'success' | 'warn' | 'error', msg: string) => void;
}

export interface GroupJoinResult {
  success: boolean;
  joined: number;           // 成功加入的群数
  skipped: number;          // 因有问题/需审核等跳过
  aiAnswered: number;       // AI 回答了问题的次数
  error?: string;
}

/**
 * v1.2.0 Phase 4b —— Facebook 群组搜索 + 加入执行器
 *
 * 流程：
 * 1. 根据策略挑一个关键词
 * 2. 导航到 https://www.facebook.com/groups/search/groups_home/?q=KEYWORD
 * 3. 扫描搜索结果，筛选「公开群」+「成员数 > 500」
 * 4. 逐个尝试 Join：
 *    4a. 无门槛 → 直接点 Join → 成功
 *    4b. 弹出问题框：
 *        - AI 未开启 → 关掉问题框，跳过这个群
 *        - AI 开启 → 调 AiClientService 生成答案 → 填入 → 提交
 * 5. 到达 dailyLimit 停止
 *
 * 日志通过 params.logger 回写任务日志（在 task-auto-runner 里 append 到 taskId）
 */
@Injectable()
export class FacebookGroupJoinService implements OnModuleInit {
  private readonly logger = new Logger(FacebookGroupJoinService.name);

  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly aiClient: AiClientService,
  ) {}

  /**
   * 启动时 ensure 表：group_join_history（每日加群限额跟踪）
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS group_join_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" UUID NOT NULL,
          "accountId" UUID NOT NULL,
          "dateKey" VARCHAR(10) NOT NULL,
          "groupUrl" TEXT,
          "groupName" TEXT,
          "keyword" VARCHAR(100),
          status VARCHAR(20) NOT NULL,
          "aiAnswered" BOOLEAN DEFAULT false,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_group_join_hist_acc_date
          ON group_join_history ("accountId", "dateKey")
      `);
      this.logger.log('✅ group_join_history schema ensured (v1.2.0 Phase 4b)');
    } catch (err: any) {
      this.logger.error(`group_join_history init failed: ${err.message}`);
    }
  }

  /**
   * 查今天某账号已加了多少群（用于 dailyLimit 判断）
   */
  private async getTodayJoinCount(accountId: string): Promise<number> {
    const today = localDateKey();
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM group_join_history
       WHERE "accountId" = $1 AND "dateKey" = $2 AND status = 'joined'`,
      [accountId, today],
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * 记录一次加群尝试
   */
  private async recordAttempt(
    userId: string,
    accountId: string,
    keyword: string,
    groupUrl: string,
    groupName: string,
    status: 'joined' | 'skipped_question' | 'skipped_private' | 'already_member' | 'failed',
    aiAnswered: boolean,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO group_join_history ("userId", "accountId", "dateKey", "groupUrl", "groupName", "keyword", status, "aiAnswered")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, accountId, localDateKey(), groupUrl, groupName, keyword, status, aiAnswered],
    );
  }

  /**
   * 根据策略挑关键词
   */
  private pickKeyword(keywords: string[], strategy: string): string {
    if (keywords.length === 0) return '';
    if (strategy === 'random') {
      return keywords[Math.floor(Math.random() * keywords.length)];
    }
    if (strategy === 'weighted') {
      // 靠前的权重高（1st 权重 N, 2nd N-1, ..., last 1）
      const weights = keywords.map((_, i) => keywords.length - i);
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < keywords.length; i++) {
        r -= weights[i];
        if (r <= 0) return keywords[i];
      }
      return keywords[0];
    }
    // sequential —— 简单轮转（基于秒数伪轮转）
    const idx = Math.floor(Date.now() / 60000) % keywords.length;
    return keywords[idx];
  }

  /**
   * 主入口：执行一次加群任务
   */
  async executeAutoJoinGroup(params: GroupJoinParams): Promise<GroupJoinResult> {
    const {
      userId, accountId, keywords, dailyLimit, strategy,
      aiAnswerEnabled, aiAnswerPrompt, headless, logger,
      aiProviderOverride, aiApiKeyOverride,
      delayMinMs, delayMaxMs,
    } = params;
    // 加群之间的间隔（默认 6-12 秒 —— 暖化调度器的老默认；显式传入则覆盖）
    const betweenGroupsMin = delayMinMs ?? 6_000;
    const betweenGroupsMax = delayMaxMs ?? 12_000;

    // ── 前置检查 ───────────────────────────────────────────────────────
    if (!keywords || keywords.length === 0) {
      return { success: false, joined: 0, skipped: 0, aiAnswered: 0, error: '未配置关键词' };
    }

    const alreadyToday = await this.getTodayJoinCount(accountId);
    if (alreadyToday >= dailyLimit) {
      logger('warn', `⏭ 今日已加 ${alreadyToday}/${dailyLimit} 个群，达到上限，跳过本次`);
      return { success: true, joined: 0, skipped: 0, aiAnswered: 0 };
    }

    const remaining = dailyLimit - alreadyToday;
    logger('info', `🎯 今日目标：再加 ${remaining} 个群（已加 ${alreadyToday}/${dailyLimit}）`);

    // AI Key 获取（如果开启）—— v1.3.1 优先用任务级覆盖，否则读全局加密存储
    let aiKeySet: { provider: AiProvider; apiKey: string } | null = null;
    if (aiAnswerEnabled) {
      if (aiApiKeyOverride && aiProviderOverride) {
        aiKeySet = { provider: aiProviderOverride, apiKey: aiApiKeyOverride };
        logger('info', `🤖 使用任务级 AI (${aiProviderOverride})`);
      } else {
        aiKeySet = await this.usersService.getDecryptedAiApiKey(userId);
        if (aiKeySet) {
          logger('info', `🤖 使用全局 AI (${aiKeySet.provider})`);
        }
      }
      if (!aiKeySet) {
        logger('warn', '⚠️ AI 模式已开启但未配置 API Key，退化为「跳过有问题的群」');
      }
    }

    // ── 启动浏览器 ──────────────────────────────────────────────────────
    let page: any = null;
    let joined = 0;
    let skipped = 0;
    let aiAnswered = 0;
    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless: headless ?? false });
      page = await this.browserSessionService.newPage(accountId);

      // 打开 FB 确保已登录
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(2000, 4000);
      const cookies = await page.cookies();
      const cUser = cookies.find((c: any) => c.name === 'c_user');
      if (!cUser) {
        logger('error', '❌ 账号未登录，请先完成登录');
        return { success: false, joined, skipped, aiAnswered, error: '账号未登录' };
      }
      logger('success', `✅ 账号已登录 (c_user=${cUser.value})`);

      // ── 逐个关键词尝试加群 ───────────────────────────────────────
      const keyword = this.pickKeyword(keywords, strategy);
      logger('info', `🔍 本次搜索关键词：${keyword}`);

      const searchUrl = `https://www.facebook.com/groups/search/groups_home/?q=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(3000, 5000);

      // 尝试滚动几下加载更多结果
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
        await randomDelay(1500, 2500);
      }

      // 扫描群组卡片 —— 提取 url + 名称 + 是否是公开群
      const candidates = await this.scanGroupCandidates(page);
      logger('info', `📋 搜索到 ${candidates.length} 个候选群`);

      if (candidates.length === 0) {
        logger('warn', '未找到任何群 —— 可能是 FB 改版或关键词无结果');
        return { success: true, joined, skipped, aiAnswered };
      }

      // 打乱顺序，避免每次都加同样几个群
      shuffle(candidates);

      for (const cand of candidates) {
        if (joined >= remaining) break;

        try {
          const outcome = await this.tryJoinOne(
            page, cand, aiAnswerEnabled && !!aiKeySet, aiKeySet, aiAnswerPrompt, keyword, logger,
          );
          await this.recordAttempt(
            userId, accountId, keyword, cand.url, cand.name,
            outcome.status, outcome.aiAnswered,
          );

          if (outcome.status === 'joined') {
            joined++;
            if (outcome.aiAnswered) aiAnswered++;
          } else {
            skipped++;
          }

          await randomDelay(betweenGroupsMin, betweenGroupsMax);
        } catch (err: any) {
          logger('warn', `⚠️ 尝试加群失败（${cand.name.slice(0, 30)}）：${err.message}`);
          skipped++;
        }
      }

      logger('success', `🏁 加群任务完成：成功 ${joined} 个，跳过 ${skipped} 个，AI 回答 ${aiAnswered} 次`);
      return { success: true, joined, skipped, aiAnswered };

    } catch (err: any) {
      logger('error', `❌ 加群任务异常：${err.message}`);
      return { success: false, joined, skipped, aiAnswered, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }

  /**
   * 扫描 FB 搜索结果页，提取候选群列表
   * 返回 [{ url, name }]（已去重，已过滤看起来是公开群的）
   */
  private async scanGroupCandidates(page: any): Promise<Array<{ url: string; name: string }>> {
    return page.evaluate(() => {
      const seen = new Set<string>();
      const out: Array<{ url: string; name: string }> = [];
      // FB groups 的链接是 /groups/{id}/ 或 /groups/{slug}/
      const links = Array.from(document.querySelectorAll('a[href*="/groups/"]')) as HTMLAnchorElement[];
      for (const a of links) {
        const href = a.href;
        // 过滤掉 search / create / yours 等非具体群的链接
        const m = href.match(/^https:\/\/www\.facebook\.com\/groups\/([^/?]+)\/?/);
        if (!m) continue;
        const id = m[1];
        if (['search', 'create', 'feed', 'discover', 'joins', 'yours'].includes(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        const text = (a.innerText || a.textContent || '').trim().split('\n')[0] || id;
        // 跳过太短或纯数字的 text（通常是误识别）
        if (text.length < 3) continue;
        out.push({ url: `https://www.facebook.com/groups/${id}/`, name: text });
        if (out.length >= 15) break;
      }
      return out;
    });
  }

  /**
   * 尝试加入一个群
   */
  private async tryJoinOne(
    page: any,
    cand: { url: string; name: string },
    allowAi: boolean,
    aiKey: { provider: AiProvider; apiKey: string } | null,
    aiPrompt: string,
    keyword: string,
    logger: GroupJoinParams['logger'],
  ): Promise<{ status: 'joined' | 'skipped_question' | 'skipped_private' | 'already_member' | 'failed'; aiAnswered: boolean }> {
    const shortName = cand.name.slice(0, 30);
    logger('info', `➡️ 尝试加入：${shortName}`);

    await page.goto(cand.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await randomDelay(3000, 5000);

    // 检查当前状态：已加入 / 有 Join 按钮 / 申请已发送
    const state = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const hasJoined = /You're a member|您是成员|Joined|已加入/i.test(bodyText);
      const hasRequested = /Request sent|请求已发送|Pending/i.test(bodyText);
      // Find Join button by text
      const allEls = Array.from(document.querySelectorAll('div[role="button"], a[role="button"], button')) as HTMLElement[];
      let joinBtn: HTMLElement | null = null;
      for (const el of allEls) {
        const t = (el.innerText || el.textContent || '').trim();
        if (/^(Join Group|Join|加入群组|加入)$/i.test(t)) {
          joinBtn = el;
          break;
        }
      }
      let btnCoords = null;
      if (joinBtn) {
        const r = joinBtn.getBoundingClientRect();
        btnCoords = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      return { hasJoined, hasRequested, btnCoords };
    });

    if (state.hasJoined) {
      logger('info', `ℹ️ 已经是该群成员，跳过`);
      return { status: 'already_member', aiAnswered: false };
    }
    if (state.hasRequested) {
      logger('info', `ℹ️ 已发送加群请求，等待审核，跳过`);
      return { status: 'skipped_private', aiAnswered: false };
    }
    if (!state.btnCoords) {
      logger('warn', `⚠️ 未找到 Join 按钮，跳过`);
      return { status: 'failed', aiAnswered: false };
    }

    // 点击 Join 按钮（OS 级鼠标点击）
    await page.mouse.click(state.btnCoords.x, state.btnCoords.y);
    await randomDelay(2500, 4000);

    // 检查是否弹出加群问题框
    const questions = await this.detectJoinQuestions(page);
    if (questions.length === 0) {
      // 没有问题 → 再确认一下是否进了 / 是否变成了「Request sent」
      const post = await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        return {
          hasJoined: /You're a member|您是成员|Joined|已加入/i.test(bodyText),
          hasRequested: /Request sent|请求已发送|Pending/i.test(bodyText),
        };
      });
      if (post.hasJoined) {
        logger('success', `✅ 已加入：${shortName}（无门槛）`);
        return { status: 'joined', aiAnswered: false };
      }
      if (post.hasRequested) {
        logger('info', `📮 已发送申请（需审核）：${shortName}`);
        // 视为 skipped_private（不算完成的加群，但已尝试）
        return { status: 'skipped_private', aiAnswered: false };
      }
      logger('warn', `⚠️ 加群后状态未知，跳过：${shortName}`);
      return { status: 'failed', aiAnswered: false };
    }

    // ── 弹出了问题框 ────────────────────────────────────────────
    logger('info', `❓ 检测到 ${questions.length} 个加群问题`);

    if (!allowAi || !aiKey) {
      // 关闭问题框，跳过
      logger('info', `⏭ AI 模式未开启，跳过有问题的群：${shortName}`);
      await this.closeQuestionDialog(page);
      return { status: 'skipped_question', aiAnswered: false };
    }

    // 调 AI 回答每个问题
    let answeredAll = true;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      logger('info', `🤖 问题 ${i + 1}/${questions.length}: ${q.slice(0, 60)}${q.length > 60 ? '...' : ''}`);
      const resp = await this.aiClient.generateAnswer({
        provider: aiKey.provider,
        apiKey: aiKey.apiKey,
        systemPrompt: aiPrompt || '你是一个礼貌、简短、友善的新人，回答群管理员的问题以便通过审核。',
        question: q,
        keyword,
        groupContext: cand.name,
      });
      if (!resp.success || !resp.answer) {
        logger('error', `❌ AI 回答失败：${resp.error}`);
        answeredAll = false;
        break;
      }
      logger('info', `💬 AI 答：${resp.answer.slice(0, 80)}`);
      const ok = await this.fillAnswerByIndex(page, i, resp.answer);
      if (!ok) {
        logger('warn', `⚠️ 填写问题 ${i + 1} 的答案失败`);
        answeredAll = false;
        break;
      }
      await randomDelay(1500, 3000);
    }

    if (!answeredAll) {
      await this.closeQuestionDialog(page);
      return { status: 'skipped_question', aiAnswered: true };
    }

    // 提交申请
    const submitted = await this.submitJoinDialog(page);
    if (!submitted) {
      logger('warn', `⚠️ 未找到「提交」按钮`);
      return { status: 'failed', aiAnswered: true };
    }

    await randomDelay(3000, 5000);
    logger('success', `✅ 已提交加群申请（含 AI 回答）：${shortName}`);
    return { status: 'joined', aiAnswered: true };
  }

  /**
   * 检测加群问题框 —— 返回问题文本数组
   * 多重检测策略：
   * 1. 找 [role="dialog"] 里所有 textarea / input[type=text]
   * 2. 每个输入框向上找 label / 前面的文字（问题文本）
   * 3. 如果有 "Answer questions" / "回答问题" 标题，确认是加群问题框
   */
  private async detectJoinQuestions(page: any): Promise<string[]> {
    return page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
      if (!dialog) return [];
      const title = (dialog.innerText || '').slice(0, 200);
      // 标题过滤：必须看起来像问题框
      const looksLikeQuestionDialog =
        /answer|question|问题|请回答|Why|为什么/i.test(title);
      if (!looksLikeQuestionDialog) return [];

      const inputs = Array.from(dialog.querySelectorAll('textarea, input[type="text"]')) as HTMLElement[];
      if (inputs.length === 0) return [];

      const questions: string[] = [];
      for (const input of inputs) {
        // 向上找最近的「question 文本」—— 一般在 input 前面的 div
        let el: HTMLElement | null = input;
        let found = '';
        for (let up = 0; up < 6 && el; up++) {
          el = el.parentElement;
          if (!el) break;
          const siblings = Array.from(el.children) as HTMLElement[];
          for (const sib of siblings) {
            if (sib === input || sib.contains(input)) continue;
            const t = (sib.innerText || '').trim();
            if (t.length > 5 && t.length < 300 && !t.includes('Answer')) {
              found = t.split('\n')[0];
              break;
            }
          }
          if (found) break;
        }
        questions.push(found || '（未识别问题文本）');
      }
      return questions.slice(0, 3); // FB 最多 3 个问题
    });
  }

  /**
   * 填入第 index 个问题的答案
   */
  private async fillAnswerByIndex(page: any, index: number, answer: string): Promise<boolean> {
    // 先定位 input
    const clicked: { x: number; y: number } | null = await page.evaluate((idx: number) => {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
      if (!dialog) return null;
      const inputs = Array.from(dialog.querySelectorAll('textarea, input[type="text"]')) as HTMLElement[];
      const input = inputs[idx];
      if (!input) return null;
      const r = input.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, index);

    if (!clicked) return false;

    await page.mouse.click(clicked.x, clicked.y);
    await randomDelay(300, 700);
    // 用 keyboard 打字，保留延迟避免被识别为机器人
    await page.keyboard.type(answer, { delay: 40 + Math.random() * 30 });
    return true;
  }

  /**
   * 提交问题框 —— 找 "Submit"/"Send Request"/"提交" 按钮
   */
  private async submitJoinDialog(page: any): Promise<boolean> {
    const coords = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
      if (!dialog) return null;
      const btns = Array.from(dialog.querySelectorAll('div[role="button"], button')) as HTMLElement[];
      for (const b of btns) {
        const t = (b.innerText || '').trim();
        if (/^(Submit|Send Request|Request|Join|提交|发送|加入)/i.test(t)) {
          const r = b.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });
    if (!coords) return false;
    await page.mouse.click(coords.x, coords.y);
    return true;
  }

  /**
   * 关闭问题框（Esc + 点 × 按钮双保险）
   */
  private async closeQuestionDialog(page: any): Promise<void> {
    try { await page.keyboard.press('Escape'); } catch {}
    await randomDelay(500, 1000);
    // 如果还在，点 × 按钮
    try {
      const coords = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
        if (!dialog) return null;
        const closeBtn = dialog.querySelector('[aria-label="Close"], [aria-label="关闭"]') as HTMLElement | null;
        if (!closeBtn) return null;
        const r = closeBtn.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (coords) await page.mouse.click(coords.x, coords.y);
    } catch {}
  }
}

function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
