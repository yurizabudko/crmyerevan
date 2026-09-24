import sharp from 'sharp';

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

const FULL_SIZE = 1600;
const THUMB_SIZE = 480;

/**
 * Нормализует фото: поворот по EXIF, удаление метаданных (в т.ч. геометок),
 * уменьшение до 1600px и превью 480px, JPEG.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { failOn: 'error' }).rotate();
  const { data: full, info } = await base
    .clone()
    .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
  return { full, thumb, width: info.width, height: info.height };
}

// TODO(auto-import): фото с list.am перед processImage обрезаются сверху на 5%,
// чтобы убрать водяной знак (БТ-3.2.3, допущение Д-3).
export async function cropTopWatermark(input: Buffer, fraction = 0.05): Promise<Buffer> {
  const image = sharp(input).rotate();
  const { width, height } = await image.metadata();
  if (!width || !height) throw new Error('Не удалось определить размер изображения');
  const top = Math.round(height * fraction);
  return image.extract({ left: 0, top, width, height: height - top }).toBuffer();
}
