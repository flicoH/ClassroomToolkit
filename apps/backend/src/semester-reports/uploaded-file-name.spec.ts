import { normalizeUploadedFileName } from './uploaded-file-name';

describe('normalizeUploadedFileName', () => {
  it('repairs UTF-8 Chinese names decoded as Latin-1 by multipart', () => {
    const name = '26秋课程大纲-Fun World-Health-40周.pdf';
    expect(
      normalizeUploadedFileName(Buffer.from(name, 'utf8').toString('latin1')),
    ).toBe(name);
  });

  it.each(['26秋课程大纲.pdf', 'Fun World.pdf', 'café.pdf'])(
    'preserves a correctly decoded filename: %s',
    (name) => expect(normalizeUploadedFileName(name)).toBe(name),
  );

  it('sanitizes paths and control characters after decoding', () => {
    const name = 'C:\\uploads\\课程\u0000\u001f\u007f.pdf';
    expect(
      normalizeUploadedFileName(Buffer.from(name, 'utf8').toString('latin1')),
    ).toBe('课程.pdf');
  });
});
