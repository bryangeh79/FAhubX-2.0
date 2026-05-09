import api from './api';
import {
  TestLoginRequest,
  AssignVPNRequest,
  SaveSessionRequest,
  UpdateAntiDetectionConfigRequest,
  LoginTestResult,
  LoginStatus,
  LoginSession,
  AntiDetectionConfig,
  IPRotationPolicy,
  TrafficPattern,
  AccountVPNAssociation,
  ExtendedFacebookAccount,
} from '../types/facebook-login';

// Facebook登录流程API服务
export const facebookLoginService = {
  // 登录测试
  async testLogin(accountId: string, data: TestLoginRequest): Promise<{ data: LoginTestResult }> {
    const response = await api.post<{ data: LoginTestResult }>(
      `/facebook-accounts/${accountId}/test-login`,
      data
    );
    return response.data;
  },

  // 分配VPN
  async assignVPN(accountId: string, data: AssignVPNRequest): Promise<{ data: AccountVPNAssociation }> {
    const response = await api.post<{ data: AccountVPNAssociation }>(
      `/facebook-accounts/${accountId}/assign-vpn`,
      data
    );
    return response.data;
  },

  // 获取登录状态
  async getLoginStatus(accountId: string): Promise<{ data: LoginStatus }> {
    const response = await api.get<{ data: LoginStatus }>(
      `/facebook-accounts/${accountId}/login-status`
    );
    return response.data;
  },

  // 保存会话
  async saveSession(accountId: string, data: SaveSessionRequest): Promise<{ data: LoginSession }> {
    const response = await api.post<{ data: LoginSession }>(
      `/facebook-accounts/${accountId}/save-session`,
      data
    );
    return response.data;
  },

  // 获取会话信息
  async getSessionInfo(accountId: string): Promise<{ data: LoginSession }> {
    const response = await api.get<{ data: LoginSession }>(
      `/facebook-accounts/${accountId}/session-info`
    );
    return response.data;
  },

  // 获取扩展的账号信息
  async getExtendedAccount(accountId: string): Promise<{ data: ExtendedFacebookAccount }> {
    const response = await api.get<{ data: ExtendedFacebookAccount }>(
      `/facebook-accounts/${accountId}/extended`
    );
    return response.data;
  },

  // 更新登录配置
  async updateLoginConfig(
    accountId: string,
    data: Partial<ExtendedFacebookAccount['loginConfig']>
  ): Promise<{ data: ExtendedFacebookAccount }> {
    const response = await api.patch<{ data: ExtendedFacebookAccount }>(
      `/facebook-accounts/${accountId}/login-config`,
      data
    );
    return response.data;
  },

  // 反检测配置管理
  async getAntiDetectionConfigs(): Promise<{ data: AntiDetectionConfig[] }> {
    const response = await api.get<{ data: AntiDetectionConfig[] }>('/anti-detection-configs');
    return response.data;
  },

  async getAntiDetectionConfig(id: string): Promise<{ data: AntiDetectionConfig }> {
    const response = await api.get<{ data: AntiDetectionConfig }>(`/anti-detection-configs/${id}`);
    return response.data;
  },

  async createAntiDetectionConfig(data: Omit<AntiDetectionConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ data: AntiDetectionConfig }> {
    const response = await api.post<{ data: AntiDetectionConfig }>('/anti-detection-configs', data);
    return response.data;
  },

  async updateAntiDetectionConfig(id: string, data: UpdateAntiDetectionConfigRequest): Promise<{ data: AntiDetectionConfig }> {
    const response = await api.patch<{ data: AntiDetectionConfig }>(`/anti-detection-configs/${id}`, data);
    return response.data;
  },

  async deleteAntiDetectionConfig(id: string): Promise<void> {
    await api.delete(`/anti-detection-configs/${id}`);
  },

  // IP轮换策略管理
  async getIPRotationPolicies(): Promise<{ data: IPRotationPolicy[] }> {
    const response = await api.get<{ data: IPRotationPolicy[] }>('/ip-rotation-policies');
    return response.data;
  },

  async createIPRotationPolicy(data: Omit<IPRotationPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ data: IPRotationPolicy }> {
    const response = await api.post<{ data: IPRotationPolicy }>('/ip-rotation-policies', data);
    return response.data;
  },

  async updateIPRotationPolicy(id: string, data: Partial<IPRotationPolicy>): Promise<{ data: IPRotationPolicy }> {
    const response = await api.patch<{ data: IPRotationPolicy }>(`/ip-rotation-policies/${id}`, data);
    return response.data;
  },

  async deleteIPRotationPolicy(id: string): Promise<void> {
    await api.delete(`/ip-rotation-policies/${id}`);
  },

  // 流量模式管理
  async getTrafficPatterns(): Promise<{ data: TrafficPattern[] }> {
    const response = await api.get<{ data: TrafficPattern[] }>('/traffic-patterns');
    return response.data;
  },

  async createTrafficPattern(data: Omit<TrafficPattern, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ data: TrafficPattern }> {
    const response = await api.post<{ data: TrafficPattern }>('/traffic-patterns', data);
    return response.data;
  },

  async updateTrafficPattern(id: string, data: Partial<TrafficPattern>): Promise<{ data: TrafficPattern }> {
    const response = await api.patch<{ data: TrafficPattern }>(`/traffic-patterns/${id}`, data);
    return response.data;
  },

  async deleteTrafficPattern(id: string): Promise<void> {
    await api.delete(`/traffic-patterns/${id}`);
  },

  // 账号-VPN关联管理
  async getAccountVPNAssociations(accountId?: string): Promise<{ data: AccountVPNAssociation[] }> {
    const params = accountId ? { accountId } : {};
    const response = await api.get<{ data: AccountVPNAssociation[] }>('/account-vpn-associations', { params });
    return response.data;
  },

  async updateAccountVPNAssociation(id: string, data: Partial<AccountVPNAssociation>): Promise<{ data: AccountVPNAssociation }> {
    const response = await api.patch<{ data: AccountVPNAssociation }>(`/account-vpn-associations/${id}`, data);
    return response.data;
  },

  async deleteAccountVPNAssociation(id: string): Promise<void> {
    await api.delete(`/account-vpn-associations/${id}`);
  },

  // VPN连接测试
  async testVPNConnection(vpnId: string): Promise<{ data: { success: boolean; latency: number; bandwidth: number; error?: string } }> {
    const response = await api.post<{ data: { success: boolean; latency: number; bandwidth: number; error?: string } }>(
      `/vpns/${vpnId}/test-connection`
    );
    return response.data;
  },

  // 批量操作
  async batchAssignVPN(accountIds: string[], vpnId: string): Promise<{ data: { success: number; failed: number; errors: string[] } }> {
    const response = await api.post<{ data: { success: number; failed: number; errors: string[] } }>(
      '/batch/assign-vpn',
      { accountIds, vpnId }
    );
    return response.data;
  },

  async batchTestLogin(accountIds: string[]): Promise<{ data: { results: Record<string, LoginTestResult> } }> {
    const response = await api.post<{ data: { results: Record<string, LoginTestResult> } }>(
      '/batch/test-login',
      { accountIds }
    );
    return response.data;
  },

  // 监控相关
  async getLoginMonitorStats(): Promise<{ data: {
    totalAccounts: number;
    loggedInAccounts: number;
    failedLogins: number;
    averageLoginTime: number;
    vpnUsage: Record<string, number>;
    recentActivities: Array<{
      accountId: string;
      accountName: string;
      action: string;
      timestamp: string;
      success: boolean;
    }>;
  } }> {
    const response = await api.get<{ data: any }>('/monitor/login-stats');
    return response.data;
  },

  // 实时监控（WebSocket备用）
  async subscribeToLoginEvents(accountId?: string): Promise<{ data: { wsUrl: string } }> {
    const params = accountId ? { accountId } : {};
    const response = await api.get<{ data: { wsUrl: string } }>('/monitor/subscribe', { params });
    return response.data;
  },
};