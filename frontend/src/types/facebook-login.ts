// Facebook登录流程相关类型定义

// VPN配置类型
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
  latency?: number; // 延迟(ms)
  bandwidth?: number; // 带宽(Mbps)
  lastConnectedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// IP轮换策略
export interface IPRotationPolicy {
  id: string;
  name: string;
  type: 'time_based' | 'request_based' | 'manual' | 'dynamic';
  intervalMinutes?: number;
  maxRequestsPerIP?: number;
  enabled: boolean;
  accounts: string[]; // 关联的账号ID
  createdAt: string;
  updatedAt: string;
}

// 浏览器指纹配置
export interface BrowserFingerprint {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  language: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  webglVendor: string;
  webglRenderer: string;
  canvasFingerprint: string;
  audioFingerprint: string;
  fonts: string[];
  plugins: string[];
}

// 人类行为参数
export interface HumanBehaviorParams {
  mouseMovement: {
    enabled: boolean;
    speedVariation: number; // 0-1
    pauseProbability: number; // 0-1
    curveProbability: number; // 0-1
  };
  keyboardInput: {
    enabled: boolean;
    typingSpeed: number; // 字符/分钟
    errorRate: number; // 0-1
    backspaceProbability: number; // 0-1
  };
  scrolling: {
    enabled: boolean;
    speedVariation: number; // 0-1
    pauseProbability: number; // 0-1
    scrollDirectionChanges: boolean;
  };
  pageInteraction: {
    enabled: boolean;
    clickRandomness: number; // 0-1
    hoverProbability: number; // 0-1
    tabSwitchProbability: number; // 0-1
  };
}

// 设备模拟选项
export interface DeviceSimulation {
  deviceType: 'desktop' | 'mobile' | 'tablet';
  os: 'windows' | 'macos' | 'linux' | 'android' | 'ios';
  osVersion: string;
  browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  browserVersion: string;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  touchSupport: boolean;
}

// 流量模式配置
export interface TrafficPattern {
  id: string;
  name: string;
  requestInterval: number; // 请求间隔(秒)
  requestRandomness: number; // 随机性(0-1)
  pageDepth: number; // 页面深度
  stayTime: number; // 停留时间(秒)
  actionsPerSession: number; // 每会话动作数
  createdAt: string;
  updatedAt: string;
}

// 反检测配置
export interface AntiDetectionConfig {
  id: string;
  name: string;
  browserFingerprint: BrowserFingerprint;
  humanBehavior: HumanBehaviorParams;
  deviceSimulation: DeviceSimulation;
  trafficPatternId?: string;
  trafficPattern?: TrafficPattern;
  enabled: boolean;
  accounts: string[]; // 关联的账号ID
  createdAt: string;
  updatedAt: string;
}

// 登录会话信息
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
  localStorage?: Record<string, any>;
  sessionStorage?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// 登录状态
export interface LoginStatus {
  accountId: string;
  isLoggedIn: boolean;
  lastLoginAttempt?: string;
  lastSuccessfulLogin?: string;
  loginFailures: number;
  lastFailureReason?: string;
  session?: LoginSession;
  requiresVerification: boolean;
  verificationType?: 'email' | 'sms' | '2fa' | 'captcha';
  nextLoginAttempt?: string;
  createdAt: string;
  updatedAt: string;
}

// 登录测试结果
export interface LoginTestResult {
  success: boolean;
  timestamp: string;
  duration: number; // 毫秒
  ipAddress: string;
  userAgent: string;
  steps: Array<{
    name: string;
    success: boolean;
    duration: number;
    error?: string;
    screenshot?: string;
  }>;
  cookiesCount: number;
  sessionCreated: boolean;
  sessionId?: string;
  warnings: string[];
  errors: string[];
}

// 账号-VPN关联
export interface AccountVPNAssociation {
  id: string;
  accountId: string;
  vpnId: string;
  vpnConfig?: VPNConfig;
  priority: number;
  failoverEnabled: boolean;
  failoverVPNIds: string[];
  connectionStrategy: 'round_robin' | 'sticky' | 'latency_based' | 'manual';
  lastUsedAt?: string;
  successRate: number; // 0-1
  createdAt: string;
  updatedAt: string;
}

// 扩展的Facebook账号信息
export interface ExtendedFacebookAccount {
  // 基础信息
  id: string;
  name: string;
  facebookId?: string;
  email?: string;
  facebookPassword?: string;
  remarks?: string;
  accountType: 'user' | 'page' | 'business';
  verified?: boolean;
  loginStatus?: boolean;
  status?: string;
  createdAt: string;
  updatedAt?: string;
  
  // 登录相关
  loginConfig?: {
    vpnAssociationId?: string;
    antiDetectionConfigId?: string;
    autoReconnect: boolean;
    reconnectInterval: number; // 分钟
    maxReconnectAttempts: number;
  };
  
  // 会话管理
  currentSession?: LoginSession;
  loginHistory?: Array<{
    timestamp: string;
    success: boolean;
    ipAddress: string;
    duration: number;
  }>;
  
  // 统计信息
  stats?: {
    totalLogins: number;
    successfulLogins: number;
    averageLoginTime: number;
    lastLoginDate?: string;
    consecutiveFailures: number;
  };
}

// API请求/响应类型
export interface TestLoginRequest {
  vpnId?: string;
  antiDetectionConfigId?: string;
  saveSession: boolean;
  timeout: number; // 秒
}

export interface AssignVPNRequest {
  vpnId: string;
  priority?: number;
  failoverVPNIds?: string[];
  connectionStrategy?: 'round_robin' | 'sticky' | 'latency_based' | 'manual';
}

export interface SaveSessionRequest {
  sessionData: {
    cookies: Record<string, any>;
    localStorage: Record<string, any>;
    sessionStorage: Record<string, any>;
  };
  expiresIn: number; // 小时
}

export interface UpdateAntiDetectionConfigRequest {
  name?: string;
  browserFingerprint?: Partial<BrowserFingerprint>;
  humanBehavior?: Partial<HumanBehaviorParams>;
  deviceSimulation?: Partial<DeviceSimulation>;
  trafficPatternId?: string;
  enabled?: boolean;
}