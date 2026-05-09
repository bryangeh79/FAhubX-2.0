import api from './api';
import { ExtendedFacebookAccount } from '../types/facebook-login';

// 登录状态相关类型定义
export interface LoginStatus {
  accountId: string;
  isLoggedIn: boolean;
  lastLoginAttempt?: string;
  lastSuccessfulLogin?: string;
  loginFailures: number;
  lastFailureReason?: string;
  requiresVerification: boolean;
  verificationType?: 'email' | 'sms' | '2fa' | 'captcha';
  nextLoginAttempt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginSession {
  id: string;
  accountId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  loginTime: string;
  lastActivity: string;
  expiresAt: string;
  status: 'active' | 'expired' | 'invalidated' | 'error';
  cookies?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface VPNStatus {
  connected: boolean;
  ipAddress?: string;
  country?: string;
  city?: string;
  latency?: number;
  bandwidth?: number;
  lastConnectedAt?: string;
}

export interface AntiDetectionStatus {
  enabled: boolean;
  lastCheck?: string;
  issues?: string[];
  score?: number;
}

export interface AccountLoginStatus extends Omit<ExtendedFacebookAccount, 'loginStatus'> {
  loginStatus?: LoginStatus;
  currentSession?: LoginSession;
  vpnStatus?: VPNStatus;
  antiDetectionStatus?: AntiDetectionStatus;
  healthScore?: number;
}

export interface StatusStats {
  total: number;
  online: number;
  offline: number;
  verifying: number;
  failed: number;
  healthy: number;
  warning: number;
  critical: number;
  avgHealthScore: number;
  lastUpdated: string;
}

export interface StatusTrendData {
  timestamp: string;
  online: number;
  offline: number;
  verifying: number;
  failed: number;
  healthy: number;
  warning: number;
  critical: number;
}

export interface GetStatusParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  timeRange?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface StatusResponse {
  data: {
    accounts: AccountLoginStatus[];
    stats: StatusStats;
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

export interface TrendResponse {
  data: {
    trends: StatusTrendData[];
    period: string;
    from: string;
    to: string;
  };
}

export interface ReconnectConfig {
  enabled: boolean;
  maxAttempts: number;
  attemptInterval: number;
  failureThreshold: number;
  healthThreshold: number;
  strategy: 'smart' | 'aggressive' | 'conservative' | 'custom';
  notificationEnabled: boolean;
  rules: Array<{
    id: string;
    name: string;
    condition: any;
    action: any;
    enabled: boolean;
    accounts: string[];
  }>;
}

export interface HealthAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: string;
  acknowledged: boolean;
  accountId?: string;
  accountName?: string;
}

export const loginStatusService = {
  // 获取所有账号的登录状态
  async getStatus(params?: GetStatusParams): Promise<StatusResponse> {
    const response = await api.get<StatusResponse>('/login-status', { params });
    return response.data;
  },

  // 获取单个账号的详细状态
  async getAccountStatus(accountId: string): Promise<{ data: AccountLoginStatus }> {
    const response = await api.get<{ data: AccountLoginStatus }>(`/login-status/${accountId}`);
    return response.data;
  },

  // 获取状态统计
  async getStats(): Promise<{ data: StatusStats }> {
    const response = await api.get<{ data: StatusStats }>('/login-status/stats');
    return response.data;
  },

  // 获取状态趋势
  async getTrends(period: string = '7d'): Promise<TrendResponse> {
    const response = await api.get<TrendResponse>('/login-status/trends', {
      params: { period },
    });
    return response.data;
  },

  // 手动刷新状态
  async refreshStatus(accountIds?: string[]): Promise<void> {
    await api.post('/login-status/refresh', { accountIds });
  },

  // 重试登录
  async retryLogin(accountId: string): Promise<{ data: { success: boolean; message: string } }> {
    const response = await api.post<{ data: { success: boolean; message: string } }>(
      `/login-status/${accountId}/retry`
    );
    return response.data;
  },

  // 清除会话
  async clearSession(accountId: string): Promise<void> {
    await api.delete(`/login-status/${accountId}/session`);
  },

  // 批量操作
  async batchRetry(accountIds: string[]): Promise<{ data: { success: number; failed: number } }> {
    const response = await api.post<{ data: { success: number; failed: number } }>(
      '/login-status/batch/retry',
      { accountIds }
    );
    return response.data;
  },

  async batchClearSessions(accountIds: string[]): Promise<{ data: { cleared: number } }> {
    const response = await api.post<{ data: { cleared: number } }>(
      '/login-status/batch/clear-sessions',
      { accountIds }
    );
    return response.data;
  },

  // 获取自动重连配置
  async getReconnectConfig(accountId?: string): Promise<{ data: ReconnectConfig }> {
    const url = accountId 
      ? `/login-status/reconnect-config/${accountId}`
      : '/login-status/reconnect-config';
    const response = await api.get<{ data: ReconnectConfig }>(url);
    return response.data;
  },

  // 更新自动重连配置
  async updateReconnectConfig(config: Partial<ReconnectConfig>, accountId?: string): Promise<{ data: ReconnectConfig }> {
    const url = accountId
      ? `/login-status/reconnect-config/${accountId}`
      : '/login-status/reconnect-config';
    const response = await api.patch<{ data: ReconnectConfig }>(url, config);
    return response.data;
  },

  // 获取健康告警
  async getHealthAlerts(params?: {
    status?: string;
    severity?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: HealthAlert[]; meta: any }> {
    const response = await api.get<{ data: HealthAlert[]; meta: any }>('/login-status/alerts', { params });
    return response.data;
  },

  // 确认告警
  async acknowledgeAlert(alertId: string): Promise<void> {
    await api.put(`/login-status/alerts/${alertId}/acknowledge`);
  },

  // 解决告警
  async resolveAlert(alertId: string, resolutionDescription: string): Promise<void> {
    await api.put(`/login-status/alerts/${alertId}/resolve`, { resolutionDescription });
  },

  // 导出状态报告
  async exportReport(format: 'csv' | 'json' | 'pdf' = 'csv'): Promise<Blob> {
    const response = await api.get(`/login-status/export`, {
      params: { format },
      responseType: 'blob',
    });
    return response.data;
  },

  // 实时状态更新（WebSocket）
  getRealtimeStatus(callback: (data: any) => void): () => void {
    // 这里应该实现WebSocket连接
    // 暂时返回一个空函数
    console.log('WebSocket连接已建立');
    
    // 模拟实时数据
    const intervalId = setInterval(() => {
      // 模拟实时更新
      callback({
        type: 'status_update',
        timestamp: new Date().toISOString(),
        data: {
          online: Math.floor(Math.random() * 10) + 20,
          offline: Math.floor(Math.random() * 5),
        },
      });
    }, 5000);
    
    // 返回清理函数
    return () => {
      clearInterval(intervalId);
      console.log('WebSocket连接已关闭');
    };
  },
};

// 工具函数
export const statusUtils = {
  // 获取状态标签
  getStatusLabel(status?: LoginStatus): string {
    if (!status) return '未知';
    
    if (status.requiresVerification) return '验证中';
    if (status.isLoggedIn) return '在线';
    if (status.loginFailures > 0) return '失败';
    return '离线';
  },

  // 获取状态颜色
  getStatusColor(status?: LoginStatus): string {
    if (!status) return 'default';
    
    if (status.requiresVerification) return 'orange';
    if (status.isLoggedIn) return 'green';
    if (status.loginFailures > 0) return 'red';
    return 'default';
  },

  // 获取健康状态标签
  getHealthLabel(score?: number): string {
    if (!score) return '未知';
    
    if (score >= 80) return '健康';
    if (score >= 60) return '警告';
    return '危险';
  },

  // 获取健康状态颜色
  getHealthColor(score?: number): string {
    if (!score) return 'default';
    
    if (score >= 80) return 'green';
    if (score >= 60) return 'orange';
    return 'red';
  },

  // 计算会话剩余时间
  getSessionRemainingTime(session?: LoginSession): {
    hours: number;
    minutes: number;
    seconds: number;
    expired: boolean;
  } {
    if (!session) {
      return { hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    
    const now = new Date();
    const expiry = new Date(session.expiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return { hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds, expired: false };
  },

  // 格式化时间
  formatTime(dateString?: string): string {
    if (!dateString) return '从未';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}天前`;
    
    return date.toLocaleDateString();
  },
};