import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  message,
  Row,
  Col,
  Statistic,
  Popconfirm,
  Tabs,
  Alert,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  WifiOutlined,
  DisconnectOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  SyncOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AppLayout from '../components/AppLayout';
import { vpnService, VPNConfig } from '../services/vpn';
import { useT } from '../i18n';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const VPNPage: React.FC = () => {
  const t = useT();
  const [vpns, setVpns] = useState<VPNConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVPN, setEditingVPN] = useState<VPNConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('vpns');
  // const [showMonitor, setShowMonitor] = useState(false); // 暂时注释，未使用

  const configuredCount = vpns.length;
  const activeCount = vpns.filter((v) => v.status === 'connected' || (v as any).status === 'active').length;
  const ipPoolCount = vpns.filter((v) => v.status !== 'error').length;
  

  // const avgLatency = connectedVPNs.length > 0 
  //   ? Math.round(connectedVPNs.reduce((sum, v) => sum + (v.latency || 0), 0) / connectedVPNs.length)
  //   : 0; // 暂时注释，未使用
  // const avgBandwidth = connectedVPNs.length > 0
  //   ? Math.round(connectedVPNs.reduce((sum, v) => sum + (v.bandwidth || 0), 0) / connectedVPNs.length)
  //   : 0; // 暂时注释，未使用

  // const handleAssociationChange = () => {}; // 暂时注释，未使用
  // const handlePolicyChange = () => {}; // 暂时注释，未使用

  useEffect(() => {
    fetchVPNs();
  }, []);

  const fetchVPNs = async () => {
    setLoading(true);
    try {
      const res = await vpnService.getVPNs();
      setVpns(res.data.vpns || []);
    } catch {
      message.error(t('vpn.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddClick = () => {
    setEditingVPN(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditClick = (vpn: VPNConfig) => {
    setEditingVPN(vpn);
    const rec = vpn as any;
    form.setFieldsValue({
      name: rec.name,
      type: rec.type || rec.protocol,
      serverAddress: rec.serverAddress || rec.server,
      port: rec.port,
      username: rec.username,
      password: rec.password,
      country: rec.country,
      city: rec.city,
      ipAddress: rec.ipAddress,
    });
    setModalVisible(true);
  };

  const handleDeleteClick = async (id: string) => {
    try {
      await vpnService.deleteVPN(id);
      message.success(t('vpn.deleteSuccess'));
      fetchVPNs();
    } catch {
      message.error(t('vpn.deleteFailed'));
    }
  };

  const handleConnectClick = async (id: string) => {
    setConnectingId(id);
    try {
      await vpnService.connectVPN(id);
      message.success(t('vpn.connectSuccess'));
      fetchVPNs();
    } catch {
      message.error(t('vpn.connectFailed'));
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnectClick = async (id: string) => {
    try {
      await vpnService.disconnectVPN(id);
      message.success(t('vpn.disconnectSuccess'));
      fetchVPNs();
    } catch {
      message.error(t('vpn.disconnectFailed'));
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingVPN) {
        await vpnService.updateVPN(editingVPN.id, values);
        message.success(t('vpn.updateSuccess'));
      } else {
        await vpnService.createVPN(values);
        message.success(t('vpn.createSuccess'));
      }

      setModalVisible(false);
      fetchVPNs();
    } catch (error) {
      console.error('save failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalCancel = () => {
    setModalVisible(false);
    form.resetFields();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'active': return 'green';
      case 'connecting':
      case 'testing': return 'blue';
      case 'disconnecting': return 'orange';
      case 'disconnected':
      case 'inactive': return 'default';
      case 'error': return 'red';
      default: return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
      case 'active': return t('vpn.statusConnected');
      case 'connecting':
      case 'testing': return t('vpn.statusConnecting');
      case 'disconnecting': return t('vpn.statusDisconnecting');
      case 'disconnected':
      case 'inactive': return t('vpn.statusDisconnected');
      case 'error': return t('vpn.statusError');
      default: return status || t('vpn.statusUnknown');
    }
  };

  const getTypeText = (type: string) => {
    const ty = (type || '').toLowerCase();
    switch (ty) {
      case 'openvpn': return 'OpenVPN';
      case 'wireguard': return 'WireGuard';
      case 'shadowsocks':
      case 'proxy': return 'Shadowsocks/Proxy';
      case 'other': return t('vpn.colTypeOther');
      default: return type || t('vpn.statusUnknown');
    }
  };

  const columns = [
    {
      title: t('vpn.colName'),
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: t('vpn.colType'),
      key: 'type',
      width: 100,
      render: (_: any, record: any) => {
        const ty = record.protocol || record.type || '';
        return <Tag color="blue">{getTypeText(ty)}</Tag>;
      },
    },
    {
      title: t('vpn.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
      ),
    },
    {
      title: t('vpn.colServer'),
      key: 'serverAddress',
      width: 150,
      render: (_: any, record: any) => {
        const address = record.server || record.serverAddress || '';
        return (
          <div>
            <div>{address || '-'}</div>
            {record.country && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.country} {record.city ? `· ${record.city}` : ''}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: t('vpn.colIpAddress'),
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      width: 120,
      render: (ip: string) => (ip ? <Tag color="geekblue">{ip}</Tag> : '-'),
    },
    {
      title: t('vpn.colMetrics'),
      key: 'performance',
      render: (_: any, record: VPNConfig) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          {record.latency && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text type="secondary" style={{ fontSize: 12, width: 40 }}>{t('vpn.colLatency')}</Text>
              <Progress
                percent={Math.min(100, (record.latency || 300) / 3)}
                size="small"
                status={record.latency < 150 ? 'success' : record.latency < 250 ? 'normal' : 'exception'}
                showInfo={false}
                style={{ flex: 1 }}
              />
              <Text style={{ fontSize: 12, width: 40 }}>{record.latency}ms</Text>
            </div>
          )}
          {record.bandwidth && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text type="secondary" style={{ fontSize: 12, width: 40 }}>{t('vpn.colBandwidth')}</Text>
              <Progress
                percent={Math.min(100, (record.bandwidth || 100) / 10)}
                size="small"
                status={record.bandwidth > 50 ? 'success' : record.bandwidth > 20 ? 'normal' : 'exception'}
                showInfo={false}
                style={{ flex: 1 }}
              />
              <Text style={{ fontSize: 12, width: 40 }}>{record.bandwidth}Mbps</Text>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: t('vpn.colLastConnected'),
      dataIndex: 'lastConnectedAt',
      key: 'lastConnectedAt',
      width: 120,
      render: (time: string) => (time ? dayjs(time).format('MM-DD HH:mm') : '-'),
    },
    {
      title: t('common.operating'),
      key: 'actions',
      width: 200,
      render: (_: any, record: VPNConfig) => (
        <Space size="small">
          {(record.status === 'connected' || (record as any).status === 'active') ? (
            <Button
              size="small"
              icon={<DisconnectOutlined />}
              onClick={() => handleDisconnectClick(record.id)}
              danger
            >
              {t('vpn.disconnectButton')}
            </Button>
          ) : (
            <Button
              size="small"
              icon={<WifiOutlined />}
              onClick={() => handleConnectClick(record.id)}
              loading={connectingId === record.id}
              type="primary"
            >
              {t('vpn.connectButton')}
            </Button>
          )}
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={() => handleEditClick(record)}
          >
            {t('vpn.editButton')}
          </Button>
          <Popconfirm
            title={t('vpn.deleteConfirm')}
            onConfirm={() => handleDeleteClick(record.id)}
            okText={t('vpn.deleteOk')}
            cancelText={t('vpn.deleteCancel')}
          >
            <Button icon={<DeleteOutlined />} danger>
              {t('vpn.deleteButton')}
            </Button>
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
            <Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
              {t('vpn.title')}
            </Title>
            <Text type="secondary">{t('vpn.subtitle')}</Text>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddClick} size="large">
              {t('vpn.addVpn')}
            </Button>
          </Col>
        </Row>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title={t('vpn.statConfigTotal')}
              value={configuredCount}
              valueStyle={{ color: '#1890ff' }}
              prefix={<SafetyOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title={t('vpn.statActiveConnections')}
              value={activeCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title={t('vpn.statAvailablePool')}
              value={ipPoolCount}
              valueStyle={{ color: '#722ed1' }}
              prefix={<GlobalOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title={t('vpn.statAvgLatency')}
              value={0}
              suffix="ms"
              valueStyle={{ color: '#faad14' }}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ marginBottom: 24 }}>
        <TabPane tab={<span><WifiOutlined /> {t('vpn.tabList')}</span>} key="vpns">
          <Card>
            <Table
              columns={columns}
              dataSource={vpns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10, showTotal: (total) => t('common.total', { count: total }) }}
              scroll={{ x: 1200 }}
            />
          </Card>
        </TabPane>
        <TabPane tab={<span><SyncOutlined /> {t('vpn.tabRotation')}</span>} key="rotation">
          <Card>
            <Alert
              message={t('vpn.rotationTitle')}
              description={t('vpn.rotationDesc')}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <SyncOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
              <Text type="secondary">{t('vpn.rotationWip')}</Text>
            </div>
          </Card>
        </TabPane>
      </Tabs>

      <Modal
        title={editingVPN ? t('vpn.editModalTitle') : t('vpn.addModalTitle')}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        confirmLoading={submitting}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('vpn.formName')}
            rules={[{ required: true, message: t('vpn.formNameRequired') }]}
          >
            <Input placeholder={t('vpn.formNamePlaceholder')} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type"
                label={t('vpn.formType')}
                rules={[{ required: true, message: t('vpn.formTypeRequired') }]}
              >
                <Select placeholder={t('vpn.formTypePlaceholder')}>
                  <Select.OptGroup label={t('vpn.formTypeRecommended')}>
                    <Select.Option value="SOCKS5">{t('vpn.formTypeSocks5')}</Select.Option>
                    <Select.Option value="HTTP">{t('vpn.formTypeHttp')}</Select.Option>
                  </Select.OptGroup>
                  <Select.OptGroup label={t('vpn.formTypeAdvanced')}>
                    <Select.Option value="OpenVPN">{t('vpn.formTypeOpenvpn')}</Select.Option>
                    <Select.Option value="WireGuard">{t('vpn.formTypeWireguard')}</Select.Option>
                    <Select.Option value="Shadowsocks">{t('vpn.formTypeShadowsocks')}</Select.Option>
                    <Select.Option value="Other">{t('vpn.formTypeOther')}</Select.Option>
                  </Select.OptGroup>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="serverAddress"
                label={t('vpn.formServer')}
                rules={[{ required: true, message: t('vpn.formServerRequired') }]}
              >
                <Input placeholder={t('vpn.formServerPlaceholder')} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="port"
                label={t('vpn.formPort')}
                rules={[{ required: true, message: t('vpn.formPortRequired') }]}
              >
                <Input placeholder={t('vpn.formPortPlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="country"
                label={t('vpn.formCountry')}
              >
                <Input placeholder={t('vpn.formCountryPlaceholder')} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="city"
                label={t('vpn.formCity')}
              >
                <Input placeholder={t('vpn.formCityPlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="username"
                label={t('vpn.formUsername')}
              >
                <Input placeholder={t('vpn.formUsernamePlaceholder')} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="password" label={t('vpn.formPassword')}>
            <Input.Password placeholder={t('vpn.formPasswordPlaceholder')} />
          </Form.Item>

          <Form.Item name="ipAddress" label={t('vpn.formIpAddress')} extra={t('vpn.formIpAddressExtra')}>
            <Input placeholder={t('vpn.formIpAddressPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  );
};

export default VPNPage;