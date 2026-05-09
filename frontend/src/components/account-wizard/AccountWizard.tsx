import React, { useState, useEffect } from 'react';
import {
  Steps,
  Card,
  Button,
  Space,
  Typography,
  Form,
  message,
  Row,
  Col,
  Divider,
  Alert,
  Progress,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  SaveOutlined,
  CloseOutlined,
} from '@ant-design/icons';

import Step1BasicInfo from './steps/Step1BasicInfo';
import Step2VPNConfig from './steps/Step2VPNConfig';
import Step3AntiDetection from './steps/Step3AntiDetection';
import Step4LoginTest from './steps/Step4LoginTest';
import Step5SessionManagement from './steps/Step5SessionManagement';

import { ExtendedFacebookAccount } from '../../types/facebook-login';
import { accountsService } from '../../services/accounts';
import { facebookLoginService } from '../../services/facebook-login';

const { Title, Text } = Typography;
const { Step } = Steps;

interface AccountWizardProps {
  accountId?: string; // 编辑模式时传入
  onSuccess?: (account: ExtendedFacebookAccount) => void;
  onCancel?: () => void;
  visible: boolean;
}

const AccountWizard: React.FC<AccountWizardProps> = ({
  accountId,
  onSuccess,
  onCancel,
  visible,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Partial<ExtendedFacebookAccount>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<ExtendedFacebookAccount | null>(null);
  const [stepForms, setStepForms] = useState<Record<number, any>>({});

  // 编辑模式：加载账号数据
  useEffect(() => {
    if (accountId && visible) {
      loadAccountData();
    }
  }, [accountId, visible]);

  const loadAccountData = async () => {
    try {
      setLoading(true);
      const response = await accountsService.getExtendedAccount(accountId!);
      setAccount(response.data);
      setFormData(response.data);
    } catch (error) {
      message.error('加载账号数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    // 验证当前步骤的表单
    const currentForm = stepForms[currentStep];
    if (currentForm) {
      currentForm.validateFields().then(() => {
        setCurrentStep(currentStep + 1);
      }).catch((error: any) => {
        console.log('Validation failed:', error);
      });
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleStepChange = (step: number) => {
    // 只能跳转到已完成的步骤或下一步
    if (step <= currentStep + 1) {
      setCurrentStep(step);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      if (accountId) {
        // 更新现有账号
        const updateData = {
          name: formData.name,
          email: formData.email,
          facebookPassword: formData.facebookPassword,
          remarks: formData.remarks,
          accountType: formData.accountType,
        };
        
        await accountsService.updateAccount(accountId, updateData);
        
        // 更新登录配置
        if (formData.loginConfig) {
          await accountsService.updateAccountLoginConfig(accountId, formData.loginConfig);
        }
        
        message.success('账号更新成功');
      } else {
        // 创建新账号
        const createData = {
          name: formData.name!,
          facebookId: formData.facebookId || formData.email || '',
          email: formData.email,
          facebookPassword: formData.facebookPassword,
          accountType: formData.accountType || 'user',
          remarks: formData.remarks,
        };
        
        const response = await accountsService.createAccount(createData);
        const newAccount = response.data;
        
        // 设置登录配置
        if (formData.loginConfig) {
          await accountsService.updateAccountLoginConfig(newAccount.id, formData.loginConfig);
        }
        
        message.success('账号创建成功');
        setAccount(newAccount as ExtendedFacebookAccount);
      }
      
      if (onSuccess && account) {
        onSuccess(account);
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || '保存失败';
      message.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleFormDataChange = (step: number, data: any) => {
    setFormData(prev => ({
      ...prev,
      ...data,
    }));
  };

  const registerForm = (step: number, form: any) => {
    setStepForms(prev => ({
      ...prev,
      [step]: form,
    }));
  };

  const steps = [
    {
      title: '基本信息',
      description: '账号基础信息',
      content: (
        <Step1BasicInfo
          formData={formData}
          onChange={(data) => handleFormDataChange(0, data)}
          registerForm={(form) => registerForm(0, form)}
          editing={!!accountId}
        />
      ),
    },
    {
      title: 'VPN配置',
      description: '分配VPN和IP',
      content: (
        <Step2VPNConfig
          formData={formData}
          onChange={(data) => handleFormDataChange(1, data)}
          registerForm={(form) => registerForm(1, form)}
          accountId={accountId}
        />
      ),
    },
    {
      title: '反检测设置',
      description: '浏览器指纹和行为',
      content: (
        <Step3AntiDetection
          formData={formData}
          onChange={(data) => handleFormDataChange(2, data)}
          registerForm={(form) => registerForm(2, form)}
        />
      ),
    },
    {
      title: '登录测试',
      description: '验证登录功能',
      content: (
        <Step4LoginTest
          formData={formData}
          onChange={(data) => handleFormDataChange(3, data)}
          registerForm={(form) => registerForm(3, form)}
          accountId={accountId}
        />
      ),
    },
    {
      title: '会话管理',
      description: '保存和管理会话',
      content: (
        <Step5SessionManagement
          formData={formData}
          onChange={(data) => handleFormDataChange(4, data)}
          registerForm={(form) => registerForm(4, form)}
          accountId={accountId}
        />
      ),
    },
  ];

  if (!visible) return null;

  return (
    <Card
      title={
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            {accountId ? '编辑Facebook账号' : '添加Facebook账号'}
          </Title>
          <Text type="secondary">
            {accountId ? `编辑账号: ${account?.name || accountId}` : '创建新的Facebook账号'}
          </Text>
        </Space>
      }
      extra={
        <Button
          icon={<CloseOutlined />}
          onClick={onCancel}
          disabled={saving}
        >
          取消
        </Button>
      }
      loading={loading}
      style={{ width: '100%', maxWidth: 1200, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 24 }}>
        <Steps current={currentStep} onChange={handleStepChange}>
          {steps.map((step, index) => (
            <Step
              key={index}
              title={step.title}
              description={step.description}
              disabled={index > currentStep + 1}
            />
          ))}
        </Steps>
        
        <div style={{ marginTop: 16 }}>
          <Progress
            percent={Math.round(((currentStep + 1) / steps.length) * 100)}
            size="small"
            status="active"
            showInfo={false}
          />
        </div>
      </div>

      <div style={{ minHeight: 400, marginBottom: 24 }}>
        {steps[currentStep].content}
      </div>

      <Divider />

      <Row justify="space-between" align="middle">
        <Col>
          <Text type="secondary">
            步骤 {currentStep + 1} / {steps.length}
          </Text>
        </Col>
        <Col>
          <Space>
            {currentStep > 0 && (
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={handlePrev}
                disabled={saving}
              >
                上一步
              </Button>
            )}
            
            {currentStep < steps.length - 1 ? (
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={handleNext}
                disabled={saving}
              >
                下一步
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                {accountId ? '保存更改' : '完成并创建账号'}
              </Button>
            )}
            
            {currentStep === steps.length - 1 && accountId && (
              <Button
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                保存配置
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      {currentStep === steps.length - 1 && (
        <Alert
          message="配置完成"
          description="所有步骤已完成配置。点击'完成并创建账号'保存配置，或点击'保存配置'仅更新当前配置。"
          type="success"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </Card>
  );
};

export default AccountWizard;