/**
 * i18n 公共导出。所有组件只需 import from '../i18n' 即可。
 *
 * 用法：
 *   import { useT } from '../i18n';
 *   const t = useT();
 *   return <Button>{t('common.save')}</Button>;
 *
 *   // 带参数的：
 *   {t('accounts.quotaTitle', { plan: 'PRO' })}
 */
import { useIntl } from 'react-intl';
import { useCallback } from 'react';

export { I18nProvider, useI18n } from './I18nProvider';
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, I18N_ENABLED } from './config';
export type { SupportedLocale } from './config';

/**
 * useT — 更友好的 wrapper，直接返回一个 translate 函数。
 * 用 useCallback 保持引用稳定，避免放到 useEffect/useCallback deps 里导致无限刷新。
 */
export const useT = () => {
  const intl = useIntl();
  return useCallback(
    (id: string, values?: Record<string, any>) =>
      intl.formatMessage({ id, defaultMessage: id }, values),
    [intl],
  );
};
