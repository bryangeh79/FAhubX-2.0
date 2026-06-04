import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import { URL } from 'url';
import { resolveVpnProxy } from './vpn-proxy-resolver';
import { getBrowserLocale, BrowserLocale } from './vpn-locale.util';
import { detectCheckpoint, applyCheckpointToAccount } from './checkpoint-detector.util';

export interface BrowserSession {
  browser: any; // Puppeteer Browser
  accountId: string;
  userId?: string; // 所属用户，用于按用户隔离并发
  profileDir: string;
  proxyServer: string | null;
  proxyCredentials: { username: string; password: string } | null;
  /** VPN 出口国家代码（用于设置 locale / timezone），可能为空 */
  vpnCountry: string | null;
  /** 根据 vpnCountry 解析出的 locale，newPage 时使用 */
  locale: BrowserLocale;
  status: 'launching' | 'ready' | 'closed';
  lastActivity: Date;
  /** 最近一次成功 launch 时间，用于频控避免 FB 看到频繁 session 重建 */
  lastLaunchAt: Date;
}

export interface LaunchOptions {
  proxyServer?: string;
  proxyCredentials?: { username: string; password: string } | null;
  headless?: boolean;
  userId?: string; // 传入用户ID用于并发隔离
  maxUserSessions?: number; // 该用户的最大并发数（默认=maxAccounts）
}

// 全局硬性上限（防止单台服务器 OOM）
const MAX_SESSIONS_GLOBAL = parseInt(process.env.MAX_BROWSER_SESSIONS || '30', 10);
// 空闲超时：任务结束后保留浏览器几分钟，期间有新任务可以复用；超时再关闭
const IDLE_CLOSE_MS = parseInt(process.env.BROWSER_IDLE_CLOSE_MS || '180000', 10); // 3 分钟
// Puppeteer launch 超时（防止代理不可达时无限挂起）
const LAUNCH_TIMEOUT_MS = parseInt(process.env.BROWSER_LAUNCH_TIMEOUT_MS || '60000', 10);
// 代理 TCP 连通性预检超时
const PROXY_PING_TIMEOUT_MS = parseInt(process.env.PROXY_PING_TIMEOUT_MS || '5000', 10);
// 同一账号两次 launch 之间的最小间隔（毫秒），降低 FB 看到频繁 session 重建的怀疑分
const MIN_RELAUNCH_INTERVAL_MS = parseInt(process.env.MIN_RELAUNCH_INTERVAL_MS || '0', 10);

@Injectable()
export class BrowserSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserSessionService.name);
  private readonly sessions = new Map<string, BrowserSession>();
  private readonly launching = new Set<string>(); // guard concurrent launches
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>(); // 空闲关闭定时器
  private readonly lastLaunchAt = new Map<string, Date>(); // 每账号上次成功 launch 时间，用于频控

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * 根据 accountId 自动查询该账号绑定的 VPN 配置并转成 proxy 参数。
   * 如果调用方已经传入 proxyServer 就跳过查询（facebook-login.service 这种情况）。
   */
  private async resolveAccountProxy(accountId: string): Promise<{
    proxyServer?: string;
    proxyCredentials?: { username: string; password: string } | null;
    vpnCountry?: string | null;
  }> {
    try {
      const rows = await this.dataSource.query(
        `SELECT "vpnConfigId" FROM facebook_accounts WHERE id = $1 LIMIT 1`,
        [accountId],
      );
      if (!rows.length || !rows[0].vpnConfigId) return {};

      const vpnRows = await this.dataSource.query(
        `SELECT * FROM vpn_configs WHERE id = $1 LIMIT 1`,
        [rows[0].vpnConfigId],
      );
      if (!vpnRows.length) return {};

      const proxyConfig = resolveVpnProxy(vpnRows[0]);
      if (!proxyConfig) return { vpnCountry: vpnRows[0].country || null };

      this.logger.log(`[${accountId}] Auto-resolved proxy: ${proxyConfig.proxyServer} (country=${vpnRows[0].country || '?'})`);
      return {
        proxyServer: proxyConfig.proxyServer,
        proxyCredentials: proxyConfig.credentials,
        vpnCountry: vpnRows[0].country || null,
      };
    } catch (err: any) {
      this.logger.warn(`[${accountId}] Failed to auto-resolve VPN proxy: ${err.message}`);
      return {};
    }
  }

  /**
   * 在真正 launch 浏览器之前，做一次 TCP 层连通性预检。
   * 代理服务器死了时，puppeteer.launch 默认会无限挂起；提前 ping 让错误立刻可见。
   *
   * 支持 http(s):// 和 socks5:// 形式，提取 host:port，TCP connect。
   * 失败时 throw，让调用方 fail-fast。
   */
  private async pingProxy(proxyServer: string): Promise<void> {
    let host: string;
    let port: number;
    try {
      // 接受 host:port / scheme://host:port 两种写法
      const normalized = proxyServer.includes('://') ? proxyServer : `tcp://${proxyServer}`;
      const u = new URL(normalized);
      host = u.hostname;
      port = parseInt(u.port, 10);
      if (!host || !port) throw new Error('Invalid proxy URL');
    } catch (err: any) {
      throw new Error(`Proxy URL 解析失败: ${proxyServer} (${err.message})`);
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      const fail = (msg: string) => {
        try { socket.destroy(); } catch (_) {}
        reject(new Error(`VPN/代理节点不可达 ${host}:${port} — ${msg}`));
      };
      const timer = setTimeout(() => fail(`TCP 连接超时 ${PROXY_PING_TIMEOUT_MS}ms`), PROXY_PING_TIMEOUT_MS);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve();
      });
      socket.once('error', (err: any) => {
        clearTimeout(timer);
        fail(err.message || 'socket error');
      });
      socket.connect(port, host);
    });
  }

  async getOrLaunchSession(accountId: string, options: LaunchOptions = {}): Promise<BrowserSession> {
    // 有新任务来了，取消空闲关闭计时
    this.cancelIdleClose(accountId);

    // Checkpoint 冷却闸门：如果账号在 cooldownUntil 之前，直接拒绝。
    // 防止 FB 把"刚怀疑你 → 你又来了"升级成永封。
    try {
      const rows = await this.dataSource.query(
        `SELECT status, "cooldownUntil", "checkpointReason" FROM facebook_accounts WHERE id = $1 LIMIT 1`,
        [accountId],
      );
      const acc = rows[0];
      if (acc?.cooldownUntil && new Date(acc.cooldownUntil) > new Date()) {
        const mins = Math.ceil((new Date(acc.cooldownUntil).getTime() - Date.now()) / 60000);
        throw new Error(
          `账号处于 checkpoint 冷却中（${mins} 分钟后解除）。原因：${acc.checkpointReason || '未知'}`,
        );
      }
      if (acc?.status === 'banned') {
        throw new Error(`账号已被 FB 封禁，无法启动浏览器`);
      }
    } catch (err: any) {
      // 只有"冷却 / 已封"这两个 error 才往外抛；查 DB 报错时降级继续
      if (err.message?.includes('cooldown') || err.message?.includes('冷却') || err.message?.includes('封禁') || err.message?.includes('banned')) {
        throw err;
      }
      this.logger.warn(`[${accountId}] Cooldown gate query failed (continuing): ${err.message}`);
    }

    // Return existing session if alive
    const existing = this.sessions.get(accountId);
    if (existing && existing.status !== 'closed') {
      try {
        // Quick health check — if browser is disconnected this throws
        await existing.browser.pages();
        existing.lastActivity = new Date();
        this.logger.log(`[${accountId}] Reusing existing browser session`);
        return existing;
      } catch {
        this.logger.warn(`[${accountId}] Existing session is dead, relaunching`);
        this.sessions.delete(accountId);
      }
    }

    // Guard against concurrent launches for same account
    if (this.launching.has(accountId)) {
      // Wait for the other launch to finish (poll every 500ms, up to 60s)
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 500));
        const s = this.sessions.get(accountId);
        if (s && s.status === 'ready') return s;
      }
      throw new Error(`[${accountId}] Browser launch timed out waiting for concurrent launch`);
    }

    // Enforce global hard limit (server protection)
    if (this.sessions.size >= MAX_SESSIONS_GLOBAL) {
      throw new Error(`服务器已达全局最大并发浏览器限制（${MAX_SESSIONS_GLOBAL}个），请稍后再试`);
    }

    // Enforce per-user session limit
    if (options.userId && options.maxUserSessions) {
      const userSessionCount = Array.from(this.sessions.values())
        .filter(s => s.userId === options.userId && s.status !== 'closed').length;
      if (userSessionCount >= options.maxUserSessions) {
        throw new Error(`您的并发浏览器已达上限（${userSessionCount}/${options.maxUserSessions}个），请等待其他任务完成`);
      }
    }

    this.launching.add(accountId);

    // 频控：同一账号短时间内 launch 过 → FB 看到的是"刚走又来" = 加分。
    // 默认 0（不限），可通过 MIN_RELAUNCH_INTERVAL_MS 启用。
    if (MIN_RELAUNCH_INTERVAL_MS > 0) {
      const prev = this.lastLaunchAt.get(accountId);
      if (prev) {
        const gap = Date.now() - prev.getTime();
        if (gap < MIN_RELAUNCH_INTERVAL_MS) {
          this.launching.delete(accountId);
          const wait = Math.round((MIN_RELAUNCH_INTERVAL_MS - gap) / 1000);
          throw new Error(
            `账号 ${accountId} 距上次浏览器启动仅 ${Math.round(gap / 1000)}s，` +
            `为降低 FB 检测风险，请 ${wait}s 后再试`,
          );
        }
      }
    }

    // 如果调用方没显式传代理，自动从 DB 查账号绑定的 VPN
    let vpnCountry: string | null = null;
    if (!options.proxyServer) {
      const resolved = await this.resolveAccountProxy(accountId);
      options.proxyServer = resolved.proxyServer;
      options.proxyCredentials = resolved.proxyCredentials ?? null;
      vpnCountry = resolved.vpnCountry ?? null;
    }
    const locale = getBrowserLocale(vpnCountry);

    const profileDir = this.getProfileDir(accountId);
    this.logger.log(`[${accountId}] Launching browser | profile: ${profileDir} | proxy: ${options.proxyServer || 'none'} | country: ${vpnCountry || 'n/a'}`);

    try {
      // 代理预检：失败立刻 throw（不浪费 launch 时间）
      if (options.proxyServer) {
        try {
          await this.pingProxy(options.proxyServer);
        } catch (err: any) {
          this.launching.delete(accountId);
          this.logger.error(`[${accountId}] Proxy precheck failed: ${err.message}`);
          throw err;
        }
      }

      // Ensure profile dir exists
      fs.mkdirSync(profileDir, { recursive: true });

      // Clear stale lock file (left by crashed Chrome)
      const lockFile = path.join(profileDir, 'SingletonLock');
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        this.logger.warn(`[${accountId}] Cleared stale SingletonLock`);
      }

      const puppeteer = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      puppeteer.use(StealthPlugin());

      // Resolve bundled Chrome path via core puppeteer (respects PUPPETEER_CACHE_DIR).
      // puppeteer-extra does not expose executablePath(); must use the underlying package.
      const executablePath: string = require('puppeteer').executablePath();
      this.logger.log(`[${accountId}] Chrome executable: ${executablePath}`);

      const args = this.buildArgs(profileDir, options.proxyServer, locale.primaryLanguage);
      const headless = options.headless ?? false;

      const browser = await puppeteer.launch({
        headless,
        args,
        executablePath,
        defaultViewport: null,
        // 默认 30 秒太短，长时间聊天任务会触发 "Runtime.callFunctionOn timed out"。
        // 调到 3 分钟足够覆盖 FB 页面加载 + 各种交互。
        protocolTimeout: 180_000,
        // 代理死时 puppeteer 默认会无限挂；设上限让错误明确
        timeout: LAUNCH_TIMEOUT_MS,
      });

      const session: BrowserSession = {
        browser,
        accountId,
        userId: options.userId || undefined,
        profileDir,
        proxyServer: options.proxyServer || null,
        proxyCredentials: options.proxyCredentials || null,
        vpnCountry,
        locale,
        status: 'ready',
        lastActivity: new Date(),
        lastLaunchAt: new Date(),
      };
      this.lastLaunchAt.set(accountId, session.lastLaunchAt);

      this.sessions.set(accountId, session);
      this.launching.delete(accountId);

      // Clean up when browser disconnects (use 'once' to auto-remove listener)
      browser.once('disconnected', () => {
        this.logger.warn(`[${accountId}] Browser disconnected`);
        const s = this.sessions.get(accountId);
        if (s) s.status = 'closed';
      });

      this.logger.log(`[${accountId}] Browser launched successfully (${this.sessions.size}/${MAX_SESSIONS_GLOBAL} active)`);
      return session;
    } catch (err) {
      this.launching.delete(accountId);
      throw err;
    }
  }

  /**
   * Open a new page on the account's browser session.
   * Automatically applies proxy authentication if credentials are configured.
   */
  async newPage(accountId: string): Promise<any> {
    const session = this.sessions.get(accountId);
    if (!session || session.status === 'closed') {
      throw new Error(`[${accountId}] No active browser session`);
    }

    const page = await session.browser.newPage();

    // Apply proxy authentication
    if (session.proxyCredentials) {
      await page.authenticate(session.proxyCredentials);
    }

    // 不再手动 setUserAgent —— 让 puppeteer-extra-plugin-stealth 用浏览器真实 UA
    // 历史问题：之前写死 Chrome/122 但实际 Chromium 是 146，UA 与 userAgentData.brands
    // 对不上是 FB 反爬最容易抓的矛盾点。
    //
    // 改为只对齐 locale + timezone 跟 VPN 出口国家：
    const locale = session.locale;
    try {
      await page.setExtraHTTPHeaders({ 'Accept-Language': locale.acceptLanguage });
    } catch (err: any) {
      this.logger.warn(`[${accountId}] setExtraHTTPHeaders failed: ${err.message}`);
    }
    try {
      await page.emulateTimezone(locale.timezone);
    } catch (err: any) {
      // 个别 timezone 名不被 Chrome 接受时降级，不抛
      this.logger.warn(`[${accountId}] emulateTimezone(${locale.timezone}) failed: ${err.message}`);
    }
    // 把 navigator.languages 也对齐（args --lang 已设主语言，这里补 languages 数组）
    try {
      await page.evaluateOnNewDocument((langs: string[]) => {
        try {
          Object.defineProperty(navigator, 'languages', { get: () => langs });
        } catch (_) { /* defineProperty 可能被 stealth 已经接管 */ }
      }, locale.languages);
    } catch (err: any) {
      this.logger.warn(`[${accountId}] override navigator.languages failed: ${err.message}`);
    }

    session.lastActivity = new Date();
    return page;
  }

  /**
   * 任务完成后调用此方法，而不是 closeSession。
   * 浏览器保持打开 IDLE_CLOSE_MS（默认 3 分钟），如果期间有新任务复用 → 重置计时；
   * 如果超时 → 自动关闭，释放资源。
   */
  releaseSession(accountId: string): void {
    // 取消旧的计时器（如果有）
    this.cancelIdleClose(accountId);
    const session = this.sessions.get(accountId);
    if (!session || session.status === 'closed') return;
    this.logger.log(`[${accountId}] 任务完成，浏览器保持打开 ${Math.round(IDLE_CLOSE_MS / 1000)}s 等待复用...`);
    const timer = setTimeout(async () => {
      this.idleTimers.delete(accountId);
      await this.closeSession(accountId);
      this.logger.log(`[${accountId}] 空闲超时，浏览器已自动关闭`);
    }, IDLE_CLOSE_MS);
    this.idleTimers.set(accountId, timer);
  }

  private cancelIdleClose(accountId: string): void {
    const t = this.idleTimers.get(accountId);
    if (t) {
      clearTimeout(t);
      this.idleTimers.delete(accountId);
    }
  }

  /**
   * 在已打开的页面上扫一次 checkpoint。如果命中：
   *   - 把账号置 status=suspicious + cooldownUntil=now+24h（hard disabled 则 status=banned）
   *   - 关闭浏览器 session（避免继续硬刚）
   *   - 返回检测结果
   *
   * 不命中 → 返回 detected:false，不动账号。
   *
   * 推荐调用点：登录刚完成、长任务做完、检测到 FB 弹窗时。
   * 不要在每次 page action 后都调（拉慢任务）。
   */
  async checkAndApplyCheckpoint(accountId: string, page: any, opts: { cooldownHours?: number; closeOnDetect?: boolean } = {}): Promise<{ detected: boolean; kind?: string; reason?: string }> {
    const detection = await detectCheckpoint(page);
    if (!detection.detected) return { detected: false };

    this.logger.warn(`[${accountId}] 🚨 Checkpoint detected: ${detection.kind} | ${detection.reason} | ${detection.url}`);
    try {
      await applyCheckpointToAccount(this.dataSource, accountId, detection, opts.cooldownHours ?? 24);
    } catch (err: any) {
      this.logger.error(`[${accountId}] 写入 checkpoint 状态失败: ${err.message}`);
    }
    if (opts.closeOnDetect !== false) {
      await this.closeSession(accountId).catch(() => {});
    }
    return { detected: true, kind: detection.kind, reason: detection.reason };
  }

  async closeSession(accountId: string): Promise<void> {
    this.cancelIdleClose(accountId);
    const session = this.sessions.get(accountId);
    if (session) {
      try {
        session.browser.removeAllListeners('disconnected');
        await session.browser.close();
      } catch (_) {}
      session.status = 'closed';
      this.sessions.delete(accountId);
      this.logger.log(`[${accountId}] Browser session closed`);
    }
  }

  async closeAll(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    await Promise.all(ids.map(id => this.closeSession(id)));
    this.logger.log('All browser sessions closed');
  }

  getSession(accountId: string): BrowserSession | null {
    return this.sessions.get(accountId) || null;
  }

  getActiveSessions(): { accountId: string; profileDir: string; proxyServer: string | null; lastActivity: Date }[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status !== 'closed')
      .map(s => ({
        accountId: s.accountId,
        profileDir: s.profileDir,
        proxyServer: s.proxyServer,
        lastActivity: s.lastActivity,
      }));
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Module destroying — closing all browser sessions...');
    await this.closeAll();
  }

  private getProfileDir(accountId: string): string {
    // 优先使用环境变量配置的绝对路径（本地部署时指向 C:\FAhubX\data\browsers）
    // fallback 到 process.cwd() 保持开发环境兼容
    const baseDir = process.env.BROWSER_DATA_DIR
      || path.resolve(process.cwd(), 'browser-profiles');
    return path.resolve(baseDir, accountId);
  }

  private buildArgs(profileDir: string, proxyServer?: string, primaryLanguage?: string): string[] {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--window-size=1280,800',
      '--disable-blink-features=AutomationControlled',
      `--user-data-dir=${profileDir}`,
    ];

    // 把 navigator.languages 改成跟 VPN 国家匹配，避免出口 IP 与浏览器语言矛盾
    if (primaryLanguage) {
      args.push(`--lang=${primaryLanguage}`);
    }

    if (proxyServer) {
      args.push(`--proxy-server=${proxyServer}`);
    }

    return args;
  }
}
