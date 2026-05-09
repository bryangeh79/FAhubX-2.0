import React, { useState, useEffect } from 'react';
import { Card, Select, DatePicker, Space, Typography, Row, Col } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AreaChartOutlined, BarChartOutlined, LineChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

interface StatusTrendData {
  timestamp: string;
  online: number;
  offline: number;
  verifying: number;
  failed: number;
  healthy: number;
  warning: number;
  critical: number;
}

interface StatusTrendChartProps {
  data?: StatusTrendData[];
  height?: number;
}

const StatusTrendChart: React.FC<StatusTrendChartProps> = ({ data: propData, height = 300 }) => {
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('line');
  const [timeRange, setTimeRange] = useState<'1d' | '7d' | '30d'>('7d');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['online', 'healthy']);
  const [chartData, setChartData] = useState<StatusTrendData[]>([]);

  // 模拟数据生成
  const generateMockData = () => {
    const data: StatusTrendData[] = [];
    const now = dayjs();
    const days = timeRange === '1d' ? 24 : timeRange === '7d' ? 7 : 30;
    const isHourly = timeRange === '1d';
    
    for (let i = days; i >= 0; i--) {
      const timestamp = isHourly 
        ? now.subtract(i, 'hour').format('YYYY-MM-DD HH:00')
        : now.subtract(i, 'day').format('YYYY-MM-DD');
      
      const baseOnline = Math.floor(Math.random() * 20) + 30;
      const baseOffline = Math.floor(Math.random() * 10) + 5;
      const baseVerifying = Math.floor(Math.random() * 5);
      const baseFailed = Math.floor(Math.random() * 8);
      
      data.push({
        timestamp,
        online: baseOnline,
        offline: baseOffline,
        verifying: baseVerifying,
        failed: baseFailed,
        healthy: Math.floor(baseOnline * 0.8),
        warning: Math.floor(baseOnline * 0.15),
        critical: Math.floor(baseOnline * 0.05),
      });
    }
    
    return data;
  };

  useEffect(() => {
    if (propData) {
      setChartData(propData);
    } else {
      setChartData(generateMockData());
    }
  }, [propData, timeRange]);

  const metricOptions = [
    { value: 'online', label: '在线账号', color: '#52c41a' },
    { value: 'offline', label: '离线账号', color: '#8c8c8c' },
    { value: 'verifying', label: '验证中', color: '#fa8c16' },
    { value: 'failed', label: '失败账号', color: '#f5222d' },
    { value: 'healthy', label: '健康账号', color: '#73d13d' },
    { value: 'warning', label: '警告账号', color: '#faad14' },
    { value: 'critical', label: '危险账号', color: '#ff4d4f' },
  ];

  const renderChart = () => {
    const ChartComponent = chartType === 'line' ? Line : chartType === 'area' ? Line : Line;
    
    return (
      <ResponsiveContainer width="100%" height={height}>
        {chartType === 'line' || chartType === 'area' ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="timestamp" 
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              label={{ 
                value: '账号数量', 
                angle: -90, 
                position: 'insideLeft',
                offset: 10,
                style: { textAnchor: 'middle' }
              }}
            />
            <Tooltip 
              formatter={(value: any) => [`${value}个`, '数量']}
              labelFormatter={(label) => `时间: ${label}`}
            />
            <Legend />
            {metricOptions
              .filter(metric => selectedMetrics.includes(metric.value))
              .map(metric => (
                <ChartComponent
                  key={metric.value}
                  type="monotone"
                  dataKey={metric.value}
                  name={metric.label}
                  stroke={metric.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                  fill={chartType === 'area' ? metric.color : 'none'}
                  fillOpacity={chartType === 'area' ? 0.3 : 1}
                />
              ))}
          </LineChart>
        ) : (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="timestamp" 
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              label={{ 
                value: '账号数量', 
                angle: -90, 
                position: 'insideLeft',
                offset: 10,
                style: { textAnchor: 'middle' }
              }}
            />
            <Tooltip 
              formatter={(value: any) => [`${value}个`, '数量']}
              labelFormatter={(label) => `时间: ${label}`}
            />
            <Legend />
            {metricOptions
              .filter(metric => selectedMetrics.includes(metric.value))
              .map(metric => (
                <Line
                  key={metric.value}
                  type="monotone"
                  dataKey={metric.value}
                  name={metric.label}
                  stroke={metric.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    );
  };

  return (
    <Card
      title={
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              <LineChartOutlined /> 状态趋势图
            </Title>
          </Col>
          <Col>
            <Space>
              <Select
                value={timeRange}
                onChange={setTimeRange}
                style={{ width: 100 }}
              >
                <Option value="1d">24小时</Option>
                <Option value="7d">7天</Option>
                <Option value="30d">30天</Option>
              </Select>
              
              <Select
                value={chartType}
                onChange={setChartType}
                style={{ width: 100 }}
              >
                <Option value="line">
                  <LineChartOutlined /> 折线图
                </Option>
                <Option value="area">
                  <AreaChartOutlined /> 面积图
                </Option>
                <Option value="bar">
                  <BarChartOutlined /> 柱状图
                </Option>
              </Select>
            </Space>
          </Col>
        </Row>
      }
      extra={
        <Select
          mode="multiple"
          value={selectedMetrics}
          onChange={setSelectedMetrics}
          style={{ width: 200 }}
          placeholder="选择指标"
          maxTagCount={2}
        >
          {metricOptions.map(metric => (
            <Option key={metric.value} value={metric.value}>
              <span style={{ color: metric.color, marginRight: 8 }}>●</span>
              {metric.label}
            </Option>
          ))}
        </Select>
      }
    >
      {chartData.length > 0 ? (
        renderChart()
      ) : (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text type="secondary">暂无数据</Text>
        </div>
      )}
      
      <div style={{ marginTop: 16 }}>
        <Text type="secondary">
          显示 {timeRange === '1d' ? '24小时' : timeRange === '7d' ? '7天' : '30天'} 内的状态变化趋势
          {selectedMetrics.length > 0 && `，已选择 ${selectedMetrics.length} 个指标`}
        </Text>
      </div>
    </Card>
  );
};

export default StatusTrendChart;