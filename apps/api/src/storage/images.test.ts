import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cropTopWatermark, processImage } from './images.js';

const image = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#88aacc' } })
    .png()
    .toBuffer();

describe('processImage', () => {
  it('downsizes large photos and builds a thumbnail', async () => {
    const result = await processImage(await image(4000, 3000));
    expect([result.width, result.height]).toEqual([1600, 1200]);
    const thumb = await sharp(result.thumb).metadata();
    expect([thumb.width, thumb.height, thumb.format]).toEqual([480, 360, 'jpeg']);
  });

  it('keeps small photos as is', async () => {
    const result = await processImage(await image(300, 200));
    expect([result.width, result.height]).toEqual([300, 200]);
  });

  it('rejects files that are not images', async () => {
    await expect(processImage(Buffer.from('not an image'))).rejects.toThrow();
  });
});

describe('cropTopWatermark', () => {
  it('cuts 5% from the top', async () => {
    const cropped = await sharp(await cropTopWatermark(await image(1000, 800))).metadata();
    expect([cropped.width, cropped.height]).toEqual([1000, 760]);
  });
});
