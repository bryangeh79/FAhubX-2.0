export interface ProxyConfig {
  proxyServer: string; // e.g. "http://host:port" or "socks5://host:port"
  credentials: { username: string; password: string } | null;
}

/**
 * 把 VpnConfig 数据库记录转成 Puppeteer 的代理参数。
 * 支持的协议：
 *   - socks5    → socks5://... (静态住宅 IP、911 S5 等首选)
 *   - http      → http://...   (HTTP 代理)
 *   - shadowsocks → socks5://... (底层是 socks5)
 *   - openvpn/wireguard/其他 → 兜底当 HTTP 处理（但实际上这些协议 Chromium 不原生支持，需系统级 VPN）
 */
export function resolveVpnProxy(vpnConfig: any): ProxyConfig | null {
  if (!vpnConfig) return null;

  const server = vpnConfig.server || vpnConfig.endpoint || '';
  const port = vpnConfig.port || 1080;
  const protocol = (vpnConfig.protocol || vpnConfig.type || '').toLowerCase();
  const username = vpnConfig.username || '';
  const password = vpnConfig.password || '';

  if (!server) return null;

  let proxyServer: string;
  let credentials: { username: string; password: string } | null = null;

  // SOCKS5 / Shadowsocks → socks5 代理
  if (protocol === 'socks5' || protocol === 'shadowsocks' || protocol === 'wireguard') {
    proxyServer = `socks5://${server}:${port}`;
    if (username && password) {
      credentials = { username, password };
    }
  }
  // HTTP / 其他 / 未识别 → http 代理（Chromium 原生支持）
  else {
    proxyServer = `http://${server}:${port}`;
    if (username && password) {
      credentials = { username, password };
    }
  }

  return { proxyServer, credentials };
}
