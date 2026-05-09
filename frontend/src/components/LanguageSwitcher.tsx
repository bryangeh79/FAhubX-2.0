import React from 'react';
import { Dropdown, Button, Space } from 'antd';
import { GlobalOutlined, DownOutlined } from '@ant-design/icons';
import { useI18n, SUPPORTED_LOCALES, SupportedLocale, I18N_ENABLED } from '../i18n';
import api from '../services/api';

/**
 * 右上角语言切换下拉。点击后：
 *   1. 立即更新前端 locale（context + localStorage）
 *   2. 异步调 PATCH /users/me/preferences 把 language 存到 DB（失败不阻塞 UI）
 */
const LanguageSwitcher: React.FC = () => {
  const { locale, setLocale } = useI18n();

  // I18N_ENABLED=false 时完全隐藏
  if (!I18N_ENABLED) return null;

  const current = SUPPORTED_LOCALES.find(l => l.code === locale) || SUPPORTED_LOCALES[0];

  const handleSelect = (next: SupportedLocale) => {
    if (next === locale) return;
    setLocale(next);
    // 异步把偏好写到 DB（失败了也不回滚 UI，localStorage 是 single-source-of-truth）
    api.patch('/users/me/language', { language: next }).catch(() => {
      // ignore — localStorage 已保存
    });
  };

  const menuItems = SUPPORTED_LOCALES.map(l => ({
    key: l.code,
    label: (
      <Space>
        <span style={{ fontSize: 16 }}>{l.flag}</span>
        <span>{l.label}</span>
      </Space>
    ),
    onClick: () => handleSelect(l.code),
  }));

  return (
    <Dropdown menu={{ items: menuItems, selectedKeys: [locale] }} placement="bottomRight">
      <Button type="text" size="small">
        <Space size={4}>
          <GlobalOutlined />
          <span style={{ fontSize: 16 }}>{current.flag}</span>
          <span>{current.label}</span>
          <DownOutlined style={{ fontSize: 10 }} />
        </Space>
      </Button>
    </Dropdown>
  );
};

export default LanguageSwitcher;
