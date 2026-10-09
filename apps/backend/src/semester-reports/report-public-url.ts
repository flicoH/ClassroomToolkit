import { ServiceUnavailableException } from '@nestjs/common';

/** Use an explicit server setting rather than trusting request Host headers for parent links. */
export function readReportPublicBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const production = env.NODE_ENV === 'production';
  const configured = env.REPORT_PUBLIC_BASE_URL?.trim();
  const invalid = () =>
    new ServiceUnavailableException(
      'REPORT_PUBLIC_BASE_URL 必须设置为家长可访问的 HTTP(S) 网站根地址，不能使用 localhost 或示例域名',
    );
  if (!configured && production) throw invalid();
  let url: URL;
  try {
    url = new URL(configured || 'http://localhost:3001');
  } catch {
    throw invalid();
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw invalid();
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    production &&
    (/(^|\.)localhost$/.test(host) ||
      /^127\./.test(host) ||
      ['localhost.localdomain', '0.0.0.0', '[::1]', '[::]'].includes(host) ||
      /(^|\.)example\.(com|net|org)$/.test(host))
  )
    throw invalid();
  return url.origin;
}
