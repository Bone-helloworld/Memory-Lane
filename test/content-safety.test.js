// Azure Content Safety is never called for real here. fetch is stubbed, or the client is injected.
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
import {
  API_VERSION,
  ContentSafetyError,
  analyzeImage,
  analyzeText,
  createContentSafetyClient,
  imageIsBlocked,
  imageToJpeg,
  setContentSafetyClient,
  textIsBlocked,
} from '../server/lib/content-safety.js';
import { applyImageSafety, scoreImage, setImageReviewer } from '../server/lib/moderate.js';
import { contentSafetyFrames, setVideoReviewer } from '../server/lib/videoCheck.js';

const CATEGORIES = ['Sexual', 'Violence', 'Hate', 'SelfHarm'];

function categories(overrides = {}) {
  return CATEGORIES.map((category) => ({ category, severity: overrides[category] ?? 0 }));
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('severity thresholds', () => {
  test('images block on sexual low-or-higher, or violence medium-or-higher', () => {
    assert.equal(imageIsBlocked(categories()), false);
    assert.equal(imageIsBlocked(categories({ Sexual: 2 })), true);
    assert.equal(imageIsBlocked(categories({ Sexual: 0, Violence: 2 })), false);
    assert.equal(imageIsBlocked(categories({ Violence: 4 })), true);
    assert.equal(imageIsBlocked(categories({ Hate: 6, SelfHarm: 6 })), false);
  });

  test('text blocks on sexual low-or-higher, or hate, violence, self-harm at medium', () => {
    assert.equal(textIsBlocked(categories()), false);
    assert.equal(textIsBlocked(categories({ Sexual: 2 })), true);
    assert.equal(textIsBlocked(categories({ Hate: 2 })), false);
    assert.equal(textIsBlocked(categories({ Hate: 4 })), true);
    assert.equal(textIsBlocked(categories({ Violence: 4 })), true);
    assert.equal(textIsBlocked(categories({ SelfHarm: 2 })), false);
    assert.equal(textIsBlocked(categories({ SelfHarm: 4 })), true);
  });
});

describe('image preparation', () => {
  test('a photo is sent as a JPEG no larger than 1024px and no smaller than 50px', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-safety-'));
    try {
      const wide = path.join(dir, 'wide.png');
      const tiny = path.join(dir, 'tiny.png');
      await sharp({ create: { width: 2000, height: 40, channels: 3, background: { r: 20, g: 40, b: 80 } } }).png().toFile(wide);
      await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toFile(tiny);

      const wideJpeg = await imageToJpeg(wide);
      const wideMeta = await sharp(wideJpeg).metadata();
      assert.equal(wideMeta.format, 'jpeg');
      assert.ok(wideMeta.width <= 1024 && wideMeta.height <= 1024);
      assert.ok(wideMeta.width >= 50 && wideMeta.height >= 50);

      const tinyJpeg = await imageToJpeg(tiny);
      const tinyMeta = await sharp(tinyJpeg).metadata();
      assert.equal(tinyMeta.format, 'jpeg');
      assert.ok(tinyMeta.width >= 50 && tinyMeta.height >= 50);
      assert.ok(tinyMeta.width <= 1024 && tinyMeta.height <= 1024);

      await assert.rejects(() => imageToJpeg(tiny, { maxBytes: 10 }), (err) => err instanceof ContentSafetyError);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the REST client', () => {
  const endpoint = 'https://memorylane-safety.example/';
  const key = 'test-key';

  async function clientFor(fetchImpl, sleep = async () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-safety-'));
    const file = path.join(dir, 'photo.png');
    await sharp({ create: { width: 80, height: 60, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toFile(file);
    const client = createContentSafetyClient({ endpoint, key, fetchImpl, sleep });
    return { client, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  test('image and text requests use the subscription key, api version, and severity scale', async () => {
    const seen = [];
    const { client, file, cleanup } = await clientFor(async (url, options) => {
      seen.push({ url, options });
      const sexual = String(url).includes('image:analyze') ? 2 : 0;
      return jsonResponse({ categoriesAnalysis: categories({ Sexual: sexual }) });
    });
    try {
      const image = await client.analyzeImage(file);
      const text = await client.analyzeText('Một ngày ở Hội An');
      assert.equal(image.blocked, true);
      assert.equal(text.blocked, false);

      assert.equal(seen[0].url, `https://memorylane-safety.example/contentsafety/image:analyze?api-version=${API_VERSION}`);
      assert.equal(seen[1].url, `https://memorylane-safety.example/contentsafety/text:analyze?api-version=${API_VERSION}`);
      for (const call of seen) {
        assert.equal(call.options.method, 'POST');
        assert.equal(call.options.headers['Ocp-Apim-Subscription-Key'], key);
        assert.equal(call.options.headers['Content-Type'], 'application/json');
        assert.equal(call.url.includes(key), false);
        const payload = JSON.parse(call.options.body);
        assert.equal(payload.outputType, 'FourSeverityLevels');
        assert.deepEqual(payload.categories, CATEGORIES);
      }
      const imageBody = JSON.parse(seen[0].options.body);
      const bytes = Buffer.from(imageBody.image.content, 'base64');
      assert.equal(bytes[0], 0xff);
      assert.equal(bytes[1], 0xd8);
      assert.equal(JSON.parse(seen[1].options.body).text, 'Một ngày ở Hội An');
    } finally {
      cleanup();
    }
  });

  test('429 and 5xx are retried once; other errors and a bad body are not', async () => {
    async function attempts(responses) {
      const calls = [];
      const sleeps = [];
      const { client, cleanup } = await clientFor(
        async () => {
          calls.push(1);
          const next = responses[calls.length - 1];
          if (next instanceof Error) throw next;
          return next;
        },
        async (ms) => {
          sleeps.push(ms);
        },
      );
      try {
        return { result: await client.analyzeText('hello'), calls: calls.length, sleeps };
      } finally {
        cleanup();
      }
    }

    const ok = jsonResponse({ categoriesAnalysis: categories() });
    const retried = await attempts([jsonResponse('slow', 429, { 'retry-after': '0' }), ok]);
    assert.equal(retried.result.blocked, false);
    assert.equal(retried.calls, 2);
    assert.deepEqual(retried.sleeps, [0]);

    const stillDown = await assert.rejects(
      () => attempts([jsonResponse('no', 503), jsonResponse('no', 500)]),
      (err) => err instanceof ContentSafetyError && err.code === 'CONTENT_SAFETY_UNAVAILABLE',
    );
    assert.equal(stillDown, undefined);

    const rejected = await clientFor(async () => jsonResponse('bad key', 401));
    try {
      await assert.rejects(() => rejected.client.analyzeText('hello'), /HTTP 401/);
    } finally {
      rejected.cleanup();
    }

    let badBodyCalls = 0;
    const badBody = await clientFor(async () => {
      badBodyCalls += 1;
      return jsonResponse({ ok: true });
    });
    try {
      await assert.rejects(() => badBody.client.analyzeText('hello'), /unexpected body/);
      assert.equal(badBodyCalls, 1);
    } finally {
      badBody.cleanup();
    }
  });

  test('a timeout is retried once', async () => {
    let calls = 0;
    const { client, cleanup } = await clientFor(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      return jsonResponse({ categoriesAnalysis: categories({ Sexual: 2 }) });
    });
    try {
      assert.equal((await client.analyzeText('hello')).blocked, true);
      assert.equal(calls, 2);
    } finally {
      cleanup();
    }

    calls = 0;
    const failing = await clientFor(async () => {
      calls += 1;
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    });
    try {
      await assert.rejects(() => failing.client.analyzeText('hello'), /TimeoutError/);
      assert.equal(calls, 2);
    } finally {
      failing.cleanup();
    }
  });

  test('missing credentials skip the check and do not use the network', async () => {
    const original = globalThis.fetch;
    let calls = 0;
    const previous = {
      endpoint: process.env.AZURE_CONTENT_SAFETY_ENDPOINT,
      key: process.env.AZURE_CONTENT_SAFETY_KEY,
    };
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error('network');
    };
    try {
      delete process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
      delete process.env.AZURE_CONTENT_SAFETY_KEY;
      setContentSafetyClient(undefined);
      assert.deepEqual(await analyzeText('xin chào'), { blocked: false, skipped: true });
      assert.deepEqual(await analyzeImage('/no/such/file'), { blocked: false, skipped: true });
      assert.equal(calls, 0);
      assert.equal(createContentSafetyClient({ endpoint: '', key: 'x' }), null);

      process.env.AZURE_CONTENT_SAFETY_ENDPOINT = 'https://safety.example';
      process.env.AZURE_CONTENT_SAFETY_KEY = 'env-key';
      globalThis.fetch = async (url, options) => {
        calls += 1;
        assert.equal(url, `https://safety.example/contentsafety/text:analyze?api-version=${API_VERSION}`);
        assert.equal(options.headers['Ocp-Apim-Subscription-Key'], 'env-key');
        const payload = JSON.parse(options.body);
        assert.equal(payload.text, 'Một ngày ở Hội An');
        return jsonResponse({ categoriesAnalysis: categories() });
      };
      assert.deepEqual(await analyzeText('Một ngày ở Hội An'), { blocked: false });
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = original;
      if (previous.endpoint === undefined) delete process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
      else process.env.AZURE_CONTENT_SAFETY_ENDPOINT = previous.endpoint;
      if (previous.key === undefined) delete process.env.AZURE_CONTENT_SAFETY_KEY;
      else process.env.AZURE_CONTENT_SAFETY_KEY = previous.key;
      setContentSafetyClient(null);
    }
  });

  test('text longer than the API limit is checked in chunks and stops when one is blocked', async () => {
    const seen = [];
    setContentSafetyClient({
      async analyzeText(text) {
        seen.push(text.length);
        return { blocked: text.startsWith('b') };
      },
    });
    try {
      const blocked = await analyzeText(`${'a'.repeat(10_000)}b`);
      assert.equal(blocked.blocked, true);
      assert.deepEqual(seen, [10_000, 1]);
      const allowed = await analyzeText('a'.repeat(10_000));
      assert.equal(allowed.blocked, false);
      assert.deepEqual(seen, [10_000, 1, 10_000]);
      assert.deepEqual(await analyzeText('   '), { blocked: false, skipped: true });
    } finally {
      setContentSafetyClient(null);
    }
  });
});

describe('photos and the frames sent to content safety', () => {
  test('a local refusal skips Azure; an Azure refusal still blocks', async () => {
    let calls = 0;
    setContentSafetyClient({
      async analyzeImage() {
        calls += 1;
        return { blocked: true };
      },
    });
    try {
      const local = await applyImageSafety('photo', { explicit: true, suspicion: 0.9 });
      assert.equal(local.explicit, true);
      assert.equal(calls, 0);
      const remote = await applyImageSafety('photo', { explicit: false, suspicion: 0.2 });
      assert.equal(remote.explicit, true);
      assert.equal(calls, 1);
      setContentSafetyClient({
        async analyzeImage() {
          throw new ContentSafetyError('down');
        },
      });
      await assert.rejects(
        () => applyImageSafety('photo', { explicit: false, suspicion: 0 }),
        (err) => err.code === 'CONTENT_SAFETY_UNAVAILABLE',
      );
      setContentSafetyClient(null);
      assert.equal((await applyImageSafety('photo', { explicit: false, suspicion: 0.1 })).explicit, false);
    } finally {
      setContentSafetyClient(null);
    }
  });

  test('video frames for Azure are the four nsfwjs found most suspicious', () => {
    assert.deepEqual(
      contentSafetyFrames([
        { frame: 'a', suspicion: 0.1 },
        { frame: 'b', suspicion: 0.7 },
        { frame: 'c', suspicion: 0.4 },
        { frame: 'd', suspicion: 0.2 },
        { frame: 'e', suspicion: 0.05 },
        { frame: 'f', suspicion: 0.7 },
      ]).map((frame) => frame.frame),
      ['b', 'f', 'c', 'd'],
    );
    assert.deepEqual(
      contentSafetyFrames([
        { frame: 'a', suspicion: 0.2 },
        { frame: 'b', suspicion: 0.2 },
        { frame: 'c', suspicion: 0.2 },
        { frame: 'd', suspicion: 0.2 },
        { frame: 'e', suspicion: 0.2 },
      ]).map((frame) => frame.frame),
      ['a', 'b', 'c', 'd'],
    );
  });

  test('a frame score can come from the test double', async () => {
    setImageReviewer(async () => ({ explicit: false, suspicion: 0.42 }));
    try {
      assert.deepEqual(await scoreImage('frame'), { explicit: false, suspicion: 0.42 });
      setImageReviewer(async () => ({ explicit: true }));
      assert.deepEqual(await scoreImage('frame'), { explicit: true, suspicion: 1 });
    } finally {
      setImageReviewer(undefined);
    }
  });
});

describe('memory text', () => {
  let server;
  let base;
  let tmp;

  before(async () => {
    setContentSafetyClient(null);
    setImageReviewer(async () => ({ explicit: false }));
    setVideoReviewer(async () => ({ explicit: false }));
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memorylane-safety-'));
    const config = {
      ...loadConfig({ DATA_DIR: tmp, AUTH_RATE_LIMIT: '1000' }),
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
    async function call(method, url, { json } = {}) {
      const headers = {};
      if (cookie) headers.cookie = cookie;
      let body;
      if (json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(json);
      }
      const res = await fetch(base + url, { method, headers, body });
      for (const line of res.headers.getSetCookie()) {
        const pair = line.split(';')[0];
        const index = pair.indexOf('=');
        if (pair.slice(0, index) === 'ml_session') cookie = pair.slice(index + 1) ? pair : '';
      }
      const type = res.headers.get('content-type') ?? '';
      const parsed = res.status === 204 ? null : type.includes('json') ? await res.json() : null;
      return { status: res.status, body: parsed };
    }
    return {
      get: (url) => call('GET', url),
      post: (url, json) => call('POST', url, { json }),
      put: (url, json) => call('PUT', url, { json }),
    };
  }

  let userCount = 0;
  async function owner() {
    userCount += 1;
    const a = agent();
    const res = await a.post('/api/auth/register', {
      name: 'An',
      email: `safety${userCount}@example.com`,
      password: 'correct horse battery',
      locale: 'vi',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return a;
  }

  async function withClient(client, fn) {
    setContentSafetyClient(client);
    try {
      return await fn();
    } finally {
      setContentSafetyClient(null);
    }
  }

  function blockingClient(blockedText) {
    const seen = [];
    return {
      seen,
      async analyzeText(text) {
        seen.push(text);
        return { blocked: blockedText(text) };
      },
      async analyzeImage() {
        return { blocked: false };
      },
    };
  }

  test('a clean title and story are stored, and an empty story is not sent', async () => {
    const client = blockingClient(() => false);
    const a = await owner();
    const res = await withClient(client, () => a.post('/api/memories', { title: 'Một ngày ở Hội An', year: 2017 }));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(client.seen, ['Một ngày ở Hội An']);
  });

  test('title and story are refused on their own fields, and an update is not saved', async () => {
    const client = blockingClient((text) => text.includes('bad'));
    const a = await owner();
    const created = await withClient(client, () =>
      a.post('/api/memories', { title: 'Hội An', story: 'Phố cổ', year: 2017 }),
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.memory.id;

    const title = await withClient(client, () =>
      a.post('/api/memories', { title: 'bad title', story: 'Phố cổ', year: 2017 }),
    );
    assert.equal(title.status, 400);
    assert.equal(title.body.error, 'VALIDATION');
    assert.equal(title.body.fields.title.code, 'INAPPROPRIATE_TEXT');
    assert.equal(title.body.fields.story, undefined);

    const story = await withClient(client, () =>
      a.post('/api/memories', { title: 'Hội An', story: 'a bad story', year: 2017 }),
    );
    assert.equal(story.body.fields.story.code, 'INAPPROPRIATE_TEXT');
    assert.equal(story.body.fields.title, undefined);

    const both = await withClient(client, () =>
      a.post('/api/memories', { title: 'bad title', story: 'bad story', year: 2017 }),
    );
    assert.equal(both.body.fields.title.code, 'INAPPROPRIATE_TEXT');
    assert.equal(both.body.fields.story.code, 'INAPPROPRIATE_TEXT');

    const updated = await withClient(client, () =>
      a.put(`/api/memories/${id}`, { title: 'bad title', story: 'Phố cổ', year: 2017 }),
    );
    assert.equal(updated.status, 400);
    assert.equal(updated.body.fields.title.code, 'INAPPROPRIATE_TEXT');
    const kept = await a.get(`/api/memories/${id}`);
    assert.equal(kept.body.memory.title, 'Hội An');
    assert.equal(kept.body.memory.story, 'Phố cổ');
  });

  test('a comment is refused on the message field and not stored', async () => {
    const client = blockingClient((text) => text.includes('bad'));
    const a = await owner();
    const created = await withClient(client, () => a.post('/api/memories', { title: 'Hội An', year: 2017 }));
    const id = created.body.memory.id;
    const comment = await withClient(client, () =>
      a.post(`/api/memories/${id}/comments`, { body: 'a bad note' }),
    );
    assert.equal(comment.status, 400);
    assert.equal(comment.body.fields.body.code, 'INAPPROPRIATE_TEXT');
    const list = await a.get(`/api/memories/${id}/comments`);
    assert.deepEqual(list.body.comments, []);

    const ok = await withClient(client, () => a.post(`/api/memories/${id}/comments`, { body: 'Đẹp quá' }));
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.comment.body, 'Đẹp quá');
  });

  test('when content safety cannot answer, title and story both ask to try again', async () => {
    let calls = 0;
    const a = await owner();
    const res = await withClient(
      {
        async analyzeText() {
          calls += 1;
          throw new ContentSafetyError('content safety request failed (TimeoutError)');
        },
      },
      () => a.post('/api/memories', { title: 'Hội An', story: 'Phố cổ', year: 2017 }),
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.fields.title.code, 'COULD_NOT_VERIFY');
    assert.equal(res.body.fields.story.code, 'COULD_NOT_VERIFY');
    assert.equal(calls, 1);
  });
});
