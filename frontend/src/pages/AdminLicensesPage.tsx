// FAhubX 2.0 KEEP: AdminLicensesPage manages Cloudflare License Server entries.
// This IS the 2.0 admin tool — the admin uses it to issue, revoke, and manage
// customer license keys (machine binding, plan, expiry). Do NOT remove.
// Note: tenant_name/email/username fields reflect license metadata, not SaaS tenants.
import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, DatePicker, Select, Tag, Space,
  Typography, message, Card, Row, Col, Statistic, Popconfirm, Tooltip, Alert,
} from 'antd';
import {
  ReloadOutlined, DisconnectOutlined, EditOutlined, DeleteOutlined,
  KeyOutlined, DesktopOutlined, WarningOutlined, PlusOutlined, CopyOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AppLayout from '../components/AppLayout';
import api from '../services/api';
import { useT } from '../i18n';

const { Title, Text, Paragraph } = Typography;

interface License {
  id: string;
  license_key: string;
  tenant_name: string;
  tenant_email: string | null;
  tenant_username: string | null;
  plan: string;
  max_accounts: number;
  max_tasks: number;
  max_scripts: number;
  machine_id: string | null;
  expires_at: string | null;
  subscription_expiry: string | null;
  active: number;
  last_heartbeat: string | null;
  last_ip: string | null;
  current_accounts: number;
  current_tasks: number;
  created_at: string;
  notes: string | null;
}

interface Dashboard {
  totalLicenses: number;
  activeLicenses: number;
  expiredLicenses: number;
  onlineNow: number;
}

const PLAN_DEFAULTS: Record<string, { max_accounts: number; max_tasks: number; max_scripts: number }> = {
  basic:      { max_accounts: 10,  max_tasks: 50,  max_scripts: 10 },
  pro:        { max_accounts: 30,  max_tasks: 200, max_scripts: 50 },
  enterprise: { max_accounts: 50,  max_tasks: 300, max_scripts: 100 },
};

const AdminLicensesPage: React.FC = () => {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [editing, setEditing] = useState<License | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Create license state
  const [creating, setCreating] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setConfigError(null);
    try {
      const [licRes, statRes] = await Promise.all([
        api.get('/admin/licenses'),
        api.get('/admin/licenses/dashboard'),
      ]);
      setLicenses(licRes.data?.data?.licenses || licRes.data?.licenses || []);
      setDashboard(statRes.data?.data || statRes.data || null);
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message || 'Unknown error';
      // 503 = LICENSE_ADMIN_KEY not configured; show friendly in-page alert
      if (status === 503 || (msg && msg.includes('LICENSE_ADMIN_KEY'))) {
        setConfigError(
          'License Server admin key is not configured. ' +
          'Add LICENSE_ADMIN_KEY=<your-admin-api-key> to backend/.env and restart the backend. ' +
          'You can find the admin key in your Cloudflare License Server settings.'
        );
      } else {
        message.error(`${t('adminLicenses.fetchFailed')}: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  const handlePlanChange = (plan: string) => {
    const defaults = PLAN_DEFAULTS[plan];
    if (defaults) createForm.setFieldsValue(defaults);
  };

  const handleCreate = async () => {
    let values: any;
    try { values = await createForm.validateFields(); } catch { return; }
    setCreateLoading(true);
    try {
      // License Server expects camelCase; only maxScripts is accepted as override
      // (maxAccounts and maxTasks are derived from plan by the License Server)
      const payload: any = {
        tenantName: values.tenant_name,
        plan: values.plan,
      };
      if (values.tenant_email)    payload.tenantEmail    = values.tenant_email;
      if (values.tenant_username) payload.tenantUsername = values.tenant_username;
      if (values.max_scripts)     payload.maxScripts     = values.max_scripts;
      if (values.notes)           payload.notes          = values.notes;
      if (values.expires_at) {
        payload.expiresAt          = values.expires_at.toISOString();
        payload.subscriptionExpiry = values.expires_at.toISOString();
      }
      const res = await api.post('/admin/licenses', payload);
      // License Server responds: { success: true, license: { licenseKey, ... } }
      const data = res.data?.data || res.data || {};
      const key = data.license?.licenseKey || data.licenseKey || data.license_key || '';
      setCreating(false);
      createForm.resetFields();
      setCreatedKey(key);
      loadData();
      message.success('License created successfully!');
    } catch (err: any) {
      message.error('Create failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUnbind = async (id: string) => {
    try {
      await api.post(`/admin/licenses/${id}/unbind`);
      message.success(t('adminLicenses.unbindSuccess'));
      loadData();
    } catch (err: any) {
      message.error(`${t('adminLicenses.unbindFailed')}: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/licenses/${id}`);
      message.success(t('adminLicenses.deleteSuccess'));
      loadData();
    } catch (err: any) {
      message.error(`${t('adminLicenses.deleteFailed')}: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleEdit = (license: License) => {
    setEditing(license);
    form.setFieldsValue({
      active: license.active === 1,
      plan: license.plan,
      notes: license.notes,
      subscriptionExpiry: license.subscription_expiry ? dayjs(license.subscription_expiry) : null,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      const values = await form.validateFields();
      const payload: any = {
        active: values.active,
        plan: values.plan,
        notes: values.notes,
        subscriptionExpiry: values.subscriptionExpiry
          ? values.subscriptionExpiry.toISOString() : null,
        expiresAt: values.subscriptionExpiry
          ? values.subscriptionExpiry.toISOString() : null,
      };
      await api.patch(`/admin/licenses/${editing.id}`, payload);
      message.success(t('adminLicenses.updateSuccess'));
      setEditing(null);
      loadData();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(`${t('adminLicenses.updateSuccess')}: ${err.response?.data?.message || err.message}`);
    }
  };

  const columns = [
    {
      title: t('adminLicenses.colKey'),
      dataIndex: 'license_key',
      key: 'license_key',
      width: 220,
      render: (key: string) => (
        <Text code copyable style={{ fontSize: 12 }}>{key}</Text>
      ),
    },
    {
      title: t('adminLicenses.colTenant'),
      key: 'tenant',
      width: 200,
      render: (_: any, r: License) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.tenant_email || r.tenant_name}</div>
          {r.tenant_username && <Text type="secondary" style={{ fontSize: 11 }}>@{r.tenant_username}</Text>}
        </div>
      ),
    },
    {
      title: t('adminLicenses.colPlan'),
      dataIndex: 'plan',
      key: 'plan',
      width: 100,
      render: (plan: string, r: License) => {
        const color = plan === 'admin' ? 'red' : plan === 'enterprise' ? 'blue' : plan === 'pro' ? 'purple' : 'default';
        return <div>
          <Tag color={color}>{plan.toUpperCase()}</Tag>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            {r.max_accounts}/{r.max_tasks}/{r.max_scripts}
          </div>
        </div>;
      },
    },
    {
      title: t('adminLicenses.colMachine'),
      key: 'machine',
      width: 150,
      render: (_: any, r: License) =>
        r.machine_id
          ? <Tooltip title={r.machine_id}><Tag color="green" icon={<DesktopOutlined />}>{t('adminLicenses.machineBound')}</Tag></Tooltip>
          : <Tag>{t('adminLicenses.machineNotBound')}</Tag>,
    },
    {
      title: t('adminLicenses.colStatus'),
      key: 'status',
      width: 90,
      render: (_: any, r: License) => {
        if (!r.active) return <Tag color="red">{t('adminLicenses.statusRevoked')}</Tag>;
        if (r.subscription_expiry && new Date(r.subscription_expiry) < new Date()) {
          return <Tag color="orange">{t('adminLicenses.statusExpired')}</Tag>;
        }
        return <Tag color="green">{t('adminLicenses.statusActive')}</Tag>;
      },
    },
    {
      title: t('adminLicenses.colExpiry'),
      dataIndex: 'subscription_expiry',
      key: 'subscription_expiry',
      width: 110,
      render: (d: string | null) => d ? dayjs(d).format('YYYY-MM-DD') : <Text type="secondary">—</Text>,
    },
    {
      title: t('adminLicenses.colLastHeartbeat'),
      dataIndex: 'last_heartbeat',
      key: 'last_heartbeat',
      width: 140,
      render: (d: string | null) => {
        if (!d) return <Text type="secondary">—</Text>;
        const hours = (Date.now() - new Date(d).getTime()) / 3600000;
        const color = hours < 1 ? '#52c41a' : hours < 24 ? '#faad14' : '#ff4d4f';
        return <Text style={{ fontSize: 11, color }}>{dayjs(d).format('MM-DD HH:mm')}</Text>;
      },
    },
    {
      title: t('adminLicenses.colActions'),
      key: 'action',
      width: 200,
      render: (_: any, r: License) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>{t('common.edit')}</Button>
          <Popconfirm title={t('adminLicenses.unbindConfirm')} onConfirm={() => handleUnbind(r.id)} okText={t('adminLicenses.unbindOk')} cancelText={t('adminLicenses.unbindCancel')}>
            <Button size="small" icon={<DisconnectOutlined />} disabled={!r.machine_id}>{t('adminLicenses.unbindOk')}</Button>
          </Popconfirm>
          <Popconfirm title={t('adminLicenses.deleteConfirm')} onConfirm={() => handleDelete(r.id)} okText={t('admin.deleteOk')} cancelText={t('common.cancel')}>
            <Button size="small" icon={<DeleteOutlined />} danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>{t('adminLicenses.title')}</Title>
            <Paragraph type="secondary">{t('adminLicenses.subtitle')}</Paragraph>
          </div>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => { setCreating(true); createForm.resetFields(); createForm.setFieldsValue({ plan: 'basic', ...PLAN_DEFAULTS.basic }); }}
            >
              创建 License
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>{t('adminLicenses.refresh')}</Button>
          </Space>
        </div>

        {configError && (
          <Alert
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            message="License Server Not Configured"
            description={configError}
            style={{ marginBottom: 24 }}
            action={
              <Button size="small" onClick={loadData} icon={<ReloadOutlined />}>
                Retry
              </Button>
            }
          />
        )}

        {dashboard && (
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card><Statistic title={t('adminLicenses.statTotal')} value={dashboard.totalLicenses} prefix={<KeyOutlined />} /></Card>
            </Col>
            <Col span={6}>
              <Card><Statistic title={t('adminLicenses.statActive')} value={dashboard.activeLicenses} valueStyle={{ color: '#3f8600' }} /></Card>
            </Col>
            <Col span={6}>
              <Card><Statistic title={t('adminLicenses.statExpired')} value={dashboard.expiredLicenses} valueStyle={{ color: '#cf1322' }} /></Card>
            </Col>
            <Col span={6}>
              <Card><Statistic title={t('adminLicenses.statOnline')} value={dashboard.onlineNow} prefix={<DesktopOutlined />} valueStyle={{ color: '#1677ff' }} /></Card>
            </Col>
          </Row>
        )}

        <Card>
          <Table
            dataSource={licenses}
            columns={columns}
            rowKey="id"
            loading={loading}
            size="middle"
            scroll={{ x: 1200 }}
            pagination={{ pageSize: 20, showSizeChanger: true }}
          />
        </Card>

        {/* ── Create License Modal ── */}
        <Modal
          title="创建 License / Create Customer Authorization"
          open={creating}
          onOk={handleCreate}
          onCancel={() => { setCreating(false); createForm.resetFields(); }}
          okText="创建 / Create"
          cancelText={t('common.cancel')}
          confirmLoading={createLoading}
          width={560}
        >
          <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="客户姓名 / Tenant Name" name="tenant_name" rules={[{ required: true, message: 'Please enter tenant name' }]}>
              <Input placeholder="e.g. John Doe" />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item label="邮箱 / Email" name="tenant_email">
                  <Input placeholder="customer@example.com" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="用户名 / Username" name="tenant_username">
                  <Input placeholder="johndoe" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="套餐 / Plan" name="plan" rules={[{ required: true }]}>
              <Select onChange={handlePlanChange}>
                <Select.Option value="basic">Basic — 10 账号 / 50 任务</Select.Option>
                <Select.Option value="pro">Pro — 30 账号 / 200 任务</Select.Option>
                <Select.Option value="enterprise">Enterprise — 50 账号 / 300 任务</Select.Option>
              </Select>
            </Form.Item>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item label="最大账号数" name="max_accounts" rules={[{ required: true }]}>
                  <InputNumber min={1} max={9999} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="最大任务数" name="max_tasks" rules={[{ required: true }]}>
                  <InputNumber min={1} max={9999} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="最大剧本数" name="max_scripts" rules={[{ required: true }]}>
                  <InputNumber min={1} max={9999} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="到期日 / Expiry Date" name="expires_at" extra="Leave blank for no expiry">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="备注 / Notes" name="notes">
              <Input.TextArea rows={2} placeholder="Optional notes for this customer" />
            </Form.Item>
          </Form>
        </Modal>

        {/* ── Created Key Reveal Modal ── */}
        <Modal
          title="✅ License Created — Copy Key for Customer"
          open={!!createdKey}
          onOk={() => setCreatedKey(null)}
          onCancel={() => setCreatedKey(null)}
          okText="Done"
          cancelButtonProps={{ style: { display: 'none' } }}
          width={520}
        >
          <Alert
            type="success"
            message="License key generated. Send this key and the FAhubX 2.0 installer to your customer."
            style={{ marginBottom: 16 }}
          />
          <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '12px 16px', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 16, letterSpacing: 1, fontFamily: 'monospace' }}>
              {createdKey}
            </Text>
          </div>
          <Button
            icon={<CopyOutlined />}
            onClick={() => {
              if (createdKey) {
                navigator.clipboard.writeText(createdKey).then(() => message.success('License key copied!'));
              }
            }}
          >
            Copy License Key
          </Button>
          <div style={{ marginTop: 12, color: '#888', fontSize: 12 }}>
            The key will also appear in the license list table.
          </div>
        </Modal>

        {/* ── Edit License Modal ── */}
        <Modal
          title={t('adminLicenses.editLicense')}
          open={!!editing}
          onOk={handleSave}
          onCancel={() => setEditing(null)}
          okText={t('common.save')}
          cancelText={t('common.cancel')}
        >
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label={t('adminLicenses.colStatus')} name="active" valuePropName="checked">
              <Select>
                <Select.Option value={true}>{t('adminLicenses.statusActive')}</Select.Option>
                <Select.Option value={false}>{t('adminLicenses.statusRevoked')}</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item label={t('adminLicenses.formPlan')} name="plan">
              <Select>
                <Select.Option value="basic">Basic (10)</Select.Option>
                <Select.Option value="pro">Pro (30)</Select.Option>
                <Select.Option value="enterprise">Enterprise (50)</Select.Option>
                <Select.Option value="admin">Admin (∞)</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item label={t('adminLicenses.formExpiry')} name="subscriptionExpiry" extra={t('adminLicenses.neverExpire')}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('adminLicenses.formNote')} name="notes">
              <Input.TextArea rows={2} placeholder={t('adminLicenses.formNotePlaceholder')} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </AppLayout>
  );
};

export default AdminLicensesPage;
