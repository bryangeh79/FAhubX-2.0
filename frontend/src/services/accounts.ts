import api from './api';
import { ExtendedFacebookAccount } from '../types/facebook-login';

/**
 * 后端有全局 TransformInterceptor 包装：{ success, data, timestamp }
 * 此 helper 统一解包；非包装响应原样返回。
 */
function unwrapApi<T>(body: any): T {
  return (body && typeof body === 'object' && 'data' in body && 'success' in body && 'timestamp' in body)
    ? body.data as T
    : body as T;
}

export interface FacebookAccount {
  id: string;
  name: string;
  accountNumber?: number | null;
  warmupGroupNumber?: number | null;
  facebookId?: string;
  email?: string;
  remarks?: string;
  accountType: 'user' | 'page' | 'business';
  verified?: boolean;
  loginStatus?: boolean;
  status?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GroupStats {
  groupCount: number;
  groups: { group: number; count: number }[];
  unassigned: number;
  total: number;
}

export interface WarmupSettings {
  groupCount: number;
}

/**
 * 格式化账号编号：1 -> "#01"，10 -> "#10"，100 -> "#100"
 * 账号号未分配（null/undefined）时返回空串
 */
export function formatAccountNumber(n?: number | null): string {
  if (n == null) return '';
  return n < 100 ? `#${String(n).padStart(2, '0')}` : `#${n}`;
}

/**
 * 账号展示标签：#01 bryangeh@hotmail.com
 * 用于下拉选择器、日志、错误提示等需要简短可读标识的地方
 */
export function formatAccountLabel(a: Pick<FacebookAccount, 'accountNumber' | 'email' | 'name'>): string {
  const num = formatAccountNumber(a.accountNumber);
  const id = a.email || a.name || '';
  return num ? `${num} ${id}` : id;
}

export interface AccountStats {
  totalAccounts: number;
  activeAccounts: number;
  expiredAccounts: number;
  [key: string]: number;
}

export interface AccountsResponse {
  data: {
    accounts: FacebookAccount[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

export interface GetAccountsParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateAccountData {
  name: string;
  facebookId: string;
  email?: string;
  facebookPassword?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  accountType: 'user' | 'page' | 'business';
  verified?: boolean;
  remarks?: string;
}

export const accountsService = {
  async getAccounts(params?: GetAccountsParams): Promise<AccountsResponse> {
    const response = await api.get<AccountsResponse>('/facebook-accounts', { params });
    return response.data;
  },

  async getStats(): Promise<{ data: AccountStats }> {
    const response = await api.get<{ data: AccountStats }>('/facebook-accounts/stats');
    return response.data;
  },

  async createAccount(data: CreateAccountData): Promise<{ data: FacebookAccount }> {
    const response = await api.post<{ data: FacebookAccount }>('/facebook-accounts', data);
    return response.data;
  },

  async updateAccount(id: string, data: Partial<CreateAccountData>): Promise<{ data: FacebookAccount }> {
    const response = await api.patch<{ data: FacebookAccount }>(`/facebook-accounts/${id}`, data);
    return response.data;
  },

  async deleteAccount(id: string): Promise<void> {
    await api.delete(`/facebook-accounts/${id}`);
  },

  async syncAccount(id: string): Promise<{ data: FacebookAccount }> {
    const response = await api.post<{ data: FacebookAccount }>(`/facebook-accounts/${id}/sync`);
    return response.data;
  },

  // 新增接口
  async getExtendedAccount(id: string): Promise<{ data: ExtendedFacebookAccount }> {
    const response = await api.get<{ data: ExtendedFacebookAccount }>(`/facebook-accounts/${id}/extended`);
    return response.data;
  },

  async getAccountLoginConfig(id: string): Promise<{ data: ExtendedFacebookAccount['loginConfig'] }> {
    const response = await api.get<{ data: ExtendedFacebookAccount['loginConfig'] }>(`/facebook-accounts/${id}/login-config`);
    return response.data;
  },

  async updateAccountLoginConfig(id: string, data: Partial<ExtendedFacebookAccount['loginConfig']>): Promise<{ data: ExtendedFacebookAccount }> {
    const response = await api.patch<{ data: ExtendedFacebookAccount }>(`/facebook-accounts/${id}/login-config`, data);
    return response.data;
  },

  async getAccountSessions(id: string): Promise<{ data: any[] }> {
    const response = await api.get<{ data: any[] }>(`/facebook-accounts/${id}/sessions`);
    return response.data;
  },

  async clearAccountSessions(id: string): Promise<void> {
    await api.delete(`/facebook-accounts/${id}/sessions`);
  },

  // ─── 半自动注册新账号 ──────────────────────────────────────────────
  async startRegistration(data: {
    firstName: string;
    lastName: string;
    email: string;
    facebookPassword: string;
    vpnConfigId: string;
    name?: string;
    dateOfBirth?: string;
    gender?: 'male' | 'female' | 'custom';
    accountType?: 'user' | 'page' | 'business';
    remarks?: string;
  }): Promise<{ accountId: string; status: string }> {
    const response = await api.post<{ accountId: string; status: string }>(
      '/facebook-accounts/start-registration',
      data,
    );
    return response.data;
  },

  async getRegistrationStatus(accountId: string): Promise<{
    status: 'registering' | 'idle' | 'registration_failed';
    facebookId?: string;
    error?: string;
  }> {
    const response = await api.get<{
      status: 'registering' | 'idle' | 'registration_failed';
      facebookId?: string;
      error?: string;
    }>(`/facebook-accounts/${accountId}/registration-status`);
    return response.data;
  },

  async cancelRegistration(accountId: string): Promise<void> {
    await api.post(`/facebook-accounts/${accountId}/cancel-registration`);
  },

  /**
   * v1.2.1 —— 出厂重置账号
   */
  async factoryReset(id: string): Promise<{
    accountDeleted: boolean;
    profileDeleted: boolean;
    profilePath: string | null;
    warmupRowsDeleted: number;
    groupJoinRowsDeleted: number;
    tasksDeleted: number;
    recycledNumber: number | null;
  }> {
    const r = await api.post<any>(`/facebook-accounts/${id}/factory-reset`);
    return unwrapApi<any>(r.data);
  },

  // ─── v1.2.0 Phase 1 — 暖化分组（用 unwrap 解包 TransformInterceptor 的 { success, data, ts }） ─
  async getGroupStats(): Promise<GroupStats> {
    const response = await api.get<any>('/facebook-accounts/group-stats');
    return unwrapApi<GroupStats>(response.data);
  },

  async assignGroup(id: string, groupNumber: number | null): Promise<{ data: FacebookAccount }> {
    const response = await api.patch<{ data: FacebookAccount }>(
      `/facebook-accounts/${id}/group`,
      { groupNumber },
    );
    return response.data;
  },

  async batchAssignGroup(
    accountIds: string[],
    groupNumber: number | null,
  ): Promise<{ updated: number }> {
    const response = await api.patch<any>(
      '/facebook-accounts/batch-assign-group',
      { accountIds, groupNumber },
    );
    return unwrapApi<{ updated: number }>(response.data);
  },

  async getWarmupSettings(): Promise<WarmupSettings> {
    const response = await api.get<any>('/users/me/warmup-settings');
    return unwrapApi<WarmupSettings>(response.data);
  },

  async updateWarmupSettings(settings: WarmupSettings): Promise<WarmupSettings> {
    const response = await api.patch<any>('/users/me/warmup-settings', settings);
    return unwrapApi<WarmupSettings>(response.data);
  },

  async getGroupJoinSettings(): Promise<GroupJoinSettings> {
    const response = await api.get<any>('/users/me/group-join-settings');
    return unwrapApi<GroupJoinSettings>(response.data);
  },

  async updateGroupJoinSettings(settings: GroupJoinSettings): Promise<GroupJoinSettings> {
    const response = await api.patch<any>('/users/me/group-join-settings', settings);
    return unwrapApi<GroupJoinSettings>(response.data);
  },
};

export type AiProvider = 'claude' | 'openai' | 'deepseek';

export interface GroupJoinSettings {
  keywords: string[];
  dailyLimit: number;
  strategy: 'random' | 'sequential' | 'weighted';
  aiAnswerEnabled: boolean;
  aiAnswerPrompt: string;
  aiProvider?: AiProvider;
  /** 读取时：遮罩字符串（如 sk-…abc9）；写入时：新 key 明文，或空串保留旧值，或 "__CLEAR__" 清空 */
  aiApiKey?: string;
  /** 只读：后端告诉前端是否已配置过 key */
  aiApiKeyConfigured?: boolean;
}

/** 提供商元数据 —— UI 下拉显示用 */
export const AI_PROVIDERS: Array<{
  value: AiProvider;
  label: string;
  model: string;
  costHint: string;
  keyHint: string;
}> = [
  {
    value: 'claude',
    label: 'Claude Haiku',
    model: 'claude-haiku (Anthropic)',
    costHint: '每 500 次加群约 $0.5',
    keyHint: 'sk-ant-api03-...',
  },
  {
    value: 'openai',
    label: 'GPT-4o-mini',
    model: 'gpt-4o-mini (OpenAI)',
    costHint: '每 500 次加群约 $0.4',
    keyHint: 'sk-proj-...',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek Chat',
    model: 'deepseek-chat (性价比最高)',
    costHint: '每 500 次加群约 $0.05（最便宜）',
    keyHint: 'sk-...',
  },
];

/**
 * 格式化分组标签：1 -> "G1", 3 -> "G3", null -> "未分组"
 */
export function formatGroupLabel(n?: number | null): string {
  if (n == null) return '未分组';
  return `G${n}`;
}

/**
 * 分组颜色（6 组各一个色，保持视觉区分）
 */
export function getGroupColor(n?: number | null): string {
  if (n == null) return 'default';
  // v1.4.0：扩到 9 组（Enterprise 配套）
  const colors = ['blue', 'green', 'gold', 'purple', 'magenta', 'cyan', 'orange', 'volcano', 'geekblue'];
  return colors[(n - 1) % colors.length] || 'default';
}
