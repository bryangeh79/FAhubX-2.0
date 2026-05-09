/**
 * 后端日志消息翻译器（前端显示时用）
 *
 * 后端 appendLog 发送的都是中文日志，为了避免大改后端同时支持多语言日志，
 * 前端在 ExecutionLogModal render 时用这里的函数做字符串替换。
 *
 * 维护提示：
 * - 每条规则是 {pattern: RegExp, translate: (m) => string}
 * - pattern 用 RegExp 匹配含 capture group 的中文模板
 * - 按顺序匹配，第一个命中的规则生效
 * - 没有匹配到的日志原样显示（还是中文）— 对技术日志可以接受
 */

import type { SupportedLocale } from './config';

interface LogRule {
  pattern: RegExp;
  en: (m: RegExpMatchArray) => string;
  vi: (m: RegExpMatchArray) => string;
}

const RULES: LogRule[] = [
  // Task start / type
  {
    pattern: /^▶ 开始执行任务：(.+)$/,
    en: (m) => `▶ Starting task: ${m[1]}`,
    vi: (m) => `▶ Bắt đầu tác vụ: ${m[1]}`,
  },
  {
    pattern: /^任务类型：(.+)$/,
    en: (m) => `Task type: ${m[1]}`,
    vi: (m) => `Loại tác vụ: ${m[1]}`,
  },
  {
    pattern: /^👤 目标账号：(.+)$/,
    en: (m) => `👤 Target account: ${m[1]}`,
    vi: (m) => `👤 Tài khoản mục tiêu: ${m[1]}`,
  },
  // Browser lifecycle
  { pattern: /^🌐 正在启动浏览器\.\.\.$/, en: () => '🌐 Starting browser...', vi: () => '🌐 Đang khởi động trình duyệt...' },
  { pattern: /^🖥️ Chrome 浏览器已打开，正在导航到 Facebook\.\.\.$/, en: () => '🖥️ Chrome opened, navigating to Facebook...', vi: () => '🖥️ Đã mở Chrome, đang đi tới Facebook...' },
  {
    pattern: /^✅ 浏览器启动成功（(无头模式|显示窗口)）$/,
    en: (m) => `✅ Browser started (${m[1] === '无头模式' ? 'headless' : 'visible'})`,
    vi: (m) => `✅ Trình duyệt đã khởi động (${m[1] === '无头模式' ? 'ẩn' : 'hiện'})`,
  },
  { pattern: /^📄 已打开 Facebook 首页$/, en: () => '📄 Opened Facebook homepage', vi: () => '📄 Đã mở trang chủ Facebook' },
  // Warming-specific
  {
    pattern: /^⏱ 模拟时长：(\d+) 分钟$/,
    en: (m) => `⏱ Duration: ${m[1]} min`,
    vi: (m) => `⏱ Thời lượng: ${m[1]} phút`,
  },
  {
    pattern: /^🎯 执行动作：(.+)$/,
    en: (m) => `🎯 Actions: ${m[1]}`,
    vi: (m) => `🎯 Hành động: ${m[1]}`,
  },
  {
    pattern: /^✅ 模拟完成！共执行了 (\d+) 个操作$/,
    en: (m) => `✅ Simulation complete! Performed ${m[1]} actions`,
    vi: (m) => `✅ Mô phỏng xong! Đã thực hiện ${m[1]} hành động`,
  },
  // Login flow
  { pattern: /^⚠️ 账号未登录，将尝试使用已保存的 Session$/, en: () => '⚠️ Not logged in, trying saved session', vi: () => '⚠️ Chưa đăng nhập, thử dùng session đã lưu' },
  { pattern: /^⚠️ 账号未登录，正在尝试注入已保存的 Cookie\.\.\.$/, en: () => '⚠️ Not logged in, injecting saved cookies...', vi: () => '⚠️ Chưa đăng nhập, đang inject cookie đã lưu...' },
  { pattern: /^✅ 账号已登录$/, en: () => '✅ Account logged in', vi: () => '✅ Đã đăng nhập' },
  {
    pattern: /^🍪 注入 (\d+) 个已保存的 Cookie\.\.\.$/,
    en: (m) => `🍪 Injecting ${m[1]} saved cookies...`,
    vi: (m) => `🍪 Đang inject ${m[1]} cookie đã lưu...`,
  },
  { pattern: /^✅ Cookie 注入成功，已自动登录！$/, en: () => '✅ Cookies injected, auto-logged in!', vi: () => '✅ Đã inject cookie, đăng nhập tự động!' },
  { pattern: /^⚠️ Cookie 已过期，尝试使用密码登录\.\.\.$/, en: () => '⚠️ Cookies expired, trying password login...', vi: () => '⚠️ Cookie hết hạn, thử đăng nhập bằng mật khẩu...' },
  {
    pattern: /^⚠️ Cookie 解析失败：(.+)，尝试密码登录\.\.\.$/,
    en: (m) => `⚠️ Cookie parse failed: ${m[1]}, trying password login...`,
    vi: (m) => `⚠️ Lỗi parse cookie: ${m[1]}, thử đăng nhập bằng mật khẩu...`,
  },
  { pattern: /^❌ 无可用的 Cookie 或密码，请在账号管理中重新登录$/, en: () => '❌ No cookies or password available, please re-login in Accounts page', vi: () => '❌ Không có cookie hoặc mật khẩu, vui lòng đăng nhập lại' },
  {
    pattern: /^🔑 正在使用密码登录账号：(.+)$/,
    en: (m) => `🔑 Logging in with password: ${m[1]}`,
    vi: (m) => `🔑 Đăng nhập bằng mật khẩu: ${m[1]}`,
  },
  { pattern: /^✅ 密码登录成功！$/, en: () => '✅ Password login succeeded!', vi: () => '✅ Đăng nhập mật khẩu thành công!' },
  { pattern: /^❌ 密码登录失败，请检查密码是否正确$/, en: () => '❌ Password login failed, check password', vi: () => '❌ Đăng nhập thất bại, kiểm tra mật khẩu' },
  { pattern: /^❌ Facebook 需要安全验证（双因子验证\/手机确认），请手动处理后重试$/, en: () => '❌ Facebook requires security verification (2FA / phone), please handle manually', vi: () => '❌ Facebook cần xác minh bảo mật (2FA/điện thoại), vui lòng xử lý thủ công' },
  // Task-specific start messages
  { pattern: /^💬 正在启动自动聊天\.\.\.$/, en: () => '💬 Starting auto chat...', vi: () => '💬 Đang bắt đầu chat tự động...' },
  { pattern: /^🖼️ 正在发图片帖子\.\.\.$/, en: () => '🖼️ Posting image...', vi: () => '🖼️ Đang đăng ảnh...' },
  { pattern: /^🎬 正在发视频帖子\.\.\.$/, en: () => '🎬 Posting video...', vi: () => '🎬 Đang đăng video...' },
  { pattern: /^📞 正在启动自动拨号\.\.\.$/, en: () => '📞 Starting auto call...', vi: () => '📞 Đang bắt đầu gọi tự động...' },
  { pattern: /^👤 正在自动加好友\.\.\.$/, en: () => '👤 Sending friend requests...', vi: () => '👤 Đang gửi yêu cầu kết bạn...' },
  { pattern: /^✅ 正在接受好友申请\.\.\.$/, en: () => '✅ Accepting friend requests...', vi: () => '✅ Đang chấp nhận yêu cầu kết bạn...' },
  { pattern: /^💬 正在自动留言\.\.\.$/, en: () => '💬 Posting comments...', vi: () => '💬 Đang bình luận...' },
  { pattern: /^❤️ 正在自动 Follow\.\.\.$/, en: () => '❤️ Following...', vi: () => '❤️ Đang theo dõi...' },
  { pattern: /^🗂️ 正在执行组合任务\.\.\.$/, en: () => '🗂️ Running combo task...', vi: () => '🗂️ Đang chạy tác vụ kết hợp...' },
  // Task-specific success messages
  {
    pattern: /^✅ 聊天完成，共发送 (\d+) 条消息$/,
    en: (m) => `✅ Chat complete, sent ${m[1]} messages`,
    vi: (m) => `✅ Chat xong, đã gửi ${m[1]} tin nhắn`,
  },
  { pattern: /^✅ 帖子发布成功$/, en: () => '✅ Post published', vi: () => '✅ Đã đăng bài' },
  { pattern: /^✅ 视频发布成功$/, en: () => '✅ Video published', vi: () => '✅ Đã đăng video' },
  {
    pattern: /^✅ 通话完成，时长 (\d+) 秒$/,
    en: (m) => `✅ Call complete, duration ${m[1]}s`,
    vi: (m) => `✅ Cuộc gọi xong, ${m[1]}s`,
  },
  {
    pattern: /^✅ 完成！本次发送好友申请 (\d+) 个$/,
    en: (m) => `✅ Done! Sent ${m[1]} friend requests`,
    vi: (m) => `✅ Xong! Đã gửi ${m[1]} yêu cầu kết bạn`,
  },
  {
    pattern: /^✅ 完成！本次接受 (\d+) 个好友申请$/,
    en: (m) => `✅ Done! Accepted ${m[1]} friend requests`,
    vi: (m) => `✅ Xong! Đã chấp nhận ${m[1]} yêu cầu kết bạn`,
  },
  {
    pattern: /^✅ 完成！本次发布评论 (\d+) 条$/,
    en: (m) => `✅ Done! Posted ${m[1]} comments`,
    vi: (m) => `✅ Xong! Đã bình luận ${m[1]} lần`,
  },
  {
    pattern: /^✅ 完成！本次 Follow (\d+) 个$/,
    en: (m) => `✅ Done! Followed ${m[1]} accounts`,
    vi: (m) => `✅ Xong! Đã follow ${m[1]} tài khoản`,
  },
  {
    pattern: /^✅ 组合任务完成！(.+)$/,
    en: (m) => `✅ Combo task complete! ${m[1]}`,
    vi: (m) => `✅ Tác vụ kết hợp xong! ${m[1]}`,
  },
  {
    pattern: /^⚠️ 组合任务部分完成：(.+)$/,
    en: (m) => `⚠️ Combo task partially complete: ${m[1]}`,
    vi: (m) => `⚠️ Tác vụ kết hợp hoàn tất một phần: ${m[1]}`,
  },
  {
    pattern: /^共 (\d+) 个动作：(.+)$/,
    en: (m) => `Total ${m[1]} actions: ${m[2]}`,
    vi: (m) => `Tổng ${m[1]} hành động: ${m[2]}`,
  },
  // Errors
  {
    pattern: /^❌ 执行失败：(.+)$/,
    en: (m) => `❌ Execution failed: ${m[1]}`,
    vi: (m) => `❌ Thực thi thất bại: ${m[1]}`,
  },
  {
    pattern: /^❌ 聊天失败：(.+)$/,
    en: (m) => `❌ Chat failed: ${m[1]}`,
    vi: (m) => `❌ Chat thất bại: ${m[1]}`,
  },
  {
    pattern: /^❌ 发帖失败：(.+)$/,
    en: (m) => `❌ Post failed: ${m[1]}`,
    vi: (m) => `❌ Đăng bài thất bại: ${m[1]}`,
  },
  {
    pattern: /^❌ 发视频失败：(.+)$/,
    en: (m) => `❌ Video post failed: ${m[1]}`,
    vi: (m) => `❌ Đăng video thất bại: ${m[1]}`,
  },
  {
    pattern: /^❌ 拨号失败：(.+)$/,
    en: (m) => `❌ Call failed: ${m[1]}`,
    vi: (m) => `❌ Cuộc gọi thất bại: ${m[1]}`,
  },
  {
    pattern: /^❌ 失败：(.+)$/,
    en: (m) => `❌ Failed: ${m[1]}`,
    vi: (m) => `❌ Thất bại: ${m[1]}`,
  },
  {
    pattern: /^❌ 执行异常：(.+)$/,
    en: (m) => `❌ Execution error: ${m[1]}`,
    vi: (m) => `❌ Lỗi thực thi: ${m[1]}`,
  },
  {
    pattern: /^❌ 任务执行未捕获异常：(.+)$/,
    en: (m) => `❌ Uncaught task error: ${m[1]}`,
    vi: (m) => `❌ Lỗi không bắt được: ${m[1]}`,
  },
  { pattern: /^❌ 未找到目标账号ID$/, en: () => '❌ Target account ID not found', vi: () => '❌ Không tìm thấy ID tài khoản' },
  {
    pattern: /^❌ 账号不存在 \(id: (.+)\)$/,
    en: (m) => `❌ Account not found (id: ${m[1]})`,
    vi: (m) => `❌ Tài khoản không tồn tại (id: ${m[1]})`,
  },
  {
    pattern: /^❌ 密码解密失败（加密密钥已变动，请重新编辑账号输入密码）：(.+)$/,
    en: (m) => `❌ Password decryption failed (encryption key changed, please re-enter password in Accounts): ${m[1]}`,
    vi: (m) => `❌ Giải mã mật khẩu thất bại (khóa mã đã đổi, vui lòng nhập lại mật khẩu): ${m[1]}`,
  },
  {
    pattern: /^❌ 登录异常：(.+)$/,
    en: (m) => `❌ Login error: ${m[1]}`,
    vi: (m) => `❌ Lỗi đăng nhập: ${m[1]}`,
  },
  {
    pattern: /^⚠️ 任务类型 "(.+)" 的执行功能开发中$/,
    en: (m) => `⚠️ Task type "${m[1]}" is under development`,
    vi: (m) => `⚠️ Loại tác vụ "${m[1]}" đang phát triển`,
  },
  // Common prefix / fallback for batch combo
  {
    pattern: /^✅ 组合动作 (.+) 完成$/,
    en: (m) => `✅ Combo action ${m[1]} complete`,
    vi: (m) => `✅ Hành động kết hợp ${m[1]} xong`,
  },
];

/**
 * 翻译一条日志消息。如果没有匹配规则，原样返回（通常是中文）。
 * 调用方应按当前 locale 决定是否调用 — 中文模式下直接返回原文更快。
 */
export function translateLogMessage(message: string, locale: SupportedLocale): string {
  if (locale === 'zh') return message;  // 中文不翻译
  for (const rule of RULES) {
    const m = message.match(rule.pattern);
    if (m) {
      return locale === 'vi' ? rule.vi(m) : rule.en(m);
    }
  }
  return message;  // 无匹配，保持原样（少数技术日志中文可接受）
}
