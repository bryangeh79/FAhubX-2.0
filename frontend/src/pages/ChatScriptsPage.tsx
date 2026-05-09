import React, { useCallback, useEffect, useState } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, Modal, Upload, message,
  Tabs, Popconfirm, Empty, Alert, Radio,
} from 'antd';
import {
  CloudUploadOutlined, DeleteOutlined, ReloadOutlined,
  InboxOutlined, FileTextOutlined, TranslationOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import AppLayout from '../components/AppLayout';
import {
  chatScriptsService, ChatScript, LanguageStats, ImportScriptPackPayload,
} from '../services/chat-scripts';
import { useT } from '../i18n';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

type Lang = 'zh' | 'en' | 'vi';

const LANG_LABELS: Record<Lang, { label: string; flag: string }> = {
  zh: { label: '中文', flag: '🇨🇳' },
  en: { label: 'English', flag: '🇬🇧' },
  vi: { label: 'Tiếng Việt', flag: '🇻🇳' },
};

const ChatScriptsPage: React.FC = () => {
  const t = useT();
  const EMPTY_DESC: Record<Lang, string> = {
    zh: t('chatScripts.emptyZh'),
    en: t('chatScripts.emptyEn'),
    vi: t('chatScripts.emptyVi'),
  };
  const [currentLang, setCurrentLang] = useState<Lang>('zh');
  const [scripts, setScripts] = useState<ChatScript[]>([]);
  const [stats, setStats] = useState<LanguageStats>({ zh: 0, en: 0, vi: 0 });
  const [loading, setLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<ImportScriptPackPayload | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [conflictMode, setConflictMode] = useState<'skip' | 'overwrite'>('skip');
  const [importing, setImporting] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const s = await chatScriptsService.getLanguageStats();
      setStats(s);
    } catch (e: any) {
      // Silent fail for stats; page still works
    }
  }, []);

  const fetchScripts = useCallback(async (lang: Lang) => {
    setLoading(true);
    try {
      const list = await chatScriptsService.listByLanguage(lang);
      setScripts(list);
    } catch (e: any) {
      message.error(`${t('chatScripts.loadFailed')}：${e?.response?.data?.message || e.message}`);
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchScripts(currentLang);
  }, [currentLang, fetchScripts]);

  // Parse uploaded JSON file as ImportScriptPackPayload
  const handleFileRead: UploadProps['beforeUpload'] = (file) => {
    setImportError(null);
    setImportPayload(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = JSON.parse(text);
        // Basic validation
        if (!parsed || typeof parsed !== 'object') throw new Error('JSON 格式错误');
        if (!parsed.language || !['zh', 'en', 'vi'].includes(parsed.language)) {
          throw new Error('language 字段缺失或不合法（必须是 zh/en/vi）');
        }
        if (!Array.isArray(parsed.scripts) || parsed.scripts.length === 0) {
          throw new Error('scripts 数组为空');
        }
        if (parsed.scripts.length > 50) {
          throw new Error(`剧本数不能超过 50，当前 ${parsed.scripts.length}`);
        }
        for (const s of parsed.scripts) {
          if (typeof s.scriptNumber !== 'number' || s.scriptNumber < 1 || s.scriptNumber > 50) {
            throw new Error(`剧本编号必须在 1-50，发现 ${s.scriptNumber}`);
          }
          if (!s.title) throw new Error(`剧本 #${s.scriptNumber} 缺少 title`);
          if (!Array.isArray(s.phases)) throw new Error(`剧本 #${s.scriptNumber} 的 phases 不是数组`);
        }
        setImportPayload(parsed as ImportScriptPackPayload);
      } catch (e: any) {
        setImportError(e.message || '解析 JSON 失败');
      }
    };
    reader.onerror = () => setImportError('读取文件失败');
    reader.readAsText(file);
    // Prevent antd auto-upload
    return false;
  };

  const handleConfirmImport = async () => {
    if (!importPayload) return;
    setImporting(true);
    try {
      const payload: ImportScriptPackPayload = { ...importPayload, conflictMode };
      const result = await chatScriptsService.importPack(payload);
      message.success(
        t('chatScripts.importResult', {
          imported: result.imported,
          overwritten: result.overwritten,
          skipped: result.skipped,
        })
      );
      setImportOpen(false);
      setImportPayload(null);
      setImportError(null);
      await fetchStats();
      // Jump to the imported language tab
      setCurrentLang(importPayload.language as Lang);
    } catch (e: any) {
      message.error(`${t('chatScripts.importFailed')}：${e?.response?.data?.message || e.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteLanguage = async (lang: 'en' | 'vi') => {
    try {
      const result = await chatScriptsService.deleteByLanguage(lang);
      message.success(t('chatScripts.deleteSuccess', { count: result.deleted, lang: LANG_LABELS[lang].label }));
      await fetchStats();
      if (currentLang === lang) {
        setScripts([]);
      }
    } catch (e: any) {
      message.error(`${t('chatScripts.deleteFailed')}：${e?.response?.data?.message || e.message}`);
    }
  };

  const handleResetDefault = async () => {
    try {
      await chatScriptsService.resetToDefault();
      message.success(t('chatScripts.resetSuccess'));
      await fetchStats();
      if (currentLang === 'zh') fetchScripts('zh');
    } catch (e: any) {
      message.error(`${t('chatScripts.resetFailed')}：${e?.response?.data?.message || e.message}`);
    }
  };

  const columns = [
    { title: t('chatScripts.colNumber'), dataIndex: 'scriptNumber', key: 'scriptNumber', width: 80 },
    { title: t('chatScripts.colTitle'), dataIndex: 'title', key: 'title' },
    {
      title: t('chatScripts.colCategory'),
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (c: string) => <Tag color="blue">{c}</Tag>,
    },
    {
      title: t('chatScripts.colRounds'),
      key: 'rounds',
      width: 100,
      render: (_: any, record: ChatScript) => t('chatScripts.roundsSuffix', { count: record.phases?.length ?? 0 }),
    },
    {
      title: t('chatScripts.colGoal'),
      dataIndex: 'goal',
      key: 'goal',
      ellipsis: true,
      render: (g: string) => <Text type="secondary">{g || '-'}</Text>,
    },
  ];

  const tabItems = (['zh', 'en', 'vi'] as Lang[]).map(lang => ({
    key: lang,
    label: (
      <span>
        {LANG_LABELS[lang].flag} {LANG_LABELS[lang].label}
        <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
          ({stats[lang]})
        </Text>
      </span>
    ),
    children: null, // 内容在 tabs 外面统一渲染
  }));

  return (
    <AppLayout>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <FileTextOutlined /> {t('chatScripts.title')}
          </Title>
          <Text type="secondary">
            {t('chatScripts.subtitle')}
          </Text>
        </div>
        <Space>
          {currentLang === 'zh' && (
            <Popconfirm
              title={t('chatScripts.resetConfirm')}
              description={t('chatScripts.resetConfirmDesc')}
              onConfirm={handleResetDefault}
              okText={t('chatScripts.resetConfirmOk')}
              cancelText={t('common.cancel')}
            >
              <Button icon={<ReloadOutlined />}>{t('chatScripts.resetDefault')}</Button>
            </Popconfirm>
          )}
          {(currentLang === 'en' || currentLang === 'vi') && stats[currentLang] > 0 && (
            <Popconfirm
              title={t('chatScripts.clearConfirm', { lang: LANG_LABELS[currentLang].label })}
              description={t('chatScripts.clearConfirmDesc')}
              onConfirm={() => handleDeleteLanguage(currentLang as 'en' | 'vi')}
              okText={t('chatScripts.clearConfirmOk')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>{t('chatScripts.clearLanguage')}</Button>
            </Popconfirm>
          )}
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={() => {
              setImportOpen(true);
              setImportPayload(null);
              setImportError(null);
              setConflictMode('skip');
            }}
          >
            {t('chatScripts.importPack')}
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={currentLang}
        onChange={(k) => setCurrentLang(k as Lang)}
        items={tabItems}
      />

      <Card>
        {scripts.length === 0 && !loading ? (
          <Empty
            image={<TranslationOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
            description={
              <div>
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  {EMPTY_DESC[currentLang]}
                </Paragraph>
                {currentLang !== 'zh' && (
                  <Button
                    type="primary"
                    icon={<CloudUploadOutlined />}
                    onClick={() => setImportOpen(true)}
                  >
                    {t('chatScripts.importEmptyButton', { lang: LANG_LABELS[currentLang].label })}
                  </Button>
                )}
              </div>
            }
          />
        ) : (
          <Table
            columns={columns}
            dataSource={scripts}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showTotal: (total) => t('chatScripts.totalSuffix', { count: total }) }}
          />
        )}
      </Card>

      {/* Import Modal */}
      <Modal
        title={<Space><CloudUploadOutlined /> {t('chatScripts.importTitle')}</Space>}
        open={importOpen}
        onCancel={() => {
          setImportOpen(false);
          setImportPayload(null);
          setImportError(null);
        }}
        onOk={handleConfirmImport}
        okText={t('chatScripts.importOk')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !importPayload, loading: importing }}
        width={600}
      >
        {!importPayload && !importError && (
          <Dragger
            multiple={false}
            accept=".json"
            beforeUpload={handleFileRead}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">{t('chatScripts.importUploadText')}</p>
            <p className="ant-upload-hint" style={{ fontSize: 12 }}>
              {t('chatScripts.importUploadHint')}
            </p>
          </Dragger>
        )}

        {importError && (
          <Alert
            type="error"
            message={t('chatScripts.importError')}
            description={importError}
            showIcon
            action={
              <Button size="small" onClick={() => setImportError(null)}>
                {t('chatScripts.importErrorReselect')}
              </Button>
            }
          />
        )}

        {importPayload && (
          <div>
            <Alert
              type="success"
              showIcon
              message={t('chatScripts.importSuccess')}
              style={{ marginBottom: 16 }}
            />
            <div style={{ marginBottom: 12, padding: 12, background: '#fafafa', borderRadius: 6 }}>
              <div><Text strong>{t('chatScripts.importPackName')}</Text>{importPayload.name}</div>
              <div><Text strong>{t('chatScripts.importPackLanguage')}</Text>
                {LANG_LABELS[importPayload.language as Lang]?.flag}{' '}
                {LANG_LABELS[importPayload.language as Lang]?.label || importPayload.language}
              </div>
              {importPayload.version && <div><Text strong>{t('chatScripts.importPackVersion')}</Text>{importPayload.version}</div>}
              <div><Text strong>{t('chatScripts.importPackScriptCount')}</Text>{importPayload.scripts.length}</div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <Text strong>{t('chatScripts.importConflictQuestion')}</Text>
            </div>
            <Radio.Group
              value={conflictMode}
              onChange={(e) => setConflictMode(e.target.value)}
            >
              <Space direction="vertical">
                <Radio value="skip">{t('chatScripts.importConflictSkip')}</Radio>
                <Radio value="overwrite">{t('chatScripts.importConflictOverwrite')}</Radio>
              </Space>
            </Radio.Group>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
};

export default ChatScriptsPage;
