import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { splitPdf } from './pdf-pages';

async function samplePdf(count = 2) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < count; i++) {
    const page = pdf.addPage([300 + i, 200 + i]);
    page.setRotation(degrees(i % 2 === 0 ? 0 : 90));
    page.drawText(`Lesson ${i + 1}`, { font });
  }
  return Buffer.from(await pdf.save());
}

describe('PDF page copying without native programs', () => {
  it('retains original page order, dimensions, rotation and embedded content', async () => {
    const original = await samplePdf();
    const pages: number[] = [];
    const count = await splitPdf(
      original,
      async (number, buffer) => {
        expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
        const single = await PDFDocument.load(buffer);
        expect(single.getPageCount()).toBe(1);
        const page = single.getPage(0);
        expect(page.getSize()).toEqual({
          width: 299 + number,
          height: 199 + number,
        });
        expect(page.getRotation().angle).toBe(number === 1 ? 0 : 90);
        expect(page.node.Contents()).toBeDefined();
        expect(page.node.Resources()).toBeDefined();
        pages.push(number);
      },
      AbortSignal.timeout(10000),
    );
    expect(count).toBe(2);
    expect(pages).toEqual([1, 2]);
  });
  it('stops copying or uploading after the first cloud failure', async () => {
    const accept = jest.fn().mockRejectedValue(new Error('cloud failure'));
    await expect(
      splitPdf(await samplePdf(), accept, AbortSignal.timeout(10000)),
    ).rejects.toThrow('cloud failure');
    expect(accept).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed and over-limit PDFs before uploading anything', async () => {
    const accept = jest.fn();
    await expect(
      splitPdf(Buffer.from('broken pdf'), accept, AbortSignal.timeout(10000)),
    ).rejects.toThrow('PDF 文件结构无法读取');
    await expect(
      splitPdf(await samplePdf(301), accept, AbortSignal.timeout(10000)),
    ).rejects.toThrow('超过 300 页');
    expect(accept).not.toHaveBeenCalled();
  });
  it('does not upload after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const accept = jest.fn();
    await expect(
      splitPdf(await samplePdf(), accept, controller.signal),
    ).rejects.toThrow();
    expect(accept).not.toHaveBeenCalled();
  });
});
