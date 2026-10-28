import sharp from 'sharp';
import { studentPhotoDataUrl, studentPhotoMaxBytes } from './student-photo';

describe('student image validation', () => {
  async function file(width = 512, height = 320) {
    const buffer = await sharp({
      create: { width, height, channels: 4, background: '#ff000080' },
    })
      .png()
      .toBuffer();
    return { buffer, size: buffer.length, mimetype: 'image/png' };
  }
  it('decodes PNG and stores metadata-free JPEG with bounded dimensions', async () => {
    const result = await studentPhotoDataUrl(await file());
    expect(result.startsWith('data:image/jpeg;base64,')).toBe(true);
    const metadata = await sharp(
      Buffer.from(result.split(',')[1]!, 'base64'),
    ).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 512, height: 320 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.hasAlpha).toBe(false);
  });
  it('accepts exactly 256KB and rejects one byte over', async () => {
    const original = await file(4, 4);
    const buffer = Buffer.alloc(studentPhotoMaxBytes);
    original.buffer.copy(buffer);
    await expect(
      studentPhotoDataUrl({ ...original, buffer, size: buffer.length }),
    ).resolves.toContain('data:image/jpeg');
    await expect(
      studentPhotoDataUrl({
        ...original,
        buffer: Buffer.alloc(studentPhotoMaxBytes + 1),
        size: studentPhotoMaxBytes + 1,
      }),
    ).rejects.toThrow('256KB');
  });
  it('rejects false MIME, corrupt bytes, oversized dimensions and vector images', async () => {
    const png = await file();
    for (const invalid of [
      { ...png, mimetype: 'image/jpeg' },
      { ...png, buffer: png.buffer.subarray(0, 20), size: 20 },
      { ...png, size: 0 },
      await file(513, 1),
      { buffer: Buffer.from('<svg/>'), size: 6, mimetype: 'image/svg+xml' },
    ])
      await expect(studentPhotoDataUrl(invalid)).rejects.toThrow('有效');
  });
});
