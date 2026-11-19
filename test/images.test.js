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
import { ContentSafetyError, setContentSafetyClient } from '../server/lib/content-safety.js';
import { isExplicit, setImageReviewer } from '../server/lib/moderate.js';
import { frameTimestamps, FRAME_EVERY_SEC, MAX_FRAMES, TARGET_FRAMES, setVideoReviewer } from '../server/lib/videoCheck.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

let server;
let base;
let tmp;
let config;

before(async () => {
  setContentSafetyClient(null);
  setImageReviewer(async () => ({ explicit: false }));
  setVideoReviewer(async () => ({ explicit: false }));
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
  setContentSafetyClient(undefined);
  setImageReviewer(undefined);
  setVideoReviewer(undefined);
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

describe('which frames of a video are checked', () => {
  test('eight frames across the clip, at least one every 10 seconds, never more than 12', () => {
    assert.deepEqual(frameTimestamps(0), []);
    assert.deepEqual(frameTimestamps(-1), []);
    assert.equal(frameTimestamps(3).length, TARGET_FRAMES);
    const halfMinute = frameTimestamps(30);
    assert.equal(halfMinute.length, TARGET_FRAMES);
    assert.ok(halfMinute.every((t, i) => i === 0 || t > halfMinute[i - 1]));
    assert.ok(halfMinute[0] > 0 && halfMinute.at(-1) < 30);
    const ninety = frameTimestamps(90);
    assert.equal(ninety.length, Math.ceil(90 / FRAME_EVERY_SEC));
    assert.ok(ninety.every((t, i) => i === 0 || t - ninety[i - 1] <= FRAME_EVERY_SEC + 0.05));
    const tenMinutes = frameTimestamps(10 * 60);
    assert.equal(tenMinutes.length, MAX_FRAMES);
    assert.ok(tenMinutes[0] > 0 && tenMinutes.at(-1) < 10 * 60);
    assert.ok(tenMinutes.at(-1) - tenMinutes[0] > 8 * 60, 'a long video is sampled across its length, not only the start');
  });
});

describe('what counts as explicit', () => {
  const row = (className, probability) => ({ className, probability });

  test('porn, hentai, a low-neutral sexy score, or a high combined score are refused', () => {
    assert.equal(isExplicit([row('Porn', 0.35), row('Neutral', 0.6)]), true);
    assert.equal(isExplicit([row('Porn', 0.34), row('Neutral', 0.6)]), false);
    assert.equal(isExplicit([row('Hentai', 0.4), row('Neutral', 0.5)]), true);
    assert.equal(isExplicit([row('Hentai', 0.39), row('Neutral', 0.5)]), false);
    assert.equal(isExplicit([row('Sexy', 0.6), row('Neutral', 0.34)]), true);
    assert.equal(isExplicit([row('Sexy', 0.6), row('Neutral', 0.35)]), false);
    assert.equal(isExplicit([row('Sexy', 0.7), row('Neutral', 0.4), row('Porn', 0.02)]), false);
    assert.equal(isExplicit([row('Porn', 0.25), row('Hentai', 0.25), row('Sexy', 0.25), row('Neutral', 0.25)]), true);
    assert.equal(isExplicit([row('Porn', 0.2), row('Hentai', 0.2), row('Sexy', 0.2), row('Neutral', 0.4)]), false);
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

  test('when content safety cannot verify a photo, the upload is refused', async () => {
    setImageReviewer(async () => {
      throw new ContentSafetyError('content safety request failed');
    });
    const { a, memoryId } = await owner();
    const before = fs.readdirSync(config.uploadDir);
    const res = await a.post(`/api/memories/${memoryId}/files`, { form: form(PNG, { name: 'photo.png', type: 'image/png' }) });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.file.code, 'COULD_NOT_VERIFY');
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

  function tinyMp4() {
    // A file the sniffer accepts as MP4. It is not a movie ffmpeg can decode.
    const head = Buffer.alloc(8);
    const brand = Buffer.from('isom');
    const rest = Buffer.concat([Buffer.alloc(4), Buffer.from('isom')]);
    head.writeUInt32BE(8 + brand.length + rest.length, 0);
    head.write('ftyp', 4, 'latin1');
    return Buffer.concat([head, brand, rest, Buffer.alloc(64, 1)]);
  }

  test('an explicit video frame is refused and not kept on disk', async () => {
    setVideoReviewer(async () => ({ explicit: true }));
    const { a, memoryId } = await owner();
    const before = fs.readdirSync(config.uploadDir);
    const res = await a.post(`/api/memories/${memoryId}/files`, {
      form: form(tinyMp4(), { name: 'clip.mp4', type: 'video/mp4', fields: { duration: 12 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.file.code, 'EXPLICIT');
    assert.deepEqual(fs.readdirSync(config.uploadDir), before);
    setVideoReviewer(async () => ({ explicit: false }));
  });

  test('when content safety cannot verify a video, the upload is refused', async () => {
    setVideoReviewer(async () => {
      throw new ContentSafetyError('content safety request failed');
    });
    const { a, memoryId } = await owner();
    const before = fs.readdirSync(config.uploadDir);
    const res = await a.post(`/api/memories/${memoryId}/files`, {
      form: form(tinyMp4(), { name: 'clip.mp4', type: 'video/mp4', fields: { duration: 12 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.file.code, 'COULD_NOT_VERIFY');
    assert.deepEqual(fs.readdirSync(config.uploadDir), before);
    setVideoReviewer(async () => ({ explicit: false }));
  });

  test('when ffmpeg or the model cannot check a video, it is refused (fail closed)', async () => {
    setVideoReviewer(async () => {
      throw new Error('ffmpeg binary is missing');
    });
    const { a, memoryId } = await owner();
    const before = fs.readdirSync(config.uploadDir);
    const res = await a.post(`/api/memories/${memoryId}/files`, {
      form: form(tinyMp4(), { name: 'clip.mp4', type: 'video/mp4', fields: { duration: 12 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.file.code, 'MODERATION_UNAVAILABLE');
    assert.deepEqual(fs.readdirSync(config.uploadDir), before);
    setVideoReviewer(async () => ({ explicit: false }));
  });

  test('a video ffmpeg cannot read is refused, and no frame files are left behind', async () => {
    setVideoReviewer(undefined);
    const { a, memoryId } = await owner();
    const before = fs.readdirSync(config.uploadDir);
    const res = await a.post(`/api/memories/${memoryId}/files`, {
      form: form(tinyMp4(), { name: 'clip.mp4', type: 'video/mp4', fields: { duration: 12 } }),
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.fields.file.code, 'MODERATION_UNAVAILABLE');
    assert.deepEqual(fs.readdirSync(config.uploadDir), before);
    const leftovers = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('ml-frames-'));
    assert.deepEqual(leftovers, []);
    setVideoReviewer(async () => ({ explicit: false }));
  });

  test('a video longer than 10 minutes is refused; the file itself is not recompressed', async () => {
    const { a, memoryId } = await owner();
    const video = tinyMp4();

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
