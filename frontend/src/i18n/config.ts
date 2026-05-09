/**
 * i18n 配置
 * - 默认中文（保证零回归，VITE_I18N_ENABLED=false 时也是中文）
 * - 支持 zh / en / vi 三种语言
 * - 用户 language 存储优先级：DB (users.language) > localStorage > 默认 zh
 */

export type SupportedLocale = 'zh' | 'en' | 'vi';

export const DEFAULT_LOCALE: SupportedLocale = 'zh';

export const SUPPORTED_LOCALES: { code: SupportedLocale; label: string; flag: string }[] = [
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
];

export const LOCALE_STORAGE_KEY = 'fahubx_locale';

/**
 * 全局 i18n 开关。若 VITE_I18N_ENABLED=false（前端 .env 配置），
 * 强制使用默认中文，等同于本功能被禁用。给「线上发现 bug 时一键回滚」用。
 */
export const I18N_ENABLED = import.meta.env.VITE_I18N_ENABLED !== 'false';

/**
 * 获取初始 locale：优先从 localStorage 取，否则用默认
 */
export function getInitialLocale(): SupportedLocale {
  if (!I18N_ENABLED) return DEFAULT_LOCALE;
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.some(l => l.code === saved)) {
      return saved as SupportedLocale;
    }
  } catch { /* localStorage blocked */ }
  return DEFAULT_LOCALE;
}

/**
 * 持久化 locale 到 localStorage（即使 DB 保存失败也有这个本地备份）
 */
export function saveLocaleLocally(locale: SupportedLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch { /* ignore */ }
}
