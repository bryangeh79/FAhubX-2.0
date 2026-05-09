import { Injectable, Logger } from '@nestjs/common';
import { BrowserSessionService } from '../../facebook-accounts/browser-session.service';

export type WarmingAction = 'scroll_feed' | 'watch_video' | 'like_post' | 'view_profile' | 'view_stories';

const randomDelay = (min: number, max: number) =>
  new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));

@Injectable()
export class AccountWarmingService {
  private readonly logger = new Logger(AccountWarmingService.name);

  constructor(private readonly browserSessionService: BrowserSessionService) {}

  async execute(params: {
    accountId: string;
    durationMinutes: number;
    actions: WarmingAction[];
    headless?: boolean;
  }): Promise<{ success: boolean; actionsPerformed: number; error?: string }> {
    const { accountId, durationMinutes, actions } = params;
    let page: any = null;
    let actionsPerformed = 0;

    try {
      await this.browserSessionService.getOrLaunchSession(accountId, { headless: params.headless ?? true });
      page = await this.browserSessionService.newPage(accountId);

      this.logger.log(`[warming] Starting ${durationMinutes}min simulation for account ${accountId}`);
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(2000, 4000);

      const endTime = Date.now() + durationMinutes * 60 * 1000;

      while (Date.now() < endTime) {
        // Randomly pick which action to perform this cycle
        const action = this.pickAction(actions);

        try {
          switch (action) {
            case 'scroll_feed':
              await this.scrollFeed(page);
              actionsPerformed++;
              break;

            case 'watch_video':
              await this.watchVideo(page);
              actionsPerformed++;
              break;

            case 'like_post':
              const liked = await this.likePost(page);
              if (liked) actionsPerformed++;
              break;

            case 'view_profile':
              const viewed = await this.viewRandomProfile(page);
              if (viewed) actionsPerformed++;
              break;

            case 'view_stories':
              await this.viewStories(page);
              actionsPerformed++;
              break;
          }
        } catch (actionErr: any) {
          this.logger.warn(`[warming] Action ${action} failed: ${actionErr.message}`);
        }

        // Random pause between actions (3-12 seconds)
        await randomDelay(3000, 12000);

        // Occasionally go back to feed
        if (Math.random() < 0.3) {
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await randomDelay(2000, 5000);
        }

        this.logger.log(`[warming] Actions performed: ${actionsPerformed}, time left: ${Math.round((endTime - Date.now()) / 1000)}s`);
      }

      this.logger.log(`[warming] Simulation complete. Total actions: ${actionsPerformed}`);
      return { success: true, actionsPerformed };
    } catch (err: any) {
      this.logger.error(`[warming] Fatal error: ${err.message}`);
      return { success: false, actionsPerformed, error: err.message };
    } finally {
      if (page) await page.close().catch(() => {});
      this.browserSessionService.releaseSession(accountId);
    }
  }

  private pickAction(actions: WarmingAction[]): WarmingAction {
    // Weighted: scroll_feed most common
    const weighted: WarmingAction[] = [];
    for (const a of actions) {
      const weight = a === 'scroll_feed' ? 4 : a === 'watch_video' ? 3 : 1;
      for (let i = 0; i < weight; i++) weighted.push(a);
    }
    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  private async scrollFeed(page: any): Promise<void> {
    const scrolls = Math.floor(Math.random() * 5) + 3; // 3-7 scrolls
    for (let i = 0; i < scrolls; i++) {
      const amount = Math.floor(Math.random() * 500) + 200;
      await page.evaluate((n: number) => window.scrollBy({ top: n, behavior: 'smooth' }), amount);
      await randomDelay(1500, 4000);

      // Occasionally move mouse to simulate reading
      if (Math.random() < 0.5) {
        const x = Math.floor(Math.random() * 600) + 100;
        const y = Math.floor(Math.random() * 400) + 100;
        await page.mouse.move(x, y, { steps: 10 });
      }
    }
    this.logger.log(`[warming] Scrolled feed ${scrolls} times`);
  }

  private async watchVideo(page: any): Promise<void> {
    // Find a video on the page
    const video = await page.$('video');
    if (!video) return;

    const watchTime = Math.floor(Math.random() * 20000) + 8000; // 8-28 seconds
    this.logger.log(`[warming] Watching video for ${Math.round(watchTime / 1000)}s`);

    // Click the video to play
    await video.click().catch(() => {});
    await randomDelay(watchTime, watchTime + 2000);

    // Scroll past it
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  }

  private async likePost(page: any): Promise<boolean> {
    // Find an unliked Like button
    const likeButtons = await page.$$('[aria-label="Like"], [data-testid="fb-ufi-likelink"]');
    if (!likeButtons.length) return false;

    // Pick a random one (not the first to avoid being predictable)
    const idx = Math.floor(Math.random() * Math.min(likeButtons.length, 5));
    await likeButtons[idx].click();
    this.logger.log('[warming] Liked a post');
    await randomDelay(500, 1500);
    return true;
  }

  private async viewRandomProfile(page: any): Promise<boolean> {
    // Find a profile link in the feed
    const profileLinks = await page.$$('a[href*="/profile.php"], a[href^="/"][href*="?"][href*="id="]');
    if (!profileLinks.length) return false;

    const idx = Math.floor(Math.random() * Math.min(profileLinks.length, 10));
    const href = await page.evaluate((el: any) => el.getAttribute('href'), profileLinks[idx]);
    if (!href) return false;

    const fullUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await randomDelay(4000, 10000);

    // Scroll their profile a bit
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await randomDelay(2000, 5000);

    // Go back
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    this.logger.log('[warming] Viewed a profile');
    return true;
  }

  private async viewStories(page: any): Promise<void> {
    const storyBtn = await page.$('[aria-label="Stories"], [data-testid="stories-viewer"]');
    if (!storyBtn) return;

    await storyBtn.click();
    await randomDelay(3000, 8000);

    // Click through 2-3 stories
    const clicks = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < clicks; i++) {
      await page.keyboard.press('ArrowRight');
      await randomDelay(2000, 5000);
    }

    await page.keyboard.press('Escape');
    this.logger.log('[warming] Viewed stories');
  }
}
