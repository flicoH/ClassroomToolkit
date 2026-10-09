import { basename } from 'node:path';
import { splitPdf, type PdfSplitter } from './pdf-pages';
export type { PdfSplitter } from './pdf-pages';
type Env = Record<string, string | undefined>;
type Page = { page: number; text: string };
type ParserConfig =
  | { provider: 'docling'; url: string; key: string }
  | { provider: 'kimi'; base: string; key: string };

/** Uploads use Kimi by default; Docling requires explicit selection. Keys stay server-only. */
export function readParserConfig(env: Env = process.env): ParserConfig {
  const provider = env.SEMESTER_REPORT_PARSER_PROVIDER || 'kimi';
  if (provider === 'docling') {
    const url = env.SEMESTER_REPORT_PARSER_URL;
    if (!url)
      throw new Error('未配置 PDF 解析服务（SEMESTER_REPORT_PARSER_URL）');
    return { provider, url, key: env.SEMESTER_REPORT_PARSER_API_KEY || '' };
  }
  if (provider !== 'kimi')
    throw new Error('SEMESTER_REPORT_PARSER_PROVIDER 必须是 docling 或 kimi');
  const key = env.KIMI_API_KEY?.trim();
  if (!key || /\s/u.test(key) || key.includes('CHANGE_ME'))
    throw new Error('请配置有效的 KIMI_API_KEY');
  const base = (env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(
    /\/$/u,
    '',
  );
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error('KIMI_BASE_URL 必须是 HTTPS API 地址');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/v1'
  )
    throw new Error('KIMI_BASE_URL 必须是无凭据及查询参数的 HTTPS /v1 地址');
  return { provider, base, key };
}

/** Never filter or renumber malformed pages: that would corrupt report citations. */
export function normalizePdfResult(
  result: unknown,
  expectedPages?: number,
): { pages: Page[]; units: string[] } {
  const data = result as { pages?: unknown; units?: unknown } | null;
  const pages = data?.pages;
  if (
    !Array.isArray(pages) ||
    !pages.length ||
    pages.length > 300 ||
    (expectedPages !== undefined && pages.length !== expectedPages)
  ) {
    throw new Error('PDF 解析结果缺少完整页码文本，或文档内容超限');
  }
  let size = 0;
  let hasText = false;
  const normalized = pages.map((item: unknown, index) => {
    const page = item as Partial<Page> | null;
    if (
      !page ||
      page.page !== index + 1 ||
      typeof page.text !== 'string' ||
      page.text.length > 50000
    ) {
      throw new Error('PDF 解析结果包含缺失、重复或异常页码文本');
    }
    size += page.text.length;
    hasText ||= Boolean(page.text.trim());
    return { page: index + 1, text: page.text };
  });
  if (!hasText || size > 1000000)
    throw new Error('PDF 解析结果为空或全文内容超限');
  const units = Array.isArray(data?.units)
    ? data.units
        .filter((x): x is string => typeof x === 'string' && x.length <= 300)
        .slice(0, 100)
    : [];
  return { pages: normalized, units };
}

async function boundedJson(
  response: Response,
  limit: number,
): Promise<unknown> {
  if (!response.body) throw new Error('服务返回无效 JSON');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('服务响应内容超限');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new Error('服务返回无效或超限 JSON');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function boundedText(response: Response, limit: number) {
  if (!response.body) throw new Error('Kimi 文件解析未返回内容');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('Kimi 文件解析内容超限');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** No paid completion, PDF upload, model choice or local executable in this probe. */
export async function checkPdfParser(env: Env = process.env, fetcher = fetch) {
  const config = readParserConfig(env);
  if (config.provider === 'kimi') {
    let response: Response;
    try {
      response = await fetcher(`${config.base}/models`, {
        headers: { authorization: `Bearer ${config.key}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error('Kimi 配置检查连接失败或超时');
    }
    if (!response.ok)
      throw new Error(`Kimi 配置检查返回 HTTP ${response.status}`);
    const data = (await boundedJson(response, 512 * 1024)) as {
      data?: unknown;
    };
    if (!Array.isArray(data?.data))
      throw new Error('Kimi 配置检查未返回有效模型列表');
  } else {
    const health = new URL(config.url);
    health.pathname = '/health';
    const response = await fetcher(health, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (
      !response.ok ||
      ((await boundedJson(response, 128 * 1024)) as { parser?: string })
        ?.parser !== 'docling'
    )
      throw new Error('Docling 健康检查失败');
  }
}

async function kimiPage(
  pdf: Buffer,
  page: number,
  config: Extract<ParserConfig, { provider: 'kimi' }>,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const headers = {
    authorization: `Bearer ${config.key}`,
  };
  const request = async (
    path: string,
    method: string,
    body?: FormData,
    cleanup = false,
  ) => {
    let response: Response;
    try {
      response = await fetcher(`${config.base}${path}`, {
        method,
        body,
        headers,
        redirect: 'error',
        signal: cleanup
          ? AbortSignal.timeout(15000)
          : AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      });
    } catch {
      throw new Error(`Kimi 第 ${page} 页连接失败或超时，请检查网络后重试`);
    }
    if (!response.ok)
      throw new Error(
        `Kimi 第 ${page} 页返回 HTTP ${response.status}，请检查密钥、额度或限流`,
      );
    return response;
  };
  const form = new FormData();
  form.append('purpose', 'file-extract');
  // A generic name keeps the original filename out of provider metadata.
  form.append(
    'file',
    new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
    'course-page.pdf',
  );
  const upload = (await boundedJson(
    await request('/files', 'POST', form),
    128 * 1024,
  )) as { id?: unknown; extract_status?: unknown };
  if (
    typeof upload?.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,200}$/u.test(upload.id)
  )
    throw new Error(`Kimi 第 ${page} 页未返回有效文件标识`);
  const path = `/files/${upload.id}`;
  let text: string | undefined;
  let failure: Error | undefined;
  try {
    if (upload.extract_status === 'error')
      throw new Error(`Kimi 第 ${page} 页云端内容提取失败`);
    const response = await request(`${path}/content`, 'GET');
    const raw = await boundedText(response, 512 * 1024);
    if (response.headers.get('content-type')?.includes('application/json')) {
      // File API responses may wrap Markdown in {content} or return text/plain;
      // both retain the same original page contract.
      let data: { content?: unknown } | string | null;
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        throw new Error(`Kimi 第 ${page} 页返回无效 JSON`);
      }
      const value = typeof data === 'string' ? data : data?.content;
      if (typeof value !== 'string')
        throw new Error(`Kimi 第 ${page} 页未返回有效文本`);
      text = value;
    } else {
      text = raw;
    }
    if (text.length > 50000)
      throw new Error(`Kimi 第 ${page} 页内容超限，请拆分文件`);
    signal.throwIfAborted();
  } catch (error) {
    failure = error instanceof Error ? error : new Error('Kimi PDF 解析失败');
  }
  try {
    // Use a fresh timeout even if OCR was cancelled, so temporary cloud files
    // are deleted on both success and failure. Never delete pre-existing files.
    await request(path, 'DELETE', undefined, true);
  } catch {
    throw new Error(
      `${failure ? failure.message + '；' : ''}云端临时 PDF 删除失败，请在 Kimi 控制台清理后重试`,
    );
  }
  if (failure) throw failure;
  return text!;
}

/** Both providers return pages/units; no API or DB migration is required. */
export async function extractPdf(
  fileName: string,
  buffer: Buffer,
  options: {
    env?: Env;
    fetcher?: typeof fetch;
    split?: PdfSplitter;
    signal?: AbortSignal;
  } = {},
) {
  const config = readParserConfig(options.env);
  if (buffer.length > 30 * 1024 * 1024) throw new Error('PDF 文件超过 30MB');
  const fetcher = options.fetcher || fetch;
  // Stay below the worker's 15-minute claim expiry. Never save partial results.
  const signal = AbortSignal.any([
    AbortSignal.timeout(600000),
    ...(options.signal ? [options.signal] : []),
  ]);
  signal.throwIfAborted();
  if (config.provider === 'docling') {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }),
      basename(fileName),
    );
    let response: Response;
    try {
      response = await fetcher(config.url, {
        method: 'POST',
        headers: config.key ? { authorization: `Bearer ${config.key}` } : {},
        body: form,
        signal,
        redirect: 'error',
      });
    } catch {
      throw new Error('PDF 解析服务连接失败或超时');
    }
    if (!response.ok)
      throw new Error(`PDF 解析服务返回 HTTP ${response.status}`);
    return normalizePdfResult(await boundedJson(response, 4 * 1024 * 1024));
  }
  const pages: Page[] = [];
  let total = 0;
  const count = await (options.split || splitPdf)(
    buffer,
    async (page, pdf) => {
      signal.throwIfAborted();
      if (page !== pages.length + 1 || page > 300)
        throw new Error('PDF 原始页码异常');
      const text = await kimiPage(pdf, page, config, fetcher, signal);
      total += text.length;
      if (total > 1000000) throw new Error('PDF 全文内容超限，请拆分文件');
      pages.push({ page, text });
    },
    signal,
  );
  signal.throwIfAborted();
  return normalizePdfResult({ pages }, count);
}
