import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, Modal, Form,
  Input, Select, message, Row, Col, Switch, Divider, Alert, Tooltip, Popconfirm,
  Collapse, Tabs,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AppLayout from '../components/AppLayout';
import { AntiDetectionConfig } from '../types/facebook-login';
import { useT } from '../i18n';

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TabPane } = Tabs;

const AntiDetectionPage: React.FC = () => {
  const t = useT();
  const [configs, setConfigs] = useState<AntiDetectionConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AntiDetectionConfig | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // 模拟加载数据
  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      // 模拟数据
      const mockConfigs: AntiDetectionConfig[] = [
        {
          id: '1',
          name: '桌面Chrome配置',
          browserFingerprint: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            screenWidth: 1920,
            screenHeight: 1080,
            colorDepth: 24,
            timezone: 'Asia/Shanghai',
            language: 'zh-CN',
            platform: 'Win32',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            webglVendor: 'Google Inc.',
            webglRenderer: 'ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
            canvasFingerprint: 'canvas-fingerprint',
            audioFingerprint: 'audio-fingerprint',
            fonts: ['Arial', 'Microsoft YaHei', 'SimSun'],
            plugins: ['Chrome PDF Plugin', 'Chrome PDF Viewer'],
          },
          humanBehavior: {
            mouseMovement: {
              enabled: true,
              speedVariation: 0.3,
              pauseProbability: 0.1,
              curveProbability: 0.5,
            },
            keyboardInput: {
              enabled: true,
              typingSpeed: 300,
              errorRate: 0.05,
              backspaceProbability: 0.1,
            },
            scrolling: {
              enabled: true,
              speedVariation: 0.4,
              pauseProbability: 0.2,
              scrollDirectionChanges: true,
            },
            pageInteraction: {
              enabled: true,
              clickRandomness: 0.3,
              hoverProbability: 0.5,
              tabSwitchProbability: 0.1,
            },
          },
          deviceSimulation: {
            deviceType: 'desktop',
            os: 'windows',
            osVersion: '10',
            browser: 'chrome',
            browserVersion: '120.0.0.0',
            viewportWidth: 1920,
            viewportHeight: 1080,
            pixelRatio: 1,
            touchSupport: false,
          },
          enabled: true,
          accounts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      setConfigs(mockConfigs);
    } catch (error) {
      message.error(t('antiDetection.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConfig = async (values: any) => {
    try {
      // 模拟创建
      const newConfig: AntiDetectionConfig = {
        id: Date.now().toString(),
        ...values,
        accounts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setConfigs(prev => [...prev, newConfig]);
      setIsCreateModalVisible(false);
      createForm.resetFields();
      message.success(t('antiDetection.createSuccess'));
    } catch (error) {
      message.error(t('antiDetection.createFailed'));
    }
  };

  const handleEditConfig = async (values: any) => {
    if (!editingConfig) return;
    
    try {
      // 模拟更新
      const updatedConfigs = configs.map(config => 
        config.id === editingConfig.id 
          ? { ...config, ...values, updatedAt: new Date().toISOString() }
          : config
      );
      setConfigs(updatedConfigs);
      setIsEditModalVisible(false);
      setEditingConfig(null);
      editForm.resetFields();
      message.success(t('antiDetection.updateSuccess'));
    } catch (error) {
      message.error(t('antiDetection.updateFailed'));
    }
  };

  const handleDeleteConfig = async (id: string) => {
    try {
      // 模拟删除
      setConfigs(prev => prev.filter(config => config.id !== id));
      message.success(t('antiDetection.deleteSuccess'));
    } catch (error) {
      message.error(t('antiDetection.deleteFailed'));
    }
  };

  const columns = [
    {
      title: t('antiDetection.colName'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('antiDetection.colDevice'),
      key: 'device',
      render: (_: any, record: AntiDetectionConfig) => (
        <Space>
          <Tag color={record.deviceSimulation.deviceType === 'desktop' ? 'blue' : 'purple'}>
            {record.deviceSimulation.deviceType === 'desktop' ? t('antiDetection.deviceDesktop') : t('antiDetection.deviceMobile')}
          </Tag>
          <Text type="secondary">
            {record.deviceSimulation.os} {record.deviceSimulation.browser}
          </Text>
        </Space>
      ),
    },
    {
      title: t('antiDetection.colStatus'),
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'}>
          {enabled ? t('antiDetection.enabled') : t('antiDetection.disabled')}
        </Tag>
      ),
    },
    {
      title: t('antiDetection.colCreatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(date).format('YYYY-MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: t('antiDetection.colActions'),
      key: 'actions',
      render: (_: any, record: AntiDetectionConfig) => (
        <Space size="small">
          <Tooltip title={t('antiDetection.editTooltip')}>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingConfig(record);
                editForm.setFieldsValue(record);
                setIsEditModalVisible(true);
              }}
            />
          </Tooltip>
          <Tooltip title={t('antiDetection.copyTooltip')}>
            <Button
              type="text"
              icon={<CopyOutlined />}
              onClick={() => {
                const newConfig = { ...record, id: Date.now().toString(), name: `${record.name} - copy` };
                setConfigs(prev => [...prev, newConfig]);
                message.success(t('antiDetection.copySuccess'));
              }}
            />
          </Tooltip>
          <Popconfirm
            title={t('antiDetection.deleteConfirm')}
            onConfirm={() => handleDeleteConfig(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Tooltip title={t('antiDetection.deleteTooltip')}>
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
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
            <Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>{t('antiDetection.title')}</Title>
            <Text type="secondary">{t('antiDetection.subtitle')}</Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={() => setIsCreateModalVisible(true)}
            >
              {t('antiDetection.createButton')}
            </Button>
          </Col>
        </Row>
      </div>

      <Alert
        message={t('antiDetection.title')}
        description={t('antiDetection.subtitle')}
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card>
        <Table
          columns={columns}
          dataSource={configs}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (total) => t('common.total', { count: total }) }}
        />
      </Card>

      {/* 创建配置模态框 */}
      <Modal
        title={t('antiDetection.createModalTitle')}
        open={isCreateModalVisible}
        onOk={() => createForm.submit()}
        onCancel={() => {
          setIsCreateModalVisible(false);
          createForm.resetFields();
        }}
        width={800}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateConfig}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="例如：桌面Chrome配置、移动Safari配置" />
          </Form.Item>

          <Form.Item
            name="enabled"
            label="启用配置"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Divider>设备模拟配置</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name={['deviceSimulation', 'deviceType']}
                label="设备类型"
                rules={[{ required: true }]}
                initialValue="desktop"
              >
                <Select>
                  <Option value="desktop">桌面设备</Option>
                  <Option value="mobile">移动设备</Option>
                  <Option value="tablet">平板设备</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name={['deviceSimulation', 'os']}
                label="操作系统"
                rules={[{ required: true }]}
                initialValue="windows"
              >
                <Select>
                  <Option value="windows">Windows</Option>
                  <Option value="macos">macOS</Option>
                  <Option value="linux">Linux</Option>
                  <Option value="android">Android</Option>
                  <Option value="ios">iOS</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Alert
            message="提示"
            description="更多高级配置将在后续步骤中完善"
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </Form>
      </Modal>

      {/* 编辑配置模态框 */}
      <Modal
        title={t('antiDetection.editModalTitle')}
        open={isEditModalVisible}
        onOk={() => editForm.submit()}
        onCancel={() => {
          setIsEditModalVisible(false);
          setEditingConfig(null);
          editForm.resetFields();
        }}
        width={800}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditConfig}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="例如：桌面Chrome配置、移动Safari配置" />
          </Form.Item>

          <Form.Item
            name="enabled"
            label="启用配置"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </AppLayout>
  );
};

export default AntiDetectionPage;