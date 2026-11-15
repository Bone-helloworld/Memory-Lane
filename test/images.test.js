// Photos are re-encoded with sharp and refused when the (mocked) classifier says so.
// The real MobileNet model is not loaded here — that would make every test run pay
// for TensorFlow. server/lib/moderate.js is what production calls.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { isExplicit, setImageReviewer } from '../server/lib/moderate.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

let server;
let base;
let tmp;
let config;

before(async () => {
  setImageReviewer(async () => ({ explicit: false }));
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-images-'));
  config = {
    ...loadConfig({ DATA_DIR: tmp, AUTH_RATE_LIMIT: '1000', MAX_UPLOAD_MB: '8', MAX_VIDEO_MB: '2', STORAGE_MB: '50' }),
    clientDist: path.join(tmp, 'no-client-build'),
  };
  const db = openDb(config.dbFile);
  server = createApp({ db, config }).listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  setImageReviewer(undefined);
  server?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function agent() {
  let cookie = '';
  async function call(method, url, { json, form } = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    let body;
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    }
    if (form) body = form;
    const res = await fetch(base + url, { method, headers, body });
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0];
      const index = pair.indexOf('=');
      if (pair.slice(0, index) === 'ml_session') cookie = pair.slice(index + 1) ? pair : '';
    }
    const type = res.headers.get('content-type') ?? '';
    const parsed = res.status === 204 ? null : type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, body: parsed };
  }
  return {
    post: (url, options) => call('POST', url, options),
  };
}

let userCount = 0;
async function owner() {
  userCount += 1;
  const a = agent();
  const res = await a.post('/api/auth/register', {
    json: { name: 'An', email: `an${userCount}@example.com`, password: 'correct horse battery', locale: 'vi' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const memory = await a.post('/api/memories', { json: { title: 'Hội An', year: 2017 } });
  assert.equal(memory.status, 201);
  return { a, memoryId: memory.body.memory.id };
}

function form(bytes, { name = 'photo.jpg', type = 'image/jpeg', fields = {} } = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  data.set('file', new Blob([bytes], { type }), name);
  return data;
}

describe('what counts as explicit', () => {
  const row = (className, probability) => ({ className, probability });

  test('porn and hentai are refused, a beach-level "sexy" score is not', () => {
    assert.equal(isExplicit([row('Porn', 0.61), row('Neutral', 0.3)]), true);
    assert.equal(isExplicit([row('Hentai', 0.6), row('Neutral', 0.2)]), true);
    assert.equal(isExplicit([row('Sexy', 0.7), row('Neutral', 0.25), row('Porn', 0.05)]), false);
    assert.equal(isExplicit([row('Sexy', 0.9), row('Neutral', 0.05), row('Porn', 0.02)]), true);
    assert.equal(isExplicit([row('Neutral', 0.92), row('Drawing', 0.05)]), false);
  });
});

describe('upload pipeline', () => {
  test('a photo is rotated down to 2000px WebP, and the EXIF text is gone', async () => {
    const jpeg = await sharp({
      create: { width: 2400, height: 800, channels: 3, background: { r: 40, g: 90, b: 160 } },
    })
      .jpeg({ quality: 90 })
      .withMetadata({ exif: { IFD0: { ImageDescription: 'GPS 21.0285N 105.8542E' } } })
      .toBuffer();
    assert.ok(jpeg.includes('21.0285'), 'the sample really carries the location text');

    const { a, memoryId } = await owner();
    const res = await a.post(`/api/memories/${memoryId}/files`, { form: form(jpeg) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const [file] = res.body.memory.files;
    assert.match(file.url, /\.webp$/);
    assert.match(file.posterUrl, /\.webp$/);
    assert.equal(file.width, 2000);
    assert.ok(file.height < 800 && file.height > 600, `height ${file.height}`);
    const stored = fs.readFileSync(path.join(config.uploadDir, file.url.split('/').pop()));
    const thumb = fs.readFileSync(path.join(config.uploadDir, file.posterUrl.split('/').pop()));
    assert.ok(!stored.includes('21.0285'));
    assert.ok(!thumb.includes('21.0285'));
    const meta = await sharp(stored).metadata();
    const thumbMeta = await sharp(thumb).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 2000);
    assert.equal(meta.exif, undefined);
    assert.ok(thumbMeta.width <= 640);
  });

  test('an explicit photo is refused and not kept on disk', async () => {
    setImageReviewer(async () => ({ explicit: true }));
    const { a, memoryId } = await owner();
    const before = fs.readdirSync(config.uploadDir);
    const res = await a.post(`/api/memories/${memoryId}/files`, { form: form(PNG, { name: 'photo.png', type: 'image/png' }) });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.file.code, 'EXPLICIT');
    assert.deepEqual(fs.readdirSync(config.uploadDir), before);
    setImageReviewer(async () => ({ explicit: false }));
  });

  test('when the checker cannot run, the photo is refused (fail closed)', async () => {
    setImageReviewer(async () => {
      throw new Error('model failed to load');
    });
    const { a, memoryId } = await owner();
    const before = fs.readdirSync(config.uploadDir);
    const res = await a.post(`/api/memories/${memoryId}/files`, { form: form(PNG, { name: 'photo.png', type: 'image/png' }) });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.file.code, 'MODERATION_UNAVAILABLE');
    assert.deepEqual(fs.readdirSync(config.uploadDir), before);
    setImageReviewer(async () => ({ explicit: false }));
  });

  test('a video longer than 10 minutes is refused; the file itself is not recompressed', async () => {
    const { a, memoryId } = await owner();
    // A tiny file the sniffer accepts as MP4: size, "ftyp", brand. Not a playable movie.
    const head = Buffer.alloc(8);
    const brand = Buffer.from('isom');
    const rest = Buffer.concat([Buffer.alloc(4), Buffer.from('isom')]);
    head.writeUInt32BE(8 + brand.length + rest.length, 0);
    head.write('ftyp', 4, 'latin1');
    const video = Buffer.concat([head, brand, rest, Buffer.alloc(64, 1)]);

    const tooLong = await a.post(`/api/memories/${memoryId}/files`, {
      form: form(video, { name: 'clip.mp4', type: 'video/mp4', fields: { duration: 11 * 60 } }),
    });
    assert.equal(tooLong.status, 400, JSON.stringify(tooLong.body));
    assert.deepEqual(tooLong.body.fields.file, { code: 'VIDEO_TOO_LONG', max: 10 });

    const ok = await a.post(`/api/memories/${memoryId}/files`, {
      form: form(video, { name: 'clip.mp4', type: 'video/mp4', fields: { duration: 30 } }),
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.memory.files.at(-1).kind, 'video');
    assert.match(ok.body.memory.files.at(-1).url, /\.mp4$/);
  });
});
