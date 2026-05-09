import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
  Typography,
  message,
} from 'antd';
import {
  UserOutlined,
  GlobalOutlined,
  MessageOutlined,
  SafetyOutlined,
  LogoutOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  MonitorOutlined,
  CrownOutlined,
  TeamOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useAuth } from '../store/authStore';
import { authService } from '../services/auth';
import { accountsService } from '../services/accounts';
import { useT } from '../i18n';
import LanguageSwitcher from './LanguageSwitcher';

// App version — bump this when releasing a new installer
const APP_VERSION = '1.4.2';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [plan, setPlan] = useState<string>('basic'); // basic / pro / admin
  const t = useT();

  // 拉一次用户 plan，用于左下角版本标识
  useEffect(() => {
    if (!user) return;
    accountsService.getStats()
      .then(res => {
        const p = (res.data as any)?.plan;
        if (p) setPlan(p);
      })
      .catch(() => {/* ignore — 默认 basic */});
  }, [user]);

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return 'dashboard';
    if (path === '/accounts') return 'accounts';
    if (path === '/tasks') return 'tasks';
    if (path === '/chat-scripts') return 'chat-scripts';
    if (path === '/vpn') return 'vpn';
    if (path === '/anti-detection') return 'anti-detection';
    if (path === '/login-status') return 'login-status';
    if (path === '/admin/users') return 'admin-users';
    return 'dashboard';
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // ignore errors on logout
    } finally {
      logout();
      message.success(t('header.logoutSuccess'));
      navigate('/login');
    }
  };

  const userMenuItems = [
    {
      key: 'settings',
      icon: React.createElement(SettingOutlined),
      label: t('header.settings'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: React.createElement(LogoutOutlined),
      label: t('header.logout'),
      onClick: handleLogout,
      danger: true,
    },
  ];

  const isAdmin = user?.role === 'admin';

  const commonNavItems = [
    {
      key: 'dashboard',
      icon: React.createElement(DashboardOutlined),
      label: t('nav.dashboard'),
      onClick: () => navigate('/'),
    },
    {
      key: 'accounts',
      icon: React.createElement(UserOutlined),
      label: t('nav.accounts'),
      onClick: () => navigate('/accounts'),
    },
    {
      key: 'tasks',
      icon: React.createElement(MessageOutlined),
      label: t('nav.tasks'),
      onClick: () => navigate('/tasks'),
    },
    {
      key: 'chat-scripts',
      icon: React.createElement(FileTextOutlined),
      label: t('nav.chatScripts'),
      onClick: () => navigate('/chat-scripts'),
    },
    {
      key: 'vpn',
      icon: React.createElement(SafetyOutlined),
      label: t('nav.vpn'),
      onClick: () => navigate('/vpn'),
    },
    {
      key: 'anti-detection',
      icon: React.createElement(SafetyOutlined),
      label: t('nav.antiDetection'),
      onClick: () => navigate('/anti-detection'),
    },
    {
      key: 'login-status',
      icon: React.createElement(MonitorOutlined),
      label: t('nav.loginStatus'),
      onClick: () => navigate('/login-status'),
    },
  ];

  const adminOnlyItems = [
    { type: 'divider' as const },
    {
      key: 'admin-users',
      icon: React.createElement(TeamOutlined),
      label: t('nav.adminUsers'),
      onClick: () => navigate('/admin/users'),
      style: { color: '#722ed1' },
    },
    {
      key: 'admin-licenses',
      icon: React.createElement(SafetyOutlined),
      label: t('nav.adminLicenses'),
      onClick: () => navigate('/admin/licenses'),
      style: { color: '#722ed1' },
    },
  ];

  const navItems = isAdmin ? [...commonNavItems, ...adminOnlyItems] : commonNavItems;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        style={{ background: '#001529', position: 'relative' }}
      >
        <div
          style={{
            padding: collapsed ? '12px 0' : '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            overflow: 'hidden',
          }}
        >
          {collapsed ? (
            <img src="/logo.png" alt="FAhubX" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          ) : (
            <>
              <img src="/logo.png" alt="FAhubX" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 4 }} />
              <div style={{ color: 'white', fontSize: 14, fontWeight: 'bold', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                FAhubX
              </div>
            </>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={navItems}
          style={{ borderRight: 0, marginTop: 8, marginBottom: 72 /* 给底部版本标签留空间 */ }}
        />
        {/* 左下角版本标识 — absolute 钉在 Sider 底部 */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: collapsed ? '10px 4px' : '10px 16px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.45)',
            fontSize: collapsed ? 10 : 12,
            lineHeight: 1.5,
            letterSpacing: 0.3,
            background: '#001529',
          }}
        >
          {collapsed ? (
            <div>v{APP_VERSION}</div>
          ) : (
            <>
              <div style={{
                color: plan === 'admin' ? '#b37feb'
                  : plan === 'enterprise' ? '#69b1ff'   // v1.4.0 钻石蓝
                  : plan === 'pro' ? '#ffd666'
                  : 'rgba(255,255,255,0.6)',
                fontWeight: 500,
              }}>
                {plan === 'admin' ? 'Admin Edition'
                  : plan === 'enterprise' ? '💎 Enterprise'
                  : plan === 'pro' ? 'Pro Version'
                  : 'Basic Version'}
              </div>
              <div>v{APP_VERSION}</div>
            </>
          )}
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? React.createElement(MenuUnfoldOutlined) : React.createElement(MenuFoldOutlined)}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <LanguageSwitcher />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}>
                <Avatar
                  icon={isAdmin ? React.createElement(CrownOutlined) : React.createElement(UserOutlined)}
                  style={{ background: isAdmin ? '#722ed1' : '#1890ff' }}
                />
                <div>
                  <Text>{user?.email || user?.username || 'Admin'}</Text>
                  {isAdmin && (
                    <Text style={{ fontSize: 11, color: '#722ed1', marginLeft: 6 }}>{t('nav.adminUsers')}</Text>
                  )}
                </div>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            background: '#f0f2f5',
            minHeight: 'calc(100vh - 112px)',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
