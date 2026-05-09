import { Injectable, Logger } from '@nestjs/common';
import { BrowserSessionService } from '../../facebook-accounts/browser-session.service';
import { ChatScriptsService } from '../../chat-scripts/chat-scripts.service';
import { DataSource } from 'typeorm';

const randomDelay = (min: number, max: number) =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

@Injectable()
export class FacebookChatService {
  private readonly logger = new Logger(FacebookChatService.name);

  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly chatScriptsService: ChatScriptsService,
    private readonly dataSource: DataSource,
  ) {}

  async executeAutoChat(params: {
    accountAId: string;
    accountBId: string;
    scriptId: string;
    aiEnabled: boolean;
    userId: string;
    headless?: boolean;
  }): Promise<{ success: boolean; messagesSent: number; error?: string }> {
    const { accountAId, accountBId, scriptId, aiEnabled, userId } = params;

    // ── Load both accounts ──────────────────────────────────────────────────
    const [accA] = await this.dataSource.query(
      `SELECT id, name, email, cookies, "facebookId", messenger_pin AS "messengerPin" FROM facebook_accounts WHERE id = $1`,
      [accountAId],
    );
    const [accB] = await this.dataSource.query(
      `SELECT id, name, email, cookies, "facebookId", messenger_pin AS "messengerPin" FROM facebook_accounts WHERE id = $1`,
      [accountBId],
    );

    if (!accA) return { success: false, messagesSent: 0, error: '账号A不存在' };
    if (!accB) return { success: false, messagesSent: 0, error: '账号B不存在' };
    if (!accA.cookies) return { success: false, messagesSent: 0, error: `账号A「${accA.name}」尚未登录，请先在账号管理中登录` };
    if (!accB.cookies) return { success: false, messagesSent: 0, error: `账号B「${accB.name}」尚未登录，请先在账号管理中登录` };
    if (!accA.facebookId) return { success: false, messagesSent: 0, error: `账号A「${accA.name}」没有 Facebook ID，请重新登录自动获取` };
    if (!accB.facebookId) return { success: false, messagesSent: 0, error: `账号B「${accB.name}」没有 Facebook ID，请重新登录自动获取` };

    // ── Load script ─────────────────────────────────────────────────────────
    const script = await this.chatScriptsService.findOne(userId, scriptId);
    if (!script) return { success: false, messagesSent: 0, error: '剧本不存在' };

    let pageA: any = null;
    let pageB: any = null;
    let messagesSent = 0;

    try {
      // ── Launch both Chrome instances in parallel ─────────────────────────
      this.logger.log(`[dual_chat] Launching browsers for A:${accA.name} and B:${accB.name}`);
      await Promise.all([
        this.browserSessionService.getOrLaunchSession(accountAId, { headless: params.headless ?? true }),
        this.browserSessionService.getOrLaunchSession(accountBId, { headless: params.headless ?? true }),
      ]);

      pageA = await this.browserSessionService.newPage(accountAId);
      pageB = await this.browserSessionService.newPage(accountBId);

      // ── Login both accounts ──────────────────────────────────────────────
      this.logger.log(`[dual_chat] Logging in both accounts...`);
      const [loginA, loginB] = await Promise.all([
        this.injectCookiesAndLogin(pageA, accA),
        this.injectCookiesAndLogin(pageB, accB),
      ]);

      if (!loginA) {
        return { success: false, messagesSent: 0, error: `账号A「${accA.name}」Cookie 已过期，请重新登录` };
      }
      if (!loginB) {
        return { success: false, messagesSent: 0, error: `账号B「${accB.name}」Cookie 已过期，请重新登录` };
      }

      this.logger.log(`[dual_chat] Both accounts logged in ✅`);

      // ── Open chat windows (sequential so each blocker is fully handled) ──
      // A opens chat with B
      this.logger.log(`[dual_chat] Opening A→B chat...`);
      await pageA.goto(`https://www.facebook.com/messages/t/${accB.facebookId}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await randomDelay(3000, 4000);
      await this.handleMessengerPin(pageA, accA);        // Step 1: PIN
      await this.handleContinueButton(pageA, accA);      // Step 2: Continue (encryption notice)
      await this.handleAcceptBar(pageA, accA);           // Step 3: Accept (friend/message request bar)
      this.logger.log(`[dual_chat] A chat window ready ✅`);

      // B opens chat with A
      this.logger.log(`[dual_chat] Opening B→A chat...`);
      await pageB.goto(`https://www.facebook.com/messages/t/${accA.facebookId}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await randomDelay(3000, 4000);
      await this.handleMessengerPin(pageB, accB);        // Step 1: PIN
      await this.handleContinueButton(pageB, accB);      // Step 2: Continue (encryption notice)
      await this.handleAcceptBar(pageB, accB);           // Step 3: Accept (friend/message request bar)
      this.logger.log(`[dual_chat] B chat window ready ✅`);

      // ── Run dual conversation ────────────────────────────────────────────
      if (aiEnabled) {
        messagesSent = await this.runDualAiChat(pageA, pageB, accA, accB, script, params);
      } else {
        messagesSent = await this.runDualScriptChat(pageA, pageB, script);
      }

      return { success: true, messagesSent };

    } catch (err: any) {
      this.logger.error(`[dual_chat] Error: ${err.message}`);
      return { success: false, messagesSent, error: err.message };
    } finally {
      if (pageA) await pageA.close().catch(() => {});
      if (pageB) await pageB.close().catch(() => {});
      this.browserSessionService.releaseSession(accountAId);
      this.browserSessionService.releaseSession(accountBId);
    }
  }

  /** 注入 Cookie 并验证登录 */
  private async injectCookiesAndLogin(page: any, acc: any): Promise<boolean> {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const cookieList = typeof acc.cookies === 'string' ? JSON.parse(acc.cookies) : acc.cookies;
    for (const cookie of cookieList) {
      try {
        await page.setCookie({
          name: cookie.name, value: cookie.value,
          domain: cookie.domain || '.facebook.com',
          path: cookie.path || '/',
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure !== false,
        });
      } catch { /* ignore */ }
    }
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3000);
    const cookies = await page.cookies();
    const cUser = cookies.find((c: any) => c.name === 'c_user');
    if (cUser) {
      this.logger.log(`[dual_chat] ${acc.email} logged in (ID: ${cUser.value})`);
    }
    return !!cUser;
  }

  /**
   * 双向剧本对话：
   * 每个阶段有 sender 字段('A'|'B')，明确指定哪个账号发送
   * 若 sender 未设置，则按阶段序号奇偶交替（0=A, 1=B, 2=A...）
   */
  private async runDualScriptChat(pageA: any, pageB: any, script: any): Promise<number> {
    let sent = 0;
    const phases = script.phases || [];

    if (phases.length === 0) {
      this.logger.warn('[dual_chat] Script has no phases!');
      return 0;
    }

    this.logger.log(`[dual_chat] Running script "${script.title}" with ${phases.length} phases`);

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const messages: string[] = (phase.messages || []).filter((m: string) => m?.trim());

      if (messages.length === 0) {
        this.logger.log(`[dual_chat] Phase ${i + 1} "${phase.label}" has no messages, skipping`);
        continue;
      }

      // 优先使用 phase.sender，否则按奇偶交替
      let senderLabel: 'A' | 'B';
      if (phase.sender === 'A' || phase.sender === 'B') {
        senderLabel = phase.sender;
      } else {
        senderLabel = i % 2 === 0 ? 'A' : 'B';
      }

      const senderPage = senderLabel === 'A' ? pageA : pageB;

      // messages 数组是"同一阶段的多个变体"，随机选一条发送
      const msg = messages[Math.floor(Math.random() * messages.length)];
      this.logger.log(`[dual_chat] Phase ${i + 1} "${phase.label}" → 账号${senderLabel} 发送: ${msg.substring(0, 60)}`);
      await this.sendMessage(senderPage, msg);
      sent++;

      // 阶段间停顿（模拟对方在阅读和思考回复）
      if (i < phases.length - 1) {
        await randomDelay(4000, 10000);
      }
    }

    this.logger.log(`[dual_chat] Script completed. Total messages sent: ${sent}`);
    return sent;
  }

  /**
   * 双向 AI 对话：
   * A 按剧本开场，B 用 AI 回复，A 再用 AI 回复，轮流进行
   */
  private async runDualAiChat(pageA: any, pageB: any, accA: any, accB: any, script: any, params: any): Promise<number> {
    const aiSettings = await this.loadAiSettings(params.userId);
    if (!aiSettings?.apiKey) {
      this.logger.warn('[dual_chat] No AI key, falling back to script mode');
      return this.runDualScriptChat(pageA, pageB, script);
    }

    let sent = 0;
    const history: Array<{ role: string; content: string }> = [];
    const maxRounds = 5;

    // A 先按剧本发第一句
    const firstMsg = script.phases?.[0]?.messages?.[0] || '你好！';
    this.logger.log(`[dual_chat] A 发起对话: ${firstMsg}`);
    await this.sendMessage(pageA, firstMsg);
    sent++;
    history.push({ role: 'user', content: firstMsg });
    await randomDelay(5000, 10000);

    for (let round = 0; round < maxRounds; round++) {
      // B 刷新并用 AI 生成回复
      await pageB.reload({ waitUntil: 'domcontentloaded' });
      await randomDelay(2000, 4000);

      const bReply = await this.callAiApi(aiSettings, script, [
        ...history,
      ], `你是账号B（${accB.name}），正在与账号A（${accA.name}）对话。根据对话历史，自然地回复对方。不超过2句话。`);

      if (!bReply) break;
      this.logger.log(`[dual_chat] B 回复: ${bReply.substring(0, 40)}`);
      await this.sendMessage(pageB, bReply);
      sent++;
      history.push({ role: 'assistant', content: bReply });
      await randomDelay(5000, 12000);

      // A 刷新并用 AI 生成回复
      await pageA.reload({ waitUntil: 'domcontentloaded' });
      await randomDelay(2000, 4000);

      const aReply = await this.callAiApi(aiSettings, script, [
        ...history,
      ], `你是账号A（${accA.name}），正在与账号B（${accB.name}）对话。根据对话历史，自然地继续聊天。不超过2句话。`);

      if (!aReply) break;
      this.logger.log(`[dual_chat] A 回复: ${aReply.substring(0, 40)}`);
      await this.sendMessage(pageA, aReply);
      sent++;
      history.push({ role: 'user', content: aReply });
      await randomDelay(5000, 12000);
    }

    return sent;
  }

  /**
   * 自动处理 Messenger PIN 弹窗（全程使用真实鼠标坐标点击，确保 React 响应）
   *
   * 流程：
   *  1. 检测页面是否有 PIN 相关弹窗
   *  2. 若是"创建PIN"引导页（只有 Create PIN 按钮，没有输入框）→ 先鼠标点击该按钮
   *  3. 等待 PIN 输入框出现
   *  4. 鼠标点击第一个输入框激活焦点，逐位键入 PIN
   *  5. 鼠标点击 Next/Continue 按钮（不用 JS .click()）
   *  6. 如需二次确认，重复步骤 4-5
   *  7. 等待弹窗消失
   */
  private async handleMessengerPin(page: any, acc: any): Promise<void> {
    try {
      await new Promise(r => setTimeout(r, 2500));

      // ── 辅助：获取页面文字 ────────────────────────────────────────────────
      const getPageText = (): Promise<string> =>
        page.evaluate(() => document.body.innerText || '').catch(() => '');

      // ── 辅助：用真实鼠标坐标点击匹配正则的第一个可见按钮 ─────────────────
      const mouseClickButton = async (pattern: RegExp, label: string): Promise<boolean> => {
        const coords: { x: number; y: number } | null = await page.evaluate(
          (pat: string) => {
            const re = new RegExp(pat, 'i');
            const btns = Array.from(
              document.querySelectorAll('button, [role="button"], a[role="button"]'),
            ) as HTMLElement[];
            for (const btn of btns) {
              const t = (btn.innerText || btn.textContent || '').trim();
              if (re.test(t)) {
                const r = btn.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                }
              }
            }
            return null;
          },
          pattern.source,
        ).catch(() => null);

        if (!coords) return false;
        this.logger.log(`[pin] [${label}] mouse-click at (${Math.round(coords.x)},${Math.round(coords.y)})`);
        await page.mouse.move(coords.x, coords.y);
        await new Promise(r => setTimeout(r, 150));
        await page.mouse.click(coords.x, coords.y);
        return true;
      };

      // ── 辅助：找 PIN 输入框并用鼠标点击激活，然后逐位键入 ─────────────────
      const fillPin = async (pinStr: string): Promise<boolean> => {
        // 广泛的输入框选择器
        const SEL = [
          'input[maxlength="1"]',
          'input[inputmode="numeric"]',
          'input[type="tel"]',
          'input[autocomplete="one-time-code"]',
          'input[type="number"]',
          'input[maxlength]',
        ].join(', ');

        const coords: { x: number; y: number } | null = await page.evaluate(
          (sel: string) => {
            const inputs = Array.from(document.querySelectorAll(sel)) as HTMLInputElement[];
            const first = inputs.find(el => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            });
            if (first) {
              const r = first.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            return null;
          },
          SEL,
        ).catch(() => null);

        if (coords) {
          await page.mouse.click(coords.x, coords.y);
          this.logger.log(`[pin] Clicked PIN input at (${Math.round(coords.x)},${Math.round(coords.y)})`);
        } else {
          // 没找到输入框 — 聚焦弹窗后尝试键盘 Tab 找焦点
          this.logger.warn(`[pin] No PIN input found, trying Tab focus...`);
          await page.keyboard.press('Tab');
        }

        await new Promise(r => setTimeout(r, 400));
        for (const digit of pinStr.split('')) {
          await page.keyboard.press(digit);
          await new Promise(r => setTimeout(r, 120));
        }
        this.logger.log(`[pin] PIN digits typed`);
        return true;
      };

      // ── Step 1：检测是否有 PIN 弹窗 ──────────────────────────────────────
      const pageText = await getPageText();
      const hasPinDialog =
        /Enter your PIN|restore your chats|Create a? PIN|Set a PIN|Secure your messages|输入PIN|输入你的 PIN|创建 ?PIN|设置 ?PIN/i.test(pageText);

      if (!hasPinDialog) return;

      const isCreate = /Create|Set a PIN|Secure|创建|设置/i.test(pageText);
      this.logger.log(`[pin] ${acc.email} — ${isCreate ? '创建PIN' : '输入PIN'} dialog detected`);

      // ── Step 2：确保 PIN 已配置（账号创建时应已填入）──────────────────────
      let pin: string | null = acc.messengerPin || null;
      if (!pin) {
        if (!isCreate) {
          throw new Error(`账号「${acc.name}」需要输入 Messenger PIN，请在账号管理 → 编辑账号 → 填写 Messenger PIN`);
        }
        pin = String(Math.floor(100000 + Math.random() * 900000));
        this.logger.log(`[pin] 未配置 PIN，自动生成 ${pin} 并保存到 DB`);
        await this.dataSource.query(
          `UPDATE facebook_accounts SET messenger_pin = $1 WHERE id = $2`,
          [pin, acc.id],
        );
      }

      // ── Step 3：若是引导页（只有 Create PIN 按钮，还没有输入框）先点按钮 ──
      if (isCreate) {
        const hasInputAlready: boolean = await page.evaluate(() => {
          const SEL = 'input[maxlength="1"], input[inputmode="numeric"], input[type="tel"]';
          const el = document.querySelector(SEL) as HTMLElement | null;
          return el ? el.getBoundingClientRect().width > 0 : false;
        }).catch(() => false);

        if (!hasInputAlready) {
          this.logger.log(`[pin] On intro screen — clicking "Create PIN" button...`);
          const clicked = await mouseClickButton(/^create\s*pin$|^创建\s*pin$/i, 'intro-btn');
          if (clicked) {
            // 等待 PIN 输入框真正出现
            try {
              await page.waitForSelector(
                'input[maxlength="1"], input[inputmode="numeric"], input[type="tel"], input[autocomplete="one-time-code"]',
                { timeout: 8000 },
              );
              this.logger.log(`[pin] PIN input appeared after clicking intro button`);
            } catch {
              this.logger.warn(`[pin] waitForSelector timed out, proceeding anyway`);
              await new Promise(r => setTimeout(r, 2000));
            }
          } else {
            this.logger.warn(`[pin] "Create PIN" button not found by regex — taking debug screenshot`);
            await page.screenshot({ path: 'C:/AI_WORKSPACE/pin_debug.png' }).catch(() => {});
          }
        }
      }

      // ── Step 4：填入 PIN（第一次）────────────────────────────────────────
      this.logger.log(`[pin] Filling PIN step 1...`);
      await fillPin(pin);
      await new Promise(r => setTimeout(r, 500));

      // ── Step 5：点 Next / Continue 按钮（真实鼠标）────────────────────────
      const clickedNext = await mouseClickButton(
        /^(next|continue|confirm|done|submit|ok|继续|确认|下一步)$/i,
        'next-btn',
      );
      if (!clickedNext) {
        this.logger.warn(`[pin] Next button not found, pressing Enter`);
        await page.keyboard.press('Enter');
      }
      await new Promise(r => setTimeout(r, 1500));

      // ── Step 6：创建流程需要二次确认填写 ─────────────────────────────────
      if (isCreate) {
        await new Promise(r => setTimeout(r, 1000));
        const step2 = await getPageText();
        if (/Confirm|Re-enter|确认|再次输入/i.test(step2)) {
          this.logger.log(`[pin] PIN confirmation screen — filling step 2...`);
          await fillPin(pin);
          await new Promise(r => setTimeout(r, 500));
          const clickedNext2 = await mouseClickButton(
            /^(next|continue|confirm|done|submit|ok|继续|确认|下一步)$/i,
            'next-btn-2',
          );
          if (!clickedNext2) await page.keyboard.press('Enter');
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      // ── Step 7：等待 PIN 弹窗消失（最多 30 秒）───────────────────────────
      this.logger.log(`[pin] Waiting for PIN dialog to clear...`);
      const deadline = Date.now() + 30000;
      let passed = false;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1500));
        const still: boolean = await page.evaluate(() => {
          const t = document.body.innerText || '';
          return /Enter your PIN|Create a? PIN|Set a PIN|restore your chats/i.test(t);
        }).catch(() => false);
        if (!still) { passed = true; break; }
        this.logger.log(`[pin] Still on PIN screen...`);
      }

      if (!passed) {
        await page.screenshot({ path: 'C:/AI_WORKSPACE/pin_timeout.png' }).catch(() => {});
        throw new Error(`账号「${acc.name}」PIN 处理超时（30s），已截图保存到 C:/AI_WORKSPACE/pin_timeout.png，请检查 PIN 是否正确`);
      }
      this.logger.log(`[pin] ✅ PIN cleared for ${acc.email}`);

    } catch (err: any) {
      if (err.message.includes('Messenger PIN') || err.message.includes('PIN 处理超时')) throw err;
      this.logger.warn(`[pin] PIN handling error for ${acc.email}: ${err.message}`);
    }
  }

  /**
   * 辅助：通过屏幕坐标点击页面上特定文字的按钮
   * 使用 page.mouse.click(x,y) — OS 级别真实点击，React 必定响应
   */
  private async clickButtonByText(page: any, keywords: string[], label: string): Promise<string | null> {
    const result: { kw: string; x: number; y: number } | null = await page.evaluate(
      (kws: string[]) => {
        const allEls = Array.from(document.querySelectorAll('*')) as HTMLElement[];
        for (const kw of kws) {
          for (const el of allEls) {
            const t = (el.innerText || el.textContent || '').trim();
            if (t === kw) {
              const r = el.getBoundingClientRect();
              if (r.width > 5 && r.height > 5) {
                return { kw, x: r.left + r.width / 2, y: r.top + r.height / 2 };
              }
            }
          }
        }
        return null;
      },
      keywords,
    ).catch(() => null);

    if (!result) return null;

    this.logger.log(`[chat] [${label}] Found "${result.kw}" at (${Math.round(result.x)},${Math.round(result.y)}), mouse-clicking...`);
    await page.mouse.move(result.x, result.y);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.click(result.x, result.y);
    return result.kw;
  }

  /**
   * Step 2: 处理「Continue」加密提示覆盖层
   * 这是一个全屏/半屏遮罩，必须点击后才能进入聊天室
   */
  private async handleContinueButton(page: any, acc: any): Promise<void> {
    try {
      const CONTINUE_KWS = ['Continue', '继续', 'OK', 'Got it', '好的', '知道了'];
      const maxWait = 20000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        const clicked = await this.clickButtonByText(page, CONTINUE_KWS, 'continue');
        if (clicked) {
          this.logger.log(`[chat] ✅ Continue clicked for ${acc.email}`);
          await new Promise(r => setTimeout(r, 3000)); // 等页面响应
          // 检查是否还有 Continue（有时有两层）
          const again = await this.clickButtonByText(page, CONTINUE_KWS, 'continue2');
          if (again) {
            this.logger.log(`[chat] ✅ Second Continue clicked for ${acc.email}`);
            await new Promise(r => setTimeout(r, 2000));
          }
          return;
        }

        // 检查页面是否已经有消息输入框（没有 Continue，直接进入了）
        const hasInput = await page.evaluate(() => {
          const el = document.querySelector('[contenteditable="true"], textarea') as HTMLElement | null;
          return el ? el.getBoundingClientRect().width > 0 : false;
        }).catch(() => false);

        if (hasInput) return; // 不需要 Continue

        // 检查页面文字，确认是否存在 Continue 提示
        const bodyText: string = await page.evaluate(() => document.body.innerText || '').catch(() => '');
        if (bodyText.includes('secured with end-to-end') || bodyText.includes('Continue') || bodyText.includes('继续')) {
          this.logger.log(`[chat] Continue prompt detected, retrying click...`);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        return; // 没有 Continue 提示，直接返回
      }
    } catch (err: any) {
      this.logger.warn(`[chat] handleContinueButton error: ${err.message}`);
    }
  }

  /**
   * Step 3: 处理「底部 Accept 栏」（好友申请 / 消息请求）
   * Facebook 显示 Block | Delete | Accept 三个按钮，替代消息输入框
   * 必须点 Accept 后消息输入框才会出现
   */
  private async handleAcceptBar(page: any, acc: any): Promise<void> {
    try {
      const ACCEPT_KWS = ['Accept', '接受', '同意', 'Confirm', '确认'];
      const maxWait = 30000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        // 检查消息输入框是否已可用（没有 Accept 栏）
        const hasInput = await page.evaluate(() => {
          // 真正可用的输入框：contenteditable 且没有被 Accept 栏覆盖
          // 通过检查附近是否有 Block/Delete 按钮来判断是否是 Accept 状态
          const hasBlock = Array.from(document.querySelectorAll('*')).some(
            (el: any) => (el.innerText || '').trim() === 'Block' &&
                          el.getBoundingClientRect().width > 0
          );
          if (hasBlock) return false; // Accept 栏还在

          const inputEl = document.querySelector('[contenteditable="true"], textarea') as HTMLElement | null;
          return inputEl ? inputEl.getBoundingClientRect().width > 0 : false;
        }).catch(() => false);

        if (hasInput) {
          this.logger.log(`[chat] ✅ Message input ready (no Accept bar) for ${acc.email}`);
          return;
        }

        // 尝试点击 Accept
        const clicked = await this.clickButtonByText(page, ACCEPT_KWS, 'accept');
        if (clicked) {
          this.logger.log(`[chat] ✅ Accept clicked for ${acc.email}`);
          await new Promise(r => setTimeout(r, 3000));
          return;
        }

        // 截图（前2次）
        try {
          const path = `C:/AI_WORKSPACE/accept_debug_${acc.email.split('@')[0]}.png`;
          await page.screenshot({ path });
          this.logger.log(`[chat] Debug screenshot: ${path}`);
        } catch { /* ignore */ }

        this.logger.log(`[chat] Waiting for Accept bar or input for ${acc.email}...`);
        await new Promise(r => setTimeout(r, 1500));
      }

      this.logger.warn(`[chat] handleAcceptBar timed out for ${acc.email}`);
    } catch (err: any) {
      this.logger.warn(`[chat] handleAcceptBar error: ${err.message}`);
    }
  }

  private async sendMessage(page: any, text: string): Promise<void> {
    await new Promise(r => setTimeout(r, 1500));

    const inputSelectors = [
      '[contenteditable="true"][aria-label]',
      '[contenteditable="true"][aria-placeholder]',
      '[role="textbox"][contenteditable="true"]',
      'textarea[name="body"]',
      '[data-testid="mcomposer-input"]',
      'textarea[placeholder]',
      'textarea',
      '[contenteditable="true"]',
    ];

    let input: any = null;
    for (const sel of inputSelectors) {
      try {
        input = await page.$(sel);
        if (input) { this.logger.log(`[dual_chat] Input found: ${sel}`); break; }
      } catch { /* ignore */ }
    }

    if (!input) {
      try {
        input = await Promise.race([
          page.waitForSelector('[contenteditable="true"]', { timeout: 5000 }),
          page.waitForSelector('textarea', { timeout: 5000 }),
        ]);
      } catch { /* ignore */ }
    }

    if (!input) {
      // Last resort: click any known blocker button (Continue / Accept / OK…) and retry
      const blockerClicked = await page.evaluate(() => {
        const PATTERNS = [/^Continue$/i, /^继续$/i, /^Accept$/i, /^接受$/i, /^同意$/i, /^OK$/i, /^Got it$/i, /^好的$/i];
        const btns = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[];
        for (const pat of PATTERNS) {
          for (const btn of btns) {
            const text = btn.innerText?.trim() || '';
            if (pat.test(text)) {
              const r = btn.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) { btn.click(); return text; }
            }
          }
        }
        return null;
      }).catch(() => null);

      if (blockerClicked) {
        this.logger.log(`[dual_chat] Clicked blocker "${blockerClicked}" while trying to send, retrying input search...`);
        await new Promise(r => setTimeout(r, 3000));
        for (const sel of inputSelectors) {
          try {
            input = await page.$(sel);
            if (input) break;
          } catch { /* ignore */ }
        }
      }
    }

    if (!input) {
      try { await page.screenshot({ path: 'C:/AI_WORKSPACE/chat_debug.png' }); } catch { /* ignore */ }
      throw new Error('找不到消息输入框');
    }

    await input.click();
    await randomDelay(300, 800);

    for (const char of text) {
      await page.keyboard.type(char);
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 80) + 40));
    }

    await randomDelay(500, 1200);
    await page.keyboard.press('Enter');
    this.logger.log(`[dual_chat] Sent: ${text.substring(0, 40)}`);
  }

  private async callAiApi(aiSettings: any, script: any, history: any[], systemOverride?: string): Promise<string | null> {
    try {
      const { default: axios } = await import('axios');
      const baseUrl = aiSettings.baseUrl || 'https://api.openai.com/v1';
      const model = aiSettings.model || 'gpt-4o';
      const systemPrompt = systemOverride || script.systemPrompt || `目标：${script.goal || '进行自然对话'}。每次回复不超过2句话，保持自然，不透露自己是AI。`;

      const res = await axios.post(
        `${baseUrl}/chat/completions`,
        { model, messages: [{ role: 'system', content: systemPrompt }, ...history], max_tokens: 150, temperature: aiSettings.temperature ?? 0.7 },
        { headers: { Authorization: `Bearer ${aiSettings.apiKey}` }, timeout: 30000 },
      );
      return res.data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err: any) {
      this.logger.error(`[dual_chat] AI error: ${err.message}`);
      return null;
    }
  }

  private async loadAiSettings(userId: string): Promise<any> {
    try {
      const rows = await this.dataSource.query(`SELECT preferences FROM users WHERE id = $1`, [userId]);
      return rows[0]?.preferences?.aiSettings || null;
    } catch { return null; }
  }

  async executeAutoCall(params: {
    accountAId: string;
    accountBId: string;
    callDuration?: number;
    userId: string;
    headless?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    const { accountAId, accountBId, callDuration = 30 } = params;

    // ── 加载两个账号 ─────────────────────────────────────────────────────────
    const [accA] = await this.dataSource.query(
      `SELECT id, name, email, cookies, "facebookId", messenger_pin AS "messengerPin" FROM facebook_accounts WHERE id = $1`,
      [accountAId],
    );
    const [accB] = await this.dataSource.query(
      `SELECT id, name, email, cookies, "facebookId", messenger_pin AS "messengerPin" FROM facebook_accounts WHERE id = $1`,
      [accountBId],
    );

    if (!accA) return { success: false, error: '发起账号不存在' };
    if (!accB) return { success: false, error: '接收账号不存在' };
    if (!accA.cookies) return { success: false, error: `账号A「${accA.name}」尚未登录，请先在账号管理中登录` };
    if (!accB.cookies) return { success: false, error: `账号B「${accB.name}」尚未登录，请先在账号管理中登录` };
    if (!accA.facebookId) return { success: false, error: `账号A「${accA.name}」没有 Facebook ID，请重新登录` };
    if (!accB.facebookId) return { success: false, error: `账号B「${accB.name}」没有 Facebook ID，请重新登录` };

    let pageA: any = null;
    let pageB: any = null;

    try {
      // ── 同时启动两个浏览器 ────────────────────────────────────────────────
      this.logger.log(`[auto_call] Launching browsers for A:${accA.name} B:${accB.name}`);
      await Promise.all([
        this.browserSessionService.getOrLaunchSession(accountAId, { headless: params.headless ?? true }),
        this.browserSessionService.getOrLaunchSession(accountBId, { headless: params.headless ?? true }),
      ]);
      pageA = await this.browserSessionService.newPage(accountAId);
      pageB = await this.browserSessionService.newPage(accountBId);

      // ── 两个账号登录 ──────────────────────────────────────────────────────
      const [loginA, loginB] = await Promise.all([
        this.injectCookiesAndLogin(pageA, accA),
        this.injectCookiesAndLogin(pageB, accB),
      ]);
      if (!loginA) return { success: false, error: `账号A「${accA.name}」Cookie 已过期，请重新登录` };
      if (!loginB) return { success: false, error: `账号B「${accB.name}」Cookie 已过期，请重新登录` };
      this.logger.log(`[auto_call] Both accounts logged in ✅`);

      // ── A 打开与 B 的聊天，等待完全加载 ──────────────────────────────────
      await pageA.goto(`https://www.facebook.com/messages/t/${accB.facebookId}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      // 等待聊天输入框出现，确认页面已完全渲染（最多等 15s）
      await pageA.waitForSelector(
        'div[contenteditable="true"], [role="textbox"], [aria-label*="message"], [aria-label*="消息"]',
        { timeout: 15000 },
      ).catch(() => this.logger.warn('[auto_call] A: chat input not found, continuing anyway'));
      await randomDelay(3000, 4000);
      await this.handleMessengerPin(pageA, accA);
      await this.handleContinueButton(pageA, accA);

      // 截图 A 的聊天页面（调试用）
      await pageA.screenshot({ path: 'C:/AI_WORKSPACE/call_A_ready.png' }).catch(() => {});
      this.logger.log(`[auto_call] A's chat window ready (screenshot: call_A_ready.png)`);

      // ── B 打开与 A 的聊天，等待完全加载 ──────────────────────────────────
      await pageB.goto(`https://www.facebook.com/messages/t/${accA.facebookId}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await pageB.waitForSelector(
        'div[contenteditable="true"], [role="textbox"], [aria-label*="message"], [aria-label*="消息"]',
        { timeout: 15000 },
      ).catch(() => this.logger.warn('[auto_call] B: chat input not found, continuing anyway'));
      await randomDelay(3000, 4000);
      await this.handleMessengerPin(pageB, accB);
      await this.handleContinueButton(pageB, accB);
      await pageB.screenshot({ path: 'C:/AI_WORKSPACE/call_B_ready.png' }).catch(() => {});
      this.logger.log(`[auto_call] B's chat window ready (screenshot: call_B_ready.png)`);

      // ── A：列出所有 aria-label 含 call 的按钮（调试）──────────────────────
      const allCallBtns = await pageA.evaluate(() => {
        return Array.from(document.querySelectorAll('button, [role="button"], [aria-label]'))
          .map((el: any) => el.getAttribute('aria-label') || '')
          .filter(l => l.toLowerCase().includes('call') || l.includes('通话') || l.includes('语音') || l.includes('voice') || l.includes('audio'))
          .slice(0, 20);
      }).catch(() => [] as string[]);
      this.logger.log(`[auto_call] Call-related aria-labels on A's page: ${JSON.stringify(allCallBtns)}`);

      // ── A：寻找并点击通话按钮（宽泛匹配）────────────────────────────────
      this.logger.log(`[auto_call] Looking for call button on A's page...`);
      const callCoords: { x: number; y: number; label: string } | null = await pageA.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[];
        for (const btn of btns) {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          // 宽泛匹配：包含 call / 通话 / voice / audio / phone
          if (label.includes('call') || label.includes('通话') || label.includes('voice') ||
              label.includes('audio') || label.includes('phone') || label.includes('语音')) {
            const r = btn.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: btn.getAttribute('aria-label') || '' };
            }
          }
        }
        // 备用：data-testid
        for (const sel of ['[data-testid="mms-phone-call-button"]', '[data-testid="mms-audio-call-button"]',
                           '[data-testid="voice-call-button"]', '[data-testid="audio-call-button"]']) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: sel };
            }
          }
        }
        return null;
      });

      if (!callCoords) {
        await pageA.screenshot({ path: 'C:/AI_WORKSPACE/call_debug_no_button.png' }).catch(() => {});
        throw new Error('找不到通话按钮（已截图 call_A_ready.png 和 call_debug_no_button.png，请查看）');
      }

      this.logger.log(`[auto_call] Found call button: "${callCoords.label}" at (${Math.round(callCoords.x)},${Math.round(callCoords.y)})`);

      // ── 监听 A / B 页面上可能弹出的 popup 窗口（Facebook 通话 UI 经常在 popup 里）
      let popupA: any = null;
      let popupB: any = null;
      pageA.once('popup', (p: any) => {
        popupA = p;
        this.logger.log(`[auto_call] A popup opened: ${p.url()}`);
      });
      pageB.once('popup', (p: any) => {
        popupB = p;
        this.logger.log(`[auto_call] B popup opened: ${p.url()}`);
      });

      // 点击通话按钮
      await pageA.mouse.move(callCoords.x, callCoords.y);
      await new Promise(r => setTimeout(r, 300));
      await pageA.mouse.click(callCoords.x, callCoords.y);
      this.logger.log(`[auto_call] ✅ Call button clicked by A`);

      // 等待 3 秒让 popup/UI 出现
      await randomDelay(3000, 4000);

      // 截图 A 的主页面 + popup（如果有）
      await pageA.screenshot({ path: 'C:/AI_WORKSPACE/call_A_after_click.png' }).catch(() => {});
      if (popupA) {
        await popupA.screenshot({ path: 'C:/AI_WORKSPACE/call_A_popup.png' }).catch(() => {});
        this.logger.log(`[auto_call] A popup screenshot saved: call_A_popup.png`);
      } else {
        this.logger.log(`[auto_call] No popup on A — call UI is inline (or click did not register)`);
      }

      // ── B：同时监听 popup + 轮询主页面，最多 30 秒────────────────────────
      this.logger.log(`[auto_call] B waiting for incoming call (popup or inline, 30s)...`);
      let accepted = false;
      const acceptDeadline = Date.now() + 30000;

      // 辅助：在指定页面上寻找接听按钮并点击
      const tryAcceptOnPage = async (pg: any): Promise<boolean> => {
        const coords = await pg.evaluate(() => {
          for (const sel of [
            '[aria-label="Accept call"]', '[aria-label="接受通话"]', '[aria-label="接听"]',
            '[data-testid="accept-call-button"]', '[data-testid="answer-call-button"]',
          ]) {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (el) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
          }
          const btns = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[];
          for (const btn of btns) {
            const lbl = (btn.getAttribute('aria-label') || btn.innerText || '').toLowerCase().trim();
            if (/accept|answer|接受|接听|接通|join/i.test(lbl)) {
              const r = btn.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
          }
          return null;
        }).catch(() => null);
        if (!coords) return false;
        await pg.mouse.click(coords.x, coords.y);
        return true;
      };

      while (Date.now() < acceptDeadline) {
        // 先检查 B 的主页面
        if (await tryAcceptOnPage(pageB)) {
          this.logger.log(`[auto_call] ✅ B accepted via main page`);
          accepted = true;
          break;
        }
        // 再检查 B 的 popup（如果来电弹出到新窗口）
        if (popupB && await tryAcceptOnPage(popupB)) {
          this.logger.log(`[auto_call] ✅ B accepted via popup`);
          accepted = true;
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      if (!accepted) {
        await pageB.screenshot({ path: 'C:/AI_WORKSPACE/call_B_no_answer.png' }).catch(() => {});
        if (popupB) await popupB.screenshot({ path: 'C:/AI_WORKSPACE/call_B_popup.png' }).catch(() => {});
        this.logger.warn(`[auto_call] B could not accept — screenshots saved`);
      }

      // ── 等待真实通话时长（只有 B 接了才有意义，但无论如何都等）────────────
      if (accepted) {
        this.logger.log(`[auto_call] Call in progress, waiting ${callDuration}s...`);
        await new Promise(r => setTimeout(r, callDuration * 1000));
        this.logger.log(`[auto_call] ${callDuration}s elapsed`);
      } else {
        this.logger.warn(`[auto_call] B did not accept — skipping wait, marking as failed`);
        return { success: false, error: 'B 未接到来电通知（请查看 call_B_no_answer.png 和 call_A_popup.png）' };
      }

      // ── A：结束通话（主页面或 popup 里找 end call 按钮）──────────────────
      const endPage = popupA || pageA;
      const endCoords: { x: number; y: number } | null = await endPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[];
        for (const btn of btns) {
          const label = (btn.getAttribute('aria-label') || btn.innerText || '').toLowerCase();
          if (/end.?call|hang.?up|结束通话|挂断|leave/i.test(label)) {
            const r = btn.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
        return null;
      }).catch(() => null);

      if (endCoords) {
        await endPage.mouse.click(endCoords.x, endCoords.y);
        this.logger.log(`[auto_call] ✅ Call ended by A`);
      } else {
        this.logger.warn(`[auto_call] End call button not found`);
      }

      await randomDelay(1000, 2000);
      return { success: true };

    } catch (err: any) {
      this.logger.error(`[auto_call] Error: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      if (pageA) await pageA.close().catch(() => {});
      if (pageB) await pageB.close().catch(() => {});
      this.browserSessionService.releaseSession(accountAId);
      this.browserSessionService.releaseSession(accountBId);
    }
  }
}
