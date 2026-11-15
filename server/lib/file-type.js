// Recognise a file by its first bytes ("magic numbers") instead of trusting its name or the
// MIME type the browser sends — both are chosen by whoever uploads the file.
const IMAGES = [
  { ext: 'jpg', match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', match: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'gif', match: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { ext: 'webp', match: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

// MP4 and MOV share the ISO "ftyp" box; HEIC/AVIF still images use it too and are refused here.
const STILL_IMAGE_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis']);

/** → { kind: 'image' | 'video', ext } or null when the bytes are not a supported format. */
export function sniff(head) {
  if (!head || head.length < 12) return null;
  const image = IMAGES.find((signature) => signature.match(head));
  if (image) return { kind: 'image', ext: image.ext };
  if (head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1');
    if (STILL_IMAGE_BRANDS.has(brand.trim())) return null;
    return { kind: 'video', ext: brand === 'qt  ' ? 'mov' : 'mp4' };
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { kind: 'video', ext: 'webm' };
  return null;
}

/** The names stored files get: 128 random bits in hex + the real extension (also used by `npm run admin`). */
export const NAME_PATTERN = /^[a-f0-9]{32}\.(jpg|png|gif|webp|mp4|mov|webm)$/;
