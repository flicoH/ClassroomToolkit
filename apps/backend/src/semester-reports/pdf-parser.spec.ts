import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractPdf,
  normalizePdfResult,
  readParserConfig,
  checkPdfParser,
  type PdfSplitter,
} from './pdf-parser';
import {
  chooseCourseUnitCandidates,
  selectCoursePages,
  extractLearningContents,
} from './course-scope';
const config = { KIMI_API_KEY: 'private-test-key' };
const uploaded = () =>
  new Response(
    JSON.stringify({ id: 'file_safe-page', extract_status: 'ready' }),
  );
const deleted = () => new Response(JSON.stringify({ deleted: true }));
const split: PdfSplitter = async (_buffer, accept) => {
  await accept(1, Buffer.from('%PDF-page-one'));
  await accept(2, Buffer.from('%PDF-page-two'));
  return 2;
};
const success = (text: string) => [uploaded(), new Response(text), deleted()];

describe('direct Kimi PDF parser', () => {
  it('defaults to Kimi and uploads actual PDF pages without any local renderer', async () => {
    const fetcher = jest.fn();
    [...success('课程一'), ...success('课程二')].forEach((r) =>
      fetcher.mockResolvedValueOnce(r),
    );
    const result = await extractPdf('student-secret.pdf', Buffer.from('pdf'), {
      env: config,
      fetcher,
      split,
    });
    expect(result.pages).toEqual([
      { page: 1, text: '课程一' },
      { page: 2, text: '课程二' },
    ]);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.moonshot.cn/v1/files');
    expect(options.redirect).toBe('error');
    expect(options.headers.authorization).toBe('Bearer private-test-key');
    // Existing accounts can use the standard file API but may reject beta access.
    expect(options.headers['kimi-api-version']).toBeUndefined();
    expect(options.body.get('purpose')).toBe('file-extract');
    const pdf = options.body.get('file');
    expect(pdf.type).toBe('application/pdf');
    expect(pdf.name).toBe('course-page.pdf');
    expect(await pdf.text()).toBe('%PDF-page-one');
    expect(fetcher.mock.calls.map((c) => c[1].method || 'GET')).toEqual([
      'POST',
      'GET',
      'DELETE',
      'POST',
      'GET',
      'DELETE',
    ]);
    expect(
      fetcher.mock.calls.some((c) => c[0].includes('chat/completions')),
    ).toBe(false);
  });
  it('requires a key before reading or uploading PDFs', async () => {
    const fetcher = jest.fn();
    const splitter = jest.fn();
    await expect(
      extractPdf('x.pdf', Buffer.from('x'), {
        env: {},
        fetcher,
        split: splitter,
      }),
    ).rejects.toThrow('KIMI_API_KEY');
    expect(fetcher).not.toHaveBeenCalled();
    expect(splitter).not.toHaveBeenCalled();
    expect(() =>
      readParserConfig({
        ...config,
        KIMI_BASE_URL: 'http://api.moonshot.cn/v1',
      }),
    ).toThrow();
    expect(() =>
      readParserConfig({ SEMESTER_REPORT_PARSER_PROVIDER: 'typo' }),
    ).toThrow();
  });
  it.each([401, 403, 429, 500])(
    'reports HTTP %s without exposing the provider error or uploading next pages',
    async (status) => {
      const fetcher = jest
        .fn()
        .mockResolvedValue(
          new Response('private-test-key:secret-document', { status }),
        );
      await expect(
        extractPdf('x.pdf', Buffer.from('x'), { env: config, fetcher, split }),
      ).rejects.toThrow(`HTTP ${status}`);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('deletes cloud files on content failure and stops before the next page', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(uploaded())
      .mockResolvedValueOnce(new Response('secret', { status: 500 }))
      .mockResolvedValueOnce(deleted());
    await expect(
      extractPdf('x.pdf', Buffer.from('x'), { env: config, fetcher, split }),
    ).rejects.toThrow('HTTP 500');
    expect(fetcher.mock.calls[2][1].method).toBe('DELETE');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('makes failed cloud deletion visible instead of claiming cleanup succeeded', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(uploaded())
      .mockResolvedValueOnce(new Response('课程'))
      .mockResolvedValueOnce(new Response('secret', { status: 500 }));
    await expect(
      extractPdf('x.pdf', Buffer.from('x'), { env: config, fetcher, split }),
    ).rejects.toThrow('云端临时 PDF 删除失败');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('keeps blank pages and accepts the legacy JSON content envelope', async () => {
    const fetcher = jest.fn();
    [
      ...success(''),
      uploaded(),
      new Response(JSON.stringify({ content: '课程二' }), {
        headers: { 'content-type': 'application/json' },
      }),
      deleted(),
    ].forEach((r) => fetcher.mockResolvedValueOnce(r));
    expect(
      (
        await extractPdf('x.pdf', Buffer.from('x'), {
          env: config,
          fetcher,
          split,
        })
      ).pages,
    ).toEqual([
      { page: 1, text: '' },
      { page: 2, text: '课程二' },
    ]);
  });
  it('rejects oversized or malformed content and still removes the uploaded file', async () => {
    for (const content of [
      new Response('x'.repeat(50001)),
      new Response('x'.repeat(512 * 1024 + 1)),
      new Response('{broken', {
        headers: { 'content-type': 'application/json' },
      }),
    ]) {
      const fetcher = jest
        .fn()
        .mockResolvedValueOnce(uploaded())
        .mockResolvedValueOnce(content)
        .mockResolvedValueOnce(deleted());
      await expect(
        extractPdf('x.pdf', Buffer.from('x'), { env: config, fetcher, split }),
      ).rejects.toThrow();
      expect(fetcher.mock.calls[2][1].method).toBe('DELETE');
    }
  });
  it('rejects cloud extraction errors and unsafe file IDs', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'file_safe-page', extract_status: 'error' }),
        ),
      )
      .mockResolvedValueOnce(deleted());
    await expect(
      extractPdf('x.pdf', Buffer.from('x'), { env: config, fetcher, split }),
    ).rejects.toThrow('提取失败');
    expect(fetcher.mock.calls[1][1].method).toBe('DELETE');
    fetcher
      .mockReset()
      .mockResolvedValue(new Response(JSON.stringify({ id: '../secret' })));
    await expect(
      extractPdf('x.pdf', Buffer.from('x'), { env: config, fetcher, split }),
    ).rejects.toThrow('文件标识');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sanitizes connection errors and aborts without an upload', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('private-test-key'));
    await expect(
      extractPdf('x.pdf', Buffer.from('x'), { env: config, fetcher, split }),
    ).rejects.toThrow('连接失败');
    const controller = new AbortController();
    controller.abort();
    fetcher.mockClear();
    await expect(
      extractPdf('x.pdf', Buffer.from('x'), {
        env: config,
        fetcher,
        split,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps Docling only when explicitly selected', async () => {
    const fetcher = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          pages: [{ page: 1, text: '课程' }],
          units: ['第一单元'],
        }),
      ),
    );
    const result = await extractPdf('x.pdf', Buffer.from('x'), {
      env: {
        SEMESTER_REPORT_PARSER_PROVIDER: 'docling',
        SEMESTER_REPORT_PARSER_URL: 'https://parser.test/parse',
      },
      fetcher,
    });
    expect(result.units).toEqual(['第一单元']);
    expect(fetcher.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });
  it('checks authentication without checking Poppler, requiring a model, or uploading a PDF', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'kimi-k2.6' }] })),
      );
    await checkPdfParser(config, fetcher);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.moonshot.cn/v1/models');
    expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  });
});

describe('original PDF page contract', () => {
  it.each(
    [
      [],
      [{ page: 2, text: '课程' }],
      [
        { page: 1, text: 'a' },
        { page: 1, text: 'b' },
      ],
      [{ page: 1, text: 'a' }, null],
      [{ page: 1, text: ' ' }],
      [{ page: 1, text: 'a'.repeat(50001) }],
      Array.from({ length: 301 }, (_, i) => ({ page: i + 1, text: 'a' })),
      Array.from({ length: 21 }, (_, i) => ({
        page: i + 1,
        text: 'a'.repeat(50000),
      })),
    ].map((pages) => ({ pages })),
  )('rejects incomplete or oversized page data %#', ({ pages }) => {
    expect(() => normalizePdfResult({ pages })).toThrow();
  });
  it('checks the real original page count', () => {
    expect(() =>
      normalizePdfResult({ pages: [{ page: 1, text: '课程' }] }, 2),
    ).toThrow();
  });
});

// Existing Docling snippets exercise downstream invariants through the Kimi
// adapter. They do not claim to measure real cloud OCR accuracy.
const formats = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/uploaded-course-formats.json'),
    'utf8',
  ),
) as Array<{ kind: string; pages: Array<{ page: number; text: string }> }>;
describe('Kimi adapter and accepted course formats', () => {
  it.each(formats)(
    'preserves $kind content and original page references',
    async (fixture) => {
      const fetcher = jest.fn();
      fixture.pages.forEach((page) => {
        success(page.text).forEach((r) => fetcher.mockResolvedValueOnce(r));
      });
      const splitter: PdfSplitter = async (_buffer, accept) => {
        for (const page of fixture.pages)
          await accept(page.page, Buffer.from('sanitized-page'));
        return fixture.pages.length;
      };
      const parsed = await extractPdf('course.pdf', Buffer.from('pdf'), {
        env: config,
        fetcher,
        split: splitter,
      });
      expect(parsed.pages).toEqual(fixture.pages);
      const text = parsed.pages
        .map((p) => `【PDF第${p.page}页】\n${p.text}`)
        .join('\n\n');
      const units = chooseCourseUnitCandidates(text, parsed.units);
      const document = {
        id: fixture.kind,
        fileName: 'course.pdf',
        sourcePages: parsed.pages,
        confirmedUnits: units,
      };
      const cases: Record<string, [string, number[], string]> = {
        pinyin: ['第81课时', [21], '阶段测评四'],
        reading: ['第2册 第11课时', [13], '汉字迁移运用'],
        handwriting: ['第9课时', [2], '巩固复习'],
        health: ['Unit3 6', [10], ''],
      };
      const [scope, pages, content] = cases[fixture.kind];
      expect(units).toHaveLength(
        { pinyin: 81, reading: 80, handwriting: 18, health: 21 }[fixture.kind]!,
      );
      expect(
        selectCoursePages([document], scope, 'week')[0].pages.map(
          (p) => p.page,
        ),
      ).toEqual(pages);
      expect(
        extractLearningContents([document], scope, 'week')
          .map((c) => c.text)
          .join('\n'),
      ).toContain(content);
    },
  );
});
