import { Injectable, Logger } from '@nestjs/common';
import { BrowserSessionService } from '../../facebook-accounts/browser-session.service';
import { DataSource } from 'typeorm';

const randomDelay = (min: number, max: number) =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

@Injectable()
export class FacebookPostService {
  private readonly logger = new Logger(FacebookPostService.name);

  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly dataSource: DataSource,
  ) {}

  // ── 注入 Cookie 并验证登录（与 social/chat service 相同逻辑）────────────
  private async injectCookiesAndLogin(page: any, acc: any): Promise<boolean> {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const cookieList = typeof acc.cookies === 'string' ? JSON.parse(acc.cookies) : acc.cookies;
    for (const cookie of cookieList) {
      try {
        await page.setCookie({
          name: cookie.name,
          value: cookie.value,
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
    if (cUser) this.logger.log(`[post] ${acc.email} logged in (c_user=${cUser.value})`);
    return !!cUser;
  }

  // ── 通用：打开发帖 Composer，返回已聚焦的 contenteditable 输入框 ─────────
  private async openComposerAndGetInput(page: any): Promise<any> {
    // Step 1: 寻找"What's on your mind?"按钮并点击（桌面版 Feed 顶部）
    const opened = await page.evaluate(() => {
      // 先找包含 "What's on your mind" 或 "有什么新鲜事" 的可点击区域
      const triggers = Array.from(document.querySelectorAll(
        '[role="button"], [aria-label], button, [placeholder]',
      )) as HTMLElement[];
      for (const el of triggers) {
        const t = (
          el.getAttribute('aria-placeholder') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('aria-label') ||
          el.innerText || ''
        ).toLowerCase();
        if (
          t.includes("what's on your mind") ||
          t.includes('有什么新鲜事') ||
          t.includes("what's on your mind") ||
          t.includes('create post') ||
          t.includes('发帖')
        ) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
      }
      return null;
    });

    if (opened) {
      await page.mouse.click(opened.x, opened.y);
      this.logger.log(`[post] Clicked compose trigger at (${Math.round(opened.x)},${Math.round(opened.y)})`);
      await randomDelay(1500, 2500);
    } else {
      this.logger.warn('[post] Compose trigger not found, trying direct dialog selector');
    }

    // Step 2: 在弹出的 Dialog 或页面中找 contenteditable 输入框
    const inputSelectors = [
      '[role="dialog"] [contenteditable="true"]',
      '[data-lexical-editor="true"]',
      '[contenteditable="true"][aria-placeholder]',
      '[contenteditable="true"][aria-label]',
      '[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"]',
    ];

    for (const sel of inputSelectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 4000 });
        if (el) {
          this.logger.log(`[post] Found composer input: ${sel}`);
          return el;
        }
      } catch { /* try next */ }
    }

    return null;
  }

  // ── 通用：找 Post / Share 按钮并点击（真实鼠标坐标）────────────────────
  private async clickPostButton(page: any): Promise<boolean> {
    const coords: { x: number; y: number } | null = await page.evaluate(() => {
      // 找 Dialog 里的提交按钮（"Post" / "Share" / "发帖"）
      const candidates = Array.from(
        document.querySelectorAll('[role="dialog"] button, [role="dialog"] [role="button"]'),
      ) as HTMLElement[];
      for (const btn of candidates) {
        const t = (btn.innerText || btn.textContent || '').trim();
        if (/^(Post|Share|发帖|发布|提交|OK)$/i.test(t)) {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
      }
      // 备用：全局搜索
      const all = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[];
      for (const btn of all) {
        const t = (btn.innerText || btn.textContent || '').trim();
        if (/^(Post|Share|发帖|发布)$/i.test(t)) {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        }
      }
      return null;
    });

    if (!coords) return false;
    this.logger.log(`[post] Clicking Post button at (${Math.round(coords.x)},${Math.round(coords.y)})`);
    await page.mouse.move(coords.x, coords.y);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.click(coords.x, coords.y);
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 发布图片帖子（图片 URL 追加到文字内容，Facebook 自动展示链接预览）
  // ════════════════════════════════════════════════════════════════════════════
  async executeAutoPostImage(params: {
    accountId: string;
    content: string;
    imageUrls?: string;
    headless?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    const { accountId, content, imageUrls } = params;
    let page: any = null;

    // 加载账号信息
    const [acc] = await this.dataSource.query(
      `SELECT id, name, email, cookies FROM facebook_accounts WHERE id = $1`,
      [accountId],
    );
    if (!acc) return { success: false, error: '账号不存在' };
    if (!acc.cookies) return { success: false, error: `账号「${acc.name}」尚未登录，请先在账号管理中登录` };

    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless: params.headless ?? true });
      page = await this.browserSessionService.newPage(accountId);

      // 注入 Cookie 并验证登录
      const loggedIn = await this.injectCookiesAndLogin(page, acc);
      if (!loggedIn) return { success: false, error: `账号「${acc.name}」Cookie 已过期，请重新登录` };

      this.logger.log(`[post_image] ${acc.name} 已登录，打开发帖 Composer...`);

      // 打开发帖输入框
      const postInput = await this.openComposerAndGetInput(page);
      if (!postInput) {
        await page.screenshot({ path: 'C:/AI_WORKSPACE/post_debug.png' }).catch(() => {});
        throw new Error('找不到发帖输入框（已截图到 C:/AI_WORKSPACE/post_debug.png）');
      }

      // 点击输入框激活焦点
      await postInput.click();
      await randomDelay(400, 800);

      // 逐字键入内容（模拟真人）
      for (const char of content) {
        await page.keyboard.type(char);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 60) + 20));
      }

      // 追加图片链接（Facebook 自动生成链接预览）
      if (imageUrls) {
        const urls = imageUrls.split('\n').map(u => u.trim()).filter(Boolean);
        for (const url of urls) {
          await page.keyboard.press('Enter');
          await randomDelay(200, 400);
          for (const char of url) {
            await page.keyboard.type(char);
            await new Promise(r => setTimeout(r, 25));
          }
          await randomDelay(600, 1200); // 等 Facebook 加载链接预览
        }
      }

      await randomDelay(1000, 2000);

      // 点击发帖按钮
      const posted = await this.clickPostButton(page);
      if (!posted) {
        // 备用：键盘快捷键（Ctrl+Enter / Enter）
        this.logger.warn('[post_image] Post button not found, trying keyboard shortcut');
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
      }

      await randomDelay(2000, 4000);
      this.logger.log(`[post_image] ✅ ${acc.name} 发帖完成`);
      return { success: true };

    } catch (err: any) {
      this.logger.error(`[post_image] Error: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 发布视频帖子（视频 URL 追加到文字内容）
  // ════════════════════════════════════════════════════════════════════════════
  async executeAutoPostVideo(params: {
    accountId: string;
    description: string;
    videoUrl?: string;
    headless?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    const { accountId, description, videoUrl } = params;
    let page: any = null;

    const [acc] = await this.dataSource.query(
      `SELECT id, name, email, cookies FROM facebook_accounts WHERE id = $1`,
      [accountId],
    );
    if (!acc) return { success: false, error: '账号不存在' };
    if (!acc.cookies) return { success: false, error: `账号「${acc.name}」尚未登录，请先在账号管理中登录` };

    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless: params.headless ?? true });
      page = await this.browserSessionService.newPage(accountId);

      const loggedIn = await this.injectCookiesAndLogin(page, acc);
      if (!loggedIn) return { success: false, error: `账号「${acc.name}」Cookie 已过期，请重新登录` };

      this.logger.log(`[post_video] ${acc.name} 已登录，打开发帖 Composer...`);

      const postInput = await this.openComposerAndGetInput(page);
      if (!postInput) {
        await page.screenshot({ path: 'C:/AI_WORKSPACE/post_video_debug.png' }).catch(() => {});
        throw new Error('找不到发帖输入框（已截图到 C:/AI_WORKSPACE/post_video_debug.png）');
      }

      await postInput.click();
      await randomDelay(400, 800);

      for (const char of description) {
        await page.keyboard.type(char);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 60) + 20));
      }

      if (videoUrl) {
        await page.keyboard.press('Enter');
        await randomDelay(200, 400);
        for (const char of videoUrl) {
          await page.keyboard.type(char);
          await new Promise(r => setTimeout(r, 25));
        }
        await randomDelay(800, 1500);
      }

      await randomDelay(1000, 2000);

      const posted = await this.clickPostButton(page);
      if (!posted) {
        this.logger.warn('[post_video] Post button not found, trying keyboard shortcut');
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
      }

      await randomDelay(2000, 4000);
      this.logger.log(`[post_video] ✅ ${acc.name} 发布视频帖子完成`);
      return { success: true };

    } catch (err: any) {
      this.logger.error(`[post_video] Error: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }
}
