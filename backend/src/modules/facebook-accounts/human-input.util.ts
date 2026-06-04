/**
 * Human-like input helpers for Puppeteer pages.
 *
 * 用途：把"自动化味道"很重的瞬移点击 + JS 赋值，替换成"看起来像人"的
 * 多段弧线鼠标移动 + 带抖动延迟的键盘输入。
 *
 * 不是万能反爬 —— 真正的反爬要靠 stealth 插件 + UA 一致性 + IP 合理 +
 * 行为节奏。这层只解决最低级的 mousemove 直线 / instant click / value 赋值
 * 这些容易被脚本检测抓的点。
 */

export type Point = { x: number; y: number };

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 用贝塞尔曲线生成一条从 from → to 的弯曲鼠标轨迹。
 * 步数随距离自动调整，每步加微小随机偏移避免完美几何曲线。
 */
export async function humanMouseMove(page: any, from: Point, to: Point): Promise<void> {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.min(40, Math.max(8, Math.round(dist / 18)));

  // 控制点：偏离直线一段距离造一个弧
  const midX = (from.x + to.x) / 2 + rand(-30, 30);
  const midY = (from.y + to.y) / 2 + rand(-30, 30);

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // 二次贝塞尔：(1-t)^2*P0 + 2(1-t)t*P1 + t^2*P2
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * midX + t * t * to.x + rand(-1.2, 1.2);
    const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * midY + t * t * to.y + rand(-1.2, 1.2);
    await page.mouse.move(x, y);
    // 每步 6 ~ 18ms：合计约 100~500ms，跟人类一次手势的耗时一致
    await sleep(rand(6, 18));
  }
  await page.mouse.move(to.x, to.y);
}

/**
 * 在元素中心做拟人点击：
 *   1) 用 getBoundingClientRect 拿元素中心 + 小幅随机偏移（避免每次正中心）
 *   2) 从当前鼠标位置走贝塞尔轨迹过去
 *   3) 小停顿（"找到目标的犹豫"）后再 click
 *
 * 注意：React 不响应 JS .click()，必须 page.mouse.click(x,y)。
 */
export async function humanClick(page: any, selector: string, opts: { delayBeforeMs?: [number, number] } = {}): Promise<void> {
  const box = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, selector);
  if (!box) throw new Error(`humanClick: selector not found: ${selector}`);

  // 元素中心 ± 30% 偏移，看起来更像人
  const targetX = box.x + box.w * (0.35 + Math.random() * 0.30);
  const targetY = box.y + box.h * (0.35 + Math.random() * 0.30);

  // 当前鼠标位置 puppeteer 没暴露 getter，从一个保守起点开始
  const from: Point = { x: Math.max(0, targetX - rand(120, 240)), y: Math.max(0, targetY - rand(80, 160)) };
  await humanMouseMove(page, from, { x: targetX, y: targetY });

  const [a, b] = opts.delayBeforeMs ?? [60, 160];
  await sleep(rand(a, b));
  await page.mouse.click(targetX, targetY);
}

/**
 * 拟人键盘输入：每个字符 80~180ms 抖动延迟，避免恒定速率被识别。
 * 偶尔在空格/标点后多停一会儿，模拟思考。
 */
export async function humanType(page: any, text: string, opts: { selector?: string } = {}): Promise<void> {
  if (opts.selector) {
    await humanClick(page, opts.selector);
    await sleep(rand(80, 160));
  }
  for (const ch of text) {
    await page.keyboard.type(ch);
    const base = rand(70, 170);
    const pause = (ch === ' ' || ch === ',' || ch === '.' || ch === '\n') ? rand(120, 320) : 0;
    await sleep(base + pause);
  }
}

/**
 * 模拟"看页面"动作：随机滚动一段距离，然后等待几秒。
 * 用于登录成功后过渡 / 任务间隙，给 FB 一个"用户在浏览"的信号。
 */
export async function humanIdleScroll(page: any, opts: { minMs?: number; maxMs?: number } = {}): Promise<void> {
  const total = rand(opts.minMs ?? 3000, opts.maxMs ?? 8000);
  const start = Date.now();
  while (Date.now() - start < total) {
    const delta = randInt(80, 320);
    try { await page.mouse.wheel({ deltaY: delta }); } catch (_) {}
    await sleep(rand(400, 1200));
    if (Math.random() < 0.15) {
      // 偶尔反向往上滚一点点
      try { await page.mouse.wheel({ deltaY: -randInt(50, 150) }); } catch (_) {}
      await sleep(rand(300, 700));
    }
  }
}

export { rand, randInt, sleep };
