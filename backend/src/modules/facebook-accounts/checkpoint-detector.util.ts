/**
 * Facebook checkpoint / 反爬警告检测器。
 *
 * 用途：登录或导航后调用一次，看 FB 是不是在弹下面任一种：
 *   1. /checkpoint/ 路径（最常见，URL 直接命中）
 *   2. "We suspect automated behaviour on your account"（软 checkpoint，可 dismiss）
 *   3. "Your account has been disabled" / "Account disabled"（硬封号）
 *   4. "Security check required" / 人脸 / 手机验证
 *
 * 命中时返回详情，调用方负责把账号置 suspicious + 冷却 24h。
 */

export type CheckpointKind = 'soft_suspect' | 'security_check' | 'account_disabled' | 'login_required' | 'unknown';

export interface CheckpointDetection {
  detected: boolean;
  kind?: CheckpointKind;
  url?: string;
  reason?: string;
}

const URL_PATTERNS: Array<{ re: RegExp; kind: CheckpointKind; reason: string }> = [
  { re: /facebook\.com\/checkpoint\//i, kind: 'security_check', reason: 'URL matched /checkpoint/' },
  { re: /facebook\.com\/login\//i, kind: 'login_required', reason: 'URL matched /login/ (cookies invalidated)' },
  { re: /facebook\.com\/recover\//i, kind: 'security_check', reason: 'URL matched /recover/' },
  { re: /facebook\.com\/disabled\//i, kind: 'account_disabled', reason: 'URL matched /disabled/' },
];

const TEXT_PATTERNS: Array<{ re: RegExp; kind: CheckpointKind; reason: string }> = [
  { re: /we suspect automated behaviou?r on your account/i, kind: 'soft_suspect', reason: 'Soft suspect dialog text' },
  { re: /我们怀疑你的账户有自动化行为/i, kind: 'soft_suspect', reason: 'Soft suspect dialog (zh)' },
  { re: /your account has been disabled/i, kind: 'account_disabled', reason: 'Account disabled banner' },
  { re: /your account is disabled/i, kind: 'account_disabled', reason: 'Account disabled banner' },
  { re: /账户已被停用/i, kind: 'account_disabled', reason: 'Account disabled banner (zh)' },
  { re: /security check required/i, kind: 'security_check', reason: 'Security check banner' },
  { re: /confirm your identity/i, kind: 'security_check', reason: 'Identity confirm banner' },
];

/**
 * 在 page 上检测 checkpoint。调用方在登录或重要操作之后调用。
 * 优先看 URL（瞬间命中），其次看页面 body 文本（捕捉嵌入的对话框）。
 *
 * 注意：不要在每个 page action 后都调用 —— 会拖慢任务。推荐：
 *   - 登录后调一次
 *   - 浏览器空闲一段时间后调一次
 *   - 检测到任意 FB 提示弹窗时调一次
 */
export async function detectCheckpoint(page: any): Promise<CheckpointDetection> {
  if (!page || page.isClosed?.()) return { detected: false };

  let url = '';
  try { url = page.url() || ''; } catch (_) { /* page closed */ }

  for (const p of URL_PATTERNS) {
    if (p.re.test(url)) {
      return { detected: true, kind: p.kind, url, reason: p.reason };
    }
  }

  // 文本探针：只读 body innerText 头 4000 字符，避免拉大整页 HTML
  let bodyText = '';
  try {
    bodyText = await page.evaluate(() => {
      const t = document.body ? (document.body.innerText || '') : '';
      return t.slice(0, 4000);
    });
  } catch (_) {
    // 页面切换中 evaluate 会失败，忽略
    return { detected: false };
  }

  for (const p of TEXT_PATTERNS) {
    if (p.re.test(bodyText)) {
      return { detected: true, kind: p.kind, url, reason: p.reason };
    }
  }

  return { detected: false };
}

/**
 * 把检测结果落库到 facebook_accounts：
 *   - status = 'suspicious'（soft）或 'banned'（hard disabled）
 *   - cooldownUntil = now + 24h（soft）/ never（hard）
 *   - lastCheckpointAt, checkpointReason
 *
 * 使用 raw SQL 避免引入 repository 依赖（这个工具会在多个模块用到）。
 */
export async function applyCheckpointToAccount(
  dataSource: { query: (sql: string, params: any[]) => Promise<any> },
  accountId: string,
  detection: CheckpointDetection,
  cooldownHours: number = 24,
): Promise<void> {
  if (!detection.detected) return;

  const newStatus: string = detection.kind === 'account_disabled' ? 'banned' : 'suspicious';
  // 硬封号不设冷却（无意义），软 checkpoint / 安全检查给 cooldownHours 小时
  const setCooldown = detection.kind !== 'account_disabled';
  const cooldownExpr = setCooldown
    ? `NOW() + INTERVAL '${cooldownHours} hours'`
    : 'NULL';

  const reason = (detection.reason || 'checkpoint detected').slice(0, 2000);
  await dataSource.query(
    `UPDATE facebook_accounts
       SET status = $1,
           "cooldownUntil" = ${cooldownExpr},
           "lastCheckpointAt" = NOW(),
           "checkpointReason" = $2,
           "updatedAt" = NOW()
     WHERE id = $3`,
    [newStatus, `[${detection.kind || 'unknown'}] ${reason}${detection.url ? ' @ ' + detection.url : ''}`, accountId],
  );
}
