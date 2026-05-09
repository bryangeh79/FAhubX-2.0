import React, { useState } from 'react';
import {
  Card, Button, Space, Typography, Alert, Upload, message,
  List, Tag, Progress, Row, Col, Statistic, Tooltip, Checkbox,
} from 'antd';
import {
  ImportOutlined, ExportOutlined, DownloadOutlined,
  UploadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  FileTextOutlined, SafetyOutlined, CloudUploadOutlined,
  CloudDownloadOutlined, DeleteOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { AntiDetectionConfig } from '../../types/facebook-login';

const { Text, Title } = Typography;
const { Dragger } = Upload;

interface ImportExportPanelProps {
  configs: AntiDetectionConfig[];
  onImport: (configs: AntiDetectionConfig[]) => void;
  onExport: (configIds: string[]) => void;
}

interface ImportJob {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'parsing' | 'validating' | 'importing' | 'completed' | 'failed';
  progress: number;
  totalConfigs: number;
  importedConfigs: number;
  failedConfigs: number;
  errors: string[];
  startTime: string;
  endTime?: string;
}

const ImportExportPanel: React.FC<ImportExportPanelProps> = ({
  configs,
  onImport,
  onExport,
}) => {
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [selectedConfigs, setSelectedConfigs] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // 处理文件上传
  const handleFileUpload = async (file: File) => {
    const jobId = `import_${Date.now()}`;
    
    const newJob: ImportJob = {
      id: jobId,
      fileName: file.name,
      fileSize: file.size,
      status: 'parsing',
      progress: 0,
      totalConfigs: 0,
      importedConfigs: 0,
      failedConfigs: 0,
      errors: [],
      startTime: new Date().toISOString(),
    };
    
    setImportJobs(prev => [newJob, ...prev]);
    
    try {
      // 解析JSON文件
      setImportJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'parsing', progress: 20 } : job
      ));
      
      const text = await file.text();
      const data = JSON.parse(text);
      
      // 验证数据格式
      setImportJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, status: 'validating', progress: 40 } : job
      ));
      
      let configsToImport: AntiDetectionConfig[] = [];
      
      if (Array.isArray(data)) {
        // 批量导入
        configsToImport = data.filter(item => 
          item.name && item.deviceSimulation && item.browserFingerprint
        );
      } else if (data.name && data.deviceSimulation && data.browserFingerprint) {
        // 单个配置导入
        configsToImport = [data];
      } else {
        throw new Error('文件格式不正确，请确保包含有效的反检测配置');
      }
      
      setImportJobs(prev => prev.map(job => 
        job.id === jobId ? { 
          ...job, 
          status: 'importing', 
          progress: 60,
          totalConfigs: configsToImport.length 
        } : job
      ));
      
      // 模拟导入过程
      for (let i = 0; i < configsToImport.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const success = Math.random() > 0.1; // 90%成功率
        setImportJobs(prev => prev.map(job => {
          if (job.id === jobId) {
            const updatedJob = {
              ...job,
              progress: 60 + Math.round((i + 1) / configsToImport.length * 30),
              importedConfigs: job.importedConfigs + (success ? 1 : 0),
              failedConfigs: job.failedConfigs + (success ? 0 : 1),
            };
            
            if (!success) {
              updatedJob.errors.push(`配置 ${i + 1} 导入失败`);
            }
            
            if (i === configsToImport.length - 1) {
              updatedJob.status = 'completed';
              updatedJob.progress = 100;
              updatedJob.endTime = new Date().toISOString();
              
              // 实际导入到系统
              if (updatedJob.importedConfigs > 0) {
                onImport(configsToImport.filter((_, index) => {
                  // 模拟成功/失败的配置
                  return Math.random() > 0.1;
                }));
              }
            }
            
            return updatedJob;
          }
          return job;
        }));
      }
      
      message.success(`成功导入 ${configsToImport.length} 个配置`);
    } catch (error: any) {
      setImportJobs(prev => prev.map(job => 
        job.id === jobId ? { 
          ...job, 
          status: 'failed', 
          progress: 100,
          errors: [error.message],
          endTime: new Date().toISOString()
        } : job
      ));
      message.error(`导入失败: ${error.message}`);
    }
  };

  // 处理导出
  const handleExport = () => {
    if (selectedConfigs.length === 0) {
      message.warning('请选择要导出的配置');
      return;
    }
    
    setExporting(true);
    
    try {
      const selectedConfigData = configs.filter(config => 
        selectedConfigs.includes(config.id)
      );
      
      const exportData = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        totalConfigs: selectedConfigData.length,
        configs: selectedConfigData,
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `anti-detection-configs-${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      message.success(`成功导出 ${selectedConfigData.length} 个配置`);
    } catch (error: any) {
      message.error(`导出失败: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  // 上传配置
  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: '.json',
    showUploadList: false,
    beforeUpload: (file: File) => {
      handleFileUpload(file);
      return false; // 阻止自动上传
    },
  };

  // 获取任务状态颜色
  const getJobStatusColor = (status: ImportJob['status']) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'importing': return 'processing';
      default: return 'default';
    }
  };

  // 获取任务状态文本
  const getJobStatusText = (status: ImportJob['status']) => {
    switch (status) {
      case 'pending': return '等待中';
      case 'parsing': return '解析中';
      case 'validating': return '验证中';
      case 'importing': return '导入中';
      case 'completed': return '完成';
      case 'failed': return '失败';
      default: return status;
    }
  };

  return (
    <Card>
      <Title level={4} style={{ marginBottom: 16 }}>
        <SafetyOutlined /> 配置导入/导出
      </Title>
      
      <Row gutter={24}>
        {/* 导入区域 */}
        <Col span={12}>
          <Card title="导入配置" style={{ height: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message="导入说明"
                description="支持导入JSON格式的反检测配置文件，可以导入单个配置或批量配置"
                type="info"
                showIcon
              />
              
              <Dragger {...uploadProps}>
                <p className="ant-upload-drag-icon">
                  <CloudUploadOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
                <p className="ant-upload-hint">
                  支持单个或多个配置的JSON文件
                </p>
              </Dragger>
              
              <Button
                icon={<ImportOutlined />}
                block
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = (e: any) => {
                    const file = e.target.files[0];
                    if (file) handleFileUpload(file);
                  };
                  input.click();
                }}
              >
                选择文件导入
              </Button>
            </Space>
          </Card>
        </Col>
        
        {/* 导出区域 */}
        <Col span={12}>
          <Card title="导出配置" style={{ height: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message="导出说明"
                description="选择要导出的配置，系统将生成JSON格式的配置文件"
                type="info"
                showIcon
              />
              
              <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
                <List
                  size="small"
                  dataSource={configs}
                  renderItem={config => (
                    <List.Item
                      actions={[
                        <Checkbox
                          checked={selectedConfigs.includes(config.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedConfigs([...selectedConfigs, config.id]);
                            } else {
                              setSelectedConfigs(selectedConfigs.filter(id => id !== config.id));
                            }
                          }}
                        >
                          选择
                        </Checkbox>
                      ]}
                    >
                      <List.Item.Meta
                        title={<Text>{config.name}</Text>}
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {config.deviceSimulation.deviceType} · {config.deviceSimulation.os}
                          </Text>
                        }
                      />
                    </List.Item>
                  )}
                />
              </div>
              
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text type="secondary">
                  已选择 {selectedConfigs.length} 个配置
                </Text>
                <Space>
                  <Button
                    size="small"
                    onClick={() => setSelectedConfigs(configs.map(c => c.id))}
                  >
                    全选
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setSelectedConfigs([])}
                  >
                    清空
                  </Button>
                </Space>
              </Space>
              
              <Button
                type="primary"
                icon={<ExportOutlined />}
                block
                loading={exporting}
                onClick={handleExport}
                disabled={selectedConfigs.length === 0}
              >
                导出选中配置 ({selectedConfigs.length})
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
      
      {/* 导入任务列表 */}
      {importJobs.length > 0 && (
        <>
          <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
            导入任务
          </Title>
          
          <List
            dataSource={importJobs}
            renderItem={job => (
              <List.Item>
                <List.Item.Meta
                  avatar={<FileTextOutlined />}
                  title={
                    <Space>
                      <Text>{job.fileName}</Text>
                      <Tag color={getJobStatusColor(job.status)}>
                        {getJobStatusText(job.status)}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {(job.fileSize / 1024).toFixed(2)} KB
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {job.totalConfigs} 个配置
                        </Text>
                      </Space>
                      
                      <Progress
                        percent={job.progress}
                        status={job.status === 'failed' ? 'exception' : 
                               job.status === 'completed' ? 'success' : 'active'}
                        size="small"
                      />
                      
                      {job.status === 'completed' && (
                        <Space>
                          <Tag color="success" style={{ fontSize: 12 }}>
                            <CheckCircleOutlined /> 成功: {job.importedConfigs}
                          </Tag>
                          {job.failedConfigs > 0 && (
                            <Tag color="error" style={{ fontSize: 12 }}>
                              <CloseCircleOutlined /> 失败: {job.failedConfigs}
                            </Tag>
                          )}
                        </Space>
                      )}
                      
                      {job.errors.length > 0 && (
                        <Alert
                          message="错误信息"
                          description={
                            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                              {job.errors.map((error, index) => (
                                <li key={index}>{error}</li>
                              ))}
                            </ul>
                          }
                          type="error"
                          showIcon

                        />
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </>
      )}
      
      {/* 统计信息 */}
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="总配置数"
              value={configs.length}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="今日导入"
              value={importJobs.filter(job => 
                new Date(job.startTime).toDateString() === new Date().toDateString()
              ).length}
              prefix={<ImportOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="导入成功率"
              value={importJobs.length > 0 ? 
                Math.round(importJobs.reduce((sum, job) => sum + job.importedConfigs, 0) / 
                importJobs.reduce((sum, job) => sum + job.totalConfigs, 0) * 100) : 0}
              suffix="%"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="进行中任务"
              value={importJobs.filter(job => 
                job.status === 'parsing' || job.status === 'validating' || job.status === 'importing'
              ).length}
              prefix={<ReloadOutlined spin />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>
    </Card>
  );
};


export default ImportExportPanel;