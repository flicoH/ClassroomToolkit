import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const studentPhotoMaxBytes = 256 * 1024;
export type StudentPhotoFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

/** Decode actual bytes, strip metadata and bound stored images independently of browser checks. */
export async function studentPhotoDataUrl(
  file: StudentPhotoFile,
): Promise<string> {
  const message =
    '请上传有效的 JPG 或 PNG 学生照片（处理后最大 256KB、最长边 512 像素）';
  if (
    !file.buffer?.length ||
    file.buffer.length > studentPhotoMaxBytes ||
    file.size !== file.buffer.length
  )
    throw new BadRequestException(message);
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 512 * 512,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    if (
      !['jpeg', 'png'].includes(metadata.format ?? '') ||
      file.mimetype !== `image/${metadata.format}` ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 512 ||
      metadata.height > 512 ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error(message);
    const bytes = await image
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
    if (bytes.length > studentPhotoMaxBytes) throw new Error(message);
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
  } catch {
    throw new BadRequestException(message);
  }
}
