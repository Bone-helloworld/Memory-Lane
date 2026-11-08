import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';

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

/**
 * Private file storage for photos and videos. Uploads are streamed to DATA_DIR/uploads/tmp
 * (a 100 MB video never sits in memory), inspected, and only then moved to their final,
 * random, unguessable name. Nothing in this folder is ever served without an access check.
 */
export function createFileStore(dir) {
  const tmpDir = path.join(dir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  // Leftovers from a crash or an aborted upload.
  const anHourAgo = Date.now() - 3_600_000;
  for (const name of fs.readdirSync(tmpDir)) {
    const file = path.join(tmpDir, name);
    try {
      if (fs.statSync(file).mtimeMs < anHourAgo) fs.rmSync(file, { force: true });
    } catch {
      // already gone
    }
  }

  return {
    dir,

    /** multer middleware accepting one `file` and an optional `poster` image. */
    uploader(maxBytes) {
      return multer({
        storage: multer.diskStorage({
          destination: tmpDir,
          filename: (req, file, cb) => cb(null, randomBytes(16).toString('hex')),
        }),
        limits: { fileSize: maxBytes, files: 2, fields: 10 },
      }).fields([
        { name: 'file', maxCount: 1 },
        { name: 'poster', maxCount: 1 },
      ]);
    },

    /** Reads the first bytes of an uploaded temp file and identifies it. */
    inspect(tmpPath) {
      const fd = fs.openSync(tmpPath, 'r');
      try {
        const head = Buffer.alloc(16);
        const read = fs.readSync(fd, head, 0, 16, 0);
        return sniff(head.subarray(0, read));
      } finally {
        fs.closeSync(fd);
      }
    },

    /** Moves an inspected temp file to its permanent random name. */
    adopt(tmpPath, ext) {
      const name = `${randomBytes(16).toString('hex')}.${ext}`;
      fs.renameSync(tmpPath, path.join(dir, name));
      return name;
    },

    /** Writes bytes we already hold (used by the seed script). */
    saveBuffer(buffer, ext) {
      const name = `${randomBytes(16).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(dir, name), buffer, { flag: 'wx' });
      return name;
    },

    discard(tmpPath) {
      if (tmpPath) fs.rm(tmpPath, { force: true }, () => {});
    },

    remove(name) {
      if (name && NAME_PATTERN.test(name)) fs.rm(path.join(dir, name), { force: true }, () => {});
    },

    isValidName: (name) => NAME_PATTERN.test(name),
  };
}
