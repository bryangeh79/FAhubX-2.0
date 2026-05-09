import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, Input, Row, Col,
  Statistic, Tooltip, Badge, Alert, message,
} from 'antd';
import {
  SyncOutlined, CheckCircleOutlined, CloseCircleOutlined,
  WarningOutlined, ReloadOutlined, SearchOutlined,
  LoginOutlined, LogoutOutlined, LoadingOutlined, GlobalOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import AppLayout from '../components/AppLayout';
import api from '../services/api';
import { useT } from '../i18n';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

const LoginStatusPage: React.FC = () => {
  const t = useT();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingInId, setLoggingInId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/facebook-accounts?limit=100');
      const list = res.data?.data?.accounts || [];
      setAccounts(list);
    } catch {
      message.error(t('loginStatus.fetchFailed'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // 不把 t 加到依赖 — 每次 render 都是新函数会导致 useEffect 无限刷新

  useEffect(() => {
    fetchAccounts();
    // Auto-refresh every 30s
    const timer = setInterval(fetchAccounts, 30000);
    return () => clearInterval(timer);
  }, [fetchAccounts]);

  const handleLogin = async (record: any) => {
    setLoggingInId(record.id);
    message.loading({ content: `${t('accounts.login')} ${record.name}...`, key: 'login', duration: 60 });
    try {
      const res = await api.post(`/facebook-accounts/${record.id}/login`, {}, { timeout: 360000 });
      const result = res.data?.data || res.data;
      message.destroy('login');
      if (result?.success) {
        message.success(`${record.name} ${t('accounts.loggedIn')}`);
        fetchAccounts();
      } else {
        message.error(result?.error || t('accounts.loginFailedDefault'));
        fetchAccounts();
      }
    } catch (err: any) {
      message.destroy('login');
      message.error(err?.response?.data?.message || t('accounts.loginFailedDefault'));
    } finally {
      setLoggingInId(null);
    }
  };

  const handleLogout = async (record: any) => {
    try {
      await api.post(`/facebook-accounts/${record.id}/logout`);
      message.success(t('accounts.logout'));
      fetchAccounts();
    } catch {
      message.error(t('accounts.syncFailed'));
    }
  };

  const filtered = accounts.filter(a =>
    !searchText || a.name?.includes(searchText) || a.email?.includes(searchText),
  );

  const onlineCount = accounts.filter(a => a.loginStatus === true || a.status === 'active').length;
  const errorCount = accounts.filter(a => a.status === 'error').length;
  const offlineCount = accounts.length - onlineCount - errorCount;

  const getStatusBadge = (record: any) => {
    if (record.loginStatus === true || record.status === 'active') {
      return <Badge status="success" text={<Tag color="green"><CheckCircleOutlined /> {t('accounts.loggedIn')}</Tag>} />;
    }
    if (record.status === 'error') {
      return (
        <Tooltip title={record.syncError || t('accounts.loginFailedTitle')}>
          <Tag color="red"><CloseCircleOutlined /> {t('accounts.loginFailedTitle')}</Tag>
        </Tooltip>
      );
    }
    if (record.status === 'banned') return <Tag color="volcano"><WarningOutlined /> {t('accounts.statusBanned')}</Tag>;
    return <Tag color="default">{t('accounts.notLoggedIn')}</Tag>;
  };

  const columns = [
    {
      title: t('loginStatus.colAccount'),
      key: 'account',
      render: (_: any, record: any) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
        </Space>
      ),
    },
    {
      title: t('loginStatus.colStatus'),
      key: 'loginStatus',
      render: (_: any, record: any) => getStatusBadge(record),
    },
    {
      title: t('loginStatus.colSessionExpiry'),
      key: 'sessionExpiresAt',
      render: (_: any, record: any) => {
        if (!record.sessionExpiresAt) return <Text type="secondary">-</Text>;
        const exp = dayjs(record.sessionExpiresAt);
        const expired = exp.isBefore(dayjs());
        return (
          <Tooltip title={exp.format('YYYY-MM-DD HH:mm')}>
            <Tag color={expired ? 'red' : 'green'}>
              {expired ? t('loginStatus.statusExpired') : exp.fromNow()}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: t('loginStatus.colLastLogin'),
      key: 'lastLoginAt',
      render: (_: any, record: any) =>
        record.lastLoginAt ? (
          <Tooltip title={dayjs(record.lastLoginAt).format('YYYY-MM-DD HH:mm:ss')}>
            <Text>{dayjs(record.lastLoginAt).fromNow()}</Text>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'VPN',
      key: 'vpn',
      render: (_: any, record: any) => (
        <Tag icon={<GlobalOutlined />} color={record.vpnConfigId ? 'purple' : 'cyan'}>
          {record.vpnConfigId ? t('accounts.assignedVpn') : t('accounts.globalIp')}
        </Tag>
      ),
    },
    {
      title: t('loginStatus.colActions'),
      key: 'actions',
      width: 160,
      render: (_: any, record: any) => (
        <Space size={4}>
          {record.loginStatus === true || record.status === 'active' ? (
            <Button size="small" danger icon={<LogoutOutlined />} onClick={() => handleLogout(record)}>
              {t('accounts.logout')}
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={loggingInId === record.id ? <LoadingOutlined /> : <LoginOutlined />}
              loading={loggingInId === record.id}
              onClick={() => handleLogin(record)}
              disabled={loggingInId !== null && loggingInId !== record.id}
            >
              {t('accounts.login')}
            </Button>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchAccounts}>
            {t('loginStatus.refresh')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>{t('loginStatus.title')}</Title>
          <Text type="secondary">{t('loginStatus.subtitle')}</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={fetchAccounts} loading={loading}>
          {t('loginStatus.refresh')}
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title={t('dashboard.totalAccounts')} value={accounts.length} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title={t('accounts.loggedIn')} value={onlineCount} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title={t('accounts.notLoggedIn')} value={offlineCount} valueStyle={{ color: '#999' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title={t('accounts.statusError')} value={errorCount} valueStyle={{ color: '#ff4d4f' }} prefix={<WarningOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder={t('common.search')}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
        </div>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (total) => t('common.total', { count: total }) }}
          rowClassName={(record: any) => {
            if (record.loginStatus === true || record.status === 'active') return 'row-online';
            if (record.status === 'error') return 'row-error';
            return '';
          }}
        />
      </Card>
    </AppLayout>
  );
};

export default LoginStatusPage;
