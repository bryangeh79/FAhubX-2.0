/**
 * Map VPN exit-country (ISO-3166-1 alpha-2) → browser locale + IANA timezone.
 *
 * 用于把浏览器的 Accept-Language / navigator.languages 和 timezone 跟 VPN
 * 出口 IP 保持一致，避免 Facebook 反爬抓到"美国 IP + 中文 Accept-Language"
 * 这种明显矛盾的指纹。
 *
 * 如果 country 没命中，回退到 en-US / UTC（中性，不会产生矛盾）。
 */

export interface BrowserLocale {
  /** 用于 Accept-Language HTTP 头 */
  acceptLanguage: string;
  /** 用于 navigator.languages 数组 */
  languages: string[];
  /** 用于 Intl / Date 显示 */
  primaryLanguage: string;
  /** IANA timezone for page.emulateTimezone */
  timezone: string;
}

const FALLBACK: BrowserLocale = {
  acceptLanguage: 'en-US,en;q=0.9',
  languages: ['en-US', 'en'],
  primaryLanguage: 'en-US',
  timezone: 'UTC',
};

const COUNTRY_MAP: Record<string, BrowserLocale> = {
  US: { acceptLanguage: 'en-US,en;q=0.9', languages: ['en-US', 'en'], primaryLanguage: 'en-US', timezone: 'America/New_York' },
  CA: { acceptLanguage: 'en-CA,en;q=0.9,fr-CA;q=0.5', languages: ['en-CA', 'en', 'fr-CA'], primaryLanguage: 'en-CA', timezone: 'America/Toronto' },
  GB: { acceptLanguage: 'en-GB,en;q=0.9', languages: ['en-GB', 'en'], primaryLanguage: 'en-GB', timezone: 'Europe/London' },
  UK: { acceptLanguage: 'en-GB,en;q=0.9', languages: ['en-GB', 'en'], primaryLanguage: 'en-GB', timezone: 'Europe/London' },
  AU: { acceptLanguage: 'en-AU,en;q=0.9', languages: ['en-AU', 'en'], primaryLanguage: 'en-AU', timezone: 'Australia/Sydney' },
  DE: { acceptLanguage: 'de-DE,de;q=0.9,en;q=0.7', languages: ['de-DE', 'de', 'en'], primaryLanguage: 'de-DE', timezone: 'Europe/Berlin' },
  FR: { acceptLanguage: 'fr-FR,fr;q=0.9,en;q=0.7', languages: ['fr-FR', 'fr', 'en'], primaryLanguage: 'fr-FR', timezone: 'Europe/Paris' },
  ES: { acceptLanguage: 'es-ES,es;q=0.9,en;q=0.7', languages: ['es-ES', 'es', 'en'], primaryLanguage: 'es-ES', timezone: 'Europe/Madrid' },
  IT: { acceptLanguage: 'it-IT,it;q=0.9,en;q=0.7', languages: ['it-IT', 'it', 'en'], primaryLanguage: 'it-IT', timezone: 'Europe/Rome' },
  NL: { acceptLanguage: 'nl-NL,nl;q=0.9,en;q=0.8', languages: ['nl-NL', 'nl', 'en'], primaryLanguage: 'nl-NL', timezone: 'Europe/Amsterdam' },
  JP: { acceptLanguage: 'ja-JP,ja;q=0.9,en;q=0.7', languages: ['ja-JP', 'ja', 'en'], primaryLanguage: 'ja-JP', timezone: 'Asia/Tokyo' },
  KR: { acceptLanguage: 'ko-KR,ko;q=0.9,en;q=0.7', languages: ['ko-KR', 'ko', 'en'], primaryLanguage: 'ko-KR', timezone: 'Asia/Seoul' },
  CN: { acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.7', languages: ['zh-CN', 'zh', 'en'], primaryLanguage: 'zh-CN', timezone: 'Asia/Shanghai' },
  HK: { acceptLanguage: 'zh-HK,zh;q=0.9,en;q=0.8', languages: ['zh-HK', 'zh', 'en'], primaryLanguage: 'zh-HK', timezone: 'Asia/Hong_Kong' },
  TW: { acceptLanguage: 'zh-TW,zh;q=0.9,en;q=0.7', languages: ['zh-TW', 'zh', 'en'], primaryLanguage: 'zh-TW', timezone: 'Asia/Taipei' },
  SG: { acceptLanguage: 'en-SG,en;q=0.9,zh-SG;q=0.7', languages: ['en-SG', 'en', 'zh-SG'], primaryLanguage: 'en-SG', timezone: 'Asia/Singapore' },
  MY: { acceptLanguage: 'en-MY,en;q=0.9,ms-MY;q=0.7,zh-MY;q=0.5', languages: ['en-MY', 'en', 'ms-MY'], primaryLanguage: 'en-MY', timezone: 'Asia/Kuala_Lumpur' },
  ID: { acceptLanguage: 'id-ID,id;q=0.9,en;q=0.7', languages: ['id-ID', 'id', 'en'], primaryLanguage: 'id-ID', timezone: 'Asia/Jakarta' },
  TH: { acceptLanguage: 'th-TH,th;q=0.9,en;q=0.7', languages: ['th-TH', 'th', 'en'], primaryLanguage: 'th-TH', timezone: 'Asia/Bangkok' },
  VN: { acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.7', languages: ['vi-VN', 'vi', 'en'], primaryLanguage: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
  PH: { acceptLanguage: 'en-PH,en;q=0.9,fil;q=0.7', languages: ['en-PH', 'en', 'fil'], primaryLanguage: 'en-PH', timezone: 'Asia/Manila' },
  IN: { acceptLanguage: 'en-IN,en;q=0.9,hi-IN;q=0.7', languages: ['en-IN', 'en', 'hi-IN'], primaryLanguage: 'en-IN', timezone: 'Asia/Kolkata' },
  BR: { acceptLanguage: 'pt-BR,pt;q=0.9,en;q=0.7', languages: ['pt-BR', 'pt', 'en'], primaryLanguage: 'pt-BR', timezone: 'America/Sao_Paulo' },
  MX: { acceptLanguage: 'es-MX,es;q=0.9,en;q=0.7', languages: ['es-MX', 'es', 'en'], primaryLanguage: 'es-MX', timezone: 'America/Mexico_City' },
  AR: { acceptLanguage: 'es-AR,es;q=0.9,en;q=0.7', languages: ['es-AR', 'es', 'en'], primaryLanguage: 'es-AR', timezone: 'America/Argentina/Buenos_Aires' },
  RU: { acceptLanguage: 'ru-RU,ru;q=0.9,en;q=0.7', languages: ['ru-RU', 'ru', 'en'], primaryLanguage: 'ru-RU', timezone: 'Europe/Moscow' },
  TR: { acceptLanguage: 'tr-TR,tr;q=0.9,en;q=0.7', languages: ['tr-TR', 'tr', 'en'], primaryLanguage: 'tr-TR', timezone: 'Europe/Istanbul' },
  AE: { acceptLanguage: 'ar-AE,ar;q=0.9,en;q=0.7', languages: ['ar-AE', 'ar', 'en'], primaryLanguage: 'ar-AE', timezone: 'Asia/Dubai' },
  SA: { acceptLanguage: 'ar-SA,ar;q=0.9,en;q=0.7', languages: ['ar-SA', 'ar', 'en'], primaryLanguage: 'ar-SA', timezone: 'Asia/Riyadh' },
  ZA: { acceptLanguage: 'en-ZA,en;q=0.9', languages: ['en-ZA', 'en'], primaryLanguage: 'en-ZA', timezone: 'Africa/Johannesburg' },
};

/**
 * 根据国家代码（大小写不敏感）返回对应的浏览器 locale。
 * 命中失败时回退到 en-US / UTC。
 */
export function getBrowserLocale(country?: string | null): BrowserLocale {
  if (!country) return FALLBACK;
  const code = country.trim().toUpperCase();
  return COUNTRY_MAP[code] || FALLBACK;
}
