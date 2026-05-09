import { Injectable, Logger } from '@nestjs/common';
import { BrowserSessionService } from '../../facebook-accounts/browser-session.service';
import { DataSource } from 'typeorm';

const randomDelay = (min: number, max: number) =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

@Injectable()
export class FacebookSocialService {
  private readonly logger = new Logger(FacebookSocialService.name);

  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Helper: load account from DB ─────────────────────────────────────────
  private async loadAccount(accountId: string): Promise<any> {
    const [acc] = await this.dataSource.query(
      `SELECT id, name, email, cookies, "facebookId" FROM facebook_accounts WHERE id = $1`,
      [accountId],
    );
    return acc;
  }

  // ── Helper: inject cookies + verify login ────────────────────────────────
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
      } catch { /* ignore individual cookie errors */ }
    }
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3000);
    const cookies = await page.cookies();
    const cUser = cookies.find((c: any) => c.name === 'c_user');
    if (cUser) {
      this.logger.log(`[social] ${acc.email} logged in (c_user=${cUser.value})`);
    }
    return !!cUser;
  }

  // ── Helper: click button by text using OS-level mouse click ─────────────
  // page.mouse.click(x,y) is the only reliable method for React apps.
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

    this.logger.log(`[social] [${label}] Found "${result.kw}" at (${Math.round(result.x)},${Math.round(result.y)}), clicking...`);
    await page.mouse.move(result.x, result.y);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.click(result.x, result.y);
    return result.kw;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Auto Add Friends
  //    Navigates to facebook.com/friends/ which naturally surfaces mutual
  //    friends first, satisfying the "prioritize mutual" requirement.
  //    Hard limit: 6 requests/day to avoid triggering Facebook bans.
  // ══════════════════════════════════════════════════════════════════════════
  async executeAutoAddFriends(params: {
    accountId: string;
    dailyLimit: number;    // enforced max 6 by caller
    prioritizeMutual: boolean;
    delayMin: number;      // ms
    delayMax: number;      // ms
    headless?: boolean;
  }): Promise<{ success: boolean; added: number; error?: string }> {
    const { accountId, dailyLimit, delayMin, delayMax } = params;
    const limit = Math.min(dailyLimit, 6); // hard cap — safety guard

    const acc = await this.loadAccount(accountId);
    if (!acc) return { success: false, added: 0, error: '账号不存在' };
    if (!acc.cookies) return { success: false, added: 0, error: `账号「${acc.name}」尚未登录，请先在账号管理中登录` };

    let page: any = null;
    let added = 0;

    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless: params.headless ?? true });
      page = await this.browserSessionService.newPage(accountId);

      const loggedIn = await this.injectCookiesAndLogin(page, acc);
      if (!loggedIn) return { success: false, added: 0, error: `账号「${acc.name}」Cookie 已过期，请重新登录` };

      // facebook.com/friends/ shows mutual friends first by default
      this.logger.log(`[add_friends] Navigating to friends suggestions for ${acc.name}`);
      await page.goto('https://www.facebook.com/friends/', {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await randomDelay(3000, 5000);

      const ADD_KWS = ['Add Friend', 'Add friend', '加好友', '加 好友', 'Add as friend'];

      while (added < limit) {
        let clicked = await this.clickButtonByText(page, ADD_KWS, 'add_friend');

        if (!clicked) {
          // Scroll to reveal more suggestions
          await page.evaluate(() => window.scrollBy(0, 600));
          await randomDelay(2000, 3000);
          clicked = await this.clickButtonByText(page, ADD_KWS, 'add_friend_after_scroll');
        }

        if (!clicked) {
          this.logger.log(`[add_friends] No more "Add Friend" buttons found. Stopping at ${added}.`);
          break;
        }

        added++;
        this.logger.log(`[add_friends] ✅ Sent friend request ${added}/${limit}`);

        if (added < limit) {
          await randomDelay(delayMin, delayMax); // humanlike gap between requests
        }
      }

      this.logger.log(`[add_friends] Done. Total sent: ${added}`);
      return { success: true, added };

    } catch (err: any) {
      this.logger.error(`[add_friends] Error: ${err.message}`);
      return { success: false, added, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Auto Accept Friend Requests
  //    Navigates to facebook.com/friends/requests and clicks Confirm/Accept
  //    for each pending request up to maxCount.
  // ══════════════════════════════════════════════════════════════════════════
  async executeAutoAcceptRequests(params: {
    accountId: string;
    maxCount: number;
    headless?: boolean;
  }): Promise<{ success: boolean; accepted: number; error?: string }> {
    const { accountId, maxCount } = params;

    const acc = await this.loadAccount(accountId);
    if (!acc) return { success: false, accepted: 0, error: '账号不存在' };
    if (!acc.cookies) return { success: false, accepted: 0, error: `账号「${acc.name}」尚未登录，请先在账号管理中登录` };

    let page: any = null;
    let accepted = 0;

    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless: params.headless ?? true });
      page = await this.browserSessionService.newPage(accountId);

      const loggedIn = await this.injectCookiesAndLogin(page, acc);
      if (!loggedIn) return { success: false, accepted: 0, error: `账号「${acc.name}」Cookie 已过期，请重新登录` };

      this.logger.log(`[accept_requests] Navigating to friend requests for ${acc.name}`);
      await page.goto('https://www.facebook.com/friends/requests', {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await randomDelay(3000, 5000);

      const CONFIRM_KWS = ['Confirm', 'Accept', '确认', '接受', '同意'];

      while (accepted < maxCount) {
        const clicked = await this.clickButtonByText(page, CONFIRM_KWS, 'accept_request');

        if (!clicked) {
          // Try scrolling to reveal more requests
          await page.evaluate(() => window.scrollBy(0, 600));
          await randomDelay(2000, 3000);
          const retry = await this.clickButtonByText(page, CONFIRM_KWS, 'accept_request_scroll');
          if (!retry) {
            this.logger.log(`[accept_requests] No more pending requests found. Total accepted: ${accepted}`);
            break;
          }
        }

        accepted++;
        this.logger.log(`[accept_requests] ✅ Accepted request ${accepted}`);
        await randomDelay(2000, 4000); // short pause between accepts
      }

      return { success: true, accepted };

    } catch (err: any) {
      this.logger.error(`[accept_requests] Error: ${err.message}`);
      return { success: false, accepted, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Auto Comment on Feed Posts
  //    Key fix: tracks absolute page-Y position so each comment goes to a
  //    DIFFERENT post. After commenting, minPageY advances past that article's
  //    bottom — we never look back at already-processed articles.
  // ══════════════════════════════════════════════════════════════════════════
  async executeAutoComment(params: {
    accountId: string;
    comments: string[];    // template list — one is picked at random each time
    dailyLimit: number;
    delayMin: number;      // ms
    delayMax: number;      // ms
    headless?: boolean;
  }): Promise<{ success: boolean; commented: number; error?: string }> {
    const { accountId, comments, dailyLimit, delayMin, delayMax } = params;

    if (!comments || comments.length === 0) {
      return { success: false, commented: 0, error: '未提供评论模板，请至少填写一条' };
    }

    const acc = await this.loadAccount(accountId);
    if (!acc) return { success: false, commented: 0, error: '账号不存在' };
    if (!acc.cookies) return { success: false, commented: 0, error: `账号「${acc.name}」尚未登录，请先在账号管理中登录` };

    let page: any = null;
    let commented = 0;

    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless: params.headless ?? true });
      page = await this.browserSessionService.newPage(accountId);

      const loggedIn = await this.injectCookiesAndLogin(page, acc);
      if (!loggedIn) return { success: false, commented: 0, error: `账号「${acc.name}」Cookie 已过期，请重新登录` };

      this.logger.log(`[auto_comment] Navigating to Feed for ${acc.name}`);
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(3000, 5000);

      // minPageY tracks the absolute scroll position we've already processed.
      // We only look at articles whose top is >= minPageY, ensuring each comment
      // goes to a DIFFERENT post further down the feed.
      let minPageY = 0;
      let consecutiveMisses = 0;

      while (commented < dailyLimit) {
        // Find the next unprocessed article that has a Comment button,
        // starting from absolute page position minPageY.
        const target: {
          btnViewportX: number;
          btnViewportY: number;
          articlePageBottom: number;
        } | null = await page.evaluate((minY: number) => {
          const articles = Array.from(document.querySelectorAll('[role="article"]')) as HTMLElement[];

          for (const article of articles) {
            const ar = article.getBoundingClientRect();
            const articlePageTop = window.scrollY + ar.top;
            const articlePageBottom = window.scrollY + ar.bottom;

            // Skip articles we've already processed
            if (articlePageTop < minY) continue;

            // Must be at least partially visible in viewport
            if (ar.bottom < 0 || ar.top > window.innerHeight) continue;

            // Look for a comment button specifically inside this article
            const SELECTORS = [
              '[aria-label="Leave a comment"]',
              '[aria-label="Write a comment…"]',
              '[aria-label="Comment"]',
              '[aria-label="留言"]',
            ];
            for (const sel of SELECTORS) {
              const btn = article.querySelector(sel) as HTMLElement | null;
              if (btn) {
                const br = btn.getBoundingClientRect();
                if (br.width > 5 && br.height > 5) {
                  return {
                    btnViewportX: br.left + br.width / 2,
                    btnViewportY: br.top + br.height / 2,
                    articlePageBottom,
                  };
                }
              }
            }

            // Fallback: look for span text "Comment" / "留言" inside this article
            const spans = Array.from(article.querySelectorAll('span, div')) as HTMLElement[];
            for (const span of spans) {
              const t = (span.innerText || '').trim().toLowerCase();
              if (t === 'comment' || t === '留言') {
                const sr = span.getBoundingClientRect();
                if (sr.width > 5 && sr.height > 5) {
                  return {
                    btnViewportX: sr.left + sr.width / 2,
                    btnViewportY: sr.top + sr.height / 2,
                    articlePageBottom,
                  };
                }
              }
            }
          }
          return null;
        }, minPageY).catch(() => null);

        if (!target) {
          // No eligible article in current view — scroll down to load more posts
          await page.evaluate(() => window.scrollBy(0, 900));
          await randomDelay(2000, 3000);
          consecutiveMisses++;
          if (consecutiveMisses >= 6) {
            this.logger.warn(`[auto_comment] No more comment targets after scrolling. Stopping at ${commented}.`);
            break;
          }
          continue;
        }

        consecutiveMisses = 0;
        const commentText = comments[Math.floor(Math.random() * comments.length)];

        // Step A: click the Comment button of THIS specific article
        await page.mouse.move(target.btnViewportX, target.btnViewportY);
        await new Promise(r => setTimeout(r, 200));
        await page.mouse.click(target.btnViewportX, target.btnViewportY);
        await randomDelay(1000, 2000);

        // Step B: find the newly focused textbox and type
        const textboxPos: { x: number; y: number } | null = await page.evaluate(() => {
          const boxes = Array.from(document.querySelectorAll(
            '[contenteditable="true"][role="textbox"], [data-testid="comment-composer-input"]'
          )) as HTMLElement[];
          const visible = boxes.filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 5 && r.height > 5;
          });
          if (visible.length === 0) return null;
          const el = visible[visible.length - 1]; // last = most recently activated
          el.focus();
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }).catch(() => null);

        if (!textboxPos) {
          this.logger.warn(`[auto_comment] Textbox not found, skipping this article.`);
          // Advance past this article so we don't retry it forever
          minPageY = target.articlePageBottom;
          await page.evaluate((bottom: number) => window.scrollTo(0, bottom - 200), target.articlePageBottom);
          continue;
        }

        await page.mouse.click(textboxPos.x, textboxPos.y);
        await randomDelay(300, 600);
        await page.keyboard.type(commentText, { delay: 80 });
        await randomDelay(600, 1200);
        await page.keyboard.press('Enter');

        commented++;
        this.logger.log(`[auto_comment] ✅ Post ${commented}/${dailyLimit}: "${commentText}"`);

        // Advance minPageY past this article — guarantees next iteration picks a NEW post
        minPageY = target.articlePageBottom;

        // Scroll to bring next article into view
        await page.evaluate((bottom: number) => window.scrollTo(0, bottom - 100), target.articlePageBottom);

        // Humanlike delay before next comment
        await randomDelay(delayMin, delayMax);
      }

      this.logger.log(`[auto_comment] Done. Total: ${commented}`);
      return { success: true, commented };

    } catch (err: any) {
      this.logger.error(`[auto_comment] Error: ${err.message}`);
      return { success: false, commented, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Auto Follow
  //    Scrolls the Feed and clicks "Follow" buttons on post authors / pages.
  // ══════════════════════════════════════════════════════════════════════════
  async executeAutoFollow(params: {
    accountId: string;
    dailyLimit: number;
    delayMin: number;      // ms
    delayMax: number;      // ms
    headless?: boolean;
  }): Promise<{ success: boolean; followed: number; error?: string }> {
    const { accountId, dailyLimit, delayMin, delayMax } = params;

    const acc = await this.loadAccount(accountId);
    if (!acc) return { success: false, followed: 0, error: '账号不存在' };
    if (!acc.cookies) return { success: false, followed: 0, error: `账号「${acc.name}」尚未登录，请先在账号管理中登录` };

    let page: any = null;
    let followed = 0;

    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless: params.headless ?? true });
      page = await this.browserSessionService.newPage(accountId);

      const loggedIn = await this.injectCookiesAndLogin(page, acc);
      if (!loggedIn) return { success: false, followed: 0, error: `账号「${acc.name}」Cookie 已过期，请重新登录` };

      this.logger.log(`[auto_follow] Navigating to Feed for ${acc.name}`);
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(3000, 5000);

      const FOLLOW_KWS = ['Follow', '追踪', '关注', 'Follow Page', '追踪专页', 'Follow Public Figure'];
      let consecutiveMisses = 0;

      while (followed < dailyLimit) {
        let clicked = await this.clickButtonByText(page, FOLLOW_KWS, 'follow');

        if (!clicked) {
          // Scroll to reveal more content
          await page.evaluate(() => window.scrollBy(0, 800));
          await randomDelay(2000, 3000);
          clicked = await this.clickButtonByText(page, FOLLOW_KWS, 'follow_after_scroll');
        }

        if (!clicked) {
          consecutiveMisses++;
          if (consecutiveMisses >= 4) {
            this.logger.log(`[auto_follow] No Follow buttons found after multiple scrolls. Stopping at ${followed}.`);
            break;
          }
          await page.evaluate(() => window.scrollBy(0, 800));
          await randomDelay(2000, 3000);
          continue;
        }

        consecutiveMisses = 0;
        followed++;
        this.logger.log(`[auto_follow] ✅ Followed ${followed}/${dailyLimit}`);

        if (followed < dailyLimit) {
          await randomDelay(delayMin, delayMax);
          // Scroll past current element to expose new Follow buttons
          await page.evaluate(() => window.scrollBy(0, 500));
          await randomDelay(1000, 2000);
        }
      }

      this.logger.log(`[auto_follow] Done. Total: ${followed}`);
      return { success: true, followed };

    } catch (err: any) {
      this.logger.error(`[auto_follow] Error: ${err.message}`);
      return { success: false, followed, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Combo Task
  //    Runs multiple social actions SEQUENTIALLY for one account,
  //    reusing the same browser session. Each action opens a new tab,
  //    finishes, closes the tab, then the next one starts.
  // ══════════════════════════════════════════════════════════════════════════
  async executeComboTask(params: {
    accountId: string;
    headless?: boolean;
    actions: Array<{
      type: 'auto_accept_requests' | 'auto_add_friends' | 'auto_comment' | 'auto_follow';
      dailyLimit?: number;
      maxCount?: number;
      comments?: string[];
      delayMin?: number;
      delayMax?: number;
      prioritizeMutual?: boolean;
    }>;
  }): Promise<{ success: boolean; results: Record<string, any>; error?: string }> {
    const { accountId, actions } = params;

    if (!actions || actions.length === 0) {
      return { success: false, results: {}, error: '未选择任何动作' };
    }

    const results: Record<string, any> = {};
    let overallSuccess = true;

    this.logger.log(`[combo] Starting ${actions.length} actions for account ${accountId}`);

    for (const action of actions) {
      this.logger.log(`[combo] ▶ Running: ${action.type}`);
      try {
        switch (action.type) {
          case 'auto_accept_requests':
            results.auto_accept_requests = await this.executeAutoAcceptRequests({
              accountId,
              maxCount: action.maxCount || 999,
              headless: params.headless,
            });
            break;

          case 'auto_add_friends':
            results.auto_add_friends = await this.executeAutoAddFriends({
              accountId,
              dailyLimit: Math.min(action.dailyLimit || 5, 6),
              prioritizeMutual: action.prioritizeMutual !== false,
              delayMin: (action.delayMin || 30) * 1000,
              delayMax: (action.delayMax || 180) * 1000,
              headless: params.headless,
            });
            break;

          case 'auto_comment':
            results.auto_comment = await this.executeAutoComment({
              accountId,
              comments: action.comments || ['👍', '非常棒！', '赞！', '很精彩！', '支持！'],
              dailyLimit: action.dailyLimit || 20,
              delayMin: (action.delayMin || 20) * 1000,
              delayMax: (action.delayMax || 120) * 1000,
              headless: params.headless,
            });
            break;

          case 'auto_follow':
            results.auto_follow = await this.executeAutoFollow({
              accountId,
              dailyLimit: action.dailyLimit || 40,
              delayMin: (action.delayMin || 10) * 1000,
              delayMax: (action.delayMax || 60) * 1000,
              headless: params.headless,
            });
            break;
        }
        this.logger.log(`[combo] ✅ ${action.type} done: ${JSON.stringify(results[action.type])}`);
      } catch (err: any) {
        this.logger.error(`[combo] ❌ ${action.type} failed: ${err.message}`);
        results[action.type] = { success: false, error: err.message };
        overallSuccess = false;
        // Continue with next action even if one fails
      }

      // Brief pause between actions to let things settle
      await randomDelay(3000, 6000);
    }

    this.logger.log(`[combo] All actions finished. Success: ${overallSuccess}`);
    return { success: overallSuccess, results };
  }
}
