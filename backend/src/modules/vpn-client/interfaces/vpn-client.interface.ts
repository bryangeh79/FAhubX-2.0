export interface VPNConnectionStatus {
  connected: boolean;
  status: string;
  localIp?: string;
  remoteIp?: string;
  bytesIn: number;
  bytesOut: number;
  connectedSince?: Date;
  error?: string;
}

export interface VPNClient {
  connect(config: any): Promise<VPNConnectionStatus>;
  disconnect(): Promise<void>;
  getStatus(): Promise<VPNConnectionStatus>;
  isConnected(): Promise<boolean>;
}

export interface OpenVPNConfig {
  configFile: string;
  authFile?: string;
  username?: string;
  password?: string;
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
  tlsAuth?: string;
  protocol?: 'udp' | 'tcp';
  port?: number;
  server?: string;
}

export interface WireGuardConfig {
  privateKey: string;
  publicKey: string;
  endpoint: string;
  allowedIPs: string;
  dns?: string;
  persistentKeepalive?: number;
}

export interface ProxyConfig {
  type: 'socks5' | 'http' | 'https';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface NetworkMetrics {
  latency: number; // ms
  jitter: number; // ms
  packetLoss: number; // percentage
  bandwidth: {
    download: number; // Mbps
    upload: number; // Mbps
  };
  stability: number; // 0-100 score
}

export interface IPAllocationCriteria {
  accountId: string;
  taskType?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  countryCode?: string;
  ipType?: 'residential' | 'datacenter' | 'mobile' | 'shared';
  minHealthScore?: number;
  maxLatency?: number;
}

export interface IPHealthCheckResult {
  ipAddress: string;
  healthScore: number;
  latency: number;
  packetLoss: number;
  bandwidth: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked: Date;
  details?: any;
}