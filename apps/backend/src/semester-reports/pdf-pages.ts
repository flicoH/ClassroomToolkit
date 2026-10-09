import { EncryptedPDFError, ParseSpeeds, PDFDocument } from 'pdf-lib';

export type PdfSplitter = (
  buffer: Buffer,
  accept: (page: number, pdf: Buffer) => Promise<void>,
  signal: AbortSignal,
) => Promise<number>;

/** Copy PDF page objects only; text extraction and OCR happen in Kimi's cloud.
 * One-page uploads preserve original citations without guessing page breaks in
 * the provider's whole-document Markdown. Pages are copied and sent serially.
 */
export const splitPdf: PdfSplitter = async (buffer, accept, signal) => {
  signal.throwIfAborted();
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(buffer, {
      updateMetadata: false,
      parseSpeed: ParseSpeeds.Slow,
    });
  } catch (error) {
    if (error instanceof EncryptedPDFError)
      throw new Error('PDF 已加密，请先解密后重新上传');
    throw new Error('PDF 文件结构无法读取，请检查文件后重新上传');
  }
  const count = source.getPageCount();
  if (count < 1 || count > 300)
    throw new Error('PDF 页数无效或超过 300 页，请拆分文件');
  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(source, [index]);
    single.addPage(page);
    const pdf = Buffer.from(await single.save());
    if (pdf.length > 30 * 1024 * 1024)
      throw new Error(`PDF 第 ${index + 1} 页超过 30MB，请压缩文件`);
    signal.throwIfAborted();
    await accept(index + 1, pdf);
  }
  return count;
};
