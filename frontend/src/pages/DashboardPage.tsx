import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Typography, Button, message, Space } from 'antd';
import {
  UserOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  PlayCircleOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import AppLayout from '../components/AppLayout';
import { accountsService, AccountStats } from '../services/accounts';
import { vpnService, VPNConfig } from '../services/vpn';
import { warmupService, WarmupStats } from '../services/warmup';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { ThunderboltOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface TaskStats {
  total: number;
  running: number;
  success: number;
  failed: number;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const t = useT();
  const [accountStats, setAccountStats] = useState<AccountStats | null>(null);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);
  const [vpns, setVpns] = useState<VPNConfig[]>([]);
  const [warmupStats, setWarmupStats] = useState<WarmupStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        // Parallel fetch: account stats, task stats, VPN list, warmup stats
        const [accountRes, taskRes, vpnRes, warmupRes] = await Promise.allSettled([
          accountsService.getStats(),
          api.get<any>('/tasks/stats'),
          vpnService.getVPNs({ limit: 100 }),
          warmupService.getStats(),
        ]);

        if (warmupRes.status === 'fulfilled') {
          setWarmupStats(warmupRes.value);
        }

        if (accountRes.status === 'fulfilled') {
          setAccountStats(accountRes.value.data);
        }
        if (taskRes.status === 'fulfilled') {
          // 后端若有全局拦截器包 { data: ... }，读 .data.data；否则直接 .data
          const raw: any = (taskRes.value as any).data;
          setTaskStats(raw?.data ?? raw);
        }
        if (vpnRes.status === 'fulfilled') {
          const d: any = vpnRes.value.data;
          setVpns(d?.vpns || []);
        }
      } catch {
        message.error(t('dashboard.fetchStatsFailed'));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // VPN 状态拆分：status='active' 算已连接
  const vpnConnectedCount = vpns.filter(v => (v as any).status === 'active').length;
  const vpnDisconnectedCount = vpns.length - vpnConnectedCount;

  return (
    <AppLayout>
      <Title level={2} style={{ marginTop: 0 }}>
        {t('dashboard.title')}
      </Title>

      {/* Row 1: 账号 + VPN 状态（Col 统一高度，Card height:100% 对齐） */}
      <Row gutter={16} style={{ marginBottom: 16 }} align="stretch">
        <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
          <Card loading={loading} style={{ width: '100%' }}>
            <Statistic
              title={t('dashboard.totalAccounts')}
              value={accountStats?.totalAccounts ?? '-'}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
          <Card loading={loading} style={{ width: '100%' }}>
            <Statistic
              title={t('dashboard.activeAccounts')}
              value={accountStats?.activeAccounts ?? '-'}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={12} style={{ display: 'flex' }}>
          <Card
            loading={loading}
            hoverable
            onClick={() => navigate('/vpn')}
            style={{ cursor: 'pointer', width: '100%' }}
          >
            {/* 模仿 Statistic 结构：title 在顶 + 数字区在下，高度与邻居卡片对齐 */}
            <div
              className="ant-statistic"
              style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              <div className="ant-statistic-title" style={{ marginBottom: 4 }}>
                <Space>
                  <WifiOutlined />
                  <span>{t('dashboard.vpnStatus')}</span>
                </Space>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
                <div>
                  <span style={{ fontSize: 24, fontWeight: 400, color: '#52c41a' }}>
                    <CheckCircleOutlined style={{ marginRight: 8, fontSize: 20 }} />
                    {vpnConnectedCount}
                  </span>
                  <Text type="secondary" style={{ fontSize: 13, marginLeft: 6 }}>{t('dashboard.vpnConnected')}</Text>
                </div>
                <div>
                  <span style={{ fontSize: 24, fontWeight: 400, color: (vpnDisconnectedCount > 0 ? '#f5222d' : '#bfbfbf') }}>
                    <CloseCircleOutlined style={{ marginRight: 8, fontSize: 20 }} />
                    {vpnDisconnectedCount}
                  </span>
                  <Text type="secondary" style={{ fontSize: 13, marginLeft: 6 }}>{t('dashboard.vpnDisconnected')}</Text>
                </div>
              </div>
              {vpns.length === 0 && !loading && (
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
                  {t('dashboard.vpnEmpty')}
                </Text>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Row 2: 任务 4 数字 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.totalTasks')}
              value={taskStats?.total ?? '-'}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.runningTasks')}
              value={taskStats?.running ?? '-'}
              prefix={<SyncOutlined spin={!!taskStats?.running} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.successTasks')}
              value={taskStats?.success ?? '-'}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.failedTasks')}
              value={taskStats?.failed ?? '-'}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: (taskStats?.failed ?? 0) > 0 ? '#f5222d' : '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Row 3: 暖化统计（v1.3.0）—— 独立于任务统计 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card
            loading={loading}
            hoverable
            onClick={() => navigate('/accounts')}
            style={{ cursor: 'pointer' }}
          >
            <Statistic
              title={t('dashboard.warmupActive')}
              value={warmupStats?.activeCount ?? 0}
              prefix={<ThunderboltOutlined />}
              suffix={t('dashboard.warmupAccountsUnit')}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.warmupMaintenance')}
              value={warmupStats?.maintenanceCount ?? 0}
              suffix={t('dashboard.warmupAccountsUnit')}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card loading={loading}>
            <Statistic
              title={t('dashboard.warmupRetired')}
              value={warmupStats?.retiredCount ?? 0}
              suffix={t('dashboard.warmupAccountsUnit')}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card title={t('dashboard.featureOverview')}>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Card title={t('dashboard.featureAccountsTitle')} style={{ marginBottom: 16 }}>
                  <ul>
                    <li>{t('dashboard.featureAccountsItem1')}</li>
                    <li>{t('dashboard.featureAccountsItem2')}</li>
                    <li>{t('dashboard.featureAccountsItem3')}</li>
                    <li>{t('dashboard.featureAccountsItem4')}</li>
                  </ul>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card title={t('dashboard.featureTasksTitle')} style={{ marginBottom: 16 }}>
                  <ul>
                    <li>{t('dashboard.featureTasksItem1')}</li>
                    <li>{t('dashboard.featureTasksItem2')}</li>
                    <li>{t('dashboard.featureTasksItem3')}</li>
                    <li>{t('dashboard.featureTasksItem4')}</li>
                  </ul>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card title={t('dashboard.featureSecurityTitle')} style={{ marginBottom: 16 }}>
                  <ul>
                    <li>{t('dashboard.featureSecurityItem1')}</li>
                    <li>{t('dashboard.featureSecurityItem2')}</li>
                    <li>{t('dashboard.featureSecurityItem3')}</li>
                    <li>{t('dashboard.featureSecurityItem4')}</li>
                  </ul>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card title={t('dashboard.quickActions')}>
            <p>{t('dashboard.quickActionsReady')}</p>
            <ol>
              <li>{t('dashboard.quickActionStep1')}</li>
              <li>{t('dashboard.quickActionStep2')}</li>
              <li>{t('dashboard.quickActionStep3')}</li>
            </ol>
            <div style={{ marginTop: 16 }}>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => navigate('/accounts')} style={{ marginRight: 8 }}>
                {t('dashboard.startManageAccounts')}
              </Button>
              <Button onClick={() => navigate('/tasks')}>{t('dashboard.viewTasks')}</Button>
            </div>
          </Card>
        </Col>
      </Row>
    </AppLayout>
  );
};

export default DashboardPage;
