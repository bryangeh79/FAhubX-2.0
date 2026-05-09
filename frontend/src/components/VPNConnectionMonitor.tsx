import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Progress,
  Tag,
  Space,
  Button,
  Table,
  Tooltip,
  Badge,
  Timeline,
  Alert,
  Statistic,
  Divider,
  Select,
} from 'antd';
import {
  WifiOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  LineChartOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { VPNConfig } from '../types/facebook-login';

const { Title, Text } = Typography;
const { Option } = Select;

interface ConnectionMetric {
  timestamp: string;
  latency: number;
  bandwidth: number;
  packetLoss: number;
  jitter: number;
  status: 'good' | 'fair' | 'poor' | 'down';
}

interface VPNConnectionMonitorProps {
  vpnId?: string;
  autoRefresh?: boolean;
}

const VPNConnectionMonitor: React.FC<VPNConnectionMonitorProps> = ({
  vpnId,
  autoRefresh = true,
}) => {
  const [vpns, setVPNs] = useState<VPNConfig[]>([]);
  const [selectedVPN, setSelectedVPN] = useState<string>('');
  const [metrics, setMetrics] = useState<ConnectionMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // 加载VPN列表
  useEffect(() => {
    loadVPNs();
  }, []);

  // 设置自动刷新
  useEffect(() => {
    if (autoRefresh && selectedVPN) {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      const interval = setInterval(() => {
        if (!refreshing) {
          loadMetrics(selectedVPN);
        }
      }, 10000); // 每10秒刷新一次
      setRefreshInterval(interval);
      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [autoRefresh, selectedVPN, refreshing]);

  // 如果有指定的VPN ID，直接选择它
  useEffect(() => {
    if (vpnId && vpns.length > 0) {
      setSelectedVPN(vpnId);
      loadMetrics(vpnId);
    }
  }, [vpnId, vpns]);

  const loadVPNs = async () => {
    try {
      // 模拟加载VPN数据
      const mockVPNs: VPNConfig[] = [
        {
          id: '1',
          name: '美国节点-01',
          type: 'OpenVPN',
          status: 'connected',
          ipAddress: '104.20.45.67',
          serverAddress: 'us-west.vpnserver.com',
          port: 1194,
          country: '美国',
          city: '洛杉矶',
          latency: 120,
          bandwidth: 100,
          lastConnectedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: '英国节点-01',
          type: 'WireGuard',
          status: 'connected',
          ipAddress: '185.212.96.45',
          serverAddress: 'uk.vpnserver.com',
          port: 51820,
          country: '英国',
          city: '伦敦',
          latency: 80,
          bandwidth: 150,
          lastConnectedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: '日本节点-01',
          type: 'Shadowsocks',
          status: 'disconnected',
          ipAddress: '45.76.123.89',
          serverAddress: 'jp.vpnserver.com',
          port: 8388,
          country: '日本',
          city: '东京',
          latency: 60,
          bandwidth: 200,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      setVPNs(mockVPNs);
      
      // 如果没有指定VPN ID，选择第一个
      if (!vpnId && mockVPNs.length > 0) {
        setSelectedVPN(mockVPNs[0].id);
        loadMetrics(mockVPNs[0].id);
      }
    } catch (error) {
      console.error('加载VPN列表失败:', error);
    }
  };

  const loadMetrics = async (vpnId: string) => {
    if (refreshing) return;
    
    setRefreshing(true);
    try {
      // 模拟加载监控数据
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const now = new Date();
      const newMetric: ConnectionMetric = {
        timestamp: now.toISOString(),
        latency: Math.floor(Math.random() * 200) + 50, // 50-250ms
        bandwidth: Math.floor(Math.random() * 150) + 50, // 50-200Mbps
        packetLoss: Math.random() * 5, // 0-5%
        jitter: Math.floor(Math.random() * 30) + 5, // 5-35ms
        status: Math.random() > 0.1 ? 'good' : Math.random() > 0.3 ? 'fair' : 'poor',
      };
      
      setMetrics(prev => {
        const updated = [newMetric, ...prev.slice(0, 19)]; // 保留最近20条记录
        return updated;
      });
      
      // 更新VPN的延迟和带宽信息
      setVPNs(prev => prev.map(vpn => {
        if (vpn.id === vpnId) {
          return {
            ...vpn,
            latency: newMetric.latency,
            bandwidth: newMetric.bandwidth,
            status: newMetric.status === 'down' ? 'error' : 
                   newMetric.status === 'poor' ? 'disconnected' : 'connected',
            lastConnectedAt: new Date().toISOString(),
          };
        }
        return vpn;
      }));
    } catch (error) {
      console.error('加载监控数据失败:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleVPNChange = (value: string) => {
    setSelectedVPN(value);
    setMetrics([]);
    loadMetrics(value);
  };

  const handleManualRefresh = () => {
    if (selectedVPN) {
      loadMetrics(selectedVPN);
    }
  };

  // 获取状态标签
  const getStatusTag = (status: ConnectionMetric['status']) => {
    const config = {
      good: { color: 'green', text: '良好', icon: <CheckCircleOutlined /> },
      fair: { color: 'orange', text: '一般', icon: <WarningOutlined /> },
      poor: { color: 'red', text: '较差', icon: <CloseCircleOutlined /> },
      down: { color: 'gray', text: '断开', icon: <CloseCircleOutlined /> },
    };
    const cfg = config[status];
    return (
      <Tag color={cfg.color} icon={cfg.icon}>
        {cfg.text}
      </Tag>
    );
  };

  // 获取延迟状态
  const getLatencyStatus = (latency: number) => {
    if (latency < 100) return { status: 'success', text: '优秀' };
    if (latency < 200) return { status: 'normal', text: '良好' };
    if (latency < 300) return { status: 'exception', text: '一般' };
    return { status: 'exception', text: '较差' };
  };

  // 获取带宽状态
  const getBandwidthStatus = (bandwidth: number) => {
    if (bandwidth > 150) return { status: 'success', text: '优秀' };
    if (bandwidth > 100) return { status: 'normal', text: '良好' };
    if (bandwidth > 50) return { status: 'exception', text: '一般' };
    return { status: 'exception', text: '较差' };
  };

  // 获取当前VPN
  const currentVPN = vpns.find(v => v.id === selectedVPN);

  // 获取最新指标
  const latestMetric = metrics[0];

  // 表格列定义
  const metricColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(date).toLocaleTimeString()}
        </Text>
      ),
    },
    {
      title: '延迟',
      dataIndex: 'latency',
      key: 'latency',
      render: (latency: number) => {
        const status = getLatencyStatus(latency);
        return (
          <Space>
            <Progress
              percent={Math.min(100, latency / 3)}
              size="small"
              status={status.status as any}
              showInfo={false}
              style={{ width: 80 }}
            />
            <Text>{latency}ms</Text>
            <Tag color={status.status === 'success' ? 'green' : status.status === 'normal' ? 'blue' : 'red'}>
              {status.text}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: '带宽',
      dataIndex: 'bandwidth',
      key: 'bandwidth',
      render: (bandwidth: number) => {
        const status = getBandwidthStatus(bandwidth);
        return (
          <Space>
            <Progress
              percent={Math.min(100, bandwidth / 2)}
              size="small"
              status={status.status as any}
              showInfo={false}
              style={{ width: 80 }}
            />
            <Text>{bandwidth}Mbps</Text>
            <Tag color={status.status === 'success' ? 'green' : status.status === 'normal' ? 'blue' : 'red'}>
              {status.text}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: '丢包率',
      dataIndex: 'packetLoss',
      key: 'packetLoss',
      render: (loss: number) => (
        <Space>
          <Progress
            percent={loss * 20} // 放大显示
            size="small"
            status={loss < 1 ? 'success' : loss < 3 ? 'normal' : 'exception'}
            showInfo={false}
            style={{ width: 80 }}
          />
          <Text>{loss.toFixed(2)}%</Text>
          <Tag color={loss < 1 ? 'green' : loss < 3 ? 'orange' : 'red'}>
            {loss < 1 ? '优秀' : loss < 3 ? '一般' : '较差'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '抖动',
      dataIndex: 'jitter',
      key: 'jitter',
      render: (jitter: number) => (
        <Space>
          <Progress
            percent={Math.min(100, jitter)}
            size="small"
            status={jitter < 10 ? 'success' : jitter < 20 ? 'normal' : 'exception'}
            showInfo={false}
            style={{ width: 80 }}
          />
          <Text>{jitter}ms</Text>
          <Tag color={jitter < 10 ? 'green' : jitter < 20 ? 'orange' : 'red'}>
            {jitter < 10 ? '稳定' : jitter < 20 ? '一般' : '不稳定'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: ConnectionMetric['status']) => getStatusTag(status),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <DashboardOutlined />
            <span>VPN连接质量监控</span>
            {currentVPN && (
              <Tag color="blue">
                {currentVPN.name} ({currentVPN.ipAddress})
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Select
              value={selectedVPN}
              onChange={handleVPNChange}
              style={{ width: 200 }}
              placeholder="选择VPN节点"
            >
              {vpns.map(vpn => (
                <Option key={vpn.id} value={vpn.id}>
                  <Space>
                    <WifiOutlined />
                    <span>{vpn.name}</span>
                    <Tag color={vpn.status === 'connected' ? 'green' : 'default'}>
                      {vpn.status === 'connected' ? '已连接' : '未连接'}
                    </Tag>
                  </Space>
                </Option>
              ))}
            </Select>
            <Button
              icon={<SyncOutlined spin={refreshing} />}
              onClick={handleManualRefresh}
              loading={refreshing}
            >
              刷新
            </Button>
          </Space>
        }
      >
        {currentVPN && latestMetric && (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col xs={24} sm={6}>
                <Card size="small">
                  <Statistic
                    title="延迟"
                    value={latestMetric.latency}
                    suffix="ms"
                    valueStyle={{ 
                      color: latestMetric.latency < 100 ? '#52c41a' : 
                             latestMetric.latency < 200 ? '#1890ff' : 
                             latestMetric.latency < 300 ? '#faad14' : '#ff4d4f'
                    }}
                    prefix={<ThunderboltOutlined />}
                  />
                  <Progress
                    percent={Math.min(100, latestMetric.latency / 3)}
                    status={getLatencyStatus(latestMetric.latency).status as any}
                    size="small"
                    showInfo={false}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card size="small">
                  <Statistic
                    title="带宽"
                    value={latestMetric.bandwidth}
                    suffix="Mbps"
                    valueStyle={{ 
                      color: latestMetric.bandwidth > 150 ? '#52c41a' : 
                             latestMetric.bandwidth > 100 ? '#1890ff' : 
                             latestMetric.bandwidth > 50 ? '#faad14' : '#ff4d4f'
                    }}
                    prefix={<LineChartOutlined />}
                  />
                  <Progress
                    percent={Math.min(100, latestMetric.bandwidth / 2)}
                    status={getBandwidthStatus(latestMetric.bandwidth).status as any}
                    size="small"
                    showInfo={false}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card size="small">
                  <Statistic
                    title="丢包率"
                    value={latestMetric.packetLoss}
                    suffix="%"
                    precision={2}
                    valueStyle={{ 
                      color: latestMetric.packetLoss < 1 ? '#52c41a' : 
                             latestMetric.packetLoss < 3 ? '#faad14' : '#ff4d4f'
                    }}
                    prefix={<BarChartOutlined />}
                  />
                  <Progress
                    percent={latestMetric.packetLoss * 20}
                    status={latestMetric.packetLoss < 1 ? 'success' : latestMetric.packetLoss < 3 ? 'normal' : 'exception'}
                    size="small"
                    showInfo={false}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={6}>
                <Card size="small">
                  <Statistic
                    title="抖动"
                    value={latestMetric.jitter}
                    suffix="ms"
                    valueStyle={{ 
                      color: latestMetric.jitter < 10 ? '#52c41a' : 
                             latestMetric.jitter < 20 ? '#faad14' : '#ff4d4f'
                    }}
                    prefix={<ClockCircleOutlined />}
                  />
                  <Progress
                    percent={Math.min(100, latestMetric.jitter)}
                    status={latestMetric.jitter < 10 ? 'success' : latestMetric.jitter < 20 ? 'normal' : 'exception'}
                    size="small"
                    showInfo={false}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={24}>
                <Card
                  title={
                    <Space>
                      <EyeOutlined />
                      <span>实时状态</span>
                      {getStatusTag(latestMetric.status)}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        最后更新: {new Date(latestMetric.timestamp).toLocaleTimeString()}
                      </Text>
                    </Space>
                  }
                  size="small"
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <Text strong>连接质量:</Text>
                      <Progress
                        percent={
                          latestMetric.status === 'good' ? 90 :
                          latestMetric.status === 'fair' ? 60 :
                          latestMetric.status === 'poor' ? 30 : 0
                        }
                        status={
                          latestMetric.status === 'good' ? 'success' :
                          latestMetric.status === 'fair' ? 'normal' :
                          latestMetric.status === 'poor' ? 'exception' : 'exception'
                        }
                        style={{ flex: 1 }}
                      />
                      <Text>
                        {latestMetric.status === 'good' ? '优秀' :
                         latestMetric.status === 'fair' ? '一般' :
                         latestMetric.status === 'poor' ? '较差' : '断开'}
                      </Text>
                    </div>
                    
                    {latestMetric.status === 'poor' || latestMetric.status === 'down' ? (
                      <Alert
                        message="连接质量警告"
                        description="当前VPN连接质量较差，可能会影响Facebook登录成功率。建议切换到其他VPN节点。"
                        type="warning"
                        showIcon
                      />
                    ) : (
                      <Alert
                        message="连接状态正常"
                        description="当前VPN连接质量良好，适合进行Facebook登录操作。"
                        type="success"
                        showIcon
                      />
                    )}
                  </Space>
                </Card>
              </Col>
            </Row>
          </>
        )}

        <Divider>历史监控数据</Divider>
        
        <Card size="small">
          <Table
            columns={metricColumns}
            dataSource={metrics}
            rowKey="timestamp"
            pagination={{ pageSize: 5, showTotal: (t) => `共 ${t} 条记录` }}
            size="small"
            scroll={{ x: 800 }}
          />
        </Card>

        <Divider>连接趋势</Divider>
        
        <Card size="small">
          <Timeline mode="left">
            {metrics.slice(0, 5).map((metric, index) => (
              <Timeline.Item
                key={metric.timestamp}
                color={metric.status === 'good' ? 'green' : metric.status === 'fair' ? 'orange' : 'red'}
                dot={metric.status === 'good' ? <CheckCircleOutlined /> : 
                      metric.status === 'fair' ? <WarningOutlined /> : 
                      <CloseCircleOutlined />}
              >
                <Space direction="vertical" size={2}>
                  <Text strong>{new Date(metric.timestamp).toLocaleTimeString()}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    延迟: {metric.latency}ms | 带宽: {metric.bandwidth}Mbps | 丢包: {metric.packetLoss.toFixed(2)}%
                  </Text>
                </Space>
              </Timeline.Item>
            ))}
            {metrics.length === 0 && (
              <Timeline.Item>
                <Text type="secondary">暂无监控数据</Text>
              </Timeline.Item>
            )}
          </Timeline>
        </Card>
      </Card>
    </div>
  );
};

export default VPNConnectionMonitor;
