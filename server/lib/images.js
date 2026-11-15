import fs from 'node:fs/promises';
import sharp from 'sharp';

/**
 * Turns an uploaded photo into the file we actually keep.
 *
 * sharp is good at pixels, not at judging them:
 *   - it decodes the file (a renamed .jpg that is not a photo fails here),
 *   - rotates it from the phone's EXIF orientation,
 *   - shrinks the long edge to FULL_MAX_EDGE (thumbnails use THUMB_MAX_EDGE),
 *   - drops EXIF, GPS and other metadata by writing a new file without them,
 *   - saves WebP. AVIF is smaller but much slower to encode, which hurts the
 *     free Render instance, so WebP is the format we store.
 *
 * Animated GIFs become a single frame. The album is for stills.
 * Videos are not passed through here — there is no ffmpeg in this app.
 */

export const FULL_MAX_EDGE = 2000;
export const THUMB_MAX_EDGE = 640;
export const FULL_QUALITY = 82;
export const THUMB_QUALITY = 72;

// A phone photo is about 12–48 megapixels. Anything past this is refused
// before we decode it, so one upload cannot exhaust the 512 MB instance.
const MAX_PIXELS = 60_000_000;

export class UnreadableImageError extends Error {}

async function encode(file, { maxEdge, quality }) {
  try {
    const out = await sharp(file, {
      failOn: 'error',
      animated: false,
      limitInputPixels: MAX_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4, alphaQuality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { width: out.info.width, height: out.info.height, size: out.data.length, buffer: out.data };
  } catch {
    throw new UnreadableImageError();
  }
}

/** Replaces `file` with the WebP. → { width, height, size, before, ext }. */
export async function transcodeImage(file, options) {
  const before = (await fs.stat(file)).size;
  const encoded = await encode(file, options);
  await fs.writeFile(file, encoded.buffer);
  return { width: encoded.width, height: encoded.height, size: encoded.size, before, ext: 'webp' };
}

/** Writes a WebP copy of `file` to `dest` (used for the small grid thumbnail). */
export async function transcodeImageTo(file, dest, options) {
  const encoded = await encode(file, options);
  await fs.writeFile(dest, encoded.buffer);
  return { width: encoded.width, height: encoded.height, size: encoded.size, ext: 'webp' };
}
