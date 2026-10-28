import { basename } from 'node:path';

/** Multipart filenames may contain UTF-8 bytes decoded as Latin-1 by Multer. */
export function normalizeUploadedFileName(value: string) {
  let name = value;
  if ([...name].every((character) => character.charCodeAt(0) <= 0xff)) {
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.from(name, 'latin1'),
      );
    } catch {
      // Keep genuine Latin-1 names when the bytes are not valid UTF-8.
    }
  }
  // Strip control code points without a regex so filenames remain portable and lintable.
  return [...basename(name.replaceAll('\\', '/'))]
    .filter((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .slice(0, 255);
}
