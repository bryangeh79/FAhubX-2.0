import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Statistic, Progress, Typography, Tag,
  Alert, Table, Space, Button, Tooltip, Badge, Select,
  Timeline, List, Descriptions
} from 'antd';
import {
  HeartOutlined, WarningOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExclamationCircleOutlined,
  LineChartOutlined, RadarChartOutlined, DashboardOutlined,
  ReloadOutlined, EyeOutlined, FilterOutlined,
  ArrowUpOutlined, ArrowDownOutlined, MinusOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface HealthMetric {
  name: string;
  value: number;
  target: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  change: number;
  status: 'healthy' | 'warning' | 'critical';
}

interface HealthAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: string;
  acknowledged: boolean;
  accountId?: string;
  accountName?: string;
}

interface HealthDashboardProps {
  accountId?: string; // 单个账号的仪表板
  refreshInterval?: number;
}

const HealthDashboard: React.FC<HealthDashboardProps> = ({ accountId, refreshInterval = 60 }) => {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [overallHealth, setOverallHealth] = useState(85);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');

  // 模拟健康指标数据
  const generateMockMetrics = (): HealthMetric[] => [
    {
      name: '登录成功率',
      value: 92,
      target: 95,
      unit: '%',
      trend: 'up',
      change: 2,
      status: 'healthy',
    },
    {
      name: '会话稳定性',
      value: 88,
      target: 90,
      unit: '%',
      trend: 'stable',
      change: 0,
      status: 'warning',
    },
    {
      name: 'VPN连接率',
      value: 95,
      target: 98,
      unit: '%',
      trend: 'up',
      change: 3,
      status: 'healthy',
    },
    {
      name: '反检测通过率',
      value: 82,
      target: 85,
      unit: '%',
      trend: 'down',
      change: -5,
      status: 'warning',
    },
    {
      name: '平均响应时间',
      value: 1200,
      target: 800,
      unit: 'ms',
      trend: 'down',
      change: -200,
      status: 'critical',
    },
    {
      name: '资源使用率',
      value: 65,
      target: 70,
      unit: '%',
      trend: 'stable',
      change: 0,
      status: 'healthy',
    },
  ];

  // 模拟告警数据
  const generateMockAlerts = (): HealthAlert[] => [
    {
      id: 'alert1',
      title: '登录响应时间过长',
      description: '检测到多个账号登录响应时间超过2秒，可能影响用户体验',
      severity: 'warning',
      timestamp: dayjs().subtract(30, 'minute').toISOString(),
      acknowledged: false,
      accountId: 'acc123',
      accountName: '营销账号1',
    },
    {
      id: 'alert2',
      title: 'VPN连接不稳定',
      description: '美国节点VPN连接频繁断开，已自动切换到备用节点',
      severity: 'error',
      timestamp: dayjs().subtract(2, 'hour').toISOString(),
      acknowledged: true,
    },
    {
      id: 'alert3',
      title: '反检测配置异常',
      description: '3个账号的浏览器指纹检测失败，建议检查配置',
      severity: 'warning',
      timestamp: dayjs().subtract(5, 'hour').toISOString(),
      acknowledged: false,
    },
    {
      id: 'alert4',
      title: '账号登录失败率上升',
      description: '过去1小时内登录失败率从5%上升到15%',
      severity: 'critical',
      timestamp: dayjs().subtract(1, 'day').toISOString(),
      acknowledged: true,
    },
    {
      id: 'alert5',
      title: '系统资源预警',
      description: '内存使用率达到85%，建议优化或扩容',
      severity: 'warning',
      timestamp: dayjs().subtract(2, 'day').toISOString(),
      acknowledged: false,
    },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setMetrics(generateMockMetrics());
      setAlerts(generateMockAlerts());
      
      // 计算整体健康度
      const avgHealth = Math.round(
        generateMockMetrics().reduce((sum, metric) => {
          const score = metric.value / metric.target * 100;
          return sum + Math.min(score, 100);
        }, 0) / generateMockMetrics().length
      );
      setOverallHealth(avgHealth);
      
    } catch (error) {
      console.error('加载健康数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    
    // 设置自动刷新
    if (refreshInterval > 0) {
      const intervalId = setInterval(loadData, refreshInterval * 1000);
      return () => clearInterval(intervalId);
    }
  }, [refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#52c41a';
      case 'warning': return '#fa8c16';
      case 'critical': return '#f5222d';
      default: return '#8c8c8c';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'info': return '#1890ff';
      case 'warning': return '#fa8c16';
      case 'error': return '#f5222d';
      case 'critical': return '#cf1322';
      default: return '#8c8c8c';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <ArrowUpOutlined style={{ color: '#52c41a' }} />;
      case 'down': return <ArrowDownOutlined style={{ color: '#f5222d' }} />;
      default: return <MinusOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts(alerts.map(alert => 
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    ));
  };

  const metricColumns = [
    {
      title: '指标名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: HealthMetric) => (
        <Space>
          <Text strong>{text}</Text>
          <Tag color={getStatusColor(record.status)}>
            {record.status === 'healthy' ? '健康' : 
             record.status === 'warning' ? '警告' : '危险'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '当前值',
      dataIndex: 'value',
      key: 'value',
      render: (value: number, record: HealthMetric) => (
        <Space>
          <Text strong>{value}{record.unit}</Text>
          <Text type="secondary">目标: {record.target}{record.unit}</Text>
        </Space>
      ),
    },
    {
      title: '趋势',
      key: 'trend',
      render: (_: any, record: HealthMetric) => (
        <Space>
          {getTrendIcon(record.trend)}
          <Text type={record.change > 0 ? 'success' : record.change < 0 ? 'danger' : 'secondary'}>
            {record.change > 0 ? '+' : ''}{record.change}{record.unit}
          </Text>
        </Space>
      ),
    },
    {
      title: '进度',
      key: 'progress',
      render: (_: any, record: HealthMetric) => {
        const progress = Math.min((record.value / record.target) * 100, 100);
        const status = record.status === 'healthy' ? 'success' : 
                      record.status === 'warning' ? 'normal' : 'exception';
        
        return (
          <Progress
            percent={Math.round(progress)}
            status={status}
            strokeColor={getStatusColor(record.status)}
            size="small"
          />
        );
      },
    },
  ];

  const alertColumns = [
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: string) => (
        <Tag color={getSeverityColor(severity)}>
          {severity === 'info' ? '信息' :
           severity === 'warning' ? '警告' :
           severity === 'error' ? '错误' : '严重'}
        </Tag>
      ),
    },
    {
      title: '告警内容',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: HealthAlert) => (
        <Space direction="vertical" size={2}>
          <Text strong>{title}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.description}
          </Text>
          {record.accountName && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              关联账号: {record.accountName}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 150,
      render: (timestamp: string) => (
        <Tooltip title={dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(timestamp).fromNow()}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      key: 'acknowledged',
      width: 100,
      render: (acknowledged: boolean) => (
        acknowledged ? (
          <Tag color="green">已确认</Tag>
        ) : (
          <Tag color="orange">未确认</Tag>
        )
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: any, record: HealthAlert) => (
        <Space size="small">
          {!record.acknowledged && (
            <Button
              size="small"
              onClick={() => handleAcknowledgeAlert(record.id)}
            >
              确认
            </Button>
          )}
          <Button icon={<EyeOutlined />} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card loading={loading}>
            <Row justify="space-between" align="middle">
              <Col>
                <Title level={3} style={{ margin: 0 }}>
                  <DashboardOutlined /> 系统健康状态概览
                </Title>
                <Text type="secondary">
                  {accountId ? '账号专属健康监控' : '整体系统健康状态监控'}
                </Text>
              </Col>
              <Col>
                <Space>
                  <Select
                    value={timeRange}
                    onChange={setTimeRange}
                    style={{ width: 100 }}
                  >
                    <Option value="1h">1小时</Option>
                    <Option value="24h">24小时</Option>
                    <Option value="7d">7天</Option>
                  </Select>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={loadData}
                    loading={loading}
                  >
                    刷新
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 整体健康度 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="整体健康度"
              value={overallHealth}
              prefix={<HeartOutlined />}
              valueStyle={{
                color: overallHealth >= 80 ? '#52c41a' :
                       overallHealth >= 60 ? '#fa8c16' : '#f5222d'
              }}
              suffix="/100"
            />
            <Progress
              percent={overallHealth}
              strokeColor={
                overallHealth >= 80 ? '#52c41a' :
                overallHealth >= 60 ? '#fa8c16' : '#f5222d'
              }
              size="small"
              style={{ marginTop: 8 }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                {overallHealth >= 80 ? '系统运行良好' :
                 overallHealth >= 60 ? '系统运行正常，有待优化' :
                 '系统存在严重问题，需要立即处理'}
              </Text>
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="活跃告警"
              value={alerts.filter(a => !a.acknowledged).length}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#fa8c16' }}
              suffix={`/${alerts.length}`}
            />
            <div style={{ marginTop: 8 }}>
              <Space>
                <Tag color="green">健康指标: {metrics.filter(m => m.status === 'healthy').length}</Tag>
                <Tag color="orange">警告指标: {metrics.filter(m => m.status === 'warning').length}</Tag>
                <Tag color="red">危险指标: {metrics.filter(m => m.status === 'critical').length}</Tag>
              </Space>
            </div>
          </Card>
        </Col>
        
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="最近更新"
              value={dayjs().format('HH:mm:ss')}
              prefix={<LineChartOutlined />}
            />
            <div style={{ marginTop: 8 }}>
              <Timeline pending="实时监控中..." reverse>
                <Timeline.Item color="green">
                  <Text>登录状态检查完成</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs().subtract(1, 'minute').fromNow()}
                  </Text>
                </Timeline.Item>
                <Timeline.Item color="blue">
                  <Text>VPN连接状态更新</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs().subtract(3, 'minute').fromNow()}
                  </Text>
                </Timeline.Item>
                <Timeline.Item color="orange">
                  <Text>健康度计算完成</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs().subtract(5, 'minute').fromNow()}
                  </Text>
                </Timeline.Item>
              </Timeline>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 健康指标 */}
      <Card
        title={
          <Space>
            <RadarChartOutlined />
            <span>健康指标详情</span>
            <Badge
              count={metrics.length}
              showZero
              style={{ backgroundColor: '#1890ff' }}
            />
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Table
          columns={metricColumns}
          dataSource={metrics}
          rowKey="name"
          pagination={false}
          size="small"
        />
      </Card>

      {/* 告警列表 */}
      <Card
        title={
          <Space>
            <WarningOutlined />
            <span>健康告警</span>
            <Badge
              count={alerts.filter(a => !a.acknowledged).length}
              style={{ backgroundColor: '#fa8c16' }}
            />
          </Space>
        }
        extra={
          <Select
            defaultValue="all"
            style={{ width: 120 }}
          >
            <Option value="all">全部告警</Option>
            <Option value="unacknowledged">未确认</Option>
            <Option value="critical">严重告警</Option>
          </Select>
        }
      >
        <Table
          columns={alertColumns}
          dataSource={alerts}
          rowKey="id"
          pagination={{ pageSize: 5 }}
          size="small"
        />
      </Card>

      {/* 建议和优化 */}
      <Card
        title="优化建议"
        style={{ marginTop: 16 }}
      >
        <List
          dataSource={[
            '登录成功率低于目标值，建议检查账号密码和验证设置',
            '反检测通过率下降，建议更新浏览器指纹配置',
            '平均响应时间过长，建议优化网络连接或升级服务器',
            '存在未确认的告警，请及时处理',
          ]}
          renderItem={(item, index) => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  <Badge
                    count={index + 1}
                    style={{ backgroundColor: '#1890ff' }}
                  />
                }
                title={<Text>{item}</Text>}
              />
            </List.Item>
          )}
        />
        
        <Alert
          type="info"
          message="监控建议"
          description="建议定期检查健康指标，及时处理告警，根据趋势调整系统配置。对于持续存在的问题，建议深入分析根本原因。"
          style={{ marginTop: 16 }}
          showIcon
        />
      </Card>
    </div>
  );
};

export default HealthDashboard;