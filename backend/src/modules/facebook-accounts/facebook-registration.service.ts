import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { FacebookAccount } from './entities/facebook-account.entity';
import { FacebookAccountsService } from './facebook-accounts.service';
import { BrowserSessionService } from './browser-session.service';
import { StartRegistrationDto } from './dto/start-registration.dto';

type RegistrationStatus =
  | 'registering'
  | 'idle'               // registration succeeded (matches login status)
  | 'registration_failed';

/**
 * Semi-automated Facebook account registration.
 *
 * Flow:
 *  1. startRegistration(): creates account record (status='registering'),
 *     opens Puppeteer with the account's VPN, navigates to facebook.com/r.php,
 *     pre-fills user-supplied fields, returns immediately.
 *  2. Background watcher polls for c_user cookie (user is manually completing
 *     CAPTCHA / email / phone verification in the visible browser window).
 *  3. When c_user appears: saves cookies + facebookId to DB, marks status='idle'.
 *     Browser is LEFT OPEN — user closes it manually.
 *  4. If 30 min pass without c_user: status='registration_failed' but browser
 *     stays open (user may still be completing the flow).
 */
@Injectable()
export class FacebookRegistrationService {
  private readonly logger = new Logger(FacebookRegistrationService.name);

  /** Accounts currently being watched for c_user cookie. */
  private readonly watchers = new Map<string, NodeJS.Timeout>();

  /** Registration timeout — how long we wait for c_user before marking failed. */
  private readonly REGISTRATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

  /** Cookie poll interval. */
  private readonly POLL_INTERVAL_MS = 3000;

  constructor(
    @InjectRepository(FacebookAccount)
    private readonly accountRepo: Repository<FacebookAccount>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => FacebookAccountsService))
    private readonly accountsService: FacebookAccountsService,
    private readonly browserSessionService: BrowserSessionService,
  ) {}

  async startRegistration(
    userId: string,
    dto: StartRegistrationDto,
  ): Promise<{ accountId: string; status: RegistrationStatus }> {
    // 1. Validate VPN belongs to this user
    const vpnRows = await this.dataSource.query(
      `SELECT id FROM vpn_configs WHERE id = $1 AND "userId" = $2 LIMIT 1`,
      [dto.vpnConfigId, userId],
    );
    if (!vpnRows.length) {
      throw new BadRequestException('所选 VPN 不存在或无权访问');
    }

    // 2. Delegate account creation (handles quota + encryption + duplicate check)
    //    We intentionally create with status='idle' first, then flip to 'registering'
    //    to avoid piercing FacebookAccountsService's encapsulation of encryptData.
    const displayName = dto.name?.trim() || `${dto.firstName} ${dto.lastName}`.trim();
    const created = await this.accountsService.create(userId, {
      name: displayName,
      email: dto.email,
      facebookPassword: dto.facebookPassword,
      accountType: dto.accountType || 'user',
      vpnConfigId: dto.vpnConfigId,
      remarks: dto.remarks,
    });
    const accountId = created.id;

    // 3. Flip status to 'registering' and stash registration inputs in metadata
    //    (so watcher can reference them if needed; primarily for audit/debug)
    await this.dataSource.query(
      `UPDATE facebook_accounts
       SET status = 'registering',
           "syncStatus" = 'pending',
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        accountId,
        JSON.stringify({
          registrationStartedAt: new Date().toISOString(),
          registrationInputs: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            dateOfBirth: dto.dateOfBirth,
            gender: dto.gender,
          },
        }),
      ],
    );

    // 4. Fire-and-forget: launch browser + navigate + prefill + start watcher in background.
    //    We return immediately so the HTTP request doesn't time out — Puppeteer + VPN handshake
    //    can take 10–30s which exceeds typical axios/nginx timeouts.
    //    Frontend polls GET /:id/registration-status to track progress.
    this.launchBrowserAndStartWatcher(accountId, dto).catch(async (err: any) => {
      this.logger.error(`[${dto.email}] Background launch failed: ${err.message}`);
      await this.markFailed(accountId, `启动失败：${err.message}`);
    });

    return { accountId, status: 'registering' };
  }

  /**
   * Background orchestrator — runs after startRegistration has already returned.
   * Launches Puppeteer (with VPN), navigates to FB signup, pre-fills fields,
   * then starts the cookie watcher.
   */
  private async launchBrowserAndStartWatcher(accountId: string, dto: StartRegistrationDto): Promise<void> {
    await this.browserSessionService.getOrLaunchSession(accountId, {
      headless: false,
    });
    const page = await this.browserSessionService.newPage(accountId);

    // FB sometimes serves the new responsive signup UI (/r.php with different DOM)
    // or the legacy one. Use networkidle2 to let the SPA settle, longer timeout
    // because VPN + FB can be slow.
    await page.goto('https://www.facebook.com/r.php', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Let JS render the form before trying to fill
    await new Promise(r => setTimeout(r, 1500));

    await this.prefillRegistrationForm(page, dto);
    this.logger.log(`[${dto.email}] Registration page opened and pre-filled`);

    this.startCookieWatcher(accountId, dto.email);
  }

  async getRegistrationStatus(
    userId: string,
    accountId: string,
  ): Promise<{ status: RegistrationStatus; facebookId?: string; error?: string }> {
    const rows = await this.dataSource.query(
      `SELECT status, "facebookId", "syncError" FROM facebook_accounts
       WHERE id = $1 AND "userId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [accountId, userId],
    );
    if (!rows.length) throw new NotFoundException('账号不存在');
    const row = rows[0];

    // Map DB status back to registration-flow status
    let status: RegistrationStatus;
    if (row.status === 'registering') status = 'registering';
    else if (row.status === 'registration_failed') status = 'registration_failed';
    else status = 'idle'; // any other status (idle/active) = success

    return {
      status,
      facebookId: row.facebookId || undefined,
      error: status === 'registration_failed' ? row.syncError : undefined,
    };
  }

  async cancelRegistration(userId: string, accountId: string): Promise<void> {
    // Verify ownership
    const rows = await this.dataSource.query(
      `SELECT id, status FROM facebook_accounts
       WHERE id = $1 AND "userId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [accountId, userId],
    );
    if (!rows.length) throw new NotFoundException('账号不存在');

    // Stop watcher, close browser, soft-delete the temp record
    this.stopWatcher(accountId);
    await this.browserSessionService.closeSession(accountId).catch(() => {});
    await this.dataSource.query(
      `UPDATE facebook_accounts SET "deletedAt" = NOW() WHERE id = $1`,
      [accountId],
    );
    this.logger.log(`[${accountId}] Registration cancelled by user`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pre-fill FB registration form fields. FB ships multiple signup layouts
   * (legacy desktop, new responsive "Get started on Facebook", mobile r.php).
   * We try selectors in priority order per field — first hit wins. If everything
   * fails, we log a warning but don't fail the flow — user can fill manually.
   */
  private async prefillRegistrationForm(page: any, dto: StartRegistrationDto): Promise<void> {
    // Try each selector; type into the first one that exists. Never throws.
    const tryTypeByAny = async (
      selectors: string[],
      value: string,
      label: string,
    ): Promise<boolean> => {
      for (const sel of selectors) {
        try {
          const el = await page.$(sel);
          if (!el) continue;
          await el.click({ clickCount: 3 }).catch(() => {});
          await el.type(value, { delay: 25 });
          return true;
        } catch { /* try next */ }
      }
      this.logger.warn(`[${dto.email}] Could not pre-fill ${label} — user can fill manually`);
      return false;
    };

    // Wait a beat for the form to mount
    await page.waitForSelector('input', { timeout: 10000 }).catch(() => {});

    await tryTypeByAny(
      [
        'input[name="firstname"]',
        'input[aria-label="First name"]',
        'input[placeholder="First name"]',
        'input[placeholder^="First"]',
      ],
      dto.firstName,
      'firstName',
    );

    await tryTypeByAny(
      [
        'input[name="lastname"]',
        'input[aria-label="Last name"]',
        'input[placeholder="Last name"]',
        'input[placeholder^="Last"]',
      ],
      dto.lastName,
      'lastName',
    );

    await tryTypeByAny(
      [
        'input[name="reg_email__"]',
        'input[name="reg_email"]',
        'input[aria-label="Mobile number or email"]',
        'input[placeholder="Mobile number or email"]',
        'input[placeholder*="mail"]',
      ],
      dto.email,
      'email',
    );

    await tryTypeByAny(
      [
        'input[name="reg_passwd__"]',
        'input[name="password"]',
        'input[type="password"]',
        'input[aria-label="Password"]',
      ],
      dto.facebookPassword,
      'password',
    );

    // Date of birth — legacy uses select[name=birthday_day/month/year];
    // new UI uses native <select> too but names may differ. Try legacy first.
    if (dto.dateOfBirth) {
      const [year, month, day] = dto.dateOfBirth.split('-');
      await page.select('select[name="birthday_day"]', String(parseInt(day, 10))).catch(() => {});
      await page.select('select[name="birthday_month"]', String(parseInt(month, 10))).catch(() => {});
      await page.select('select[name="birthday_year"]', year).catch(() => {});
    }

    // Gender — legacy uses input[name=sex] radios (1=female, 2=male, -1=custom).
    if (dto.gender) {
      const genderValue = dto.gender === 'female' ? '1' : dto.gender === 'male' ? '2' : '-1';
      await page.click(`input[name="sex"][value="${genderValue}"]`).catch(() => {});
    }
  }

  /**
   * Polls page cookies every POLL_INTERVAL_MS for c_user.
   * On success: saves cookies + facebookId, marks status='idle', leaves browser open.
   * On timeout: marks status='registration_failed', leaves browser open.
   */
  private startCookieWatcher(accountId: string, email: string): void {
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const session = this.browserSessionService.getSession(accountId);
        if (!session || session.status === 'closed') {
          // Browser closed (user or disconnect) — if we haven't saved yet, mark failed.
          await this.handleBrowserClosedBeforeSuccess(accountId, email);
          this.stopWatcher(accountId);
          return;
        }

        const pages = await session.browser.pages();
        // Find any page that has a c_user cookie
        let cookiesJson: string | null = null;
        for (const p of pages) {
          try {
            const cookies = await p.cookies();
            if (cookies.some((c: any) => c.name === 'c_user')) {
              cookiesJson = JSON.stringify(cookies);
              break;
            }
          } catch { /* page may have closed; keep scanning */ }
        }

        if (cookiesJson) {
          await this.saveRegistrationSuccess(accountId, email, cookiesJson);
          this.stopWatcher(accountId);
          return;
        }

        if (Date.now() - startedAt >= this.REGISTRATION_TIMEOUT_MS) {
          await this.markFailed(accountId, '注册超时（30 分钟内未检测到登录成功）');
          this.stopWatcher(accountId);
          return;
        }
      } catch (err: any) {
        this.logger.warn(`[${email}] Watcher tick error: ${err.message}`);
      }
    };

    const timer = setInterval(tick, this.POLL_INTERVAL_MS);
    this.watchers.set(accountId, timer);
    this.logger.log(`[${email}] Registration watcher started (timeout=${this.REGISTRATION_TIMEOUT_MS / 60000}min)`);
  }

  private stopWatcher(accountId: string): void {
    const t = this.watchers.get(accountId);
    if (t) {
      clearInterval(t);
      this.watchers.delete(accountId);
    }
  }

  private async handleBrowserClosedBeforeSuccess(accountId: string, email: string): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT status FROM facebook_accounts WHERE id = $1 LIMIT 1`,
      [accountId],
    );
    if (rows[0]?.status === 'registering') {
      await this.markFailed(accountId, '浏览器被关闭，注册未完成');
      this.logger.warn(`[${email}] Browser closed before c_user appeared — marked failed`);
    }
  }

  private async saveRegistrationSuccess(
    accountId: string,
    email: string,
    cookiesJson: string,
  ): Promise<void> {
    const now = new Date();
    const sessionExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const session = this.browserSessionService.getSession(accountId);
    const userDataDir = session?.profileDir || null;

    // Extract Facebook ID from c_user
    let facebookId: string | null = null;
    try {
      const cookies = JSON.parse(cookiesJson);
      const cUser = cookies.find((c: any) => c.name === 'c_user');
      if (cUser?.value) facebookId = cUser.value;
    } catch { /* ignore */ }

    await this.dataSource.query(
      `UPDATE facebook_accounts
       SET status = 'idle',
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
    this.logger.log(`[${email}] ✅ Registration succeeded — account active (fbId=${facebookId})`);
    // NOTE: Browser is intentionally left open. User closes it manually.
  }

  private async markFailed(accountId: string, reason: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE facebook_accounts
       SET status = 'registration_failed',
           "syncStatus" = 'failed',
           "syncError" = $2
       WHERE id = $1`,
      [accountId, reason],
    );
    // NOTE: Browser is intentionally left open even on failure/timeout —
    // user may still be in the middle of completing the flow manually.
  }
}
