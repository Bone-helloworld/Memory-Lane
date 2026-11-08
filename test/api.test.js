// Integration tests: the real Express app + a throw-away SQLite database, driven over HTTP.
// Run with `npm test`.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { toISODate } from '../shared/dates.js';

// A real 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** An ISO-BMFF box: 4-byte size, 4-byte type, payload. */
function box(type, ...payload) {
  const body = Buffer.concat(payload.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part, 'latin1'))));
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

const HOME = '+21.0285+105.8542/';
// A tiny MP4 shaped like a phone video: file type, a movie header holding the GPS position
// where it was filmed (the ©xyz box), then the media data.
const MP4 = Buffer.concat([
  box('ftyp', 'isom', Buffer.alloc(4), 'isomiso2mp41'),
  box('moov', box('udta', box('\xa9xyz', Buffer.from([0x00, 0x12, 0x15, 0xc7]), HOME))),
  box('mdat', Buffer.alloc(256, 7)),
]);

let server;
let base;
let tmp;
let config;
let db;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-test-'));
  config = {
    ...loadConfig({
      DATA_DIR: tmp,
      AUTH_RATE_LIMIT: '1000',
      MAX_UPLOAD_MB: '1',
      MAX_VIDEO_MB: '2',
      STORAGE_MB: '5',
    }),
    clientDist: path.join(tmp, 'no-client-build'),
  };
  db = openDb(config.dbFile);
  server = createApp({ db, config }).listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A tiny HTTP client with its own cookie jar — one per simulated browser. */
function agent() {
  let cookie = '';
  async function call(method, url, { json, form, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (cookie) init.headers.cookie = cookie;
    if (json !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(json);
    }
    if (form) init.body = form;
    const res = await fetch(base + url, init);
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0];
      const index = pair.indexOf('=');
      if (pair.slice(0, index) === 'ml_session') cookie = pair.slice(index + 1) ? pair : '';
    }
    const type = res.headers.get('content-type') ?? '';
    const body = res.status === 204 ? null : type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, body, headers: res.headers };
  }
  return {
    get: (url, options) => call('GET', url, options),
    post: (url, options) => call('POST', url, options),
    put: (url, options) => call('PUT', url, options),
    patch: (url, options) => call('PATCH', url, options),
    del: (url, options) => call('DELETE', url, options),
    get cookie() {
      return cookie;
    },
  };
}

let userCount = 0;
async function registeredAgent(name = 'Tester') {
  const a = agent();
  userCount += 1;
  const res = await a.post('/api/auth/register', {
    json: { name, email: `user${userCount}@example.com`, password: 'correct horse battery', locale: 'en' },
  });
  assert.equal(res.status, 201);
  return { agent: a, user: res.body.user, password: 'correct horse battery' };
}

async function createMemory(a, fields = {}) {
  const res = await a.post('/api/memories', { json: { title: 'Kỷ niệm', year: 2019, ...fields } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.memory;
}

function fileForm(bytes, { type = 'image/png', name = 'photo.png', poster, fields = {} } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  form.set('file', new Blob([bytes], { type }), name);
  if (poster) form.set('poster', new Blob([poster], { type: 'image/png' }), 'poster.png');
  return form;
}

const upload = (a, memoryId, bytes, options) => a.post(`/api/memories/${memoryId}/files`, { form: fileForm(bytes, options) });
const onDisk = (url) => path.join(config.uploadDir, url.split('/').pop());
const tmpFiles = () => fs.readdirSync(path.join(config.uploadDir, 'tmp'));
const settle = () => new Promise((resolve) => setTimeout(resolve, 60)); // file deletion is asynchronous

/** A connects with B through an invite link (optionally sharing one memory) → the accept response. */
async function connect(inviter, invitee, { memoryId, personId } = {}) {
  const created = await inviter.post('/api/invites', { json: { label: 'for a friend', memoryId, personId } });
  assert.equal(created.status, 201);
  const accepted = await invitee.post(`/api/invites/accept/${created.body.token}`);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  return { token: created.body.token, invite: created.body.invite, accepted: accepted.body };
}

describe('authentication', () => {
  test('anonymous session is empty and tells the client the upload limits', async () => {
    const a = agent();
    assert.deepEqual((await a.get('/api/auth/session')).body, {
      user: null,
      demo: true,
      google: false, // no GOOGLE_CLIENT_ID in the test config (see test/google.test.js)
      limits: { maxImageMb: 1, maxVideoMb: 2 },
    });
    const res = await a.get('/api/memories');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'UNAUTHORIZED');
  });

  test('register validates every field and returns error codes, not sentences', async () => {
    const res = await agent().post('/api/auth/register', { json: { name: '', email: 'nope', password: 'short' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'VALIDATION');
    assert.deepEqual(res.body.fields, {
      name: { code: 'REQUIRED' },
      email: { code: 'INVALID_EMAIL' },
      password: { code: 'TOO_SHORT', min: 8 },
    });
  });

  test('register → logged in; response never contains the password hash', async () => {
    const { agent: a, user } = await registeredAgent('Hà');
    assert.ok(a.cookie.startsWith('ml_session='));
    assert.equal(user.name, 'Hà');
    assert.equal(user.locale, 'en');
    assert.equal(user.password_hash, undefined);
    assert.equal((await a.get('/api/auth/session')).body.user.id, user.id);
  });

  test('session cookie is httpOnly and SameSite=Lax', async () => {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cookie', email: 'cookie@example.com', password: 'long enough pw' }),
    });
    const setCookie = res.headers.getSetCookie().join(';');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
  });

  test('duplicate email is rejected (case-insensitive)', async () => {
    await agent().post('/api/auth/register', { json: { name: 'A', email: 'Same@Example.com', password: '12345678' } });
    const res = await agent().post('/api/auth/register', { json: { name: 'B', email: 'same@example.com', password: '12345678' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.email.code, 'EMAIL_UNAVAILABLE');
    assert.equal(JSON.stringify(res.body).includes('EMAIL_TAKEN'), false);
  });

  test('login: wrong password and unknown email give the same answer', async () => {
    await agent().post('/api/auth/register', { json: { name: 'L', email: 'login@example.com', password: 'right password' } });
    const wrong = await agent().post('/api/auth/login', { json: { email: 'login@example.com', password: 'wrong password' } });
    const unknown = await agent().post('/api/auth/login', { json: { email: 'nobody@example.com', password: 'whatever' } });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
    const ok = await agent().post('/api/auth/login', { json: { email: 'LOGIN@example.com', password: 'right password' } });
    assert.equal(ok.status, 200);
  });

  test('logout revokes the session on the server', async () => {
    const { agent: a } = await registeredAgent();
    const stolenCookie = a.cookie;
    assert.equal((await a.post('/api/auth/logout')).status, 204);
    const replay = await fetch(`${base}/api/memories`, { headers: { cookie: stolenCookie } });
    assert.equal(replay.status, 401);
  });

  test('changing the password signs out other devices', async () => {
    const { agent: phone, user, password } = await registeredAgent();
    const laptop = agent();
    await laptop.post('/api/auth/login', { json: { email: user.email, password } });
    const bad = await phone.post('/api/me/password', { json: { currentPassword: 'nope', newPassword: 'a brand new password' } });
    assert.equal(bad.body.fields.currentPassword.code, 'WRONG_PASSWORD');
    const res = await phone.post('/api/me/password', { json: { currentPassword: password, newPassword: 'a brand new password' } });
    assert.equal(res.status, 204);
    assert.equal((await phone.get('/api/memories')).status, 200);
    assert.equal((await laptop.get('/api/memories')).status, 401);
  });

  test('logout everywhere ends every session', async () => {
    const { agent: a, user, password } = await registeredAgent();
    const b = agent();
    await b.post('/api/auth/login', { json: { email: user.email, password } });
    assert.equal((await a.post('/api/me/logout-all')).status, 204);
    assert.equal((await a.get('/api/memories')).status, 401);
    assert.equal((await b.get('/api/memories')).status, 401);
  });

  test('demo login answers DEMO_MISSING until the demo data is seeded', async () => {
    const res = await agent().post('/api/auth/demo', { json: { as: 'friend' } });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'DEMO_MISSING');
  });
});

describe('memories', () => {
  test('create, read, update and delete (JSON)', async () => {
    const { agent: a } = await registeredAgent();
    const memory = await createMemory(a, { title: 'Đà Lạt', year: 2019, month: 10, day: 11, place: 'Đà Lạt', story: 'Sương mù.' });
    assert.equal(memory.access, 'owner');
    assert.equal(memory.shareCount, 0);
    assert.deepEqual(memory.files, []);
    assert.equal(memory.cover, null);

    const updated = await a.put(`/api/memories/${memory.id}`, { json: { title: 'Đà Lạt mù sương', year: 2019 } });
    assert.equal(updated.body.memory.title, 'Đà Lạt mù sương');
    assert.equal(updated.body.memory.month, null);

    assert.equal((await a.del(`/api/memories/${memory.id}`)).status, 204);
    assert.equal((await a.get(`/api/memories/${memory.id}`)).status, 404);
  });

  test('validates dates: impossible days, day without month, future dates', async () => {
    const { agent: a } = await registeredAgent();
    const post = (fields) => a.post('/api/memories', { json: { title: 'Date', ...fields } });
    assert.equal((await post({ year: 2021, month: 2, day: 30 })).body.fields.day.code, 'INVALID_DATE');
    assert.equal((await post({ year: 2021, day: 3 })).body.fields.month.code, 'REQUIRED_FOR_DAY');
    assert.equal((await post({ year: new Date().getFullYear() + 1 })).body.fields.year.code, 'FUTURE_DATE');
    assert.equal((await post({ year: 1700 })).body.fields.year.code, 'OUT_OF_RANGE');
    assert.equal((await post({ year: 1998 })).status, 201, 'a year alone is enough for old photos');
  });

  test('line breaks (\\r\\n) are stored as \\n', async () => {
    const { agent: a } = await registeredAgent();
    const memory = await createMemory(a, { story: 'one\r\n\r\ntwo' });
    assert.equal(memory.story, 'one\n\ntwo');
  });

  test('year filter, "before" bucket and per-year counts', async () => {
    const { agent: a } = await registeredAgent();
    for (const year of [1998, 2009, 2019, 2019]) await createMemory(a, { title: `Y${year}`, year });
    assert.deepEqual((await a.get('/api/memories/years')).body.years, [
      { year: 2019, count: 2 },
      { year: 2009, count: 1 },
      { year: 1998, count: 1 },
    ]);
    assert.equal((await a.get('/api/memories?year=2019')).body.memories.length, 2);
    assert.equal((await a.get('/api/memories?year=before-2009')).body.memories.length, 1);
  });

  test("users can never see or change each other's memories, files or people", async () => {
    const { agent: owner } = await registeredAgent('Owner');
    const { agent: stranger } = await registeredAgent('Stranger');
    const memory = await createMemory(owner, { title: 'Riêng tư' });
    const photo = (await upload(owner, memory.id, PNG)).body.memory.files[0];
    const person = (await owner.post('/api/people', { json: { name: 'Bí mật' } })).body.person;

    assert.equal((await stranger.get(`/api/memories/${memory.id}`)).status, 404);
    assert.equal((await stranger.get(photo.url)).status, 404);
    assert.equal((await agent().get(photo.url)).status, 401);
    assert.equal((await stranger.get(`/api/people/${person.id}`)).status, 404);
    assert.equal((await stranger.put(`/api/memories/${memory.id}`, { json: { title: 'x', year: 2020 } })).status, 404);
    assert.equal((await stranger.del(`/api/memories/${memory.id}`)).status, 404);
    assert.equal((await upload(stranger, memory.id, PNG)).status, 404);
    assert.equal((await stranger.del(`/api/memories/${memory.id}/files/${photo.id}`)).status, 404);
    assert.equal((await stranger.post(`/api/people/${person.id}/notes`, { json: { body: 'hi' } })).status, 404);
    assert.deepEqual((await stranger.get('/api/memories')).body.memories, []);
    assert.deepEqual((await stranger.get('/api/search?q=bi mat')).body.people, []);

    // Tagging someone else's person is silently ignored.
    const mine = await createMemory(stranger, { title: 'Của tôi', peopleIds: [person.id] });
    assert.deepEqual(mine.people, []);
  });
});

describe('photos and videos', () => {
  test('several photos per memory: private URLs, ordering, cover, removal from disk', async () => {
    const { agent: a } = await registeredAgent();
    const memory = await createMemory(a);
    const first = await upload(a, memory.id, PNG, { poster: PNG, fields: { width: 1, height: 1 } });
    assert.equal(first.status, 201);
    assert.match(first.body.memory.files[0].posterUrl, /^\/api\/files\/[a-f0-9]{32}\.png$/, 'photos can carry a small preview');
    const second = await upload(a, memory.id, PNG);
    const files = second.body.memory.files;
    assert.equal(files.length, 2);
    assert.match(files[0].url, /^\/api\/files\/[a-f0-9]{32}\.png$/);
    assert.equal(files[0].kind, 'image');
    assert.equal(files[0].width, 1);
    assert.equal(second.body.memory.cover.id, files[0].id);

    const photo = await a.get(files[0].url);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    assert.equal(photo.headers.get('cache-control'), 'private, no-cache');

    const reordered = await a.put(`/api/memories/${memory.id}/files/order`, { json: { ids: [files[1].id, files[0].id] } });
    assert.equal(reordered.body.memory.cover.id, files[1].id, 'the first file is the cover');

    const removed = await a.del(`/api/memories/${memory.id}/files/${files[0].id}`);
    assert.deepEqual(removed.body.memory.files.map((f) => f.id), [files[1].id]);
    await settle();
    assert.ok(!fs.existsSync(onDisk(files[0].url)), 'a removed photo is deleted from disk');
    assert.ok(fs.existsSync(onDisk(files[1].url)));

    assert.equal((await a.del(`/api/memories/${memory.id}`)).status, 204);
    await settle();
    assert.ok(!fs.existsSync(onDisk(files[1].url)), 'deleting the memory deletes its files');
  });

  test('WebP photos (what most browsers now send) are accepted, scrubbed and served', async () => {
    const { agent: a } = await registeredAgent();
    const memory = await createMemory(a);
    // A real 1×1 lossy WebP, and its preview.
    const WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');
    const res = await upload(a, memory.id, WEBP, { type: 'image/webp', name: 'photo.webp', poster: WEBP, fields: { width: 1, height: 1 } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const [file] = res.body.memory.files;
    assert.match(file.url, /^\/api\/files\/[a-f0-9]{32}\.webp$/);
    assert.match(file.posterUrl, /\.webp$/);
    const served = await a.get(file.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/webp');
  });

  test('videos: poster frame, duration, streaming with Range requests', async () => {
    const { agent: a } = await registeredAgent();
    const memory = await createMemory(a);
    const res = await upload(a, memory.id, MP4, {
      type: 'video/mp4',
      name: 'clip.mp4',
      poster: PNG,
      fields: { width: 1920, height: 1080, duration: 12.5 },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const [video] = res.body.memory.files;
    assert.equal(video.kind, 'video');
    assert.match(video.url, /\.mp4$/);
    assert.match(video.posterUrl, /^\/api\/files\/[a-f0-9]{32}\.png$/);
    assert.equal(video.duration, 12.5);

    const part = await a.get(video.url, { headers: { range: 'bytes=0-15' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-type'), 'video/mp4');
    assert.equal(part.headers.get('content-range'), `bytes 0-15/${MP4.length}`);
    assert.equal(part.body.length, 16);
    assert.equal((await a.get(video.posterUrl)).status, 200);
  });

  test('GPS positions are removed from videos and photos before they are stored', async () => {
    const { agent: a } = await registeredAgent();
    const memory = await createMemory(a);

    const video = (await upload(a, memory.id, MP4, { type: 'video/mp4', name: 'clip.mp4' })).body.memory.files[0];
    const storedVideo = fs.readFileSync(onDisk(video.url));
    assert.equal(storedVideo.length, MP4.length, 'the video keeps its exact layout');
    assert.ok(!storedVideo.includes(HOME), 'the filming location is gone');
    assert.ok(storedVideo.includes('+00.0000+000.0000/'));

    // JPEG: SOI, an EXIF segment holding a location, then the image data.
    const exif = Buffer.from('Exif\0\0GPS 21.0285N 105.8542E', 'latin1');
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, exif.length + 2]), exif]);
    const scan = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0x11, 0x22, 0xff, 0xd9]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), app1, scan]);
    const photo = (await upload(a, memory.id, jpeg, { type: 'image/jpeg', name: 'IMG_0001.jpg' })).body.memory.files[1];
    assert.match(photo.url, /\.jpg$/);
    const storedPhoto = fs.readFileSync(onDisk(photo.url));
    assert.ok(!storedPhoto.includes('GPS'), 'the EXIF segment is gone');
    assert.deepEqual(storedPhoto, Buffer.concat([Buffer.from([0xff, 0xd8]), scan]));

    // PNG: a text chunk with a location is dropped; the image itself is untouched.
    const text = Buffer.from('Comment\0taken at 21.0285N 105.8542E', 'latin1');
    const chunk = Buffer.concat([Buffer.alloc(4), Buffer.from('tEXt'), text, Buffer.alloc(4)]);
    chunk.writeUInt32BE(text.length, 0);
    const png = Buffer.concat([PNG.subarray(0, 33), chunk, PNG.subarray(33)]);
    const cleanPng = (await upload(a, memory.id, png)).body.memory.files[2];
    assert.deepEqual(fs.readFileSync(onDisk(cleanPng.url)), PNG);
  });

  test('files are recognised by their bytes, not by their name or type', async () => {
    const { agent: a } = await registeredAgent();
    const memory = await createMemory(a);
    const filesBefore = fs.readdirSync(config.uploadDir).length;

    const script = await upload(a, memory.id, Buffer.from('<script>alert(1)</script>'), { name: 'evil.png' });
    assert.equal(script.status, 400);
    assert.equal(script.body.fields.file.code, 'FILE_TYPE');

    // HEIC photos share the MP4 container format: they are refused rather than stored as "videos".
    const heic = Buffer.concat([box('ftyp', 'heic', Buffer.alloc(4), 'mif1heic'), Buffer.alloc(64)]);
    const refused = await upload(a, memory.id, heic, { type: 'video/mp4', name: 'IMG_0002.mp4' });
    assert.equal(refused.body.fields.file.code, 'FILE_TYPE');

    // The preview ("poster") of a photo or video must itself be an image.
    const badPoster = await upload(a, memory.id, PNG, { poster: MP4 });
    assert.equal(badPoster.body.fields.poster.code, 'FILE_TYPE');

    await settle();
    assert.equal(fs.readdirSync(config.uploadDir).length, filesBefore, 'nothing is kept on disk');
    assert.deepEqual(tmpFiles(), [], 'temporary files are cleaned up');
  });

  test('size limits: photos, videos, files per memory, storage per account', async () => {
    const { agent: a } = await registeredAgent();
    const memory = await createMemory(a);

    const bigPhoto = Buffer.concat([PNG, Buffer.alloc(1.2 * 1024 * 1024)]);
    assert.deepEqual((await upload(a, memory.id, bigPhoto)).body.fields.file, { code: 'FILE_TOO_LARGE', max: 1 });

    const hugeVideo = Buffer.concat([MP4, Buffer.alloc(2.5 * 1024 * 1024)]);
    const huge = await upload(a, memory.id, hugeVideo, { type: 'video/mp4', name: 'long.mp4' });
    assert.equal(huge.status, 400);
    assert.deepEqual(huge.body.fields.file, { code: 'FILE_TOO_LARGE', max: 2 });

    // 5 MB per account in these tests: two 1.9 MB videos fit, a third does not.
    const video = Buffer.concat([MP4, Buffer.alloc(1.9 * 1024 * 1024)]);
    assert.equal((await upload(a, memory.id, video, { type: 'video/mp4' })).status, 201);
    assert.equal((await upload(a, memory.id, video, { type: 'video/mp4' })).status, 201);
    const full = await upload(a, memory.id, video, { type: 'video/mp4' });
    assert.deepEqual(full.body.fields.file, { code: 'STORAGE_FULL', max: 5 });
    const storage = (await a.get('/api/me/storage')).body;
    assert.equal(storage.quota, 5 * 1024 * 1024);
    assert.ok(storage.used > 3.8 * 1024 * 1024);

    const other = await createMemory(a);
    for (let i = 0; i < 18; i += 1) assert.equal((await upload(a, other.id, PNG)).status, 201);
    await upload(a, other.id, PNG);
    await upload(a, other.id, PNG);
    const tooMany = await upload(a, other.id, PNG);
    assert.deepEqual(tooMany.body.fields.file, { code: 'TOO_MANY_FILES', max: 20 });

    await settle();
    assert.deepEqual(tmpFiles(), []);
  });
});

describe('circle, invites, sharing and comments', () => {
  test('an invite link connects two people and shares the memory attached to it', async () => {
    const { agent: an, user: anUser } = await registeredAgent('An');
    const { agent: ha, user: haUser } = await registeredAgent('Thu Hà');
    const memory = await createMemory(an, { title: 'Hội An 2015' });
    const photo = (await upload(an, memory.id, PNG)).body.memory.files[0];
    const person = (await an.post('/api/people', { json: { name: 'Hà (bạn cấp 2)' } })).body.person;

    const created = await an.post('/api/invites', { json: { label: 'Gửi Hà qua Zalo', memoryId: memory.id, personId: person.id } });
    assert.equal(created.status, 201);
    const { token, invite } = created.body;
    assert.ok(token.length >= 32);
    assert.equal(invite.status, 'pending');
    assert.equal(invite.person.id, person.id);
    assert.equal(invite.memory.title, 'Hội An 2015');
    const stored = db.prepare('SELECT token_hash FROM invites WHERE id = ?').get(invite.id);
    assert.notEqual(stored.token_hash, token, 'only a hash of the token is stored');

    // Anyone holding the link sees who sent it — not the private label or the address-book entry.
    const preview = await agent().get(`/api/invites/preview/${token}`);
    assert.equal(preview.status, 200);
    assert.deepEqual(Object.keys(preview.body.invite).sort(), ['expiresAt', 'inviter', 'memory', 'own']);
    assert.deepEqual(preview.body.invite.inviter, { name: 'An' });
    assert.deepEqual(preview.body.invite.memory, { title: 'Hội An 2015' });
    assert.equal(JSON.stringify(preview.body).includes('Zalo'), false);

    assert.equal((await agent().post(`/api/invites/accept/${token}`)).status, 401, 'accepting needs an account');
    assert.equal((await an.post(`/api/invites/accept/${token}`)).body.error, 'INVITE_OWN');

    const accepted = await ha.post(`/api/invites/accept/${token}`);
    assert.deepEqual(accepted.body, { inviter: { id: anUser.id, name: 'An' }, memoryId: memory.id });

    // Thu Hà can now see that memory and its photo — read-only.
    const seen = (await ha.get(`/api/memories/${memory.id}`)).body.memory;
    assert.equal(seen.access, 'shared');
    assert.deepEqual(seen.owner, { id: anUser.id, name: 'An' });
    assert.equal(seen.shareCount, undefined, 'only the owner learns who else can see it');
    assert.ok(seen.sharedAt, 'the recipient sees when it was shared');
    assert.equal((await ha.get(photo.url)).status, 200);
    assert.equal((await ha.put(`/api/memories/${memory.id}`, { json: { title: 'x', year: 2015 } })).status, 404);
    assert.equal((await ha.del(`/api/memories/${memory.id}`)).status, 404);
    assert.equal((await upload(ha, memory.id, PNG)).status, 404);
    assert.equal((await ha.get(`/api/memories/${memory.id}/shares`)).status, 404, 'recipients cannot re-share');
    assert.deepEqual((await ha.get('/api/memories')).body.memories, [], 'the album lists only your own memories');

    const sharing = (await ha.get('/api/sharing')).body;
    assert.deepEqual(sharing.circle.map((c) => c.name), ['An']);
    assert.deepEqual(sharing.sharedWithMe.map((m) => m.title), ['Hội An 2015']);

    const anSide = (await an.get('/api/sharing')).body;
    assert.deepEqual(anSide.circle.map((c) => [c.name, c.sharedByMe]), [['Thu Hà', 1]]);
    assert.equal(anSide.invites[0].status, 'accepted');
    assert.deepEqual(anSide.invites[0].acceptedBy, { id: haUser.id, name: 'Thu Hà' });
    assert.deepEqual(anSide.sharedByMe.map((m) => [m.title, m.shareCount]), [['Hội An 2015', 1]]);
    assert.deepEqual((await an.get(`/api/people/${person.id}`)).body.person.linked, { id: haUser.id, name: 'Thu Hà' });

    // A link works once.
    const { agent: third } = await registeredAgent('Someone else');
    assert.equal((await third.post(`/api/invites/accept/${token}`)).body.error, 'INVITE_INVALID');
    assert.equal((await agent().get(`/api/invites/preview/${token}`)).status, 404);
    assert.equal((await third.get(`/api/memories/${memory.id}`)).status, 404);
  });

  test('invites can be withdrawn and they expire', async () => {
    const { agent: a } = await registeredAgent();
    const { agent: b } = await registeredAgent();
    const first = (await a.post('/api/invites', { json: {} })).body;
    assert.equal((await b.del(`/api/invites/${first.invite.id}`)).status, 404, 'only the inviter can withdraw');
    assert.equal((await a.del(`/api/invites/${first.invite.id}`)).status, 204);
    assert.equal((await b.post(`/api/invites/accept/${first.token}`)).body.error, 'INVITE_INVALID');
    assert.equal((await a.get('/api/invites')).body.invites[0].status, 'revoked');

    const second = (await a.post('/api/invites', { json: {} })).body;
    const expiry = Date.parse(second.invite.expiresAt) - Date.now();
    assert.ok(Math.abs(expiry - 7 * 86_400_000) < 60_000, 'valid for 7 days');
    db.prepare('UPDATE invites SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', second.invite.id);
    assert.equal((await b.post(`/api/invites/accept/${second.token}`)).body.error, 'INVITE_INVALID');
    assert.equal((await a.get('/api/invites')).body.invites[0].status, 'expired');

    // Someone else's memory or person cannot be attached to an invite.
    const { agent: c } = await registeredAgent();
    const foreign = await createMemory(c);
    const third = (await a.post('/api/invites', { json: { memoryId: foreign.id } })).body;
    assert.equal(third.invite.memory, null);
    assert.equal((await agent().get('/api/invites/preview/not-a-real-token-at-all-000')).body.error, 'INVITE_INVALID');
  });

  test('the memory form can create an invite first and attach the memory when it is saved', async () => {
    const { agent: an } = await registeredAgent('An');
    const { agent: ha } = await registeredAgent('Thu Hà');
    const { agent: stranger } = await registeredAgent('Stranger');

    // The link is created while the memory is still being written…
    const first = (await an.post('/api/invites', { json: { label: 'Hà' } })).body;
    assert.equal(first.invite.memory, null);
    // …and the memory is attached when it is saved. Only by the inviter, only one of their own memories.
    const memory = await createMemory(an, { title: 'Đà Lạt 2019' });
    const notYours = await createMemory(stranger, { title: 'Not yours' });
    assert.equal((await stranger.put(`/api/invites/${first.invite.id}/memory`, { json: { memoryId: memory.id } })).status, 404);
    assert.equal((await an.put(`/api/invites/${first.invite.id}/memory`, { json: { memoryId: notYours.id } })).status, 404);
    const attached = await an.put(`/api/invites/${first.invite.id}/memory`, { json: { memoryId: memory.id } });
    assert.equal(attached.status, 200);
    assert.deepEqual(attached.body.invite.memory, { id: memory.id, title: 'Đà Lạt 2019' });
    assert.deepEqual((await agent().get(`/api/invites/preview/${first.token}`)).body.invite.memory, { title: 'Đà Lạt 2019' });
    await ha.post(`/api/invites/accept/${first.token}`);
    assert.equal((await ha.get(`/api/memories/${memory.id}`)).status, 200);

    // Accepted before the memory was saved: the two are connected, so the memory is shared at once.
    const { agent: khoa } = await registeredAgent('Khoa');
    const early = (await an.post('/api/invites', { json: {} })).body;
    await khoa.post(`/api/invites/accept/${early.token}`);
    const later = await createMemory(an, { title: 'Sinh nhật' });
    assert.equal((await khoa.get(`/api/memories/${later.id}`)).status, 404);
    assert.equal((await an.put(`/api/invites/${early.invite.id}/memory`, { json: { memoryId: later.id } })).status, 200);
    assert.equal((await khoa.get(`/api/memories/${later.id}`)).status, 200);

    // A withdrawn link takes no memory. The circle endpoint lists who can be ticked in the form.
    const withdrawn = (await an.post('/api/invites', { json: {} })).body;
    await an.del(`/api/invites/${withdrawn.invite.id}`);
    assert.equal((await an.put(`/api/invites/${withdrawn.invite.id}/memory`, { json: { memoryId: memory.id } })).status, 404);
    assert.deepEqual((await an.get('/api/sharing/circle')).body.circle.map((c) => c.name), ['Khoa', 'Thu Hà']);
  });

  test('sharing is limited to your circle and can be withdrawn', async () => {
    const { agent: an } = await registeredAgent('An');
    const { agent: ha, user: haUser } = await registeredAgent('Hà');
    const { agent: stranger, user: strangerUser } = await registeredAgent('Stranger');
    await connect(an, ha);
    const memory = await createMemory(an, { title: 'Tết 2010' });
    const photo = (await upload(an, memory.id, PNG)).body.memory.files[0];

    // The stranger is not in An's circle: silently left out.
    const set = await an.put(`/api/memories/${memory.id}/shares`, { json: { userIds: [haUser.id, strangerUser.id] } });
    assert.deepEqual(set.body.recipients.map((r) => r.name), ['Hà']);
    const panel = (await an.get(`/api/memories/${memory.id}/shares`)).body;
    assert.deepEqual(panel.circle.map((c) => c.name), ['Hà']);
    assert.equal((await stranger.get(`/api/memories/${memory.id}`)).status, 404);
    assert.equal((await stranger.get(photo.url)).status, 404);
    assert.equal((await ha.get(photo.url)).status, 200);

    // Withdrawn: the memory and its files disappear for Hà at once.
    await an.put(`/api/memories/${memory.id}/shares`, { json: { userIds: [] } });
    assert.equal((await ha.get(`/api/memories/${memory.id}`)).status, 404);
    assert.equal((await ha.get(photo.url)).status, 404);
    assert.deepEqual((await ha.get('/api/sharing')).body.sharedWithMe, []);
  });

  test('live updates (SSE): a new share and a new note reach the other person at once', async () => {
    const { agent: an } = await registeredAgent('An');
    const { agent: ha, user: haUser } = await registeredAgent('Hà');
    await connect(an, ha);
    const memory = await createMemory(an, { title: 'Hội An' });
    assert.equal((await agent().get('/api/events')).status, 401, 'only for signed-in people');

    // Hà's browser tab listens…
    const controller = new AbortController();
    const res = await fetch(`${base}/api/events`, { headers: { cookie: ha.cookie }, signal: controller.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let pending = null;
    async function next(type) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const match = buffer.match(new RegExp(`event: ${type}\\ndata: (.*)\\n\\n`));
        if (match) {
          buffer = buffer.slice(match.index + match[0].length);
          return JSON.parse(match[1]);
        }
        pending ??= reader.read().then((result) => {
          pending = null;
          return result;
        });
        const result = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve(null), 100))]);
        if (result?.value) buffer += decoder.decode(result.value, { stream: true });
      }
      throw new Error(`no "${type}" event arrived`);
    }

    try {
      // …An shares the memory with her…
      await an.put(`/api/memories/${memory.id}/shares`, { json: { userIds: [haUser.id] } });
      const shared = await next('shared');
      assert.deepEqual([shared.memoryId, shared.title, shared.by.name], [memory.id, 'Hội An', 'An']);
      // …and writes a note under it.
      await an.post(`/api/memories/${memory.id}/comments`, { json: { body: 'Nhớ quá!' } });
      const note = await next('comment');
      assert.equal(note.memoryId, memory.id);
      assert.equal(note.comment.body, 'Nhớ quá!');
      assert.equal(note.comment.author.name, 'An');
      await an.del(`/api/memories/${memory.id}/comments/${note.comment.id}`);
      assert.equal((await next('comment-removed')).commentId, note.comment.id);
    } finally {
      controller.abort();
    }
  });

  /** Reads one SSE response. `untilDone` resolves true when the server closes it. */
  function eventStream(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    let pending = null;
    async function pull(ms) {
      const deadline = Date.now() + ms;
      while (!done && Date.now() < deadline) {
        pending ??= reader.read().then(
          (result) => {
            pending = null;
            return result;
          },
          () => {
            pending = null;
            done = true;
            return null;
          },
        );
        const result = await Promise.race([
          pending,
          new Promise((resolve) => setTimeout(() => resolve(undefined), Math.max(0, deadline - Date.now()))),
        ]);
        if (result === undefined) return;
        if (!result) return;
        if (result.value) buffer += decoder.decode(result.value, { stream: true });
        if (result.done) done = true;
      }
    }
    return {
      get buffer() {
        return buffer;
      },
      untilDone: async (ms) => {
        await pull(ms);
        return done;
      },
      async next(type, ms = 3000) {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
          const match = buffer.match(new RegExp(`event: ${type}\\ndata: (.*)\\n\\n`));
          if (match) {
            buffer = buffer.slice(match.index + match[0].length);
            return JSON.parse(match[1]);
          }
          if (done) return null;
          await pull(Math.min(200, deadline - Date.now()));
        }
        return null;
      },
    };
  }

  test('logging out closes that session’s stream; another device keeps receiving', async () => {
    const { agent: an } = await registeredAgent('An');
    const { agent: phone, user: haUser, password } = await registeredAgent('Hà');
    const laptop = agent();
    assert.equal((await laptop.post('/api/auth/login', { json: { email: haUser.email, password } })).status, 200);
    await connect(an, phone);
    const memory = await createMemory(an, { title: 'Huế' });

    const phoneAbort = new AbortController();
    const laptopAbort = new AbortController();
    try {
      const phoneRes = await fetch(`${base}/api/events`, { headers: { cookie: phone.cookie }, signal: phoneAbort.signal });
      const laptopRes = await fetch(`${base}/api/events`, { headers: { cookie: laptop.cookie }, signal: laptopAbort.signal });
      assert.equal(phoneRes.status, 200);
      assert.equal(laptopRes.status, 200);
      const phoneStream = eventStream(phoneRes);
      const laptopStream = eventStream(laptopRes);

      assert.equal((await phone.post('/api/auth/logout')).status, 204);
      assert.equal(await phoneStream.untilDone(1500), true, 'the logged-out stream should close');

      await an.put(`/api/memories/${memory.id}/shares`, { json: { userIds: [haUser.id] } });
      const shared = await laptopStream.next('shared');
      assert.equal(shared?.memoryId, memory.id, 'the other session is still signed in');
      assert.equal(phoneStream.buffer.includes('event: shared'), false);
    } finally {
      phoneAbort.abort();
      laptopAbort.abort();
    }
  });

  test('changing the password closes the other device’s live stream', async () => {
    const { agent: phone, user, password } = await registeredAgent();
    const laptop = agent();
    assert.equal((await laptop.post('/api/auth/login', { json: { email: user.email, password } })).status, 200);
    const abort = new AbortController();
    try {
      const res = await fetch(`${base}/api/events`, { headers: { cookie: laptop.cookie }, signal: abort.signal });
      assert.equal(res.status, 200);
      const stream = eventStream(res);
      const changed = await phone.post('/api/me/password', {
        json: { currentPassword: password, newPassword: 'a brand new password' },
      });
      assert.equal(changed.status, 204);
      assert.equal(await stream.untilDone(1500), true);
    } finally {
      abort.abort();
    }
  });

  test('deleting the account closes its live stream', async () => {
    const { agent: a, user } = await registeredAgent();
    const abort = new AbortController();
    try {
      const res = await fetch(`${base}/api/events`, { headers: { cookie: a.cookie }, signal: abort.signal });
      assert.equal(res.status, 200);
      const stream = eventStream(res);
      assert.equal((await a.del('/api/me', { json: { email: user.email } })).status, 204);
      assert.equal(await stream.untilDone(1500), true);
    } finally {
      abort.abort();
    }
  });

  test('comments: owner and recipients only; authors and owners can delete', async () => {
    const { agent: an } = await registeredAgent('An');
    const { agent: ha } = await registeredAgent('Hà');
    const { agent: stranger } = await registeredAgent('Stranger');
    const memory = await createMemory(an);
    await connect(an, ha, { memoryId: memory.id });

    const fromHa = await ha.post(`/api/memories/${memory.id}/comments`, { json: { body: '  Nhớ quá!\r\nHẹn gặp lại.  ' } });
    assert.equal(fromHa.status, 201);
    assert.equal(fromHa.body.comment.body, 'Nhớ quá!\nHẹn gặp lại.');
    assert.equal(fromHa.body.comment.author.name, 'Hà');
    const fromAn = (await an.post(`/api/memories/${memory.id}/comments`, { json: { body: 'Ừ, nhớ ghê.' } })).body.comment;
    assert.equal((await an.post(`/api/memories/${memory.id}/comments`, { json: { body: '   ' } })).body.fields.body.code, 'REQUIRED');

    assert.deepEqual((await ha.get(`/api/memories/${memory.id}/comments`)).body.comments.map((c) => c.author.name), ['Hà', 'An']);
    assert.equal((await stranger.get(`/api/memories/${memory.id}/comments`)).status, 404);
    assert.equal((await stranger.post(`/api/memories/${memory.id}/comments`, { json: { body: 'hi' } })).status, 404);
    assert.equal((await stranger.del(`/api/memories/${memory.id}/comments/${fromAn.id}`)).status, 404);
    assert.equal((await ha.del(`/api/memories/${memory.id}/comments/${fromAn.id}`)).status, 404, "not someone else's comment");
    assert.equal((await an.del(`/api/memories/${memory.id}/comments/${fromHa.body.comment.id}`)).status, 204, 'the owner moderates');
    assert.equal((await an.get(`/api/memories/${memory.id}`)).body.memory.commentCount, 1);
  });

  test('leaving a circle withdraws every share both ways and unlinks the address-book entry', async () => {
    const { agent: an } = await registeredAgent('An');
    const { agent: ha, user: haUser } = await registeredAgent('Hà');
    const person = (await an.post('/api/people', { json: { name: 'Hà' } })).body.person;
    const anMemory = await createMemory(an, { title: 'của An' });
    const { accepted } = await connect(an, ha, { memoryId: anMemory.id, personId: person.id });
    const haMemory = await createMemory(ha, { title: 'của Hà' });
    await ha.put(`/api/memories/${haMemory.id}/shares`, { json: { userIds: [accepted.inviter.id] } });
    assert.equal((await an.get(`/api/memories/${haMemory.id}`)).status, 200);

    assert.equal((await ha.del(`/api/sharing/circle/${accepted.inviter.id}`)).status, 204);
    assert.equal((await ha.get(`/api/memories/${anMemory.id}`)).status, 404);
    assert.equal((await an.get(`/api/memories/${haMemory.id}`)).status, 404);
    assert.deepEqual((await an.get('/api/sharing')).body.circle, []);
    assert.equal((await an.get(`/api/people/${person.id}`)).body.person.linked, null);
    assert.equal((await an.del(`/api/sharing/circle/${haUser.id}`)).status, 404, 'already gone');
  });

  test('"Today" and the navigation counters include what was shared with you', async () => {
    const { agent: an } = await registeredAgent('An');
    const { agent: ha } = await registeredAgent('Hà');
    const memory = await createMemory(an, { title: 'Gửi Hà' });
    await connect(an, ha, { memoryId: memory.id });
    const summary = (await ha.get('/api/dashboard/summary')).body;
    assert.equal(summary.counts.sharedWithMe, 1);
    assert.equal(summary.counts.circle, 1);
    assert.equal(summary.counts.memories, 0);
    const today = (await ha.get('/api/dashboard/today')).body;
    assert.deepEqual(today.sharedWithMe.map((m) => m.title), ['Gửi Hà']);
    assert.equal(today.filmstrip.mode, 'empty', "other people's memories never appear in your own film strip");
  });
});

describe('artifacts (kỷ vật): keepsake cards kept from your own memories', () => {
  /** A card as the card studio sends it: the image drawn by the browser, a small preview and what is written on it. */
  const cardForm = (fields = {}) =>
    fileForm(PNG, {
      poster: PNG,
      fields: {
        kind: 'postcard',
        style: 'paper',
        title: 'Vịnh Hạ Long',
        line: 'Hạ Long · 9 tháng 7, 2022',
        message: 'Hè này đi lại nhé!',
        recipient: 'Bố mẹ',
        width: 1,
        height: 1,
        ...fields,
      },
    });

  test('keep a card made from your memory, list it by kind, open it, delete it', async () => {
    const { agent: an } = await registeredAgent('An');
    const memory = await createMemory(an, { title: 'Vịnh Hạ Long', year: 2022 });

    const saved = await an.post(`/api/memories/${memory.id}/artifacts`, { form: cardForm() });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    const card = saved.body.artifact;
    assert.equal(card.kind, 'postcard');
    assert.equal(card.recipient, 'Bố mẹ');
    assert.deepEqual(card.memory, { id: memory.id, title: 'Vịnh Hạ Long', year: 2022, month: null, day: null });
    assert.match(card.imageUrl, /^\/api\/files\/[a-f0-9]{32}\.png$/);
    assert.equal((await an.get(card.imageUrl)).status, 200);

    await an.post(`/api/memories/${memory.id}/artifacts`, { form: cardForm({ kind: 'stamp', style: 'darkroom', title: 'Hạ Long 2022' }) });
    assert.deepEqual((await an.get('/api/artifacts')).body.artifacts.map((x) => x.kind), ['postcard', 'stamp'], 'oldest first');
    assert.deepEqual((await an.get('/api/artifacts?kind=stamp')).body.artifacts.map((x) => x.title), ['Hạ Long 2022']);
    assert.equal((await an.get(`/api/artifacts/${card.id}`)).body.artifact.message, 'Hè này đi lại nhé!');
    // The memory page lists the cards made from it — for its owner.
    assert.deepEqual((await an.get(`/api/memories/${memory.id}`)).body.memory.artifacts.map((x) => x.kind), ['postcard', 'stamp']);

    assert.equal((await an.del(`/api/artifacts/${card.id}`)).status, 204);
    await settle();
    assert.equal((await an.get(`/api/artifacts/${card.id}`)).status, 404);
    assert.ok(!fs.existsSync(onDisk(card.imageUrl)) && !fs.existsSync(onDisk(card.previewUrl)), 'image and preview deleted');
  });

  test('only from your own memories, checked like any upload, private even from people the memory is shared with', async () => {
    const { agent: an } = await registeredAgent('An');
    const { agent: ha } = await registeredAgent('Hà');
    await connect(an, ha);
    const memory = await createMemory(an, { title: 'Sinh nhật Hà' });
    await an.put(`/api/memories/${memory.id}/shares`, { json: { userIds: [(await ha.get('/api/auth/session')).body.user.id] } });

    // Hà sees the memory and can make a card to download — but not keep a copy of An's photo in her account.
    assert.equal((await ha.post(`/api/memories/${memory.id}/artifacts`, { form: cardForm() })).status, 404);

    const bad = await an.post(`/api/memories/${memory.id}/artifacts`, {
      form: fileForm(MP4, { type: 'video/mp4', name: 'v.mp4', fields: { kind: 'spaceship', title: '' } }),
    });
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['file', 'kind', 'title']);
    await settle();
    assert.deepEqual(tmpFiles(), []);

    const usedBefore = (await an.get('/api/me/storage')).body.used;
    const card = (await an.post(`/api/memories/${memory.id}/artifacts`, { form: cardForm() })).body.artifact;
    assert.equal((await an.get('/api/me/storage')).body.used, usedBefore + PNG.length * 2, 'counted in the storage quota');
    assert.deepEqual((await ha.get('/api/artifacts')).body.artifacts, []);
    assert.equal((await ha.get(`/api/artifacts/${card.id}`)).status, 404);
    assert.equal((await ha.get(card.imageUrl)).status, 404, 'not even for someone the memory is shared with');
    assert.equal((await agent().get(card.imageUrl)).status, 401);
    assert.equal((await ha.get(`/api/memories/${memory.id}`)).body.memory.artifacts, undefined);
    assert.equal((await ha.del(`/api/artifacts/${card.id}`)).status, 404);
  });

  test('deleting the memory deletes its cards; export and search include them', async () => {
    const { agent: an } = await registeredAgent('An');
    const memory = await createMemory(an, { title: 'Tết ở quê', year: 2014 });
    const form = cardForm({ title: 'Tết ở quê', message: 'Năm nay về quê gói bánh chưng nhé' });
    const card = (await an.post(`/api/memories/${memory.id}/artifacts`, { form })).body.artifact;

    assert.deepEqual((await an.get('/api/search?q=banh chung')).body.artifacts.map((x) => x.title), ['Tết ở quê'], 'accents optional');
    const exported = (await an.get('/api/me/export')).body;
    assert.equal(exported.format, 4);
    assert.deepEqual(
      exported.artifacts.map((x) => [x.title, x.memoryId, x.file]),
      [['Tết ở quê', memory.id, card.imageUrl.split('/').pop()]],
    );

    assert.equal((await an.del(`/api/memories/${memory.id}`)).status, 204);
    await settle();
    assert.deepEqual((await an.get('/api/artifacts')).body.artifacts, []);
    assert.ok(!fs.existsSync(onDisk(card.imageUrl)) && !fs.existsSync(onDisk(card.previewUrl)), "the card's files go with the memory");
  });
});

describe('search, dashboard, people, media', () => {
  test('search ignores Vietnamese accents and case', async () => {
    const { agent: a } = await registeredAgent();
    await createMemory(a, { title: 'Đà Lạt', story: 'Tết ở quê' });
    await a.post('/api/media', { json: { kind: 'music', title: 'Diễm xưa', owner: 'Ba' } });
    const person = (await a.post('/api/people', { json: { name: 'Thu Hà', relation: 'bạn cấp 2' } })).body.person;
    await a.post(`/api/people/${person.id}/notes`, { json: { body: 'Hẹn cà phê ở Huế' } });

    assert.equal((await a.get('/api/search?q=da lat')).body.memories.length, 1);
    assert.equal((await a.get('/api/search?q=TET O QUE')).body.memories.length, 1);
    assert.equal((await a.get('/api/search?q=diem xua')).body.media.length, 1);
    assert.equal((await a.get('/api/search?q=hue')).body.people.length, 1, 'notes are searchable too');
    assert.equal((await a.get('/api/search?q=100%')).body.memories.length, 0, 'LIKE wildcards are escaped');
  });

  test('"On this day" finds memories from earlier years around today', async () => {
    const { agent: a } = await registeredAgent();
    const today = toISODate();
    const [year, month, day] = today.split('-').map(Number);
    // year - 4 keeps Feb 29 valid when the tests run on a leap day.
    await createMemory(a, { title: 'Năm xưa', year: year - 4, month, day });
    await createMemory(a, { title: 'Chỉ có năm', year: year - 2 });

    const res = await a.get(`/api/dashboard/today?today=${today}`);
    assert.equal(res.body.filmstrip.mode, 'day');
    assert.deepEqual(res.body.filmstrip.items.map((m) => m.title), ['Năm xưa']);
    assert.deepEqual(res.body.stats, { memories: 2, people: 0, media: 0 });

    const summary = await a.get(`/api/dashboard/summary?today=${today}`);
    assert.equal(summary.body.counts.onThisDay, 1);
  });

  test('film strip falls back to random memories when nothing matches today', async () => {
    const { agent: a } = await registeredAgent();
    const empty = await a.get('/api/dashboard/today');
    assert.equal(empty.body.filmstrip.mode, 'empty');
    await createMemory(a, { title: 'Chỉ có năm', year: 2000 });
    assert.equal((await a.get('/api/dashboard/today')).body.filmstrip.mode, 'random');
  });

  test('people: contact log, notes and the long-time-no-see suggestion', async () => {
    const { agent: a } = await registeredAgent();
    const ha = (await a.post('/api/people', { json: { name: 'Thu Hà', lastContact: '2021-03-14', closeness: 1 } })).body.person;
    await a.post('/api/people', { json: { name: 'Minh Khoa', lastContact: toISODate() } });

    const summary = await a.get(`/api/dashboard/summary?today=${toISODate()}`);
    assert.equal(summary.body.suggestion.person.name, 'Thu Hà');
    assert.ok(summary.body.suggestion.years >= 5);

    const note = await a.post(`/api/people/${ha.id}/notes`, { json: { body: 'Gọi lại cho Hà' } });
    assert.equal(note.status, 201);
    const contacted = await a.post(`/api/people/${ha.id}/contacted`, { json: { date: toISODate() } });
    assert.equal(contacted.body.person.lastContact, toISODate());
    assert.equal((await a.get(`/api/dashboard/summary?today=${toISODate()}`)).body.suggestion, null);

    const detail = await a.get(`/api/people/${ha.id}`);
    assert.equal(detail.body.notes.length, 1);
    assert.deepEqual(detail.body.invites, []);
    assert.equal(detail.body.person.linked, null);
    assert.equal((await a.del(`/api/people/${ha.id}/notes/${note.body.note.id}`)).status, 204);

    const future = await a.post('/api/people', { json: { name: 'X', lastContact: '2999-01-01' } });
    assert.equal(future.body.fields.lastContact.code, 'FUTURE_DATE');
  });

  test('media links must be http(s) — javascript: URLs are refused', async () => {
    const { agent: a } = await registeredAgent();
    const bad = await a.post('/api/media', { json: { kind: 'film', title: 'XSS', url: 'javascript:alert(1)' } });
    assert.equal(bad.body.fields.url.code, 'INVALID_URL');
    const good = await a.post('/api/media', { json: { kind: 'film', title: 'Mắt biếc', url: 'https://youtube.com/x' } });
    assert.equal(good.status, 201);
    assert.equal((await a.get('/api/media?kind=music')).body.media.length, 0);
    assert.equal((await a.get('/api/media?kind=film')).body.media.length, 1);
  });
});

describe('privacy & security', () => {
  test('cross-site writes are blocked (CSRF)', async () => {
    const { agent: a } = await registeredAgent();
    const res = await a.post('/api/media', {
      json: { kind: 'film', title: 'csrf' },
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'CROSS_SITE');
  });

  test('responses carry security headers and are never cached', async () => {
    const res = await agent().get('/api/auth/session');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(res.headers.get('content-security-policy'), /media-src 'self' blob:/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('export contains only your own data (plus the comments you wrote)', async () => {
    const { agent: a, user } = await registeredAgent('Exporter');
    const { agent: other } = await registeredAgent('Other');
    const mine = await createMemory(a, { title: 'Của tôi', year: 2010 });
    await upload(a, mine.id, PNG);
    const theirs = await createMemory(other, { title: 'Không phải của tôi', year: 2010 });
    await connect(other, a, { memoryId: theirs.id });
    await a.post(`/api/memories/${theirs.id}/comments`, { json: { body: 'Đẹp quá' } });

    const res = await a.get('/api/me/export');
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="?memory-lane-\d{4}-\d{2}-\d{2}\.json"?$/);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const data = res.body;
    assert.equal(data.user.email, user.email);
    assert.deepEqual(data.memories.map((m) => m.title), ['Của tôi']);
    assert.match(data.memories[0].files[0].file, /^[a-f0-9]{32}\.png$/);
    assert.deepEqual(data.circle.map((c) => c.name), ['Other']);
    assert.deepEqual(data.commentsOnSharedMemories.map((c) => c.body), ['Đẹp quá']);
    assert.equal(JSON.stringify(data).includes('Không phải của tôi'), false);
  });

  test('deleting the account needs the email typed back, then removes everything', async () => {
    const { agent: a, user } = await registeredAgent();
    const { agent: friend } = await registeredAgent('Friend');
    const memory = await createMemory(a, { title: 'Bye', year: 2015 });
    const file = onDisk((await upload(a, memory.id, PNG)).body.memory.files[0].url);
    const friendMemory = await createMemory(friend);
    await connect(friend, a, { memoryId: friendMemory.id });
    await a.post(`/api/memories/${friendMemory.id}/comments`, { json: { body: 'xin chào' } });

    const wrong = await a.del('/api/me', { json: { email: 'not-me@example.com' } });
    assert.equal(wrong.body.fields.email.code, 'CONFIRM_MISMATCH');

    assert.equal((await a.del('/api/me', { json: { email: user.email.toUpperCase() } })).status, 204);
    await settle();
    assert.ok(!fs.existsSync(file), 'photos are deleted from disk');
    assert.equal((await a.get('/api/auth/session')).body.user, null);
    const login = await agent().post('/api/auth/login', { json: { email: user.email, password: 'correct horse battery' } });
    assert.equal(login.status, 401);
    assert.deepEqual((await friend.get('/api/sharing')).body.circle, [], 'they leave every circle');
    assert.deepEqual((await friend.get(`/api/memories/${friendMemory.id}/comments`)).body.comments, []);
  });

  test('unknown API routes and malformed JSON get clean JSON errors', async () => {
    const a = agent();
    assert.deepEqual((await a.get('/api/nope')).body, { error: 'NOT_FOUND' });
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'BAD_REQUEST' });
  });
});
