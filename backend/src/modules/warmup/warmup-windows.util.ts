/**
 * v1.4.0 — 暖化时间矩阵工具（分钟级 + 自适应组数）
 *
 * 每个分组固定 3 个窗口（早 / 下午 / 晚），组号越大起始时间越晚。
 * 窗口持续 30 分钟（在此期间调度器触发 enqueue；过了 30 分钟还没触发就算错过）。
 *
 * 时间矩阵规则（按 groupCount 自适应）：
 * ─────────────────────────────────────────────────────────
 * groupCount ≤ 6（v1.3 及以前的现有租户，行为完全不变）：
 *   组间错峰 = 60 分钟（整点）
 *   G1=[08:00,14:00,20:00] G2=[09:00,15:00,21:00] ... G6=[13:00,19:00,01:00]
 *
 * groupCount > 6（Enterprise 配套，最多 9 组）：
 *   组间错峰 = floor(360 / N) 分钟
 *   N=9: 40 分钟
 *   G1=[08:00,14:00,20:00]
 *   G2=[08:40,14:40,20:40]
 *   G3=[09:20,15:20,21:20]
 *   G4=[10:00,16:00,22:00]
 *   ...
 *   G9=[13:20,19:20,01:20]
 * ─────────────────────────────────────────────────────────
 *
 * 兼容性：1-6 组用户升级后矩阵不变。仅 N>6 时启用新算法。
 */

export const WINDOW_DURATION_MIN = 30;
const BASE_HOUR = 8; // 早窗口起始小时
const WINDOW_GAP_HOURS = 6; // 早→午→晚 间隔
const TOTAL_DAY_MINUTES = 24 * 60;

/**
 * 计算组间错峰分钟数
 */
function getGroupSpreadMinutes(groupCount: number): number {
  if (groupCount <= 6) return 60; // 旧规则：1 小时
  // 把 6 小时（360 分钟）均分给 N 组
  return Math.floor((WINDOW_GAP_HOURS * 60) / groupCount);
}

/**
 * 获取某个分组的 3 个窗口起始时间（分钟从 00:00 起算）
 */
export function getWarmupWindowMinutes(
  groupNumber: number,
  groupCount: number = 6,
): number[] {
  const spread = getGroupSpreadMinutes(groupCount);
  const groupOffset = (groupNumber - 1) * spread;
  const baseStartMin = BASE_HOUR * 60; // 8:00 = 480 min
  return [
    (baseStartMin + groupOffset) % TOTAL_DAY_MINUTES,
    (baseStartMin + 6 * 60 + groupOffset) % TOTAL_DAY_MINUTES,
    (baseStartMin + 12 * 60 + groupOffset) % TOTAL_DAY_MINUTES,
  ];
}

/**
 * 获取某个分组的 3 个窗口起始小时（兼容老调用 —— 仅当 groupCount<=6 时准确）
 *
 * @deprecated v1.4.0+ 推荐用 getWarmupWindowMinutes（支持分钟级）
 */
export function getWarmupWindowHours(groupNumber: number): number[] {
  const offset = groupNumber - 1;
  return [(8 + offset) % 24, (14 + offset) % 24, (20 + offset) % 24];
}

/**
 * 当前时间所属窗口的当前分钟数（00:00 起算）
 */
function nowMinutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * 计算某个时间点是否处于某个分组的某个窗口内
 * 返回 windowIndex (0/1/2) 或 -1（不在窗口）
 */
export function findActiveWindow(
  groupNumber: number,
  now: Date = new Date(),
  groupCount: number = 6,
): number {
  const windows = getWarmupWindowMinutes(groupNumber, groupCount);
  const cur = nowMinutesOfDay(now);
  for (let i = 0; i < windows.length; i++) {
    const start = windows[i];
    const end = (start + WINDOW_DURATION_MIN) % TOTAL_DAY_MINUTES;
    // 处理跨午夜：如果 end < start，window 跨日
    const inWindow = end > start
      ? cur >= start && cur < end
      : cur >= start || cur < end;
    if (inWindow) return i;
  }
  return -1;
}

/**
 * 计算某个时间点「刚错过」的窗口索引
 */
export function findJustMissedWindow(
  groupNumber: number,
  lastCheckedAt: Date,
  now: Date = new Date(),
  groupCount: number = 6,
): number {
  const windows = getWarmupWindowMinutes(groupNumber, groupCount);
  for (let i = 0; i < windows.length; i++) {
    const startMin = windows[i];
    // 把 startMin + WINDOW_DURATION_MIN 转回今天 / 明天的 Date 对象
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const windowEndMin = startMin + WINDOW_DURATION_MIN;
    const windowEnd = new Date(today.getTime() + windowEndMin * 60_000);
    if (windowEnd > lastCheckedAt && windowEnd <= now) {
      return i;
    }
  }
  return -1;
}

/**
 * v1.4.0 —— 同组内账号错峰：根据账号在组内的序号（0-based）计算 5 分钟子偏移
 * 假设账号已按 accountNumber ASC 排序，position 是索引位置
 *
 * 例：G1 早窗口 08:00，6 个账号在组内：
 *   #01 (position=0) → 08:00 触发
 *   #02 (position=1) → 08:05 触发
 *   #03 (position=2) → 08:10 触发
 *   ...
 *   #06 (position=5) → 08:25 触发
 *
 * 调度器 5 分钟一次 cron tick。账号是否进入触发：
 *   nowMinuteOffset = 当前时间相对窗口起始的分钟数
 *   triggerOffsetMin = position * 5
 *   若 nowMinuteOffset >= triggerOffsetMin && < triggerOffsetMin + 5，则触发
 */
export const ACCOUNT_STAGGER_MIN = 5;

/**
 * 判断账号此刻是否应该在这次 tick 触发（用于组内错峰）
 *
 * @param accountPositionInGroup 账号在组内的 0-based 序号
 * @param groupNumber 分组号
 * @param groupCount 该租户的组数
 * @param now 当前时间
 * @returns true=应该触发，false=还没轮到这个账号
 */
export function isAccountTurnInWindow(
  accountPositionInGroup: number,
  groupNumber: number,
  now: Date = new Date(),
  groupCount: number = 6,
): boolean {
  const windows = getWarmupWindowMinutes(groupNumber, groupCount);
  const cur = nowMinutesOfDay(now);
  for (const startMin of windows) {
    const triggerStart = (startMin + accountPositionInGroup * ACCOUNT_STAGGER_MIN) % TOTAL_DAY_MINUTES;
    const triggerEnd = (triggerStart + ACCOUNT_STAGGER_MIN) % TOTAL_DAY_MINUTES;
    // 必须仍在窗口内（30 分钟内）—— 防止 position 太大超出窗口
    const positionOffset = accountPositionInGroup * ACCOUNT_STAGGER_MIN;
    if (positionOffset >= WINDOW_DURATION_MIN) continue;

    const inSlot = triggerEnd > triggerStart
      ? cur >= triggerStart && cur < triggerEnd
      : cur >= triggerStart || cur < triggerEnd;
    if (inSlot) return true;
  }
  return false;
}

/**
 * v1.3.0 —— 暖化包模式 + 进度计算
 *
 * 租户创建养号任务时选择 packageMode：
 *   P1      — 只孵化（Day 1-7，跑完自动转 P3）
 *   P2      — 只激活（Day 1-7 用 P2 动作，跑完自动转 P3）
 *   P1+P2   — 完整养号（Day 1-14：前 7 天 P1，后 7 天 P2，跑完自动转 P3）
 *   P3      — 立即进入维护模式（无限运行）
 *
 * 注意 P2 单独时，Day 1 就用激活期动作，而不是等到 Day 8。
 * 从 startedAt 开始算 Day 1。
 *
 * 跑完自动转 P3 的时机：
 *   - P1 跑完 = day > 7：packageMode 改为 'P3'，startedAt 重置为 now（Day 1 of P3）
 *   - P2 跑完 = day > 7：同上
 *   - P1+P2 跑完 = day > 14：同上
 */
export type PackageMode = 'P1' | 'P2' | 'P1+P2' | 'P3';

export interface PackageInfo {
  /** 当前真实的包（调度器用这个决定动作）：1 孵化 / 2 激活 / 3 运营 */
  packageNumber: 1 | 2 | 3;
  packageName: 'incubation' | 'activation' | 'operation';
  /** 当前包内的天数（1-7 或 1+） */
  dayInPackage: number;
  /** 整个养号任务的累计天数 */
  overallDay: number;
  /** 相对 packageMode 总天数的进度 0-100；P3 始终 100 */
  progressPercent: number;
  /** 总天数（7 / 14 / 0=无限） */
  totalDays: number;
  isMaintenance: boolean;
  /** 是否已经跑完当前 packageMode 需要升级到 P3 */
  shouldTransitionToP3: boolean;
}

export function getPackageInfo(
  startedAt: Date,
  packageMode: PackageMode = 'P1+P2',
  now: Date = new Date(),
): PackageInfo {
  const msPerDay = 86_400_000;
  const day = Math.floor((now.getTime() - startedAt.getTime()) / msPerDay) + 1;

  // P3 无限维护
  if (packageMode === 'P3') {
    return {
      packageNumber: 3, packageName: 'operation',
      dayInPackage: day, overallDay: day,
      progressPercent: 100, totalDays: 0,
      isMaintenance: true, shouldTransitionToP3: false,
    };
  }

  // P1 单独：Day 1-7 用 P1 动作 —— 超过自动转 P3
  if (packageMode === 'P1') {
    if (day > 7) {
      return {
        packageNumber: 1, packageName: 'incubation',
        dayInPackage: 7, overallDay: day,
        progressPercent: 100, totalDays: 7,
        isMaintenance: false, shouldTransitionToP3: true,
      };
    }
    return {
      packageNumber: 1, packageName: 'incubation',
      dayInPackage: day, overallDay: day,
      progressPercent: Math.round((day / 7) * 100),
      totalDays: 7, isMaintenance: false, shouldTransitionToP3: false,
    };
  }

  // P2 单独：Day 1-7 用 P2 动作
  if (packageMode === 'P2') {
    if (day > 7) {
      return {
        packageNumber: 2, packageName: 'activation',
        dayInPackage: 7, overallDay: day,
        progressPercent: 100, totalDays: 7,
        isMaintenance: false, shouldTransitionToP3: true,
      };
    }
    return {
      packageNumber: 2, packageName: 'activation',
      dayInPackage: day, overallDay: day,
      progressPercent: Math.round((day / 7) * 100),
      totalDays: 7, isMaintenance: false, shouldTransitionToP3: false,
    };
  }

  // P1+P2 完整养号：Day 1-7 → P1，Day 8-14 → P2，Day 15+ → 转 P3
  if (day <= 7) {
    return {
      packageNumber: 1, packageName: 'incubation',
      dayInPackage: day, overallDay: day,
      progressPercent: Math.round((day / 14) * 100),
      totalDays: 14, isMaintenance: false, shouldTransitionToP3: false,
    };
  }
  if (day <= 14) {
    return {
      packageNumber: 2, packageName: 'activation',
      dayInPackage: day - 7, overallDay: day,
      progressPercent: Math.round((day / 14) * 100),
      totalDays: 14, isMaintenance: false, shouldTransitionToP3: false,
    };
  }
  // 超过 14 天 → 需转 P3
  return {
    packageNumber: 2, packageName: 'activation',
    dayInPackage: 7, overallDay: day,
    progressPercent: 100, totalDays: 14,
    isMaintenance: false, shouldTransitionToP3: true,
  };
}

/**
 * 根据包 + 窗口索引决定该触发什么动作
 *
 * Package 1 (孵化)：所有窗口都做 simulate_human_behavior（被动浏览）
 *
 * Package 2 (激活)：按窗口轮转
 *   - 窗口 0（早）：simulate + 加好友
 *   - 窗口 1（下午）：接受好友申请
 *   - 窗口 2（晚）：聊天 / 加群 / 发图文（轮流）
 *
 * Package 3 (运营)：全自由，按窗口轮转更多种类
 */
export type WarmupAction =
  | 'simulate_human_behavior'
  | 'auto_add_friend'
  | 'auto_accept_friend'
  | 'auto_chat'
  | 'auto_join_group'
  | 'auto_post_image'
  | 'auto_post_video'
  | 'auto_follow'
  | 'auto_comment';

/** 返回候选动作数组；调度器会根据账号配对/剧本可用性挑一个 */
export function pickWarmupActions(packageNumber: 1 | 2 | 3, windowIndex: 0 | 1 | 2): WarmupAction[] {
  if (packageNumber === 1) {
    return ['simulate_human_behavior'];
  }
  if (packageNumber === 2) {
    if (windowIndex === 0) return ['simulate_human_behavior', 'auto_add_friend'];
    if (windowIndex === 1) return ['auto_accept_friend', 'simulate_human_behavior'];
    return ['auto_chat', 'auto_join_group', 'auto_post_image'];
  }
  // Package 3 —— 运营期，每个窗口更丰富
  if (windowIndex === 0) return ['auto_chat', 'auto_add_friend', 'auto_comment'];
  if (windowIndex === 1) return ['auto_accept_friend', 'auto_follow', 'auto_join_group'];
  return ['auto_chat', 'auto_post_image', 'auto_post_video'];
}

/**
 * 格式化本地日期 YYYY-MM-DD（用于唯一标识「今天」，避免跨时区重复触发）
 */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
