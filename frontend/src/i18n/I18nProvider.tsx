import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { IntlProvider } from 'react-intl';
import { ConfigProvider } from 'antd';
import type { Locale as AntdLocale } from 'antd/es/locale';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import 'dayjs/locale/vi';

import {
  SupportedLocale, DEFAULT_LOCALE, I18N_ENABLED,
  getInitialLocale, saveLocaleLocally,
} from './config';

import zhMessages from './locales/zh.json';
import enMessages from './locales/en.json';
import viMessages from './locales/vi.json';

// Flatten nested JSON into dotted keys (react-intl 需要扁平 message map)
function flattenMessages(nested: any, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(nested)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(out, flattenMessages(val, path));
    } else {
      out[path] = String(val);
    }
  }
  return out;
}

const MESSAGES: Record<SupportedLocale, Record<string, string>> = {
  zh: flattenMessages(zhMessages),
  en: flattenMessages(enMessages),
  vi: flattenMessages(viMessages),
};

const ANTD_LOCALES: Record<SupportedLocale, AntdLocale> = {
  zh: zhCN,
  en: enUS,
  vi: viVN,
};

const DAYJS_LOCALES: Record<SupportedLocale, string> = {
  zh: 'zh-cn',
  en: 'en',
  vi: 'vi',
};

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (l: SupportedLocale) => void;
  enabled: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
};

interface Props {
  children: React.ReactNode;
  /**
   * 如果父层（App 启动后）从 user.language 拿到偏好，透传进来覆盖初值。
   * 不传则用 localStorage / 默认 zh。
   */
  userPreferredLocale?: SupportedLocale;
}

export const I18nProvider: React.FC<Props> = ({ children, userPreferredLocale }) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (!I18N_ENABLED) return DEFAULT_LOCALE;
    return userPreferredLocale || getInitialLocale();
  });

  // 响应外层传入的 userPreferredLocale 变化（登录后同步到 DB 值）
  useEffect(() => {
    if (!I18N_ENABLED) return;
    if (userPreferredLocale && userPreferredLocale !== locale) {
      setLocaleState(userPreferredLocale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPreferredLocale]);

  // dayjs 的 locale 是全局的，切换时同步
  useEffect(() => {
    dayjs.locale(DAYJS_LOCALES[locale]);
  }, [locale]);

  const setLocale = useCallback((next: SupportedLocale) => {
    if (!I18N_ENABLED) return;
    setLocaleState(next);
    saveLocaleLocally(next);
  }, []);

  const ctxValue = useMemo(() => ({ locale, setLocale, enabled: I18N_ENABLED }), [locale, setLocale]);

  return (
    <I18nContext.Provider value={ctxValue}>
      <ConfigProvider locale={ANTD_LOCALES[locale]}>
        <IntlProvider
          messages={MESSAGES[locale]}
          locale={locale === 'zh' ? 'zh-CN' : locale === 'vi' ? 'vi-VN' : 'en-US'}
          defaultLocale="zh-CN"
          /** 开发时若缺 key 会在 console 报错，生产里忽略 */
          onError={(err) => {
            if (import.meta.env.DEV && err.code !== 'MISSING_TRANSLATION') {
              // eslint-disable-next-line no-console
              console.warn('[i18n]', err.message);
            }
          }}
        >
          {children}
        </IntlProvider>
      </ConfigProvider>
    </I18nContext.Provider>
  );
};
