import api from './api';

export interface VPNConfig {
  id: string;
  name: string;
  type: 'OpenVPN' | 'WireGuard' | 'Shadowsocks' | 'Other';
  status: 'connected' | 'disconnecting' | 'disconnected' | 'error' | 'connecting';
  ipAddress: string;
  serverAddress: string;
  port: number;
  username?: string;
  password?: string;
  configFile?: string;
  country?: string;
  city?: string;
  latency?: number;
  bandwidth?: number;
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVPNData {
  name: string;
  type: 'OpenVPN' | 'WireGuard' | 'Shadowsocks' | 'Other';
  serverAddress: string;
  port: number;
  username?: string;
  password?: string;
  country?: string;
  city?: string;
}

export interface UpdateVPNData extends Partial<CreateVPNData> {}

export interface VPNListResponse {
  vpns: VPNConfig[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

// VPN配置服务
export const vpnService = {
  // 获取VPN列表
  async getVPNs(params?: { page?: number; limit?: number }): Promise<{ data: VPNListResponse }> {
    const response = await api.get<{ data: VPNListResponse }>('/vpn-configs', { params });
    return response.data;
  },

  // 获取单个VPN
  async getVPN(id: string): Promise<{ data: VPNConfig }> {
    const response = await api.get<{ data: VPNConfig }>(`/vpn-configs/${id}`);
    return response.data;
  },

  async createVPN(data: CreateVPNData): Promise<{ data: VPNConfig }> {
    const response = await api.post<{ data: VPNConfig }>('/vpn-configs', data);
    return response.data;
  },

  async updateVPN(id: string, data: UpdateVPNData): Promise<{ data: VPNConfig }> {
    const response = await api.patch<{ data: VPNConfig }>(`/vpn-configs/${id}`, data);
    return response.data;
  },

  async deleteVPN(id: string): Promise<void> {
    await api.delete(`/vpn-configs/${id}`);
  },

  async setDefault(id: string): Promise<{ data: VPNConfig }> {
    const response = await api.post<{ data: VPNConfig }>(`/vpn-configs/${id}/set-default`);
    return response.data;
  },

  async connectVPN(id: string): Promise<{ data: VPNConfig }> {
    const response = await api.post<{ data: VPNConfig }>(`/vpn-configs/${id}/connect`);
    return response.data;
  },

  async disconnectVPN(id: string): Promise<{ data: VPNConfig }> {
    const response = await api.post<{ data: VPNConfig }>(`/vpn-configs/${id}/disconnect`);
    return response.data;
  },

  // 测试VPN连接
  async testVPN(id: string): Promise<{ latency: number; bandwidth: number; success: boolean }> {
    const response = await api.post<{ latency: number; bandwidth: number; success: boolean }>(`/vpns/${id}/test`);
    return response.data;
  },
};