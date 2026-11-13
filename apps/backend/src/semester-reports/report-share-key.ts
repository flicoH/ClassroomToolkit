import { ServiceUnavailableException } from '@nestjs/common';

/** 两个报告工作台使用相同的部署密钥格式，避免配置口径分叉。 */
export function readReportShareKey() {
  const configured = process.env.REPORT_SHARE_ENCRYPTION_KEY;
  if (!configured || Buffer.from(configured, 'base64').length !== 32)
    throw new ServiceUnavailableException(
      'REPORT_SHARE_ENCRYPTION_KEY 必须配置为 32 字节 base64 密钥',
    );
  return Buffer.from(configured, 'base64');
}
