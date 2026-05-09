import * as crypto from 'crypto';

/**
 * 通用 AES-256-GCM 加解密（和 facebook-accounts.service 的加密方式一致，
 * 但提取成独立 util 便于复用）。
 *
 * 格式：ivHex:encryptedHex:authTagHex
 *
 * 注意：encryption.key 必须在 config 里配置 32 字节随机串。
 * 生产环境千万不能用默认值 —— config 模块本来就会在启动时警告。
 */
const ALG = 'aes-256-gcm';

function getKey(encryptionKey: string): Buffer {
  return crypto.scryptSync(encryptionKey, 'salt', 32);
}

export function encryptString(plain: string, encryptionKey: string): string {
  if (!plain) return '';
  const key = getKey(encryptionKey);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  let encrypted = cipher.update(plain, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

export function decryptString(encryptedData: string, encryptionKey: string): string {
  if (!encryptedData) return '';
  const [ivHex, encrypted, authTagHex] = encryptedData.split(':');
  if (!ivHex || !encrypted || !authTagHex) {
    // 不是加密格式 —— 可能是明文 legacy 数据；返回原样
    return encryptedData;
  }
  const key = getKey(encryptionKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * 遮罩敏感字符串（展示用）：sk-abc12345xyz789 → sk-…789
 * 保留前缀 + 后 4 位，中间全部替换为 …
 */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '****';
  const prefix = secret.slice(0, 3);
  const suffix = secret.slice(-4);
  return `${prefix}…${suffix}`;
}
