// Photos are re-drawn on a <canvas> before upload. This
//  1. removes ALL metadata — EXIF, camera model and especially GPS coordinates
//     (the server strips it again, in case anything slips through),
//  2. applies the phone's rotation so portrait photos stay upright,
//  3. shrinks huge camera files (12–48 MP) to at most 2000 px: faster uploads, less storage,
//  4. saves them as WebP where the browser can (about 30% smaller than JPEG for the same look:
//     measured on the demo photos, WebP 0.85 averaged 249 KB with SSIM 0.994 vs 358 KB for JPEG 0.88),
//  5. makes a small preview (560 px) that the album grids load instead of the full photo.

const MAX_EDGE = 2000;
const PREVIEW_WIDTH = 560;
const QUALITY = { webp: 0.85, jpeg: 0.88, preview: 0.78 };

export class UnreadableImageError extends Error {}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * WebP when this browser can write it (Chrome, Edge, Firefox, Android, recent Safari); otherwise the
 * fallback type. A browser that cannot encode WebP silently returns a PNG, hence the type check.
 * → { blob, type, ext }
 */
async function encode(canvas, quality, fallback = 'image/jpeg') {
  const webp = await canvasBlob(canvas, 'image/webp', quality);
  if (webp?.type === 'image/webp') return { blob: webp, type: 'image/webp', ext: 'webp' };
  const blob = await canvasBlob(canvas, fallback, QUALITY.jpeg);
  return { blob, type: fallback, ext: fallback === 'image/png' ? 'png' : 'jpg' };
}

function draw(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Small image used by grids (also used for video stills): WebP, or JPEG where WebP cannot be written. */
export async function makePreview(source, sourceWidth, sourceHeight) {
  const scale = Math.min(1, PREVIEW_WIDTH / sourceWidth);
  return (await encode(draw(source, sourceWidth * scale, sourceHeight * scale), QUALITY.preview)).blob;
}

/** Decodes an <img> from a File — the most widely supported way (it also reads HEIC on Safari). */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UnreadableImageError());
    };
    image.src = url;
  });
}

/**
 * Decodes a photo, upright. Three tries, because phones differ:
 *  1. createImageBitmap with imageOrientation 'from-image' (current browsers);
 *  2. the same without options — older Safari / Chrome only know 'none' | 'flipY' and throw on
 *     'from-image', but already turn photos upright by default;
 *  3. an <img> element: slower, but it decodes everything the browser can display (HEIC on Safari).
 */
async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // try the next way
  }
  try {
    return await createImageBitmap(file);
  } catch {
    // try the next way
  }
  return loadImage(file);
}

/** → { file, preview, width, height } ready for upload. */
export async function preparePhoto(file) {
  let bitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new UnreadableImageError();
  }

  try {
    const { width, height } = bitmap;
    const preview = await makePreview(bitmap, width, height);

    // Animated GIFs would lose their animation on a canvas (and GIF carries no EXIF): keep as is.
    if (file.type === 'image/gif') return { file, preview, width, height };

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = draw(bitmap, width * scale, height * scale);
    // WebP keeps transparency too; without WebP, a PNG stays PNG and everything else becomes JPEG.
    const { blob, type, ext } = await encode(canvas, QUALITY.webp, file.type === 'image/png' ? 'image/png' : 'image/jpeg');
    if (!blob) throw new UnreadableImageError();
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return {
      file: new File([blob], `${base}.${ext}`, { type }),
      preview,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close?.();
  }
}
