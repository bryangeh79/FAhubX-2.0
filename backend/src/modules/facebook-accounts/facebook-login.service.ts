import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { FacebookAccount } from './entities/facebook-account.entity';
import { FacebookAccountsService } from './facebook-accounts.service';
import { BrowserSessionService } from './browser-session.service';
import { resolveVpnProxy } from './vpn-proxy-resolver';

export type LoginResult =
  | { success: true; cookies: string }
  | { success: false; error: string; requiresManual?: boolean };

@Injectable()
export class FacebookLoginService {
  private readonly logger = new Logger(FacebookLoginService.name);
  /** 正在登录中的账号 ID 集合，防止并发重复登录 */
  private readonly loginInProgress = new Set<string>();

  constructor(
    @InjectRepository(FacebookAccount)
    private readonly accountRepo: Repository<FacebookAccount>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => FacebookAccountsService))
    private readonly accountsService: FacebookAccountsService,
    private readonly browserSessionService: BrowserSessionService,
  ) {}

  async login(userId: string, accountId: string): Promise<LoginResult> {
    // 防止并发重复登录同一账号
    if (this.loginInProgress.has(accountId)) {
      this.logger.warn(`[${accountId}] Login already in progress, rejecting duplicate request`);
      return { success: false, error: '该账号正在登录中，请等待验证完成后再试' };
    }

    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) return { success: false, error: '账号不存在' };
    if (!account.email || !account.facebookPassword) {
      return { success: false, error: '账号未设置邮箱或密码' };
    }

    this.loginInProgress.add(accountId);

    // Decrypt password
    let plainPassword: string;
    try {
      plainPassword = await this.accountsService.getDecryptedPassword(userId, accountId);
    } catch {
      plainPassword = account.facebookPassword;
    }

    // Resolve VPN proxy for this account
    let proxyServer: string | undefined;
    let proxyCredentials: { username: string; password: string } | null = null;

    if (account.vpnConfigId) {
      try {
        const vpnRows = await this.dataSource.query(
          `SELECT * FROM vpn_configs WHERE id = $1 LIMIT 1`,
          [account.vpnConfigId],
        );
        if (vpnRows.length > 0) {
          const proxyConfig = resolveVpnProxy(vpnRows[0]);
          if (proxyConfig) {
            proxyServer = proxyConfig.proxyServer;
            proxyCredentials = proxyConfig.credentials;
            this.logger.log(`[${account.email}] Using proxy: ${proxyServer}`);
          }
        }
      } catch (err) {
        this.logger.warn(`[${account.email}] Failed to load VPN config: ${err.message}`);
      }
    }

    // Mark as logging in
    await this.dataSource.query(
      `UPDATE facebook_accounts SET status = 'idle', "syncStatus" = 'pending', "syncError" = NULL WHERE id = $1`,
      [accountId],
    );

    let page: any = null;
    try {
      // Launch or reuse browser session (each account gets its own isolated profile)
      await this.browserSessionService.getOrLaunchSession(accountId, {
        proxyServer,
        proxyCredentials,
        headless: false,
      });

      page = await this.browserSessionService.newPage(accountId);

      // Fast path: check if profile already has an active session
      this.logger.log(`[${account.email}] Checking for existing session...`);
      await page.goto('https://m.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      const urlAfterCheck = page.url();
      this.logger.log(`[${account.email}] URL after check: ${urlAfterCheck}`);

      // Must have c_user cookie to confirm real login
      const allCookies = await page.cookies();
      const hasCUser = allCookies.some((c: any) => c.name === 'c_user');
      const alreadyLoggedIn =
        hasCUser &&
        urlAfterCheck.includes('facebook.com') &&
        !urlAfterCheck.includes('login') &&
        !urlAfterCheck.includes('checkpoint') &&
        !urlAfterCheck.includes('two_step');

      if (alreadyLoggedIn) {
        this.logger.log(`[${account.email}] Session already active — skipping login form`);
        const cookies = await page.cookies();
        await this.saveLoginSuccess(accountId, account, JSON.stringify(cookies));
        await page.close();
        this.loginInProgress.delete(accountId);
        return { success: true, cookies: JSON.stringify(cookies) };
      }

      // Navigate to login page
      this.logger.log(`[${account.email}] Navigating to login page...`);
      await page.goto('https://m.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      this.logger.log(`[${account.email}] URL: ${page.url()}`);

      // Accept cookies popup if present
      try {
        const acceptSelectors = [
          '[data-testid="cookie-policy-manage-dialog-accept-button"]',
          'button[title="Allow all cookies"]',
          '[aria-label="Allow all cookies"]',
        ];
        for (const sel of acceptSelectors) {
          const btn = await page.$(sel);
          if (btn) { await btn.click(); await new Promise(r => setTimeout(r, 500)); break; }
        }
      } catch (_) {}

      // Wait for email field
      this.logger.log(`[${account.email}] Waiting for email field...`);
      const emailSel = await Promise.race([
        page.waitForSelector('#m_login_email', { timeout: 15000 }).then(() => '#m_login_email'),
        page.waitForSelector('input[name="email"]', { timeout: 15000 }).then(() => 'input[name="email"]'),
        page.waitForSelector('#email', { timeout: 15000 }).then(() => '#email'),
      ]);
      this.logger.log(`[${account.email}] Email field: ${emailSel}`);

      await page.click(emailSel);
      await page.evaluate((sel: string) => { (document.querySelector(sel) as HTMLInputElement).value = ''; }, emailSel);
      await page.type(emailSel, account.email, { delay: 60 });

      // Password field
      const passSel = await Promise.race([
        page.waitForSelector('#m_login_password', { timeout: 5000 }).then(() => '#m_login_password'),
        page.waitForSelector('input[name="pass"]', { timeout: 5000 }).then(() => 'input[name="pass"]'),
        page.waitForSelector('#pass', { timeout: 5000 }).then(() => '#pass'),
      ]);
      await page.click(passSel);
      await page.evaluate((sel: string) => { (document.querySelector(sel) as HTMLInputElement).value = ''; }, passSel);
      await page.type(passSel, plainPassword, { delay: 60 });

      // Submit
      this.logger.log(`[${account.email}] Submitting login form...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        page.evaluate(() => {
          const btn = document.querySelector('[name="login"], button[type="submit"], input[type="submit"]') as HTMLElement;
          if (btn) btn.click();
        }),
      ]);

      let currentUrl = page.url();
      this.logger.log(`[${account.email}] After submit URL: ${currentUrl}`);

      // ✅ 不靠 URL 判断 — 一律等到 c_user Cookie 出现才算登录成功
      // 这样无论 Facebook 弹出什么验证页面（人机验证、设备确认、安全审核等），
      // 窗口都会保持开着，等用户手动完成后再继续。
      this.logger.log(`[${account.email}] Waiting for c_user cookie (up to 15 min)...`);

      const maxWait = 15 * 60 * 1000; // 15 分钟
      const pollInterval = 2000;
      const startTime = Date.now();
      let loggedIn = false;

      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        currentUrl = page.url();

        const cookies = await page.cookies();
        const cUser = cookies.find((c: any) => c.name === 'c_user');
        if (cUser) {
          loggedIn = true;
          this.logger.log(`[${account.email}] ✅ c_user detected — login confirmed! URL: ${currentUrl}`);
          break;
        }

        this.logger.log(`[${account.email}] Still waiting... URL: ${currentUrl}`);
      }

      if (!loggedIn) {
        // 保持浏览器窗口打开 2 分钟让用户看到失败状况（CAPTCHA/封号/网络问题等）
        this.logger.warn(`[${account.email}] 登录超时，浏览器将保持打开 2 分钟让您查看状况`);
        setTimeout(async () => {
          await page.close().catch(() => {});
          await this.browserSessionService.closeSession(accountId).catch(() => {});
        }, 120_000);
        await this.dataSource.query(
          `UPDATE facebook_accounts SET status = 'error', "syncStatus" = 'failed', "syncError" = '登录超时（15分钟），浏览器已保持打开 2 分钟供查看', "loginStatus" = false WHERE id = $1`,
          [accountId],
        );
        this.loginInProgress.delete(accountId);
        return { success: false, error: '登录超时 — 浏览器保持打开 2 分钟请查看窗口' };
      }

      // Success — save cookies and keep browser running
      const cookies = await page.cookies();
      const cookiesJson = JSON.stringify(cookies);
      await this.saveLoginSuccess(accountId, account, cookiesJson);
      await page.close().catch(() => {});
      this.loginInProgress.delete(accountId);
      return { success: true, cookies: cookiesJson };
    } catch (err: any) {
      // 保持浏览器窗口打开 2 分钟让用户看到异常状况
      this.logger.error(`[${account.email}] Login failed: ${err.message} — 浏览器保持打开 2 分钟供查看`);
      setTimeout(async () => {
        if (page) await page.close().catch(() => {});
        await this.browserSessionService.closeSession(accountId).catch(() => {});
      }, 120_000);
      this.loginInProgress.delete(accountId);
      await this.dataSource.query(
        `UPDATE facebook_accounts SET status = 'error', "syncStatus" = 'failed', "syncError" = $2, "loginStatus" = false WHERE id = $1`,
        [accountId, err.message || '登录异常'],
      );
      return { success: false, error: (err.message || '登录异常') + ' — 浏览器保持打开 2 分钟请查看' };
    }
  }

  private async saveLoginSuccess(accountId: string, account: FacebookAccount, cookiesJson: string): Promise<void> {
    const now = new Date();
    const sessionExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const session = this.browserSessionService.getSession(accountId);
    const userDataDir = session?.profileDir || null;

    // 自动从 c_user cookie 提取 Facebook ID
    let facebookId: string | null = null;
    try {
      const cookies = JSON.parse(cookiesJson);
      const cUser = cookies.find((c: any) => c.name === 'c_user');
      if (cUser?.value) {
        facebookId = cUser.value;
        this.logger.log(`[${account.email}] Auto-detected Facebook ID: ${facebookId}`);
      }
    } catch { /* ignore */ }

    await this.dataSource.query(
      `UPDATE facebook_accounts
       SET status = 'active',
           "loginStatus" = true,
           "syncStatus" = 'success',
           "syncError" = NULL,
           cookies = $2,
           "lastLoginAt" = $3,
           "sessionExpiresAt" = $4,
           "lastSyncedAt" = $3,
           "userDataDir" = $5,
           "facebookId" = COALESCE($6, "facebookId")
       WHERE id = $1`,
      [accountId, cookiesJson, now, sessionExpiry, userDataDir, facebookId],
    );
    this.logger.log(`[${account.email}] Login saved successfully`);
  }

  async logout(userId: string, accountId: string): Promise<void> {
    await this.browserSessionService.closeSession(accountId);
    await this.dataSource.query(
      `UPDATE facebook_accounts SET status = 'idle', "loginStatus" = false, cookies = NULL, "sessionExpiresAt" = NULL, "userDataDir" = NULL WHERE id = $1 AND "userId" = $2`,
      [accountId, userId],
    );
  }

  async validateSession(userId: string, accountId: string): Promise<{ alive: boolean; url?: string }> {
    const session = this.browserSessionService.getSession(accountId);
    if (!session || session.status === 'closed') {
      return { alive: false };
    }

    let page: any = null;
    try {
      page = await this.browserSessionService.newPage(accountId);
      await page.goto('https://m.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      const url = page.url();
      await page.close();
      const alive = url.includes('facebook.com') && !url.includes('login') && !url.includes('checkpoint');
      return { alive, url };
    } catch (err) {
      if (page) await page.close().catch(() => {});
      return { alive: false };
    }
  }

  async checkLoginStatus(userId: string, accountId: string): Promise<{
    loginStatus: boolean;
    status: string;
    sessionExpiresAt: Date | null;
    lastLoginAt: Date | null;
    syncError: string | null;
    browserActive: boolean;
  }> {
    const rows = await this.dataSource.query(
      `SELECT "loginStatus", status, "sessionExpiresAt", "lastLoginAt", "syncError" FROM facebook_accounts WHERE id = $1 AND "userId" = $2`,
      [accountId, userId],
    );
    if (!rows.length) {
      return { loginStatus: false, status: 'idle', sessionExpiresAt: null, lastLoginAt: null, syncError: null, browserActive: false };
    }
    const r = rows[0];
    const session = this.browserSessionService.getSession(accountId);
    const browserActive = session !== null && session.status !== 'closed';

    // Auto-expire if session is past expiry
    if (r.sessionExpiresAt && new Date(r.sessionExpiresAt) < new Date() && r.loginStatus) {
      await this.dataSource.query(
        `UPDATE facebook_accounts SET "loginStatus" = false, status = 'idle' WHERE id = $1`,
        [accountId],
      );
      r.loginStatus = false;
      r.status = 'idle';
    }

    return { ...r, browserActive };
  }
}
