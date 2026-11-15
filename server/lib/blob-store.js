import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import multer from 'multer';
import { notFound } from './errors.js';
import { NAME_PATTERN, sniff } from './file-type.js';

const TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export function contentType(name) {
  return TYPES[path.extname(name).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

export function createContainerClient(storage) {
  const container = storage.container || 'media';
  if (storage.connectionString) {
    return BlobServiceClient.fromConnectionString(storage.connectionString).getContainerClient(container);
  }
  const credential = new StorageSharedKeyCredential(storage.account, storage.key);
  const service = new BlobServiceClient(`https://${storage.account}.blob.core.windows.net`, credential);
  return service.getContainerClient(container);
}

/**
 * Private blob container for photos, videos, posters and card images.
 * Uploads still land in a local temp file (multer); only the kept bytes are uploaded.
 * `createIfNotExists` does not set a public access level, so the container stays private.
 */
export function createBlobStore(dir, storage, container = createContainerClient(storage)) {
  const tmpDir = path.join(dir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  let ready = null;

  function ensure() {
    if (!ready) {
      const created = container.createIfNotExists ? container.createIfNotExists() : Promise.resolve();
      ready = Promise.resolve(created).catch((err) => {
        ready = null;
        throw err;
      });
    }
    return ready;
  }

  return {
    backend: 'blob',
    dir,
    tmpDir,

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

    async adopt(tmpPath, ext) {
      const name = `${randomBytes(16).toString('hex')}.${ext}`;
      await ensure();
      await container.getBlockBlobClient(name).uploadFile(tmpPath, {
        blobHTTPHeaders: { blobContentType: contentType(name) },
      });
      fs.rmSync(tmpPath, { force: true });
      return name;
    },

    async saveBuffer(buffer, ext) {
      const name = `${randomBytes(16).toString('hex')}.${ext}`;
      await ensure();
      await container.getBlockBlobClient(name).uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: contentType(name) },
      });
      return name;
    },

    discard(tmpPath) {
      if (tmpPath) fs.rm(tmpPath, { force: true }, () => {});
    },

    async remove(name) {
      if (!name || !NAME_PATTERN.test(name)) return;
      await ensure();
      await container.getBlockBlobClient(name).deleteIfExists();
    },

    async exists(name) {
      await ensure();
      return container.getBlockBlobClient(name).exists();
    },

    async list() {
      await ensure();
      const entries = [];
      for await (const blob of container.listBlobsFlat()) {
        entries.push({
          name: blob.name,
          size: blob.properties?.contentLength ?? 0,
          mtimeMs: blob.properties?.lastModified ? new Date(blob.properties.lastModified).getTime() : 0,
        });
      }
      return entries;
    },

    /** Streams one private blob. Honours a single Range so a video can start and seek. */
    async send(name, req, res) {
      await ensure();
      const blob = container.getBlockBlobClient(name);
      let props;
      try {
        props = await blob.getProperties();
      } catch (err) {
        if (err.statusCode === 404 || err.code === 'BlobNotFound') throw notFound();
        throw err;
      }
      const size = Number(props.contentLength ?? 0);
      res.set('Accept-Ranges', 'bytes');
      res.set('Cache-Control', 'private, no-cache');
      res.set('Content-Type', contentType(name));
      if (props.etag) res.set('ETag', props.etag);

      const range = parseRange(req.headers.range, size);
      if (range?.invalid) {
        res.status(416);
        res.set('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      const start = range ? range.start : 0;
      const end = range ? range.end : size - 1;
      if (range) {
        res.status(206);
        res.set('Content-Range', `bytes ${start}-${end}/${size}`);
      }
      const length = size === 0 ? 0 : end - start + 1;
      res.set('Content-Length', String(length));
      if (req.method === 'HEAD' || length === 0) {
        res.end();
        return;
      }
      const download = await blob.download(start, length);
      const stream = download.readableStreamBody ?? Readable.from([]);
      try {
        await pipeline(stream, res);
      } catch (err) {
        if (!res.headersSent) throw err;
        res.destroy();
      }
    },

    isValidName: (name) => NAME_PATTERN.test(name),
  };
}

/** `bytes=start-end`, `bytes=start-`, or `bytes=-suffix`. */
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || size < 0) return { invalid: true };
  let start;
  let end;
  if (match[1] === '' && match[2] !== '') {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else if (match[1] !== '') {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  } else {
    return { invalid: true };
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}
