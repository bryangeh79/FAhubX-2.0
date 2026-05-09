import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, Modal, Form,
  Input, Select, message, Popconfirm, Row, Col, Statistic, Tooltip, Alert, Badge, Progress,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined,
  UserOutlined, LockOutlined, MailOutlined, SafetyOutlined, GlobalOutlined,
  LoginOutlined, LogoutOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, WarningOutlined, TeamOutlined, SettingOutlined,
  FireOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AppLayout from '../components/AppLayout';
import RegistrationModal from '../components/RegistrationModal';
import {
  accountsService, FacebookAccount, AccountStats, CreateAccountData,
  GroupStats, GroupJoinSettings, AI_PROVIDERS, formatGroupLabel, getGroupColor,
} from '../services/accounts';
import {
  warmupService, WarmupProgress,
  computePackageInfoFromProgress, formatProgressText,
  getPackageModeLabel, getPackageModeColor,
} from '../services/warmup';
import api from '../services/api';
import { useT } from '../i18n';

const { Title, Text } = Typography;
const { Option } = Select;

interface VPNOption {
  id: string;
  name: string;
  country?: string;
  status: string;
  isDefault: boolean;
}

const AccountsPage: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<FacebookAccount[]>([]);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FacebookAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [loggingInId, setLoggingInId] = useState<string | null>(null);
  const [vpnOptions, setVpnOptions] = useState<VPNOption[]>([]);
  const [defaultVPN, setDefaultVPN] = useState<VPNOption | null>(null);
  const [loginResultModal, setLoginResultModal] = useState<{ visible: boolean; success: boolean; message: string; requiresManual?: boolean }>({ visible: false, success: false, message: '' });
  const [registrationModalVisible, setRegistrationModalVisible] = useState(false);
  // v1.2.0 Phase 1 — 分组状态
  const [groupStats, setGroupStats] = useState<GroupStats | null>(null);
  const [groupCount, setGroupCount] = useState<number>(3);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [batchAssignVisible, setBatchAssignVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [pendingGroupCount, setPendingGroupCount] = useState<number>(3);
  // v1.2.0 Phase 2 —— 暖化进度
  const [warmupMap, setWarmupMap] = useState<Record<string, WarmupProgress>>({});
  // v1.2.0 Phase 4 —— 加群设置
  const [groupJoinVisible, setGroupJoinVisible] = useState(false);
  const [groupJoinSettings, setGroupJoinSettings] = useState<GroupJoinSettings>({
    keywords: [], dailyLimit: 3, strategy: 'random',
    aiAnswerEnabled: false, aiAnswerPrompt: '',
    aiProvider: 'claude', aiApiKey: '', aiApiKeyConfigured: false,
  });
  const [form] = Form.useForm();

  const fetchWarmupList = useCallback(async () => {
    try {
      const list = await warmupService.listForUser();
      const map: Record<string, WarmupProgress> = {};
      for (const p of list) map[p.accountId] = p;
      setWarmupMap(map);
    } catch {
      // ignore
    }
  }, []);

  const fetchGroupData = useCallback(async () => {
    try {
      const [gs, ws] = await Promise.all([
        accountsService.getGroupStats(),
        accountsService.getWarmupSettings(),
      ]);
      setGroupStats(gs);
      setGroupCount(ws.groupCount);
    } catch {
      // ignore —— 旧后端没这个端点
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accountsService.getAccounts({ page, limit: pageSize });
      setAccounts(res.data.accounts);
      setTotal(res.data.meta.total);
    } catch {
      message.error('获取账号列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await accountsService.getStats();
      setStats(res.data);
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchVPNOptions = useCallback(async () => {
    try {
      const res = await api.get('/vpn-configs?limit=100');
      const list: VPNOption[] = (res.data?.data?.configs || res.data?.data?.vpns || []).map((v: any) => ({
        id: v.id,
        name: v.name,
        country: v.country || v.serverLocation,
        status: v.status,
        isDefault: v.isDefault,
      }));
      setVpnOptions(list);
      setDefaultVPN(list.find(v => v.isDefault) || null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchStats();
    fetchVPNOptions();
    fetchGroupData();
    fetchWarmupList();
    // 60 秒轮询一次暖化状态
    const t = setInterval(fetchWarmupList, 60_000);
    return () => clearInterval(t);
  }, [fetchAccounts, fetchStats, fetchVPNOptions, fetchGroupData, fetchWarmupList]);

  const handleCreate = () => {
    setEditingAccount(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: FacebookAccount) => {
    setEditingAccount(record);
    form.setFieldsValue({
      name: record.name,
      email: record.email,
      accountType: record.accountType,
      remarks: record.remarks,
      vpnConfigId: (record as any).vpnConfigId || undefined,
      messengerPin: (record as any).messengerPin || undefined,
    });
    setIsModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await accountsService.deleteAccount(id);
      message.success('删除成功');
      fetchAccounts();
      fetchStats();
    } catch {
      message.error(t('accounts.deleteFailed'));
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      await accountsService.syncAccount(id);
      message.success(t('accounts.syncSuccess'));
      fetchAccounts();
    } catch {
      message.error(t('accounts.syncFailed'));
    } finally {
      setSyncingId(null);
    }
  };

  const handleLogin = async (record: FacebookAccount) => {
    setLoggingInId(record.id);
    message.loading({ content: `${t('accounts.login')} ${record.name}...`, key: 'login', duration: 60 });
    try {
      const res = await api.post(`/facebook-accounts/${record.id}/login`, {}, { timeout: 360000 });
      const result = res.data?.data || res.data;
      message.destroy('login');
      if (result?.success) {
        message.success({ content: `${record.name} ${t('accounts.loggedIn')}`, duration: 4 });
        fetchAccounts();
        fetchStats();
      } else {
        setLoginResultModal({
          visible: true,
          success: false,
          message: result?.error || t('accounts.loginFailedDefault'),
          requiresManual: result?.requiresManual,
        });
        fetchAccounts();
      }
    } catch (err: any) {
      message.destroy('login');
      const errMsg = err?.response?.data?.message || err?.message || t('accounts.loginFailedDefault');
      setLoginResultModal({ visible: false, success: false, message: errMsg });
      message.error(errMsg);
    } finally {
      setLoggingInId(null);
    }
  };

  const handleLogout = async (record: FacebookAccount) => {
    try {
      await api.post(`/facebook-accounts/${record.id}/logout`);
      message.success(t('accounts.logout'));
      fetchAccounts();
      fetchStats();
    } catch {
      message.error(t('accounts.syncFailed'));
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingAccount) {
        // 双保险：如果用户没主动修改过密码字段，就把它从 payload 剥离。
        // 防止浏览器密码管家自动填充其他网站的密码导致账号原密码被覆盖。
        const touchedPassword = form.isFieldTouched('facebookPassword');
        if (!touchedPassword) {
          delete (values as any).facebookPassword;
        }
        await accountsService.updateAccount(editingAccount.id, values);
        message.success(t('accounts.updateSuccess'));
      } else {
        await accountsService.createAccount(values as CreateAccountData);
        message.success(t('accounts.createSuccess'));
      }
      setIsModalVisible(false);
      form.resetFields();
      fetchAccounts();
      fetchStats();
    } catch (err: any) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message);
      } else if (!err?.errorFields) {
        message.error(t('accounts.operationFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusTag = (record: any) => {
    const loginStatus = record.loginStatus;
    const status = record.status;
    if (loginStatus === true || status === 'active') {
      return <Badge status="success" text={<Tag color="green"><CheckCircleOutlined /> {t('accounts.loggedIn')}</Tag>} />;
    }
    if (status === 'error') {
      return <Tooltip title={record.syncError || t('accounts.loginFailedTitle')}><Tag color="red"><CloseCircleOutlined /> {t('accounts.statusError')}</Tag></Tooltip>;
    }
    if (status === 'banned') return <Tag color="volcano"><WarningOutlined /> {t('accounts.statusBanned')}</Tag>;
    return <Tag color="default">{t('accounts.notLoggedIn')}</Tag>;
  };

  const columns = [
    {
      title: '#',
      dataIndex: 'accountNumber',
      key: 'accountNumber',
      width: 60,
      align: 'center' as const,
      sorter: (a: any, b: any) => (a.accountNumber ?? 9999) - (b.accountNumber ?? 9999),
      defaultSortOrder: 'ascend' as const,
      render: (n: number | null | undefined) =>
        n == null ? <Text type="secondary">-</Text> :
          <Text strong style={{ color: '#1890ff' }}>
            {n < 100 ? `#${String(n).padStart(2, '0')}` : `#${n}`}
          </Text>,
    },
    {
      title: t('accounts.colName'),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      ellipsis: true,
      render: (text: string, record: FacebookAccount) => (
        <Space direction="vertical" size={0} style={{ minWidth: 140 }}>
          <Text strong style={{ whiteSpace: 'nowrap' }}>{text}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
          {(record as any).lastLoginAt && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('accounts.lastLogin')}: {dayjs((record as any).lastLoginAt).format('MM-DD HH:mm')}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('accounts.colType'),
      dataIndex: 'accountType',
      key: 'accountType',
      render: (type: string) => {
        const map: Record<string, string> = {
          user: t('accounts.typeUser'),
          page: t('accounts.typePage'),
          business: t('accounts.typeBusiness'),
        };
        return <Tag>{map[type] || type}</Tag>;
      },
    },
    {
      title: t('accounts.colStatus'),
      key: 'loginStatus',
      render: (_: any, record: any) => getStatusTag(record),
    },
    {
      title: t('accounts.colVpn'),
      dataIndex: 'vpnConfigId',
      key: 'vpnConfigId',
      render: (vpnId: string) => {
        if (vpnId) {
          const vpn = vpnOptions.find(v => v.id === vpnId);
          return (
            <Tooltip title={t('accounts.assignedVpnTooltip')}>
              <Tag color="purple" icon={<GlobalOutlined />}>
                {vpn ? vpn.name : t('accounts.assignedVpn')}
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tooltip title={defaultVPN ? t('accounts.defaultVpnTooltip', { name: defaultVPN.name }) : t('accounts.noDefaultVpnTooltip')}>
            <Tag color={defaultVPN ? 'cyan' : 'default'} icon={<GlobalOutlined />}>
              {defaultVPN ? t('accounts.defaultVpn', { name: defaultVPN.name }) : t('accounts.globalIp')}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: t('accounts.colGroup'),
      dataIndex: 'warmupGroupNumber',
      key: 'warmupGroupNumber',
      width: 100,
      align: 'center' as const,
      sorter: (a: any, b: any) => (a.warmupGroupNumber ?? 99) - (b.warmupGroupNumber ?? 99),
      render: (n: number | null | undefined, record: FacebookAccount) => {
        const outOfRange = n != null && n > groupCount;
        return (
          <Select
            size="small"
            style={{ width: 90 }}
            value={n == null ? 'none' : String(n)}
            onChange={async (val) => {
              const newGroup = val === 'none' ? null : parseInt(val, 10);
              try {
                await accountsService.assignGroup(record.id, newGroup);
                message.success(t('accounts.updateSuccess'));
                fetchAccounts();
                fetchGroupData();
              } catch {
                message.error(t('accounts.operationFailed'));
              }
            }}
            status={outOfRange ? 'warning' : undefined}
          >
            <Option value="none">{t('accounts.groupUnassigned')}</Option>
            {Array.from({ length: groupCount }, (_, i) => i + 1).map(g => (
              <Option key={g} value={String(g)}>
                <Tag color={getGroupColor(g)} style={{ margin: 0 }}>{formatGroupLabel(g)}</Tag>
              </Option>
            ))}
            {outOfRange && (
              <Option value={String(n)} disabled>
                <Tag color="red" style={{ margin: 0 }}>{formatGroupLabel(n)} ({t('accounts.groupOutOfRange')})</Tag>
              </Option>
            )}
          </Select>
        );
      },
    },
    {
      title: t('accounts.colWarmup'),
      key: 'warmup',
      width: 220,
      render: (_: any, record: FacebookAccount) => {
        const p = warmupMap[record.id];
        // 未启动 → 一键养号按钮（P1+P2 默认）
        if (!p) {
          const noGroup = record.warmupGroupNumber == null;
          return (
            <Popconfirm
              title={t('accounts.quickStartTitle')}
              description={noGroup ? t('accounts.warmupNeedGroup') : t('accounts.quickStartDesc')}
              disabled={noGroup}
              onConfirm={async () => {
                try {
                  await warmupService.start(record.id, 'P1+P2');
                  message.success(t('accounts.warmupStartSuccess'));
                  fetchWarmupList();
                } catch (e: any) {
                  message.error(e?.response?.data?.message || t('accounts.warmupStartFailed'));
                }
              }}
              okText={t('accounts.quickStartOk')}
              cancelText={t('common.cancel')}
            >
              <Button
                size="small"
                type="primary"
                ghost
                disabled={noGroup}
                title={noGroup ? t('accounts.warmupNeedGroup') : ''}
              >
                🚀 {t('accounts.quickStart')}
              </Button>
            </Popconfirm>
          );
        }
        if (p.status === 'retired') {
          return (
            <Space size={4}>
              <Tag color="default">{t('accounts.warmupRetired')}</Tag>
              <Popconfirm
                title={t('accounts.warmupResumeConfirm')}
                onConfirm={async () => {
                  await warmupService.resume(record.id);
                  message.success(t('accounts.updateSuccess'));
                  fetchWarmupList();
                }}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Button size="small" type="link">{t('accounts.warmupResume')}</Button>
              </Popconfirm>
            </Space>
          );
        }
        // Active —— 进度条 + 标签 + 跳转任务
        const info = computePackageInfoFromProgress(p);
        const missedWarn = p.missedToday >= 6;
        const progressText = formatProgressText(p);
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag
                color={getPackageModeColor(p.packageMode)}
                style={{ margin: 0, fontSize: 11, padding: '0 6px', lineHeight: '16px' }}
              >
                {getPackageModeLabel(p.packageMode)}
              </Tag>
              <Text style={{ fontSize: 11, color: '#666' }}>{progressText}</Text>
            </div>
            <Progress
              percent={info.progressPercent}
              size="small"
              status={info.isMaintenance ? 'success' : 'active'}
              strokeColor={
                info.isMaintenance ? '#52c41a'
                  : info.packageNumber === 1 ? '#1890ff'
                  : '#faad14'
              }
              showInfo={false}
              style={{ marginBottom: 0 }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {p.taskId && (
                <Button
                  size="small"
                  type="link"
                  style={{ padding: 0, height: 18, fontSize: 11 }}
                  onClick={() => navigate(`/tasks?taskId=${p.taskId}`)}
                >
                  {t('accounts.viewLog')}
                </Button>
              )}
              <Popconfirm
                title={t('accounts.warmupRetireConfirm')}
                onConfirm={async () => {
                  await warmupService.retire(record.id);
                  message.success(t('accounts.updateSuccess'));
                  fetchWarmupList();
                }}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Button size="small" type="link" danger style={{ padding: 0, height: 18, fontSize: 11 }}>
                  {t('accounts.warmupRetire')}
                </Button>
              </Popconfirm>
            </div>
            {missedWarn && (
              <Tooltip title={t('accounts.warmupMissedHint')}>
                <Tag color="red" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '14px' }}>
                  <WarningOutlined /> {t('accounts.warmupMissedWarning', { count: p.missedToday })}
                </Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: t('accounts.colRemarks'),
      dataIndex: 'remarks',
      key: 'remarks',
      render: (text: string) => text || '-',
    },
    {
      title: t('accounts.colCreatedAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('accounts.colAction'),
      key: 'action',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={4}>
          {/* Login / Logout button */}
          {record.loginStatus === true || record.status === 'active' ? (
            <Tooltip title={t('accounts.logoutTooltip')}>
              <Button
                size="small"
                danger
                icon={<LogoutOutlined />}
                onClick={() => handleLogout(record)}
              >
                {t('accounts.logout')}
              </Button>
            </Tooltip>
          ) : (
            <Tooltip title={t('accounts.loginTooltip')}>
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
            </Tooltip>
          )}
          <Tooltip title={t('accounts.editTooltip')}>
            <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Tooltip title={t('accounts.syncTooltip')}>
            <Button
              size="small"
              type="text"
              icon={<SyncOutlined spin={syncingId === record.id} />}
              onClick={() => handleSync(record.id)}
              loading={syncingId === record.id}
            />
          </Tooltip>
          <Popconfirm
            title={t('accounts.factoryResetTitle', { num: record.accountNumber ?? '?' })}
            description={
              <div style={{ maxWidth: 360 }}>
                <Alert
                  type="error"
                  showIcon
                  message={t('accounts.factoryResetWarning')}
                  style={{ marginBottom: 8 }}
                />
                <ul style={{ paddingLeft: 18, margin: '6px 0' }}>
                  <li>{t('accounts.factoryResetItem1')}</li>
                  <li>{t('accounts.factoryResetItem2')}</li>
                  <li>{t('accounts.factoryResetItem3')}</li>
                  <li>{t('accounts.factoryResetItem4')}</li>
                  <li>{t('accounts.factoryResetItem5')}</li>
                </ul>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('accounts.factoryResetRecycled', { num: record.accountNumber ?? '?' })}
                </Text>
              </div>
            }
            onConfirm={async () => {
              try {
                const res = await accountsService.factoryReset(record.id);
                message.success(
                  t('accounts.factoryResetSuccess', {
                    num: res.recycledNumber ?? record.accountNumber ?? '?',
                    profile: res.profileDeleted ? '✓' : '-',
                    tasks: res.tasksDeleted,
                  }),
                  4,
                );
                fetchAccounts();
                fetchStats();
                fetchGroupData();
                fetchWarmupList();
              } catch {
                message.error(t('accounts.factoryResetFailed'));
              }
            }}
            okText={t('accounts.factoryReset')}
            okButtonProps={{ danger: true, icon: <FireOutlined /> }}
            cancelText={t('common.cancel')}
            icon={<FireOutlined style={{ color: '#fa541c' }} />}
          >
            <Tooltip title={t('accounts.factoryResetTooltip')}>
              <Button
                size="small"
                type="text"
                style={{ color: '#fa541c' }}
                icon={<FireOutlined />}
              >
                {t('accounts.factoryReset')}
              </Button>
            </Tooltip>
          </Popconfirm>
          <Popconfirm
            title={t('accounts.deleteConfirm')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Tooltip title={t('accounts.deleteTooltip')}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2} style={{ margin: 0 }}>{t('accounts.title')}</Title>
        <Space>
          <Button
            icon={<SettingOutlined />}
            onClick={() => {
              setPendingGroupCount(groupCount);
              setSettingsVisible(true);
            }}
          >
            {t('accounts.groupSettings')}
          </Button>
          {/* v1.3.1 —— 加群设置按钮已移除，加群配置改在任务调度页的任务创建表单内逐任务设置 */}
          <Button
            icon={<TeamOutlined />}
            disabled={selectedAccountIds.length === 0}
            onClick={() => setBatchAssignVisible(true)}
          >
            {t('accounts.batchAssignGroup')}
            {selectedAccountIds.length > 0 && ` (${selectedAccountIds.length})`}
          </Button>
          <Button
            type="default"
            icon={<GlobalOutlined />}
            onClick={() => {
              if (vpnOptions.length === 0) {
                message.warning(t('accounts.registerAccountNoVpn'));
                return;
              }
              setRegistrationModalVisible(true);
            }}
          >
            {t('accounts.registerAccount')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            {t('accounts.addAccount')}
          </Button>
        </Space>
      </div>

      {/* 分组概览 card —— 每组账号数 + 未分组数 */}
      {groupStats && (
        <Card size="small" style={{ marginBottom: 16 }} title={
          <Space>
            <TeamOutlined style={{ color: '#1890ff' }} />
            <span>{t('accounts.groupOverview')}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({groupCount} {t('accounts.groupCountLabel')})
            </Text>
          </Space>
        }>
          <Space wrap>
            {groupStats.groups.map(g => {
              const outOfRange = g.group > groupCount;
              return (
                <Tag
                  key={g.group}
                  color={outOfRange ? 'red' : getGroupColor(g.group)}
                  style={{ fontSize: 13, padding: '4px 10px' }}
                >
                  {formatGroupLabel(g.group)}
                  {outOfRange && ` (${t('accounts.groupOutOfRange')})`}
                  <Text strong style={{ marginLeft: 6 }}>{g.count}</Text>
                </Tag>
              );
            })}
            {groupStats.unassigned > 0 && (
              <Tag color="default" style={{ fontSize: 13, padding: '4px 10px' }}>
                {t('accounts.groupOverviewUnassigned', { count: groupStats.unassigned })}
              </Tag>
            )}
          </Space>
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card loading={statsLoading}>
            <Statistic
              title={t('accounts.quotaTitle', { plan: ((stats as any)?.plan || 'basic').toUpperCase() })}
              value={stats?.totalAccounts ?? total}
              suffix={`/ ${(stats as any)?.maxAccounts ?? '?'}`}
              prefix={<UserOutlined />}
              valueStyle={{
                color: (stats?.totalAccounts ?? 0) >= ((stats as any)?.maxAccounts ?? 10)
                  ? '#f5222d'
                  : (stats?.totalAccounts ?? 0) >= ((stats as any)?.maxAccounts ?? 10) * 0.8
                    ? '#faad14'
                    : '#1890ff',
              }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={statsLoading}>
            <Statistic title={t('accounts.loggedIn')} value={accounts.filter(a => (a as any).loginStatus === true || a.status === 'active').length} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={statsLoading}>
            <Statistic title={t('accounts.pageAccounts')} value={stats?.pageAccounts ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card loading={statsLoading}>
            <Statistic title={t('accounts.businessAccounts')} value={stats?.businessAccounts ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Table
          columns={columns}
          dataSource={accounts}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          rowSelection={{
            selectedRowKeys: selectedAccountIds,
            onChange: (keys) => setSelectedAccountIds(keys as string[]),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showTotal: (total) => t('common.total', { count: total }),
          }}
        />
      </Card>

      {/* 批量分组 Modal */}
      <Modal
        title={<Space><TeamOutlined /> {t('accounts.batchAssignTitle')}</Space>}
        open={batchAssignVisible}
        onCancel={() => setBatchAssignVisible(false)}
        footer={null}
        width={480}
      >
        <Alert
          type="info"
          showIcon
          message={t('accounts.batchAssignDesc', { count: selectedAccountIds.length })}
          style={{ marginBottom: 16 }}
        />
        <Space wrap>
          {Array.from({ length: groupCount }, (_, i) => i + 1).map(g => (
            <Button
              key={g}
              size="large"
              onClick={async () => {
                try {
                  const res = await accountsService.batchAssignGroup(selectedAccountIds, g);
                  message.success(t('accounts.batchAssignSuccess', { count: res.updated }));
                  setBatchAssignVisible(false);
                  setSelectedAccountIds([]);
                  fetchAccounts();
                  fetchGroupData();
                } catch {
                  message.error(t('accounts.operationFailed'));
                }
              }}
            >
              <Tag color={getGroupColor(g)} style={{ margin: 0 }}>{formatGroupLabel(g)}</Tag>
            </Button>
          ))}
          <Button
            size="large"
            danger
            onClick={async () => {
              try {
                const res = await accountsService.batchAssignGroup(selectedAccountIds, null);
                message.success(t('accounts.batchAssignSuccess', { count: res.updated }));
                setBatchAssignVisible(false);
                setSelectedAccountIds([]);
                fetchAccounts();
                fetchGroupData();
              } catch {
                message.error(t('accounts.operationFailed'));
              }
            }}
          >
            {t('accounts.removeFromGroup')}
          </Button>
        </Space>
      </Modal>

      {/* 分组设置 Modal */}
      <Modal
        title={<Space><SettingOutlined /> {t('accounts.groupSettingsTitle')}</Space>}
        open={settingsVisible}
        onCancel={() => setSettingsVisible(false)}
        onOk={async () => {
          try {
            await accountsService.updateWarmupSettings({ groupCount: pendingGroupCount });
            setGroupCount(pendingGroupCount);
            setSettingsVisible(false);
            message.success(t('accounts.updateSuccess'));
            fetchGroupData();
          } catch {
            message.error(t('accounts.operationFailed'));
          }
        }}
        width={520}
      >
        <Alert
          type="info"
          showIcon
          message={t('accounts.groupCountHelp')}
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical">
          <Form.Item label={t('accounts.groupCountLabel')}>
            <Select
              value={pendingGroupCount}
              onChange={setPendingGroupCount}
              size="large"
            >
              {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <Option key={n} value={n}>{n} {t('accounts.groupCountLabel')}</Option>
              ))}
            </Select>
          </Form.Item>
          {pendingGroupCount < groupCount && (
            <Alert
              type="warning"
              showIcon
              message={t('accounts.groupCountWarn', { max: groupCount, newMax: pendingGroupCount })}
            />
          )}
        </Form>
      </Modal>

      {/* v1.3.1 —— 加群设置 Modal 已移除，相关配置已拆到任务创建表单 per-task */}
      {false && (
      <Modal
        title={<Space><TeamOutlined /> {t('warmup.groupJoin.title')}</Space>}
        open={groupJoinVisible}
        onCancel={() => setGroupJoinVisible(false)}
        onOk={async () => {
          if (!groupJoinSettings.keywords || groupJoinSettings.keywords.length === 0) {
            message.warning(t('warmup.groupJoin.needKeywords'));
            return;
          }
          // 开启 AI 必须先有 key
          if (groupJoinSettings.aiAnswerEnabled
              && !groupJoinSettings.aiApiKeyConfigured
              && (!groupJoinSettings.aiApiKey || groupJoinSettings.aiApiKey.includes('…'))) {
            message.warning(t('warmup.groupJoin.needApiKey'));
            return;
          }
          try {
            // 如果 aiApiKey 是遮罩形式（服务器回传的），不要传回去 —— 留空意味着保留旧值
            const payload: GroupJoinSettings = {
              ...groupJoinSettings,
              aiApiKey: groupJoinSettings.aiApiKey?.includes('…') ? '' : groupJoinSettings.aiApiKey,
            };
            const saved = await accountsService.updateGroupJoinSettings(payload);
            setGroupJoinSettings(saved);
            message.success(t('warmup.groupJoin.saveSuccess'));
            setGroupJoinVisible(false);
          } catch {
            message.error(t('accounts.operationFailed'));
          }
        }}
        width={640}
        okText={t('warmup.groupJoin.save')}
      >
        <Alert
          type="info"
          showIcon
          message={t('warmup.groupJoin.subtitle')}
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical">
          <Form.Item
            label={t('warmup.groupJoin.keywords')}
            help={t('warmup.groupJoin.keywordsHelp')}
          >
            <Select
              mode="tags"
              style={{ width: '100%' }}
              placeholder={t('warmup.groupJoin.keywordsPlaceholder')}
              value={groupJoinSettings.keywords}
              onChange={(vals) => setGroupJoinSettings(p => ({ ...p, keywords: vals as string[] }))}
              tokenSeparators={[',', '，', ';', '；']}
              maxTagCount={20}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label={t('warmup.groupJoin.dailyLimit')}
                help={t('warmup.groupJoin.dailyLimitHelp')}
              >
                <Select
                  value={groupJoinSettings.dailyLimit}
                  onChange={(v) => setGroupJoinSettings(p => ({ ...p, dailyLimit: v }))}
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map(n => (
                    <Option key={n} value={n}>{n}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('warmup.groupJoin.strategy')}>
                <Select
                  value={groupJoinSettings.strategy}
                  onChange={(v) => setGroupJoinSettings(p => ({ ...p, strategy: v as any }))}
                >
                  <Option value="random">{t('warmup.groupJoin.strategyRandom')}</Option>
                  <Option value="sequential">{t('warmup.groupJoin.strategySequential')}</Option>
                  <Option value="weighted">{t('warmup.groupJoin.strategyWeighted')}</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Alert
            type="success"
            showIcon
            message={t('warmup.groupJoin.defaultModeLabel')}
            style={{ marginBottom: 12 }}
          />

          {/* AI 高级设置 —— 可折叠区 */}
          <Card
            size="small"
            title={<Space><SettingOutlined /> {t('warmup.groupJoin.aiAdvancedTitle')}</Space>}
            style={{ marginBottom: 12, background: '#fafafa' }}
          >
            <Form.Item
              label={t('warmup.groupJoin.aiAnswerEnabled')}
              help={t('warmup.groupJoin.aiAnswerEnabledHelp')}
            >
              <Select
                value={groupJoinSettings.aiAnswerEnabled ? 'on' : 'off'}
                onChange={(v) => setGroupJoinSettings(p => ({ ...p, aiAnswerEnabled: v === 'on' }))}
              >
                <Option value="off">{t('warmup.groupJoin.aiModeOff')}</Option>
                <Option value="on">{t('warmup.groupJoin.aiModeOn')}</Option>
              </Select>
            </Form.Item>

            {groupJoinSettings.aiAnswerEnabled && (
              <>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Item label={t('warmup.groupJoin.aiProvider')}>
                      <Select
                        value={groupJoinSettings.aiProvider ?? 'claude'}
                        onChange={(v) => setGroupJoinSettings(p => ({ ...p, aiProvider: v as any }))}
                      >
                        {AI_PROVIDERS.map(p => (
                          <Option key={p.value} value={p.value}>
                            <Space>
                              <Text strong>{p.label}</Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>— {p.model}</Text>
                              <Tag color={p.value === 'deepseek' ? 'green' : 'blue'}>{p.costHint}</Tag>
                            </Space>
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  label={t('warmup.groupJoin.aiApiKey')}
                  help={
                    <Space direction="vertical" size={2}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('warmup.groupJoin.aiKeyHint', {
                          hint: AI_PROVIDERS.find(p => p.value === groupJoinSettings.aiProvider)?.keyHint || 'sk-...',
                        })}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('warmup.groupJoin.aiKeyPrivacy')}
                      </Text>
                    </Space>
                  }
                >
                  <Input.Password
                    value={groupJoinSettings.aiApiKey || ''}
                    placeholder={
                      groupJoinSettings.aiApiKeyConfigured
                        ? t('warmup.groupJoin.aiApiKeyConfigured', { masked: groupJoinSettings.aiApiKey || '***' })
                        : t('warmup.groupJoin.aiApiKeyPlaceholder')
                    }
                    onChange={(e) => setGroupJoinSettings(p => ({ ...p, aiApiKey: e.target.value }))}
                    addonAfter={
                      groupJoinSettings.aiApiKeyConfigured ? (
                        <Button
                          type="link"
                          size="small"
                          danger
                          onClick={() => setGroupJoinSettings(p => ({ ...p, aiApiKey: '__CLEAR__' }))}
                        >
                          {t('warmup.groupJoin.aiApiKeyClearBtn')}
                        </Button>
                      ) : undefined
                    }
                  />
                </Form.Item>

                {!groupJoinSettings.aiApiKeyConfigured && (!groupJoinSettings.aiApiKey || groupJoinSettings.aiApiKey.includes('…')) && (
                  <Alert
                    type="warning"
                    showIcon
                    message={t('warmup.groupJoin.aiApiKeyMissing')}
                    style={{ marginTop: -8, marginBottom: 12 }}
                  />
                )}

                <Form.Item label={t('warmup.groupJoin.aiAnswerPrompt')}>
                  <Input.TextArea
                    rows={3}
                    value={groupJoinSettings.aiAnswerPrompt}
                    onChange={(e) => setGroupJoinSettings(p => ({ ...p, aiAnswerPrompt: e.target.value }))}
                    placeholder={t('warmup.groupJoin.aiAnswerPromptPlaceholder')}
                    maxLength={500}
                    showCount
                  />
                </Form.Item>
              </>
            )}
          </Card>

          {groupJoinSettings.keywords.length === 0 && (
            <Alert
              type="warning"
              showIcon
              message={t('warmup.groupJoin.emptyKeywordsWarn')}
              style={{ marginTop: 8 }}
            />
          )}
        </Form>
      </Modal>
      )}

      {/* Login result modal */}
      <Modal
        title={<Space><CloseCircleOutlined style={{ color: 'red' }} /> {t('accounts.loginFailedTitle')}</Space>}
        open={loginResultModal.visible}
        onOk={() => setLoginResultModal(p => ({ ...p, visible: false }))}
        onCancel={() => setLoginResultModal(p => ({ ...p, visible: false }))}
        okText={t('accounts.loginFailedKnowIt')}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <Alert
          type={loginResultModal.requiresManual ? 'warning' : 'error'}
          message={loginResultModal.message}
          description={
            loginResultModal.requiresManual
              ? t('accounts.loginFailedManualDesc')
              : t('accounts.loginFailedCheckDesc')
          }
          showIcon
        />
      </Modal>

      {/* Add / Edit modal */}
      <Modal
        title={editingAccount ? t('accounts.editModalTitle') : t('accounts.addModalTitle')}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => { setIsModalVisible(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText={editingAccount ? t('accounts.saveButton') : t('accounts.addButton')}
        cancelText={t('accounts.cancelButton')}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label={t('accounts.accountDisplayName')} rules={[{ required: true, message: t('accounts.nameRequired') }]}>
            <Input prefix={<UserOutlined />} placeholder={t('accounts.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="email" label={t('accounts.email')} rules={[{ required: true, message: t('accounts.emailPlaceholder') }]}>
            <Input prefix={<MailOutlined />} placeholder={t('accounts.emailPlaceholder')} autoComplete="off" />
          </Form.Item>
          {!editingAccount && (
            <Form.Item name="facebookPassword" label={t('accounts.password')} rules={[{ required: true, message: t('accounts.password') }]}>
              {/* autoComplete="new-password" 阻止浏览器密码管家把其他网站保存的密码填进来 */}
              <Input.Password prefix={<LockOutlined />} placeholder={t('accounts.passwordPlaceholder')} autoComplete="new-password" />
            </Form.Item>
          )}
          {editingAccount && (
            <Form.Item name="facebookPassword" label={t('accounts.newPassword')}>
              <Input.Password prefix={<LockOutlined />} placeholder={t('accounts.newPasswordPlaceholder')} autoComplete="new-password" />
            </Form.Item>
          )}
          <Form.Item name="accountType" label={t('accounts.accountType')} initialValue="user">
            <Select>
              <Option value="user">{t('accounts.accountType_user')}</Option>
              <Option value="page">{t('accounts.accountType_page')}</Option>
              <Option value="business">{t('accounts.accountType_business')}</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="vpnConfigId"
            label={<Space><GlobalOutlined /><span>{t('accounts.vpnConfigLabel')}</span></Space>}
            help={
              <span style={{ fontSize: 12, color: '#888' }}>
                {t('accounts.vpnHelpText')}
                {defaultVPN
                  ? t('accounts.vpnHelpCurrentDefault', { name: defaultVPN.name })
                  : t('accounts.vpnHelpNoDefault')}
              </span>
            }
          >
            <Select
              allowClear
              placeholder={defaultVPN ? t('accounts.defaultVpn', { name: defaultVPN.name }) : t('accounts.vpnPlaceholder')}
            >
              {vpnOptions.map(vpn => (
                <Option key={vpn.id} value={vpn.id}>
                  <Space>
                    <GlobalOutlined style={{ color: vpn.status === 'active' ? '#52c41a' : '#aaa' }} />
                    {vpn.name}
                    {vpn.country && <Tag style={{ marginLeft: 4 }}>{vpn.country}</Tag>}
                    {vpn.isDefault && <Tag color="cyan">{t('accounts.vpnDefaultOption')}</Tag>}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="messengerPin"
            label={t('accounts.messengerPin')}
            tooltip={t('accounts.messengerPinTooltip')}
          >
            <Input.Password
              placeholder={t('accounts.messengerPinPlaceholder')}
              maxLength={6}
            />
          </Form.Item>

          <Form.Item name="remarks" label={t('common.remarks')}>
            <Input.TextArea rows={2} placeholder={t('accounts.remarksPlaceholder')} />
          </Form.Item>

          <Alert
            style={{ marginBottom: 8 }}
            type="info"
            showIcon
            message={<span style={{ fontSize: 12 }}>{t('accounts.vpnNote')}</span>}
          />

          <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#389e0d' }}>
            <SafetyOutlined /> {t('accounts.passwordSecurity')}
          </div>
        </Form>
      </Modal>

      {/* Registration modal (VPN 代理下半自动注册新账号) */}
      <RegistrationModal
        open={registrationModalVisible}
        onClose={() => setRegistrationModalVisible(false)}
        onSuccess={() => {
          fetchAccounts();
          fetchStats();
        }}
        vpnOptions={vpnOptions}
      />
    </AppLayout>
  );
};

export default AccountsPage;
