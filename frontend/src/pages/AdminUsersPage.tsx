import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, Modal, Form, Input,
  Select, message, Row, Col, Statistic, Popconfirm, Divider, Badge, Alert, DatePicker,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, UserOutlined,
  TeamOutlined, CheckCircleOutlined, StopOutlined, CrownOutlined,
  ReloadOutlined, LockOutlined, CalendarOutlined, WarningOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AppLayout from '../components/AppLayout';
import api from '../services/api';
import { useT } from '../i18n';

const { Title, Text } = Typography;
const { Option } = Select;

interface TenantUser {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  role: 'admin' | 'tenant';
  plan: 'basic' | 'pro' | 'admin';
  maxAccounts: number;
  subscriptionExpiry?: string | null;
  status: 'active' | 'suspended';
  createdAt: string;
  emailVerified: boolean;
}

/** 计算距今天数（负数 = 已到期） */
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return dayjs(dateStr).startOf('day').diff(dayjs().startOf('day'), 'day');
}

const AdminUsersPage: React.FC = () => {
  const t = useT();

  const ExpiryTag: React.FC<{ expiry?: string | null }> = ({ expiry }) => {
    const days = daysUntil(expiry);
    if (days === null) return <Text type="secondary">-</Text>;
    if (days < 0) return <Tag color="red">{t('admin.expired')}</Tag>;
    if (days === 0) return <Tag color="red">{t('admin.expiresToday')}</Tag>;
    if (days <= 7) return <Tag color="orange">{t('admin.expiresInDays', { days })}</Tag>;
    return <Tag color="green" icon={<CalendarOutlined />}>{dayjs(expiry).format('YYYY-MM-DD')}</Tag>;
  };

  const [users, setUsers] = useState<TenantUser[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, activeUsers: 0, adminCount: 0, tenantCount: 0 });
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<TenantUser | null>(null);
  const [form] = Form.useForm();

  const expiringCount = useMemo(() => {
    return users.filter(u => {
      if (u.role !== 'tenant') return false;
      const d = daysUntil(u.subscriptionExpiry);
      return d !== null && d <= 7;
    }).length;
  }, [users]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        api.get('/admin/users?limit=100'),
        api.get('/admin/users/stats/overview'),
      ]);
      const data = usersRes.data?.data || usersRes.data;
      setUsers(data?.users || []);
      const s = statsRes.data?.data || statsRes.data;
      setStats(s || {});
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('admin.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); /* eslint-disable-next-line */ }, []);

  const openCreate = () => {
    setEditUser(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (user: TenantUser) => {
    setEditUser(user);
    form.setFieldsValue({
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      subscriptionExpiry: user.subscriptionExpiry ? dayjs(user.subscriptionExpiry) : null,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (values.subscriptionExpiry) {
      values.subscriptionExpiry = (values.subscriptionExpiry as any).toISOString();
    } else {
      values.subscriptionExpiry = null;
    }
    try {
      if (editUser) {
        await api.patch(`/admin/users/${editUser.id}`, values);
        message.success(t('admin.userUpdated'));
        setModalOpen(false);
      } else {
        const res = await api.post('/admin/users', values);
        const data = res.data?.data || res.data;
        const generatedKey = data?.licenseKey;

        setModalOpen(false);

        if (generatedKey) {
          Modal.success({
            title: t('admin.licenseGeneratedTitle'),
            width: 500,
            content: (
              <div style={{ marginTop: 16 }}>
                <Alert
                  type="success"
                  message={t('admin.licenseGeneratedAlert')}
                  description={t('admin.licenseGeneratedDesc')}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <div style={{
                  background: '#f6f8fa', border: '2px dashed #1677ff',
                  borderRadius: 8, padding: '16px 20px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{t('admin.licenseKeyLabel')}</div>
                  <div style={{
                    fontSize: 22, fontFamily: 'monospace', fontWeight: 700,
                    color: '#1677ff', letterSpacing: 2, userSelect: 'all',
                  }}>
                    {generatedKey}
                  </div>
                </div>
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    navigator.clipboard.writeText(generatedKey);
                    message.success(t('admin.copied'));
                  }}
                >
                  {t('admin.copyLicense')}
                </Button>
                <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
                  {t('admin.tenantInfo', {
                    email: data?.email,
                    plan: (data?.plan || 'basic').toUpperCase(),
                    max: data?.maxAccounts || 10,
                  })}
                </div>
              </div>
            ),
            okText: t('admin.licenseAcknowledge'),
          });
        } else {
          message.success(t('admin.createdVpsNoLicense'));
        }
      }
      fetchUsers();
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('admin.operationFailed'));
    }
  };

  const toggleStatus = async (user: TenantUser) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      await api.patch(`/admin/users/${user.id}`, { status: newStatus });
      message.success(newStatus === 'active' ? t('admin.userEnabled') : t('admin.userDisabled'));
      fetchUsers();
    } catch {
      message.error(t('admin.operationFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/users/${id}`);
      message.success(t('admin.userDeleted'));
      fetchUsers();
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('admin.deleteFailed'));
    }
  };

  const columns = [
    {
      title: t('admin.colUser'),
      key: 'user',
      render: (_: any, r: TenantUser) => (
        <Space>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: r.role === 'admin' ? '#722ed1' : '#1677ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15,
          }}>
            {r.role === 'admin' ? <CrownOutlined /> : <UserOutlined />}
          </div>
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>{r.fullName || r.username}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.email}</Text>
          </Space>
        </Space>
      ),
    },
    {
      title: t('admin.colRole'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'purple' : 'blue'} icon={role === 'admin' ? <CrownOutlined /> : <UserOutlined />}>
          {role === 'admin' ? t('admin.roleAdmin') : t('admin.roleTenant')}
        </Tag>
      ),
    },
    {
      title: t('admin.colStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge
          status={status === 'active' ? 'success' : 'error'}
          text={status === 'active' ? t('admin.statusActive') : t('admin.statusSuspended')}
        />
      ),
    },
    {
      title: t('admin.colPlan'),
      key: 'plan',
      render: (_: any, r: TenantUser) => {
        if (r.role === 'admin') return <Tag color="purple">{t('admin.planUnlimited')}</Tag>;
        const map: Record<string, { color: string; key: string }> = {
          enterprise: { color: 'blue', key: 'admin.planEnterprise' },
          pro:        { color: 'gold', key: 'admin.planPro' },
          basic:      { color: 'default', key: 'admin.planBasic' },
        };
        const p = map[r.plan] || map.basic;
        return <Tag color={p.color}>{t(p.key)}</Tag>;
      },
    },
    {
      title: t('admin.colExpiry'),
      key: 'subscriptionExpiry',
      render: (_: any, r: TenantUser) =>
        r.role === 'admin' ? <Text type="secondary">-</Text> : <ExpiryTag expiry={r.subscriptionExpiry} />,
    },
    {
      title: t('admin.colCreatedAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(d).format('YYYY-MM-DD HH:mm')}</Text>,
    },
    {
      title: t('admin.colActions'),
      key: 'actions',
      render: (_: any, r: TenantUser) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>{t('admin.editButton')}</Button>
          <Button
            size="small"
            icon={r.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />}
            style={{ color: r.status === 'active' ? '#faad14' : '#52c41a' }}
            onClick={() => toggleStatus(r)}
          >
            {r.status === 'active' ? t('admin.disableButton') : t('admin.enableButton')}
          </Button>
          <Popconfirm title={t('admin.deleteConfirm')} onConfirm={() => handleDelete(r.id)} okText={t('admin.deleteOk')} cancelText={t('admin.deleteCancel')}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>{t('admin.usersTitle')}</Title>
            <Text type="secondary">{t('admin.usersSubtitle')}</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={fetchUsers}>{t('admin.refresh')}</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} size="large">
                {t('admin.createTenant')}
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {expiringCount > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message={t('admin.expiryWarning', { count: expiringCount })}
          style={{ marginBottom: 20, borderRadius: 8 }}
          closable
        />
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          { title: t('admin.statTotalUsers'), value: stats.totalUsers, color: '#1890ff', icon: <TeamOutlined /> },
          { title: t('admin.statActiveUsers'), value: stats.activeUsers, color: '#52c41a', icon: <CheckCircleOutlined /> },
          { title: t('admin.statAdmin'), value: stats.adminCount, color: '#722ed1', icon: <CrownOutlined /> },
          { title: t('admin.statTenant'), value: stats.tenantCount, color: '#1677ff', icon: <UserOutlined /> },
        ].map(s => (
          <Col key={s.title as string} xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic title={s.title} value={s.value} valueStyle={{ color: s.color }} prefix={s.icon} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (total) => t('admin.totalUsersSuffix', { count: total }) }}
          rowClassName={(r: TenantUser) => {
            const d = daysUntil(r.subscriptionExpiry);
            if (d !== null && d < 0) return 'row-expired';
            if (d !== null && d <= 7) return 'row-expiring';
            return '';
          }}
        />
      </Card>

      <style>{`
        .row-expired td { background: #fff2f0 !important; }
        .row-expiring td { background: #fffbe6 !important; }
      `}</style>

      <Modal
        title={<Space>{editUser ? <EditOutlined /> : <PlusOutlined />} {editUser ? t('admin.editUser') : t('admin.createNewTenant')}</Space>}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText={editUser ? t('admin.saveButton') : t('admin.createButton')}
        cancelText={t('admin.cancelButton')}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          {!editUser && (
            <>
              <Form.Item name="email" label={t('admin.emailLabel')} rules={[{ required: true, type: 'email', message: t('admin.emailRequired') }]}>
                <Input prefix={<UserOutlined />} placeholder={t('admin.emailPlaceholder')} />
              </Form.Item>
              <Form.Item name="username" label={t('admin.usernameLabel')} rules={[{ required: true, message: t('admin.usernameRequired') }]}>
                <Input placeholder={t('admin.usernamePlaceholder')} />
              </Form.Item>
              <Form.Item name="password" label={t('admin.passwordLabel')} rules={[{ required: true, min: 6, message: t('admin.passwordMinError') }]}>
                <Input.Password prefix={<LockOutlined />} placeholder={t('admin.passwordPlaceholder')} />
              </Form.Item>
            </>
          )}
          <Form.Item name="fullName" label={t('admin.fullNameLabel')}>
            <Input placeholder={t('admin.fullNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="role" label={t('admin.roleLabel')} initialValue="tenant">
            <Select>
              <Option value="tenant"><UserOutlined /> {t('admin.roleTenantOption')}</Option>
              <Option value="admin"><CrownOutlined /> {t('admin.roleAdminOption')}</Option>
            </Select>
          </Form.Item>
          {!editUser && (
            <Form.Item name="plan" label={t('admin.planLabel')} initialValue="basic">
              <Select>
                <Option value="basic">{t('admin.planBasicOption')}</Option>
                <Option value="pro">{t('admin.planProOption')}</Option>
                <Option value="enterprise">{t('admin.planEnterpriseOption')}</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item
            name="subscriptionExpiry"
            label={t('admin.expiryLabel')}
            extra={t('admin.expiryExtra')}
          >
            <DatePicker
              style={{ width: '100%' }}
              placeholder={t('admin.expiryPlaceholder')}
              format="YYYY-MM-DD"
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>

          {editUser && (
            <>
              <Divider>{t('admin.changePasswordDivider')}</Divider>
              <Form.Item name="password" label={t('admin.newPasswordLabel')}>
                <Input.Password prefix={<LockOutlined />} placeholder={t('admin.newPasswordPlaceholder')} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </AppLayout>
  );
};

export default AdminUsersPage;
