import * as crypto from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 机器指纹持久化文件路径
 * 安装目录下的 data/ 目录（由 .env 的 BROWSER_DATA_DIR 父目录推断）
 * 首次计算后写入，之后永远读文件，避免网络适配器变动导致指纹漂移
 */
function getMachineIdFilePath(): string {
  // 优先使用 install dir / data / machine-id
  // BROWSER_DATA_DIR = C:\FAhubX\data\browsers → 父目录 C:\FAhubX\data
  const browserDataDir = process.env.BROWSER_DATA_DIR;
  const baseDir = browserDataDir
    ? path.dirname(browserDataDir)
    : path.join(process.cwd(), 'data');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return path.join(baseDir, 'machine-id');
}

/**
 * 计算机器指纹（基于物理 MAC 地址，排除虚拟/临时接口）
 */
function computeMachineId(): string {
  const parts: string[] = [];

  // 仅保留物理 MAC 地址，排除虚拟接口（TAP/Bluetooth/VMware 等）
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces).sort()) {
    // 跳过已知虚拟接口
    const lower = name.toLowerCase();
    if (
      lower.includes('vmware') ||
      lower.includes('virtualbox') ||
      lower.includes('vbox') ||
      lower.includes('tap-') ||
      lower.includes('tun') ||
      lower.includes('vethernet') ||
      lower.includes('bluetooth') ||
      lower.includes('loopback') ||
      lower.includes('pseudo')
    ) {
      continue;
    }
    const nets = interfaces[name];
    if (!nets) continue;
    for (const net of nets) {
      if (net.mac && net.mac !== '00:00:00:00:00:00' && !net.internal) {
        parts.push(net.mac);
      }
    }
  }

  // Fallback：若所有物理接口都被过滤（极端情况），再计入 hostname
  if (parts.length === 0) {
    parts.push(os.hostname());
  }

  // CPU 型号（额外唯一性，但不会变化）
  const cpus = os.cpus();
  if (cpus.length > 0) {
    parts.push(cpus[0].model);
  }

  const raw = parts.join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

/**
 * 生成/读取机器指纹。
 * 首次调用：计算并写入 data/machine-id 文件
 * 之后调用：读文件（绝对稳定，不会因网络变动漂移）
 */
export function getMachineId(): string {
  const filePath = getMachineIdFilePath();

  try {
    if (fs.existsSync(filePath)) {
      const saved = fs.readFileSync(filePath, 'utf-8').trim();
      if (/^[0-9a-f]{32}$/.test(saved)) {
        return saved;
      }
    }
  } catch (_) { /* 读取失败则重新生成 */ }

  const fresh = computeMachineId();
  try {
    fs.writeFileSync(filePath, fresh, 'utf-8');
  } catch (_) { /* 写入失败不影响返回 */ }
  return fresh;
}
