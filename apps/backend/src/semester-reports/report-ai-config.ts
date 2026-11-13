import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { ReportAiSettingEntity } from '../admin/entities/report-ai-setting.entity';

export type ReportAiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  source: 'database' | 'env';
};

function encryptionKey() {
  const raw =
    process.env.REPORT_AI_SETTINGS_ENCRYPTION_KEY ||
    process.env.REPORT_SHARE_ENCRYPTION_KEY;
  const key = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
  if (key.length !== 32)
    throw new Error(
      '请配置 32 字节 Base64 的 REPORT_AI_SETTINGS_ENCRYPTION_KEY',
    );
  return key;
}

export function encryptReportAiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptReportAiKey(value: string) {
  const payload = Buffer.from(value, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    payload.subarray(0, 12),
  );
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([
    decipher.update(payload.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}

export function resolveReportAiBalanceUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/users/me/balance`;
  }
  return `${trimmed}/v1/users/me/balance`;
}

export function resolveReportAiChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

export function cleanApiKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

export function envReportAiConfig(): ReportAiConfig | null {
  const baseUrl =
    process.env.REPORT_AI_BASE_URL || process.env.KIMI_BASE_URL || '';
  const apiKey = cleanApiKey(
    process.env.REPORT_AI_API_KEY || process.env.KIMI_API_KEY || '',
  );
  const model = (
    process.env.REPORT_AI_MODEL ||
    process.env.KIMI_MODEL ||
    ''
  ).trim();
  return baseUrl.trim() && apiKey && model
    ? {
        baseUrl: baseUrl.trim().replace(/\/$/, ''),
        apiKey,
        model,
        source: 'env',
      }
    : null;
}

export async function readReportAiConfig(
  source: DataSource | EntityManager,
): Promise<ReportAiConfig | null> {
  let row: ReportAiSettingEntity | null = null;
  try {
    row = await source
      .getRepository(ReportAiSettingEntity)
      .findOne({ where: { id: 'default' } });
  } catch {
    // Unit tests and pre-migration deployments may not have the entity metadata yet.
  }
  if (row) {
    try {
      const apiKey = cleanApiKey(decryptReportAiKey(row.apiKeyCiphertext));
      const baseUrl = row.baseUrl.trim().replace(/\/$/, '');
      const model = row.model.trim();
      if (baseUrl && apiKey && model) {
        return {
          baseUrl,
          apiKey,
          model,
          source: 'database',
        };
      }
    } catch {
      // 优先后端数据库配置；解密失败或格式损坏时回退到 .env
    }
  }
  return envReportAiConfig();
}
