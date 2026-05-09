import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, Modal, Form, Input, Select,
  message, Row, Col, Statistic, Popconfirm, Switch, Divider, List, Badge,
  Tabs, Alert, InputNumber, Tooltip, Upload, Steps, Progress,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, PlayCircleOutlined, PauseCircleOutlined,
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  MessageOutlined, PictureOutlined, VideoCameraOutlined, PhoneOutlined,
  RobotOutlined, KeyOutlined, SearchOutlined, UserOutlined, SwapOutlined,
  ThunderboltOutlined, ApiOutlined, SettingOutlined, EyeOutlined, EditOutlined,
  SaveOutlined, PlusCircleOutlined, MinusCircleOutlined,
  UserAddOutlined, CommentOutlined, HeartOutlined, AppstoreOutlined,
  DesktopOutlined, TeamOutlined,
} from '@ant-design/icons';
import { Checkbox } from 'antd';
import dayjs from 'dayjs';
import AppLayout from '../components/AppLayout';
import api from '../services/api';
import { useT, useI18n } from '../i18n';
import { translateLogMessage } from '../i18n/logTranslator';
import { formatAccountNumber } from '../services/accounts';
import { warmupService, WarmupProgress, computePackageInfoFromProgress, formatProgressText, getPackageModeLabel, getPackageModeColor } from '../services/warmup';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
type TaskType = 'auto_chat' | 'auto_post_image' | 'auto_post_video' | 'auto_call' | 'account_sync' | 'auto_simulate'
  | 'auto_add_friends' | 'auto_accept_requests' | 'auto_comment' | 'auto_follow' | 'auto_combo' | 'auto_join_group' | 'auto_warmup';

interface Task {
  id: string;
  name: string;
  accountName: string;
  taskType: TaskType;
  status: TaskStatus;
  scheduledAt: string;
  lastExecutedAt?: string;
  repeatCycle?: string;
  errorReason?: string;
  batchId?: string;
  batchGroup?: number;
}

// 50 chat scripts
const CHAT_SCRIPTS = Array.from({ length: 50 }, (_, i) => ({
  id: `script-${i + 1}`,
  title: `聊天模式${i + 1}`,
  preview: '点击选择此聊天模式...',
  rounds: Math.floor(Math.random() * 8) + 3,
  category: ['推广', '问候', '活动', '售后', '邀请'][i % 5],
}));

const AI_MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (OpenAI)' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (OpenAI)' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet (Anthropic)' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku (Anthropic)' },
  { value: 'gemini-pro', label: 'Gemini Pro (Google)' },
];

const initialTasks: Task[] = [
  { id: '1', name: '每日自动问候', accountName: 'John Doe', taskType: 'auto_chat', status: 'running', scheduledAt: '2026-04-13T09:00:00Z', lastExecutedAt: '2026-04-13T09:00:05Z' },
  { id: '2', name: '产品推广发帖', accountName: 'Jane Smith', taskType: 'auto_post_image', status: 'completed', scheduledAt: '2026-04-13T08:00:00Z', lastExecutedAt: '2026-04-13T08:00:12Z' },
  { id: '3', name: '账号信息同步', accountName: 'Bryan Geh', taskType: 'account_sync', status: 'pending', scheduledAt: '2026-04-14T10:00:00Z' },
  { id: '4', name: '夜间互动任务', accountName: 'John Doe', taskType: 'auto_chat', status: 'failed', scheduledAt: '2026-04-12T23:00:00Z', lastExecutedAt: '2026-04-12T23:01:30Z' },
  { id: '5', name: '每周群发公告', accountName: 'Jane Smith', taskType: 'auto_post_image', status: 'pending', scheduledAt: '2026-04-15T22:00:00Z' },
];

// 注：text 字段存 i18n key，render 时用 t(c.text) 翻译
const TASK_TYPE_CONFIG: Record<TaskType, { color: string; text: string; icon: React.ReactNode }> = {
  auto_chat:            { color: 'blue',     text: 'tasks.taskType_auto_chat',            icon: <MessageOutlined /> },
  auto_post_image:      { color: 'purple',   text: 'tasks.taskType_auto_post_image',      icon: <PictureOutlined /> },
  auto_post_video:      { color: 'magenta',  text: 'tasks.taskType_auto_post_video',      icon: <VideoCameraOutlined /> },
  auto_call:            { color: 'green',    text: 'tasks.taskType_auto_call',            icon: <PhoneOutlined /> },
  account_sync:         { color: 'orange',   text: 'tasks.taskType_account_sync',         icon: <SwapOutlined /> },
  auto_simulate:        { color: 'cyan',     text: 'tasks.taskType_auto_simulate',        icon: <EyeOutlined /> },
  auto_add_friends:     { color: 'geekblue', text: 'tasks.taskType_auto_add_friends',     icon: <UserAddOutlined /> },
  auto_accept_requests: { color: 'green',    text: 'tasks.taskType_auto_accept_requests', icon: <CheckCircleOutlined /> },
  auto_comment:         { color: 'gold',     text: 'tasks.taskType_auto_comment',         icon: <CommentOutlined /> },
  auto_follow:          { color: 'volcano',  text: 'tasks.taskType_auto_follow',          icon: <HeartOutlined /> },
  auto_combo:           { color: 'purple',   text: 'tasks.taskType_auto_combo',           icon: <AppstoreOutlined /> },
  auto_join_group:      { color: 'cyan',     text: 'tasks.taskType_auto_join_group',      icon: <TeamOutlined /> },
  auto_warmup:          { color: 'orange',   text: 'tasks.taskType_auto_warmup',          icon: <ThunderboltOutlined /> },
};

const STATUS_CONFIG: Record<TaskStatus, { color: string; icon: React.ReactNode; text: string }> = {
  pending:   { color: 'default', icon: <ClockCircleOutlined />, text: 'tasks.status_pending' },
  running:   { color: 'blue',    icon: <LoadingOutlined />,     text: 'tasks.status_running' },
  completed: { color: 'green',   icon: <CheckCircleOutlined />, text: 'tasks.status_completed' },
  failed:    { color: 'red',     icon: <CloseCircleOutlined />, text: 'tasks.status_failed' },
};

// ─── AI Settings Modal ───────────────────────────────────────────────────────
const AISettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const t = useT();
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTest = async () => {
    const values = form.getFieldsValue();
    if (!values.apiKey) { message.warning(t('tasks.aiApiKeyWarning')); return; }
    setTesting(true);
    setTestResult(null);
    try {
      await new Promise(r => setTimeout(r, 1500));
      setTestResult({ ok: true, msg: t('tasks.aiTestSuccess', { model: values.model || 'gpt-4o' }) });
    } catch {
      setTestResult({ ok: false, msg: t('tasks.aiTestFailed') });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    localStorage.setItem('ai_settings', JSON.stringify(values));
    message.success(t('tasks.aiSaved'));
    onClose();
  };

  useEffect(() => {
    if (open) {
      const saved = localStorage.getItem('ai_settings');
      if (saved) form.setFieldsValue(JSON.parse(saved));
    }
  }, [open, form]);

  return (
    <Modal title={<Space><RobotOutlined style={{ color: '#722ed1' }} /> {t('tasks.aiAssistTitle')}</Space>}
      open={open} onOk={handleSave} onCancel={onClose} okText={t('tasks.aiSave')} cancelText={t('tasks.aiCancel')} width={520}>
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="provider" label={t('tasks.aiProvider')} initialValue="openai">
          <Select>
            <Option value="openai">OpenAI</Option>
            <Option value="anthropic">Anthropic (Claude)</Option>
            <Option value="google">Google (Gemini)</Option>
          </Select>
        </Form.Item>
        <Form.Item name="model" label={t('tasks.aiModel')} initialValue="gpt-4o">
          <Select showSearch>
            {AI_MODELS.map(m => <Option key={m.value} value={m.value}>{m.label}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="apiKey" label={t('tasks.aiApiKey')} rules={[{ required: true, message: t('tasks.aiApiKeyRequired') }]}>
          <Input.Password prefix={<KeyOutlined />} placeholder="sk-..." />
        </Form.Item>
        <Form.Item name="baseUrl" label={t('tasks.aiBaseUrl')} extra={t('tasks.aiBaseUrlExtra')}>
          <Input placeholder="https://api.openai.com/v1" />
        </Form.Item>
        <Form.Item name="temperature" label={t('tasks.aiTemperature')} initialValue={0.7}>
          <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
        </Form.Item>
        <Space>
          <Button icon={<ThunderboltOutlined />} loading={testing} onClick={handleTest}>
            {t('tasks.aiTest')}
          </Button>
          {testResult && (
            <Tag color={testResult.ok ? 'green' : 'red'}>
              {testResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />} {testResult.msg}
            </Tag>
          )}
        </Space>
      </Form>
    </Modal>
  );
};

// ─── Script Selector ─────────────────────────────────────────────────────────
const ScriptSelector: React.FC<{
  value?: string;
  onChange?: (v: string) => void;
  scripts?: typeof CHAT_SCRIPTS;
}> = ({ value, onChange, scripts: propScripts }) => {
  const t = useT();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('全部');
  const sourceScripts = propScripts || CHAT_SCRIPTS;

  const filtered = sourceScripts.filter(s =>
    (category === '全部' || s.category === category) &&
    (!search || s.title.includes(search))
  );

  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
        <Space>
          <Input
            size="small"
            prefix={<SearchOutlined />}
            placeholder={t('tasks.scriptSearch')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 160 }}
          />
          <Select size="small" value={category} onChange={setCategory} style={{ width: 80 }}>
            {['全部', '推广', '问候', '活动', '售后', '邀请'].map(c => <Option key={c} value={c}>{c === '全部' ? t('tasks.scriptCategoryAll') : c}</Option>)}
          </Select>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('tasks.scriptCountSuffix', { count: filtered.length })}</Text>
        </Space>
      </div>
      <div style={{ height: 200, overflowY: 'auto' }}>
        <List
          size="small"
          dataSource={filtered as typeof CHAT_SCRIPTS}
          renderItem={script => (
            <List.Item
              onClick={() => onChange?.(script.id)}
              style={{
                cursor: 'pointer',
                padding: '6px 12px',
                background: value === script.id ? '#e6f4ff' : 'transparent',
                borderLeft: value === script.id ? '3px solid #1677ff' : '3px solid transparent',
              }}
            >
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space direction="vertical" size={0}>
                  <Text strong style={{ fontSize: 13 }}>{script.title}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{script.preview}</Text>
                </Space>
                <Space direction="vertical" size={0} style={{ textAlign: 'right', minWidth: 60 }}>
                  <Tag color="blue" style={{ fontSize: 10 }}>{script.category}</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>{t('chatScripts.roundsSuffix', { count: script.rounds })}</Text>
                </Space>
              </Space>
            </List.Item>
          )}
        />
      </div>
    </div>
  );
};

// ─── Script Editor Modal ──────────────────────────────────────────────────────
const ScriptEditorModal: React.FC<{
  scriptId: string | null;
  onClose: () => void;
}> = ({ scriptId, onClose }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!scriptId) return;
    api.get(`/chat-scripts/${scriptId}`).then(res => {
      const s = res.data?.data || res.data;
      form.setFieldsValue({
        title: s.title,
        goal: s.goal,
        systemPrompt: s.systemPrompt,
        phases: s.phases?.length ? s.phases : [{ label: '第一阶段', messages: [''] }],
      });
    }).catch(() => {});
  }, [scriptId, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await api.put(`/chat-scripts/${scriptId}`, values);
      message.success('剧本已保存');
      onClose();
    } catch {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={<Space><EditOutlined style={{ color: '#1677ff' }} /> 编辑聊天剧本</Space>}
      open={!!scriptId}
      onOk={handleSave}
      onCancel={onClose}
      okText={<Space><SaveOutlined />保存</Space>}
      cancelText="取消"
      width={680}
      confirmLoading={saving}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item name="title" label="剧本名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="goal" label="对话目标" extra="告诉 AI 这个剧本的最终目的（AI 模式下使用）">
          <TextArea rows={2} placeholder="例如：引导用户了解我们的产品，最终促成下单或留下联系方式" />
        </Form.Item>
        <Form.Item name="systemPrompt" label="AI 系统提示词" extra="AI 模式下发给 AI 的角色设定，留空则使用默认提示词">
          <TextArea rows={3} placeholder="例如：你是一个友善的Facebook销售助手，用轻松自然的语气和用户聊天..." />
        </Form.Item>

        <Divider>对话阶段（非AI模式逐条发送）</Divider>

        <Form.List name="phases">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field, idx) => (
                <Card
                  key={field.key}
                  size="small"
                  style={{ marginBottom: 12 }}
                  title={
                    <Space>
                      <Tag color="blue">第 {idx + 1} 阶段</Tag>
                      <Form.Item {...field} name={[field.name, 'label']} noStyle>
                        <Input size="small" style={{ width: 160 }} placeholder="阶段名称" />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'sender']} noStyle initialValue={idx % 2 === 0 ? 'A' : 'B'}>
                        <Select size="small" style={{ width: 120 }}>
                          <Option value="A">
                            <Tag color="blue" style={{ margin: 0 }}>账号 A 发送</Tag>
                          </Option>
                          <Option value="B">
                            <Tag color="green" style={{ margin: 0 }}>账号 B 发送</Tag>
                          </Option>
                        </Select>
                      </Form.Item>
                    </Space>
                  }
                  extra={
                    fields.length > 1 && (
                      <Button size="small" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                    )
                  }
                >
                  <Form.List name={[field.name, 'messages']}>
                    {(msgFields, { add: addMsg, remove: removeMsg }) => (
                      <>
                        {msgFields.map((msgField, mIdx) => (
                          <Space key={msgField.key} style={{ display: 'flex', marginBottom: 6 }} align="start">
                            <Tag style={{ marginTop: 4 }}>{mIdx + 1}</Tag>
                            <Form.Item {...msgField} noStyle>
                              <Input.TextArea
                                rows={2}
                                style={{ width: 400 }}
                                placeholder="输入发送的消息内容..."
                              />
                            </Form.Item>
                            <Button
                              size="small"
                              danger
                              icon={<MinusCircleOutlined />}
                              onClick={() => removeMsg(msgField.name)}
                            />
                          </Space>
                        ))}
                        <Button
                          size="small"
                          icon={<PlusCircleOutlined />}
                          onClick={() => addMsg('')}
                          style={{ marginTop: 4 }}
                        >
                          添加消息
                        </Button>
                      </>
                    )}
                  </Form.List>
                </Card>
              ))}
              <Button
                icon={<PlusOutlined />}
                onClick={() => add({
                  label: `第 ${fields.length + 1} 阶段`,
                  sender: fields.length % 2 === 0 ? 'A' : 'B',
                  messages: [''],
                })}
              >
                添加阶段
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
// ─── Execution Log Modal ──────────────────────────────────────────────────────
const LOG_LEVEL_COLOR: Record<string, string> = {
  info: '#1677ff',
  success: '#52c41a',
  warn: '#faad14',
  error: '#f5222d',
};

const ExecutionLogModal: React.FC<{
  taskId: string | null;
  taskName: string;
  onClose: () => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
}> = ({ taskId, taskName, onClose, onStatusChange }) => {
  const t = useT();
  const { locale } = useI18n();
  const [logs, setLogs] = useState<Array<{ time: string; level: string; message: string }>>([]);
  const [status, setStatus] = useState<string>('running');
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [startTime, setStartTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const logEndRef = React.useRef<HTMLDivElement>(null);

  // Use ref for onStatusChange to avoid infinite loop:
  // The parent passes an inline arrow function which creates a new reference on every render.
  // If we put it in useEffect deps, it triggers re-run → setLogs → parent re-render → new ref → loop.
  const onStatusChangeRef = React.useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  // Parse total duration from log messages (e.g. "模拟时长：10 分钟")
  const totalSeconds = React.useMemo(() => {
    const match = logs.find(l => l.message.includes('模拟时长'));
    if (!match) return 0;
    const m = match.message.match(/(\d+)\s*分钟/);
    return m ? parseInt(m[1]) * 60 : 0;
  }, [logs]);

  useEffect(() => {
    if (!taskId) return;
    setLogs([]);
    setStatus('running');
    setErrorReason(null);
    // 切换任务时重置起始时间（以该任务首条日志的时间戳为准，fetchLogs 里会校准）
    setStartTime(Date.now());
    setElapsed(0);
    setStopping(false);

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let elapsedInterval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    // Helper: stop ALL timers when task finishes
    const stopAllTimers = () => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null; }
    };

    const fetchLogs = async () => {
      try {
        const res = await api.get(`/tasks/${taskId}/logs`);
        const data = res.data?.data || res.data;
        if (cancelled) return 'running';
        const logList = data?.logs || [];
        setLogs(logList);
        // 用首条日志的时间戳校准 startTime，避免组件复用导致时间错乱
        if (logList.length > 0 && logList[0].timestamp) {
          const firstTs = new Date(logList[0].timestamp).getTime();
          if (!Number.isNaN(firstTs)) setStartTime(firstTs);
        }
        const s = data?.status || 'running';
        setStatus(s);
        if (data?.errorReason) setErrorReason(data.errorReason);
        return s;
      } catch {}
      return 'running';
    };

    // Start elapsed timer immediately
    elapsedInterval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);

    // Fetch immediately on open
    fetchLogs().then(s => {
      if (cancelled) return;
      if (s === 'completed' || s === 'failed' || s === 'cancelled') {
        stopAllTimers();
        onStatusChangeRef.current?.(taskId, s as TaskStatus);
        return; // Already done — no need to poll
      }
      // Only poll if still running
      pollInterval = setInterval(async () => {
        const s2 = await fetchLogs();
        if (cancelled) return;
        if (s2 === 'completed' || s2 === 'failed' || s2 === 'cancelled') {
          stopAllTimers();
          onStatusChangeRef.current?.(taskId, s2 as TaskStatus);
        }
      }, 2000);
    });

    // Cleanup: clear ALL intervals on unmount or taskId change
    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      if (elapsedInterval) clearInterval(elapsedInterval);
    };
  }, [taskId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const isDone = status === 'completed' || status === 'failed' || status === 'cancelled';

  const handleStop = async () => {
    if (!taskId) return;
    setStopping(true);
    try {
      await api.post(`/tasks/${taskId}/cancel`);
      setStatus('cancelled');
      onStatusChange?.(taskId, 'failed');
      message.info('已发送停止信号，浏览器将在当前操作完成后关闭');
    } catch {
      message.error('停止失败');
    } finally {
      setStopping(false);
    }
  };

  const progressPct = totalSeconds > 0 ? Math.min(100, Math.round((elapsed / totalSeconds) * 100)) : 0;

  return (
    <Modal
      title={
        <Space>
          {isDone
            ? <CheckCircleOutlined style={{ color: status === 'completed' ? '#52c41a' : '#f5222d' }} />
            : <LoadingOutlined style={{ color: '#1677ff' }} />}
          {t('tasks.executionLog')}: {taskName}
          <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : status === 'cancelled' ? 'default' : 'processing'}>
            {status === 'completed' ? `✅ ${t('tasks.status_completed')}` : status === 'failed' ? `❌ ${t('tasks.status_failed')}` : status === 'cancelled' ? `⏹ ${t('tasks.status_cancelled')}` : `⚙️ ${t('tasks.running')}...`}
          </Tag>
        </Space>
      }
      open={!!taskId}
      onCancel={onClose}
      footer={
        <Space>
          {!isDone && (
            <Button danger loading={stopping} onClick={handleStop} icon={<CloseCircleOutlined />}>
              {t('tasks.forceStop')}
            </Button>
          )}
          <Button onClick={onClose}>{t('tasks.close')}</Button>
        </Space>
      }
      width={700}
    >
      {/* Progress bar for timed tasks */}
      {totalSeconds > 0 && !isDone && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 4 }}>
            <span>⏱ {t('tasks.elapsedTime', { m: Math.floor(elapsed / 60), s: elapsed % 60 })}</span>
            <span>{t('tasks.estTotalTime', { m: Math.floor(totalSeconds / 60) })}</span>
          </div>
          <div style={{ background: '#1a1a2e', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{
              width: `${progressPct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #1677ff, #52c41a)',
              transition: 'width 1s linear',
              borderRadius: 4,
            }} />
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#555', marginTop: 2 }}>{progressPct}%</div>
        </div>
      )}

      {/* Failure reason banner */}
      {status === 'failed' && errorReason && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('tasks.logFailureTitle')}
          description={
            <div>
              <Text strong>{t('tasks.logFailureReason')}</Text>
              <Text code style={{ fontSize: 12, display: 'block', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {errorReason}
              </Text>
              <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                {t('tasks.logFailureHint')}
              </div>
            </div>
          }
        />
      )}

      <div style={{
        background: '#0d1117',
        borderRadius: 8,
        padding: '12px 16px',
        minHeight: 280,
        maxHeight: 380,
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: 13,
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', paddingTop: 60 }}>
            {isDone ? (
              <>
                <CheckCircleOutlined style={{ fontSize: 24, marginBottom: 8, color: '#555' }} />
                <div>{t('tasks.logEmptyDone')}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: '#444' }}>{t('tasks.logEmptyHint')}</div>
              </>
            ) : (
              <>
                <LoadingOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                <div>{t('tasks.logWaiting')}</div>
              </>
            )}
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ marginBottom: 4, color: LOG_LEVEL_COLOR[log.level] || '#e6edf3' }}>
              <span style={{ color: '#555', marginRight: 10 }}>[{log.time}]</span>
              <span>{translateLogMessage(log.message, locale)}</span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
      {!isDone && (
        <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
          <LoadingOutlined style={{ marginRight: 4 }} /> {t('tasks.autoRefreshNote')}
        </div>
      )}
    </Modal>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const TasksPage: React.FC = () => {
  const t = useT();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [warmupMap, setWarmupMap] = useState<Record<string, WarmupProgress>>({});
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [scriptEditorId, setScriptEditorId] = useState<string | null>(null);
  const [scripts, setScripts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [logModalTask, setLogModalTask] = useState<{ id: string; name: string } | null>(null);
  const [comboActions, setComboActions] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [batchSize, setBatchSize] = useState(4);
  const [headlessMode, setHeadlessMode] = useState(true); // VPS 默认无头
  const [form] = Form.useForm();

  const fetchTasks = () => {
    api.get('/tasks?limit=100').then(res => {
      const data = res.data?.data;
      const list = data?.tasks || (Array.isArray(data) ? data : []);
      setTasks(list.map((t: any) => ({
        id: t.id,
        name: t.name,
        accountName: t.executionData?.parameters?.accountName || t.accountId || '—',
        taskType: (t.taskAction || t.executionData?.parameters?.taskAction || 'account_sync') as TaskType,
        status: (t.status === 'queued' ? 'pending' : t.status) as any,
        scheduledAt: t.scheduledAt || t.createdAt,
        lastExecutedAt: t.completedAt,
        repeatCycle: t.scheduleConfig?.recurringType,
        errorReason: t.result?.error || undefined,
        batchId: t.executionData?.parameters?.batchId,
        batchGroup: t.executionData?.parameters?.batchGroup,
      })));
    }).catch(() => {});
  };

  useEffect(() => {
    api.get('/facebook-accounts?limit=100').then(res => {
      setAccounts(res.data?.data?.accounts || []);
    }).catch(() => {});
    api.get('/chat-scripts').then(res => {
      const list = res.data?.data || res.data || [];
      setScripts(Array.isArray(list) ? list : []);
    }).catch(() => {});
    fetchTasks();
    fetchWarmupMap();

    // Auto-refresh task list every 30s to reflect scheduled executions
    const refreshInterval = setInterval(() => {
      fetchTasks();
      fetchWarmupMap();
    }, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  const fetchWarmupMap = async () => {
    try {
      const list = await warmupService.listForUser();
      const map: Record<string, WarmupProgress> = {};
      for (const p of list) {
        map[p.accountId] = p;
        if (p.taskId) map[p.taskId] = p;
      }
      setWarmupMap(map);
    } catch {
      // ignore
    }
  };

  const totalTasks = tasks.length;
  const runningTasks = tasks.filter(t => t.status === 'running').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const failedTasks = tasks.filter(t => t.status === 'failed').length;

  const handleCreateClick = () => {
    form.resetFields();
    setTaskType(null);
    setAiEnabled(false);
    setComboActions([]);
    setBatchMode(false);
    setIsModalVisible(true);
  };

  const handleShowBrowser = async (task: Task) => {
    try {
      await api.post(`/tasks/${task.id}/show-browser`);
      message.success('浏览器窗口已打开（仅桌面环境有效）');
    } catch {
      message.error('操作失败');
    }
  };

  // Helper: build a single task payload for one accountId
  const buildPayload = (
    values: any,
    accountId: string,
    hl: boolean,
    batchMeta?: { batchId: string; batchGroup: number },
  ) => {
    const accA = accounts.find(a => a.id === accountId);
    const accB = accounts.find(a => a.id === values.accountBId);
    const labelA = accA ? `${formatAccountNumber(accA.accountNumber)} ${accA.name}`.trim() : accountId;
    const labelB = accB ? `${formatAccountNumber(accB.accountNumber)} ${accB.name}`.trim() : '';
    const accountName = labelB ? `${labelA} ↔ ${labelB}` : labelA;
    return {
      name: values.name,
      type: values.scheduledAt ? 'scheduled' : 'immediate',
      taskAction: values.taskType,
      accountId,
      accountBId: values.accountBId,
      scheduleConfig: values.scheduledAt ? { scheduledAt: new Date(values.scheduledAt) } : undefined,
      executionData: {
        scriptId: values.taskType,
        scriptType: 'dialogue',
        targets: [],
        parameters: {
          taskAction: values.taskType,
          accountName,
          accountAId: accountId,
          accountBId: values.accountBId,
          headless: hl,
          ...(batchMeta ?? {}),
          scriptId: values.scriptId,
          aiEnabled: values.aiEnabled,
          content: values.postContent,
          imageUrls: values.imageUrls,
          videoUrl: values.videoUrl,
          callDuration: values.callDuration,
          syncAccountIds: values.syncAccountIds,
          durationMinutes: values.durationMinutes,
          warmingActions: values.warmingActions,
          dailyLimit: values.dailyLimit,
          prioritizeMutual: values.prioritizeMutual,
          maxCount: values.maxCount,
          comments: typeof values.comments === 'string'
            ? values.comments.split('\n').map((s: string) => s.trim()).filter(Boolean)
            : values.comments,
          delayMin: values.delayMin,
          delayMax: values.delayMax,
          // v1.3.1 —— auto_join_group per-task settings
          joinKeywords: values.joinKeywords,
          joinCount: values.joinCount,
          joinDelayMin: values.joinDelayMin,
          joinDelayMax: values.joinDelayMax,
          joinAiAnswer: values.joinAiAnswer,
          joinAiProvider: values.joinAiProvider,
          joinAiApiKey: values.joinAiApiKey,
          joinAiPrompt: values.joinAiPrompt,
          comboActions: values.taskType === 'auto_combo' ? comboActions.map(type => ({
            type,
            ...(type === 'auto_accept_requests' && { maxCount: values.comboAcceptMax }),
            ...(type === 'auto_add_friends' && {
              dailyLimit: values.comboAddLimit,
              delayMin: values.comboAddDelayMin,
              delayMax: values.comboAddDelayMax,
              prioritizeMutual: true,
            }),
            ...(type === 'auto_comment' && {
              comments: typeof values.comboComments === 'string'
                ? values.comboComments.split('\n').map((s: string) => s.trim()).filter(Boolean)
                : ['👍', '非常棒！', '赞！'],
              dailyLimit: values.comboCommentLimit,
              delayMin: values.comboCommentDelayMin,
              delayMax: values.comboCommentDelayMax,
            }),
            ...(type === 'auto_follow' && {
              dailyLimit: values.comboFollowLimit,
              delayMin: values.comboFollowDelayMin,
              delayMax: values.comboFollowDelayMax,
            }),
          })) : undefined,
        },
      },
    };
  };

  const handleModalOk = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }

    // v1.3.0 ── auto_warmup 走专门的 warmup batch API
    if (values.taskType === 'auto_warmup') {
      setSubmitting(true);
      try {
        const targetType = values.warmupTargetType;
        const packageMode = values.warmupPackageMode || 'P1+P2';
        const result = await warmupService.batch({
          packageMode,
          accountIds: targetType === 'accounts' ? values.warmupAccountIds : undefined,
          groupNumber: targetType === 'group' ? values.warmupGroupNumber : undefined,
        });
        const started = Array.isArray(result?.started) ? result.started : [];
        const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
        if (started.length > 0) {
          message.success(t('tasks.warmupBatchSuccess', { count: started.length }));
        }
        if (skipped.length > 0) {
          const lines = skipped.map((s: any) => `#${s.accountNumber ?? '?'}: ${s.reason}`).join('\n');
          message.warning({
            content: t('tasks.warmupBatchSkipped', { count: skipped.length }),
            duration: 5,
          });
          console.warn('Warmup skipped:', lines);
        }
        // 如果两个数组都空但没出错，也提示一下避免沉默失败
        if (started.length === 0 && skipped.length === 0) {
          message.info(t('tasks.warmupBatchEmpty') || '未启动任何账号（检查目标选择是否有效）');
        }
        setIsModalVisible(false);
        form.resetFields();
        fetchTasks();
      } catch (err: any) {
        message.error(err?.response?.data?.message || t('tasks.warmupBatchFailed'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Social task types that support multi-account batch mode
    const socialTypes: TaskType[] = ['auto_combo', 'auto_add_friends', 'auto_accept_requests', 'auto_comment', 'auto_follow', 'auto_simulate', 'auto_post_image', 'auto_post_video'];
    const isBatchable = socialTypes.includes(values.taskType);
    const isBatch = batchMode && isBatchable && Array.isArray(values.batchAccountIds) && values.batchAccountIds.length > 1;

    setSubmitting(true);
    try {
      if (!isBatch) {
        // ── Single account ─────────────────────────────────────────────────
        const singleAccountId = values.accountAId || values.accountId;
        const payload = buildPayload(values, singleAccountId, headlessMode);
        const res = await api.post('/tasks', payload);
        // ⚠️ 变量名不能用 t — 会覆盖 useT() 返回的翻译函数！
        const createdTask = res.data?.data || res.data;
        const accA = accounts.find(a => a.id === singleAccountId);
        const accB = accounts.find(a => a.id === values.accountBId);
        const accountName = accA ? `${accA.name}${accB ? ` ↔ ${accB.name}` : ''}` : '-';
        const newTask: Task = {
          id: createdTask.id || Date.now().toString(),
          name: values.name,
          accountName,
          taskType: values.taskType,
          status: 'pending',
          scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : new Date().toISOString(),
          repeatCycle: values.repeatCycle,
        };
        setTasks(prev => [newTask, ...prev]);
        message.success(t('tasks.created'));
      } else {
        // ── Batch: multiple accounts, split into groups ────────────────────
        const batchId = crypto.randomUUID();
        const accountIds: string[] = values.batchAccountIds;
        const taskPayloads = accountIds.map((accountId, index) =>
          buildPayload(values, accountId, headlessMode, {
            batchId,
            batchGroup: Math.floor(index / batchSize),
          })
        );
        const res = await api.post('/tasks/batch', { tasks: taskPayloads });
        const groups = Math.ceil(accountIds.length / batchSize);
        message.success(`已创建 ${res.data?.count ?? taskPayloads.length} 个任务，分 ${groups} 批依次执行`);
        fetchTasks();
      }

      setIsModalVisible(false);
      form.resetFields();
      setBatchMode(false);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('tasks.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/tasks/${id}`);
    } catch (_) { /* ignore if not found */ }
    setTasks(prev => prev.filter(task => task.id !== id));
    message.success(t('tasks.deleted'));
  };

  const handleToggle = (task: Task) => {
    setTasks(prev => prev.map(t => t.id === task.id ? {
      ...t,
      status: t.status === 'running' ? 'pending' : 'running',
    } : t));
    message.info(task.status === 'running' ? '任务已暂停' : '任务已启动');
  };

  const handleExecute = async (task: Task) => {
    try {
      await api.post(`/tasks/${task.id}/execute`);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'running' } : t));
      setLogModalTask({ id: task.id, name: task.name });
    } catch (err: any) {
      message.error(err?.response?.data?.message || '启动失败');
    }
  };

  const handleReset = async (task: Task) => {
    try {
      await api.post(`/tasks/${task.id}/reset`);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'pending' } : t));
      message.success('任务已重置为待执行状态');
    } catch {
      message.error('重置失败');
    }
  };

  const columns = [
    {
      title: t('tasks.colName'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Task) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          {record.batchId !== undefined && (
            <Tag color="geekblue" style={{ fontSize: 10, lineHeight: '16px' }}>
              第 {(record.batchGroup ?? 0) + 1} 批 · {record.batchId.slice(0, 8)}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('tasks.colAccount'),
      dataIndex: 'accountName',
      key: 'accountName',
      render: (name: string) => <Text style={{ fontSize: 12 }}>{name}</Text>,
    },
    {
      title: t('tasks.colType'),
      dataIndex: 'taskType',
      key: 'taskType',
      render: (type: TaskType) => {
        const c = TASK_TYPE_CONFIG[type];
        if (!c) return <Tag color="default">{type || t('tasks.statusUnknown')}</Tag>;
        return <Tag color={c.color} icon={c.icon}>{t(c.text)}</Tag>;
      },
    },
    {
      title: t('tasks.colStatus'),
      key: 'status',
      width: 220,
      render: (_: any, record: Task) => {
        // v1.3.0 —— 养号任务显示进度条替代普通 status tag
        if (record.taskType === 'auto_warmup') {
          const matching = warmupMap[record.id];
          if (matching) {
            const info = computePackageInfoFromProgress(matching);
            return (
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Tag
                    color={getPackageModeColor(matching.packageMode)}
                    style={{ margin: 0, fontSize: 11, padding: '0 6px', lineHeight: '18px' }}
                  >
                    {getPackageModeLabel(matching.packageMode)}
                  </Tag>
                  <Text style={{ fontSize: 11, color: '#666' }}>{formatProgressText(matching)}</Text>
                </div>
                <Progress
                  percent={info.progressPercent}
                  size="small"
                  status={info.isMaintenance ? 'success' : 'active'}
                  strokeColor={info.isMaintenance ? '#52c41a' : info.packageNumber === 1 ? '#1890ff' : '#faad14'}
                  showInfo={false}
                />
              </Space>
            );
          }
        }
        const c = STATUS_CONFIG[record.status];
        const tagText = c ? t(c.text) : (record.status || t('tasks.statusUnknown'));
        const tag = <Tag color={c?.color || 'default'} icon={c?.icon}>{tagText}</Tag>;
        if (record.status === 'failed' && record.errorReason) {
          return (
            <Tooltip
              title={
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>❌ 失败原因：</div>
                  <div style={{ maxWidth: 300, wordBreak: 'break-word' }}>{record.errorReason}</div>
                </div>
              }
              color="#ff4d4f"
            >
              <span style={{ cursor: 'help' }}>{tag} <Text type="danger" style={{ fontSize: 11 }}>悬停查看原因</Text></span>
            </Tooltip>
          );
        }
        return tag;
      },
    },
    {
      title: t('tasks.colScheduled'),
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      render: (date: string) => <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(date).format('YYYY-MM-DD HH:mm')}</Text>,
    },
    {
      title: t('tasks.colLastExec'),
      dataIndex: 'lastExecutedAt',
      key: 'lastExecutedAt',
      render: (date?: string) => date
        ? <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(date).format('MM-DD HH:mm')}</Text>
        : <Text type="secondary">-</Text>,
    },
    {
      title: t('tasks.colActions'),
      key: 'actions',
      render: (_: any, record: Task) => (
        <Space size="small">
          <Space size={4}>
            {record.status === 'running' ? (
              <>
                <Button size="small" icon={<LoadingOutlined />}
                  onClick={() => setLogModalTask({ id: record.id, name: record.name })}>
                  查看日志
                </Button>
                <Tooltip title="在桌面打开浏览器窗口（VPS 上无效，仅本地调试）">
                  <Button size="small" icon={<DesktopOutlined />}
                    onClick={() => handleShowBrowser(record)}>
                    查看窗口
                  </Button>
                </Tooltip>
                <Tooltip title={t('tasks.resetTooltip')}>
                  <Popconfirm
                    title={t('tasks.resetConfirm')}
                    onConfirm={() => handleReset(record)}
                    okText="重置" cancelText="取消"
                  >
                    <Button size="small" icon={<CloseCircleOutlined />} style={{ color: '#faad14' }} type="text" />
                  </Popconfirm>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip title={t('tasks.executeNow')}>
                  <Button type="primary" size="small" icon={<PlayCircleOutlined />}
                    onClick={() => handleExecute(record)}>
                    ▶ {t('tasks.executeAction')}
                  </Button>
                </Tooltip>
                <Tooltip title={t('tasks.viewLogs')}>
                  <Button size="small" icon={<SearchOutlined />}
                    onClick={() => setLogModalTask({ id: record.id, name: record.name })}>
                    {t('tasks.logAction')}
                  </Button>
                </Tooltip>
              </>
            )}
            <Popconfirm title={t('tasks.deleteConfirm')} onConfirm={() => handleDelete(record.id)} okText={t('tasks.deleteOk')} cancelText={t('tasks.deleteCancel')}>
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        </Space>
      ),
    },
  ];

  return (
    <AppLayout>
      <div style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>{t('tasks.title')}</Title>
            <Text type="secondary">{t('tasks.pageSubtitle')}</Text>
          </Col>
          <Col>
            <Space>
              <Tooltip title="AI 辅助设置">
                <Button icon={<RobotOutlined />} onClick={() => setAiModalVisible(true)}>{t('tasks.aiSettings')}</Button>
              </Tooltip>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateClick} size="large">{t('tasks.createButton')}</Button>
            </Space>
          </Col>
        </Row>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          { title: t('tasks.statTotal'), value: totalTasks, color: '#1890ff', icon: <ClockCircleOutlined /> },
          { title: t('tasks.statRunning'), value: runningTasks, color: '#1677ff', icon: runningTasks > 0 ? <LoadingOutlined /> : <PlayCircleOutlined /> },
          { title: t('tasks.statCompleted'), value: completedTasks, color: '#52c41a', icon: <CheckCircleOutlined /> },
          { title: t('tasks.statFailed'), value: failedTasks, color: '#f5222d', icon: <CloseCircleOutlined /> },
        ].map(s => (
          <Col key={s.title} xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic title={s.title} value={s.value} valueStyle={{ color: s.color }} prefix={s.icon} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Table columns={columns} dataSource={tasks} rowKey="id"
          pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条记录` }}
          scroll={{ x: 900 }} />
      </Card>

      {/* ─── Create Task Modal ─── */}
      <Modal
        title={<Space><PlusOutlined /> {t('tasks.createModalTitle')}</Space>}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => { setIsModalVisible(false); form.resetFields(); }}
        confirmLoading={submitting}
        okText={t('tasks.createButton')}
        cancelText={t('tasks.cancelText')}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>

          {/* Basic Info */}
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="name" label={t('tasks.taskNameLabel')} rules={[{ required: true, message: t('tasks.taskNameRequired') }]}>
                <Input placeholder={t('tasks.taskNamePlaceholder')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taskType" label={t('tasks.taskTypeLabel')} rules={[{ required: true, message: t('tasks.taskTypePlaceholder') }]}>
                <Select placeholder={t('tasks.taskTypePlaceholder')} onChange={(v: TaskType) => { setTaskType(v); setComboActions([]); }}>
                  <Option value="auto_chat"><MessageOutlined /> {t('tasks.taskType_auto_chat')}</Option>
                  <Option value="auto_post_image"><PictureOutlined /> {t('tasks.taskType_auto_post_image')}</Option>
                  <Option value="auto_post_video"><VideoCameraOutlined /> {t('tasks.taskType_auto_post_video')}</Option>
                  <Option value="account_sync"><SwapOutlined /> {t('tasks.taskType_account_sync')}</Option>
                  <Option value="auto_simulate"><EyeOutlined /> {t('tasks.taskType_auto_simulate')}</Option>
                  <Option value="auto_add_friends"><UserAddOutlined /> {t('tasks.taskType_auto_add_friends')}</Option>
                  <Option value="auto_accept_requests"><CheckCircleOutlined /> {t('tasks.taskType_auto_accept_requests')}</Option>
                  <Option value="auto_comment"><CommentOutlined /> {t('tasks.taskType_auto_comment')}</Option>
                  <Option value="auto_follow"><HeartOutlined /> {t('tasks.taskType_auto_follow')}</Option>
                  <Option value="auto_combo"><AppstoreOutlined /> {t('tasks.taskType_auto_combo')}</Option>
                  <Option value="auto_join_group"><TeamOutlined /> {t('tasks.taskType_auto_join_group')}</Option>
                  <Option value="auto_warmup"><ThunderboltOutlined style={{ color: '#fa8c16' }}/> {t('tasks.taskType_auto_warmup')}</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* ── Batch Mode + Chrome Mode controls ── */}
          {taskType && taskType !== 'auto_chat' && taskType !== 'auto_call' && taskType !== 'account_sync' && (
            <Row gutter={16} style={{ marginBottom: 8, padding: '8px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
              <Col span={8}>
                <Form.Item label={t('tasks.batchMode')} style={{ marginBottom: 0 }}>
                  <Switch checked={batchMode} onChange={v => setBatchMode(v)}
                    checkedChildren={t('common.yes')} unCheckedChildren={t('tasks.singleAccount')} />
                </Form.Item>
              </Col>
              {batchMode && (
                <Col span={8}>
                  <Form.Item label="Batch Size" style={{ marginBottom: 0 }}>
                    <InputNumber min={1} max={10} value={batchSize}
                      onChange={v => setBatchSize(v || 1)} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              )}
              <Col span={8}>
                <Form.Item label={t('tasks.chromeMode')} style={{ marginBottom: 0 }}>
                  <Switch checked={headlessMode} onChange={setHeadlessMode}
                    checkedChildren={t('tasks.headless')} unCheckedChildren={t('tasks.showWindow')} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {/* Auto Chat Settings */}
          {taskType === 'auto_chat' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#1677ff' }}>
                <MessageOutlined /> {t('tasks.chatAccountsTitle')}
              </Divider>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="accountAId" label={<><UserOutlined /> {t('tasks.accountARole')}</>}
                    rules={[{ required: true, message: t('tasks.selectAccountA') }]}>
                    <Select placeholder={t('tasks.selectAccountAPlaceholder')} showSearch optionFilterProp="children">
                      {accounts.map(a => (
                        <Option key={a.id} value={a.id} disabled={form.getFieldValue('accountBId') === a.id}>
                          {a.accountNumber != null && (
                            <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>
                          )}
                          <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{a.email}</Text>
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="accountBId" label={<><UserOutlined /> {t('tasks.accountBRole')}</>}
                    rules={[{ required: true, message: t('tasks.selectAccountB') }]}>
                    <Select placeholder={t('tasks.selectAccountBPlaceholder')} showSearch optionFilterProp="children">
                      {accounts.map(a => (
                        <Option key={a.id} value={a.id} disabled={form.getFieldValue('accountAId') === a.id}>
                          {a.accountNumber != null && (
                            <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>
                          )}
                          <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{a.email}</Text>
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Divider orientation="left" style={{ fontSize: 13, color: '#1677ff' }}>
                <MessageOutlined /> {t('tasks.scriptSelectorTitle').replace('50', String(scripts.length || CHAT_SCRIPTS.length))}
              </Divider>
              <Form.Item shouldUpdate={(prev, cur) => prev.scriptId !== cur.scriptId} noStyle>
                {() => {
                  const selectedId = form.getFieldValue('scriptId');
                  const selectedScript = scripts.find((s: any) => s.id === selectedId);
                  return (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Form.Item name="scriptId" rules={[{ required: true, message: t('tasks.scriptSelectorTitle') }]} noStyle>
                        <ScriptSelector
                          scripts={scripts.length ? scripts.map((s: any) => ({
                            id: s.id,
                            title: s.title,
                            preview: s.goal || '',
                            rounds: s.phases?.length || 3,
                            category: s.category || '推广',
                          })) : undefined}
                        />
                      </Form.Item>
                      {selectedId && (
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => setScriptEditorId(selectedId)}
                        >
                          {t('common.edit')}: {selectedScript?.title || selectedId}
                        </Button>
                      )}
                    </Space>
                  );
                }}
              </Form.Item>

              <Divider orientation="left" style={{ fontSize: 13, color: '#722ed1' }}>
                <RobotOutlined /> {t('tasks.aiAssistOpt')}
              </Divider>
              <Row align="middle" gutter={16} style={{ marginBottom: 16 }}>
                <Col>
                  <Space>
                    <Switch checked={aiEnabled} onChange={setAiEnabled} />
                    <Text>{t('tasks.aiAssistEnable')}</Text>
                  </Space>
                </Col>
                <Col>
                  <Button size="small" icon={<SettingOutlined />} onClick={() => setAiModalVisible(true)}>
                    {t('tasks.aiAssistConfig')}
                  </Button>
                </Col>
              </Row>
            </>
          )}

          {/* Auto Post Image */}
          {taskType === 'auto_post_image' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#722ed1' }}>
                <PictureOutlined /> {t('tasks.postImageSettings')}
              </Divider>
              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={t('tasks.postAccount')} rules={[{ required: true }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={t('tasks.selectPostingAccount')} showSearch optionFilterProp="children">
                  {accounts.map(a => <Option key={a.id} value={a.id}>
                    {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                    <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                  </Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="postContent" label={t('tasks.postContent')} rules={[{ required: true }]}>
                <TextArea rows={3} placeholder={t('tasks.postContentPlaceholder')} />
              </Form.Item>
              <Form.Item name="imageUrls" label={t('tasks.imageList')}>
                <TextArea rows={3} placeholder={t('tasks.imageListPlaceholder')} />
              </Form.Item>
            </>
          )}

          {/* Auto Post Video */}
          {taskType === 'auto_post_video' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#eb2f96' }}>
                <VideoCameraOutlined /> {t('tasks.postVideoSettings')}
              </Divider>
              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={t('tasks.postAccount')} rules={[{ required: true }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={t('tasks.selectPostingAccount')} showSearch optionFilterProp="children">
                  {accounts.map(a => <Option key={a.id} value={a.id}>
                    {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                    <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                  </Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="postContent" label={t('tasks.videoDescription')}>
                <TextArea rows={2} placeholder={t('tasks.videoDescPlaceholder')} />
              </Form.Item>
              <Form.Item name="videoUrl" label={t('tasks.videoUrl')} rules={[{ required: true }]}>
                <Input placeholder={t('tasks.videoUrlPlaceholder')} />
              </Form.Item>
            </>
          )}

          {/* Auto Call */}
          {taskType === 'auto_call' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#52c41a' }}>
                <PhoneOutlined /> 自动拨号设置
              </Divider>
              <Alert type="warning" showIcon message="注意：自动拨号功能需要账号已登录，且对方账号在线" style={{ marginBottom: 16 }} />
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="accountAId" label="拨号方账号" rules={[{ required: true, message: '请选择' }]}>
                    <Select placeholder="选择发起通话的账号">
                      {accounts.map(a => <Option key={a.id} value={a.id}>{a.name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="accountBId" label="接听方账号" rules={[{ required: true, message: '请选择' }]}>
                    <Select placeholder="选择接听通话的账号">
                      {accounts.map(a => <Option key={a.id} value={a.id}>{a.name}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="callDuration" label="通话时长（秒）" initialValue={30}>
                <InputNumber min={5} max={300} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {/* Account Sync */}
          {taskType === 'account_sync' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>
                <SwapOutlined /> 同步设置
              </Divider>
              <Form.Item name="accountAId" label="同步账号" rules={[{ required: true, message: '请选择' }]}>
                <Select placeholder="选择要同步的账号" mode="multiple">
                  {accounts.map(a => <Option key={a.id} value={a.id}>{a.name}</Option>)}
                </Select>
              </Form.Item>
            </>
          )}

          {/* Auto Simulate / Account Warming */}
          {taskType === 'auto_simulate' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#13c2c2' }}>
                <EyeOutlined /> {t('tasks.simulateSectionTitle')}
              </Divider>
              <Alert
                type="info" showIcon style={{ marginBottom: 16 }}
                message={t('tasks.simulateWarmupTitle')}
                description={t('tasks.simulateWarmupDesc')}
              />
              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={t('tasks.targetAccount')} rules={[{ required: true }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={t('tasks.selectTargetAccount')} showSearch optionFilterProp="children">
                  {accounts.map(a => (
                    <Option key={a.id} value={a.id}>
                      {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                      <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="durationMinutes" label={t('tasks.simulateDurationLabel')} initialValue={30}
                rules={[{ required: true }]}>
                <InputNumber min={5} max={120} step={5} style={{ width: '100%' }}
                  addonAfter={t('tasks.minutes')} />
              </Form.Item>
              <Form.Item name="warmingActions" label={t('tasks.executeActions')} initialValue={['scroll_feed', 'watch_video', 'like_post']}
                rules={[{ required: true }]}>
                <Checkbox.Group style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Checkbox value="scroll_feed">📰 {t('tasks.actionScrollFeed')}</Checkbox>
                  <Checkbox value="watch_video">🎬 {t('tasks.actionWatchVideo')}</Checkbox>
                  <Checkbox value="like_post">👍 {t('tasks.actionLikePost')}</Checkbox>
                  <Checkbox value="view_profile">👤 {t('tasks.actionBrowseFriend')}</Checkbox>
                  <Checkbox value="view_stories">📷 {t('tasks.actionViewStories')}</Checkbox>
                </Checkbox.Group>
              </Form.Item>
            </>
          )}

          {/* ── Auto Add Friends ── */}
          {taskType === 'auto_add_friends' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#1d39c4' }}>
                <UserAddOutlined /> {t('tasks.addFriendsSectionTitle')}
              </Divider>
              <Alert
                type="warning" showIcon style={{ marginBottom: 16 }}
                message={t('tasks.addFriendsSafetyTitle')}
                description={t('tasks.addFriendsSafetyDesc')}
              />
              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={t('tasks.executingAccount')} rules={[{ required: true }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={t('tasks.selectAddFriendAccount')} showSearch optionFilterProp="children">
                  {accounts.map(a => (
                    <Option key={a.id} value={a.id}>
                      {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                      <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="dailyLimit" label={t('tasks.dailyLimit')} initialValue={5}
                    rules={[{ required: true }]}>
                    <InputNumber min={3} max={6} style={{ width: '100%' }} addonAfter={t('tasks.perDay')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="delayMin" label={t('tasks.minInterval')} initialValue={60}>
                    <InputNumber min={10} max={300} style={{ width: '100%' }} addonAfter={t('tasks.seconds')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="delayMax" label={t('tasks.maxInterval')} initialValue={240}>
                    <InputNumber min={30} max={600} style={{ width: '100%' }} addonAfter={t('tasks.seconds')} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="prioritizeMutual" label={t('tasks.mutualFriendsPriority')} initialValue valuePropName="checked">
                <Switch checkedChildren={t('tasks.on')} unCheckedChildren={t('tasks.off')} />
              </Form.Item>
            </>
          )}

          {/* ── Auto Accept Friend Requests ── */}
          {taskType === 'auto_accept_requests' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#52c41a' }}>
                <CheckCircleOutlined /> {t('tasks.acceptRequestsSectionTitle')}
              </Divider>
              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={t('tasks.executingAccount')} rules={[{ required: true }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={t('tasks.selectAcceptAccount')} showSearch optionFilterProp="children">
                  {accounts.map(a => (
                    <Option key={a.id} value={a.id}>
                      {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                      <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="maxCount" label={t('tasks.acceptMaxPerRun')} initialValue={10}>
                <InputNumber min={1} max={500} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}

          {/* ── Auto Comment ── */}
          {taskType === 'auto_comment' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#d4b106' }}>
                <CommentOutlined /> {t('tasks.commentSectionTitle')}
              </Divider>
              <Alert
                type="info" showIcon style={{ marginBottom: 16 }}
                message={t('tasks.antiSpamTitle')}
                description={t('tasks.antiSpamDesc')}
              />
              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={t('tasks.executingAccount')} rules={[{ required: true }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={t('tasks.selectCommentAccount')} showSearch optionFilterProp="children">
                  {accounts.map(a => (
                    <Option key={a.id} value={a.id}>
                      {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                      <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="comments"
                label={t('tasks.commentTemplates')}
                initialValue={'👍\n非常棒！\n赞！\n很精彩！\n支持！'}
                rules={[{ required: true }]}
              >
                <TextArea rows={5} placeholder={'👍\n非常棒！\n赞！\n很精彩！\n支持！'} />
              </Form.Item>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="dailyLimit" label={t('tasks.dailyLimit')} initialValue={10}>
                    <InputNumber min={1} max={30} style={{ width: '100%' }} addonAfter={t('tasks.perDayComment')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="delayMin" label={t('tasks.minInterval')} initialValue={60}>
                    <InputNumber min={5} max={300} style={{ width: '100%' }} addonAfter={t('tasks.seconds')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="delayMax" label={t('tasks.maxInterval')} initialValue={120}>
                    <InputNumber min={15} max={600} style={{ width: '100%' }} addonAfter={t('tasks.seconds')} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {/* ── Auto Follow ── */}
          {taskType === 'auto_follow' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#d4380d' }}>
                <HeartOutlined /> {t('tasks.followSectionTitle')}
              </Divider>
              <Alert
                type="info" showIcon style={{ marginBottom: 16 }}
                message={t('tasks.followSafeNote')}
              />
              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={t('tasks.executingAccount')} rules={[{ required: true }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={t('tasks.selectFollowAccount')} showSearch optionFilterProp="children">
                  {accounts.map(a => (
                    <Option key={a.id} value={a.id}>
                      {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                      <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="dailyLimit" label={t('tasks.dailyLimit')} initialValue={10}>
                    <InputNumber min={1} max={50} style={{ width: '100%' }} addonAfter={t('tasks.perDay')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="delayMin" label={t('tasks.minInterval')} initialValue={60}>
                    <InputNumber min={5} max={120} style={{ width: '100%' }} addonAfter={t('tasks.seconds')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="delayMax" label={t('tasks.maxInterval')} initialValue={240}>
                    <InputNumber min={10} max={300} style={{ width: '100%' }} addonAfter={t('tasks.seconds')} />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {/* ── Combo Task ── */}
          {taskType === 'auto_combo' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#722ed1' }}>
                <AppstoreOutlined /> {t('tasks.comboSectionTitle')}
              </Divider>
              <Alert
                type="info" showIcon style={{ marginBottom: 16 }}
                message="系统将按以下勾选顺序依次执行每个动作，共用同一个浏览器 Session，无需重复登录。"
              />
              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={batchMode ? '执行账号（批量）' : '执行账号'} rules={[{ required: true, message: '请选择账号' }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={batchMode ? '选择多个账号批量执行' : '选择执行所有动作的 Facebook 账号'} showSearch optionFilterProp="children">
                  {accounts.map(a => (
                    <Option key={a.id} value={a.id}>
                      {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                      <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label={<><span style={{ color: '#ff4d4f' }}>*</span> 选择动作（按顺序执行）</>}>
                <Checkbox.Group
                  value={comboActions}
                  onChange={vals => setComboActions(vals as string[])}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
                >
                  <Checkbox value="auto_accept_requests"><CheckCircleOutlined style={{ color: '#52c41a' }} /> 接受好友申请</Checkbox>
                  <Checkbox value="auto_add_friends"><UserAddOutlined style={{ color: '#1d39c4' }} /> 自动加好友</Checkbox>
                  <Checkbox value="auto_comment"><CommentOutlined style={{ color: '#d4b106' }} /> 自动留言</Checkbox>
                  <Checkbox value="auto_follow"><HeartOutlined style={{ color: '#d4380d' }} /> 自动 Follow</Checkbox>
                </Checkbox.Group>
                {comboActions.length === 0 && (
                  <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>请至少勾选一个动作</div>
                )}
              </Form.Item>

              {/* Per-action settings — only shown when checked */}
              {comboActions.includes('auto_accept_requests') && (
                <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '12px 16px', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#52c41a' }}><CheckCircleOutlined /> 接受好友申请设置</div>
                  <Form.Item name="comboAcceptMax" label="每次最多接受" initialValue={10} style={{ marginBottom: 0 }}>
                    <InputNumber min={1} max={500} addonAfter="个" style={{ width: '100%' }} />
                  </Form.Item>
                </div>
              )}

              {comboActions.includes('auto_add_friends') && (
                <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6, padding: '12px 16px', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#1d39c4' }}><UserAddOutlined /> 自动加好友设置</div>
                  <Alert type="warning" showIcon message="系统强制上限 6 个/天，超出无效" style={{ marginBottom: 8, padding: '4px 8px' }} />
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item name="comboAddLimit" label="每日上限" initialValue={5} style={{ marginBottom: 0 }}>
                        <InputNumber min={3} max={6} addonAfter="个" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="comboAddDelayMin" label="最短间隔(秒)" initialValue={60} style={{ marginBottom: 0 }}>
                        <InputNumber min={10} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="comboAddDelayMax" label="最长间隔(秒)" initialValue={240} style={{ marginBottom: 0 }}>
                        <InputNumber min={30} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              )}

              {comboActions.includes('auto_comment') && (
                <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: '12px 16px', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#d4b106' }}><CommentOutlined /> 自动留言设置</div>
                  <Form.Item name="comboComments" label="评论模板（每行一条）"
                    initialValue={'👍\n非常棒！\n赞！\n很精彩！\n支持！'} style={{ marginBottom: 8 }}>
                    <TextArea rows={4} />
                  </Form.Item>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item name="comboCommentLimit" label="每日上限" initialValue={10} style={{ marginBottom: 0 }}>
                        <InputNumber min={1} max={30} addonAfter="条" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="comboCommentDelayMin" label="最短间隔(秒)" initialValue={60} style={{ marginBottom: 0 }}>
                        <InputNumber min={5} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="comboCommentDelayMax" label="最长间隔(秒)" initialValue={120} style={{ marginBottom: 0 }}>
                        <InputNumber min={15} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              )}

              {comboActions.includes('auto_follow') && (
                <div style={{ background: '#fff2e8', border: '1px solid #ffbb96', borderRadius: 6, padding: '12px 16px', marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#d4380d' }}><HeartOutlined /> 自动 Follow 设置</div>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item name="comboFollowLimit" label="每日上限" initialValue={10} style={{ marginBottom: 0 }}>
                        <InputNumber min={1} max={50} addonAfter="个" style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="comboFollowDelayMin" label="最短间隔(秒)" initialValue={60} style={{ marginBottom: 0 }}>
                        <InputNumber min={5} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="comboFollowDelayMax" label="最长间隔(秒)" initialValue={240} style={{ marginBottom: 0 }}>
                        <InputNumber min={10} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              )}
            </>
          )}

          {/* ── Auto Warmup ── v1.3.0 */}
          {taskType === 'auto_warmup' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#fa8c16' }}>
                <ThunderboltOutlined /> {t('tasks.warmupSectionTitle')}
              </Divider>
              <Alert
                type="info" showIcon style={{ marginBottom: 16 }}
                message={t('tasks.warmupPackageDesc')}
              />
              <Form.Item name="warmupPackageMode" label={t('tasks.warmupPackageLabel')} initialValue="P1+P2" rules={[{ required: true }]}>
                <Select>
                  <Option value="P1">① {t('tasks.warmupModeP1')}</Option>
                  <Option value="P2">② {t('tasks.warmupModeP2')}</Option>
                  <Option value="P1+P2">③ {t('tasks.warmupModeP1P2')} ⭐</Option>
                  <Option value="P3">④ {t('tasks.warmupModeP3')}</Option>
                </Select>
              </Form.Item>

              <Form.Item name="warmupTargetType" label={t('tasks.warmupTargetType')} initialValue="accounts" rules={[{ required: true }]}>
                <Select>
                  <Option value="accounts">{t('tasks.warmupTargetAccounts')}</Option>
                  <Option value="group">{t('tasks.warmupTargetGroup')}</Option>
                </Select>
              </Form.Item>

              <Form.Item shouldUpdate={(p, c) => p.warmupTargetType !== c.warmupTargetType} noStyle>
                {() => {
                  const tgt = form.getFieldValue('warmupTargetType');
                  if (tgt === 'group') {
                    return (
                      <Form.Item name="warmupGroupNumber" label={t('tasks.warmupSelectGroup')} rules={[{ required: true, message: t('tasks.warmupSelectGroup') }]}>
                        <Select placeholder={t('tasks.warmupSelectGroupPlaceholder')}>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => {
                            const count = accounts.filter((a: any) => a.warmupGroupNumber === g).length;
                            return (
                              <Option key={g} value={g} disabled={count === 0}>
                                G{g} ({count} {t('tasks.accountsLabel')})
                              </Option>
                            );
                          })}
                        </Select>
                      </Form.Item>
                    );
                  }
                  return (
                    <Form.Item name="warmupAccountIds" label={t('tasks.warmupSelectAccounts')} rules={[{ required: true, message: t('tasks.warmupSelectAccounts') }]}>
                      <Select mode="multiple" placeholder={t('tasks.warmupSelectAccountsPlaceholder')} showSearch optionFilterProp="children">
                        {accounts.map(a => (
                          <Option key={a.id} value={a.id} disabled={a.warmupGroupNumber == null}>
                            {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                            <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                            {a.warmupGroupNumber != null
                              ? <Tag color="blue" style={{ marginLeft: 6, fontSize: 10 }}>G{a.warmupGroupNumber}</Tag>
                              : <Tag color="default" style={{ marginLeft: 6, fontSize: 10 }}>{t('tasks.warmupNoGroup')}</Tag>}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </>
          )}

          {/* ── Auto Join Group ── v1.3.1 (per-task settings) */}
          {taskType === 'auto_join_group' && (
            <>
              <Divider orientation="left" style={{ fontSize: 13, color: '#13c2c2' }}>
                <TeamOutlined /> {t('tasks.joinGroupSectionTitle')}
              </Divider>

              <Form.Item name={batchMode ? 'batchAccountIds' : 'accountAId'} label={t('tasks.executingAccount')} rules={[{ required: true }]}>
                <Select mode={batchMode ? 'multiple' : undefined} placeholder={t('tasks.selectTargetAccount')} showSearch optionFilterProp="children">
                  {accounts.map(a => (
                    <Option key={a.id} value={a.id}>
                      {a.accountNumber != null && <Text strong style={{ color: '#1890ff', marginRight: 6 }}>{formatAccountNumber(a.accountNumber)}</Text>}
                      <Badge color={a.loginStatus ? 'green' : 'default'} text={a.name} />
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="joinKeywords"
                label={t('tasks.joinKeywords')}
                rules={[{ required: true, message: t('tasks.joinKeywordsRequired') }]}
                extra={t('tasks.joinKeywordsHelp')}
              >
                <Select
                  mode="tags"
                  placeholder={t('tasks.joinKeywordsPlaceholder')}
                  tokenSeparators={[',', ',', ';', ';']}
                  maxTagCount={20}
                />
              </Form.Item>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="joinCount" label={t('tasks.joinCount')} initialValue={3} rules={[{ required: true }]} extra={t('tasks.joinCountHelp')}>
                    <InputNumber min={1} max={20} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="joinDelayMin" label={t('tasks.joinDelayMin')} initialValue={120} rules={[{ required: true }]}>
                    <InputNumber min={30} max={1800} addonAfter="s" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="joinDelayMax" label={t('tasks.joinDelayMax')} initialValue={300} rules={[{ required: true }]}>
                    <InputNumber min={60} max={3600} addonAfter="s" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="joinAiAnswer" valuePropName="checked" initialValue={false}>
                <Checkbox>
                  <Space>
                    <RobotOutlined style={{ color: '#722ed1' }} />
                    <Text strong>{t('tasks.joinAiAnswer')}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('tasks.joinAiAnswerHelp')}</Text>
                  </Space>
                </Checkbox>
              </Form.Item>

              <Form.Item shouldUpdate={(prev, cur) => prev.joinAiAnswer !== cur.joinAiAnswer} noStyle>
                {() => form.getFieldValue('joinAiAnswer') && (
                  <div style={{ background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 6, padding: 12, marginBottom: 12 }}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Alert
                        type="info" showIcon
                        message={t('tasks.joinAiKeyHint')}
                      />
                      <Row gutter={12}>
                        <Col span={10}>
                          <Form.Item name="joinAiProvider" label={t('tasks.joinAiProvider')} initialValue="deepseek" style={{ marginBottom: 8 }}>
                            <Select>
                              <Option value="claude">Claude Haiku</Option>
                              <Option value="openai">GPT-4o-mini</Option>
                              <Option value="deepseek">DeepSeek (最便宜)</Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={14}>
                          <Form.Item
                            name="joinAiApiKey"
                            label={t('tasks.joinAiApiKey')}
                            extra={t('tasks.joinAiApiKeyHelp')}
                            style={{ marginBottom: 8 }}
                          >
                            <Input.Password placeholder="sk-..." prefix={<KeyOutlined />} />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Form.Item name="joinAiPrompt" label={t('tasks.joinAiPrompt')} style={{ marginBottom: 0 }}>
                        <Input.TextArea rows={2} placeholder={t('tasks.joinAiPromptPlaceholder')} maxLength={300} showCount />
                      </Form.Item>
                    </Space>
                  </div>
                )}
              </Form.Item>
            </>
          )}

          {/* Schedule Settings */}
          {taskType && (
            <>
              <Divider orientation="left" style={{ fontSize: 13 }}>⏰ {t('tasks.executionPlan')}</Divider>
              <Row gutter={16}>
                <Col span={14}>
                  <Form.Item name="scheduledAt" label={t('tasks.executionTime')} rules={[{ required: true, message: t('tasks.executionTime') }]}>
                    <Input type="datetime-local" />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="repeatCycle" label={t('tasks.recurrence')} initialValue="once">
                    <Select>
                      <Option value="once">{t('tasks.recurrenceOnce')}</Option>
                      <Option value="daily">{t('tasks.recurrenceDaily')}</Option>
                      <Option value="weekly">{t('tasks.recurrenceWeekly')}</Option>
                      <Option value="hourly">{t('tasks.recurrenceHourly')}</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          {!taskType && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#aaa' }}>
              <MessageOutlined style={{ fontSize: 32, marginBottom: 8 }} />
              <div>{t('tasks.pleaseSelectTypeFirst')}</div>
            </div>
          )}
        </Form>
      </Modal>

      {/* AI Settings Modal */}
      <AISettingsModal open={aiModalVisible} onClose={() => setAiModalVisible(false)} />

      {/* Script Editor Modal */}
      <ScriptEditorModal
        scriptId={scriptEditorId}
        onClose={() => {
          setScriptEditorId(null);
          api.get('/chat-scripts').then(res => {
            const list = res.data?.data || res.data || [];
            setScripts(Array.isArray(list) ? list : []);
          }).catch(() => {});
        }}
      />

      {/* Execution Log Modal */}
      <ExecutionLogModal
        taskId={logModalTask?.id || null}
        taskName={logModalTask?.name || ''}
        onClose={() => setLogModalTask(null)}
        onStatusChange={(id, status) => {
          setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
        }}
      />
    </AppLayout>
  );
};

export default TasksPage;
