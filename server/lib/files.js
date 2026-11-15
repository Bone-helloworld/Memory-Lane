import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { createBlobStore } from './blob-store.js';
import { NAME_PATTERN, sniff } from './file-type.js';

export { NAME_PATTERN, sniff };

/**
 * Private file storage for photos, videos, posters and card images.
 * Without Azure Storage this is DATA_DIR/uploads. With it, the kept files go to a private
 * blob container and only the in-flight upload uses local disk.
 */
export function createFileStore(dir, azure = null) {
  if (azure) return createBlobStore(dir, azure);
  return createLocalStore(dir);
}

function createLocalStore(dir) {
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
    backend: 'local',
    dir,
    tmpDir,

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
      if (name && NAME_PATTERN.test(name)) fs.rmSync(path.join(dir, name), { force: true });
    },

    isValidName: (name) => NAME_PATTERN.test(name),
  };
}
