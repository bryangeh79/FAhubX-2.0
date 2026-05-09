/** Generate a license key in FAH-XXXX-XXXX-XXXX format */
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FAH-${segment()}-${segment()}-${segment()}`;
}

/** Generate a UUID v4 */
export function generateId(): string {
  return crypto.randomUUID();
}
