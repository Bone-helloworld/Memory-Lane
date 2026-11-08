// npm run test:e2e — the whole of Memory Lane in a real browser (headless Google Chrome), feature by feature, the way a
// person uses it: three browsers at once (An, Thu Hà, and a brand-new account). It builds the app, creates its own
// throw-away data folder with the demo world, starts its own server on port 3299 and stops it at the end: your
// data/ folder and your `npm run dev` are never touched. Needs Google Chrome (set CHROME_PATH if it is not in the usual place).
// Takes 1–2 minutes. Prints one line per feature, then a summary; failures keep a screenshot (the path is printed).
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.E2E_PORT) || 3299;
const BASE = `http://localhost:${PORT}`;
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-lane-e2e-'));
const DATA = path.join(WORK, 'data');
const LOG = path.join(WORK, 'server.log');
const DOWNLOADS = path.join(WORK, 'downloads');
const FAILURES = path.join(WORK, 'failures');
fs.mkdirSync(FAILURES, { recursive: true });
const results = [];
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

console.log('Build giao diện…');
execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit' });
console.log('Tạo dữ liệu demo riêng cho bài kiểm tra…');
execFileSync(process.execPath, ['server/seed.js'], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA }, stdio: 'ignore' });
const log = fs.openSync(LOG, 'a');
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), ALLOW_DEMO: 'true', NODE_ENV: '' },
  stdio: ['ignore', log, log],
});
let up = false;
for (let i = 0; i < 50 && !up; i++) {
  up = await fetch(`${BASE}/api/health`).then((r) => r.ok, () => false);
  if (!up) await new Promise((r) => setTimeout(r, 200));
}
if (!up) {
  server.kill();
  console.error(`Máy chủ thử không chạy được ở cổng ${PORT} (cổng bận? đặt E2E_PORT khác). Log: ${LOG}`);
  process.exit(1);
}
const GOOGLE = (await (await fetch(`${BASE}/api/auth/session`)).json()).google;
console.log(`Máy chủ thử: ${BASE} · dữ liệu: ${DATA}\n`);

const chromePort = Number(process.env.E2E_CHROME_PORT) || 9371;
const A = await launch({ profileDir: path.join(WORK, 'chrome-an'), port: chromePort });
const B = await launch({ profileDir: path.join(WORK, 'chrome-thuha'), port: chromePort + 1 });
const C = await launch({ profileDir: path.join(WORK, 'chrome-new'), port: chromePort + 2 });
const pages = { A: A.page, B: B.page, C: C.page };

for (const p of Object.values(pages)) {
  p.js = (code) => p.evaluate(code);
  p.until = async (code, timeout = 10000, what = code) => {
    const ok = await p.evaluate(`(async () => { const until = Date.now() + ${timeout};
      while (Date.now() < until) { try { if (await (async () => (${code}))()) return true; } catch {} await new Promise((r) => setTimeout(r, 150)); }
      return false; })()`);
    if (!ok) throw new Error(`timed out waiting for: ${what}`);
  };
  p.api = (url, init = {}) => p.evaluate(`fetch(${JSON.stringify(url)}, ${JSON.stringify(init)}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`);
  p.clickSel = (sel) => p.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('missing ${sel}'); e.click(); })()`);
  p.clickIn = (scope, text) => p.evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(scope)})].find((x) => x.textContent.trim().includes(${JSON.stringify(text)}) || (x.getAttribute('aria-label') || '').includes(${JSON.stringify(text)})); if (!e) throw new Error('missing "${text}" in ${scope}'); e.click(); })()`);
  p.setFiles = async (sel, files) => {
    const { root } = await p.cmd('DOM.getDocument', { depth: -1 });
    const { nodeId } = await p.cmd('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    if (!nodeId) throw new Error(`no ${sel}`);
    await p.cmd('DOM.setFileInputFiles', { nodeId, files });
  };
  p.overflow = () => p.evaluate(`document.documentElement.scrollWidth > innerWidth + 1`);
  p.settle = async () => {
    await p.evaluate(`(async () => { await document.fonts.ready; const until = Date.now() + 6000;
      while ([...document.images].some((i) => !i.complete) && Date.now() < until) await new Promise((r) => setTimeout(r, 100)); })()`);
    await p.sleep(300);
  };
}

async function check(name, page, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note ?? '' });
    console.log(`✓ ${name}${note ? ` — ${note}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, note: err.message.split('\n')[0] });
    console.log(`✗ ${name} — ${err.message.split('\n')[0]}`);
    try {
      await page.shot(path.join(FAILURES, `${results.length}.png`));
    } catch {
      // the browser may be gone
    }
  }
}

const prefs = (p, locale = 'vi', theme = 'notebook') => p.js(`localStorage.setItem('ml.locale', '${locale}'); localStorage.setItem('ml.theme', '${theme}')`);
const go = async (p, route) => {
  await p.go(BASE + route);
  await p.settle();
};
const email = `kiemthu.${randomBytes(3).toString('hex')}@example.com`;
const password = randomBytes(9).toString('base64url');
const password2 = randomBytes(9).toString('base64url');
const guestEmail = `khachmoi.${randomBytes(3).toString('hex')}@example.com`;
const state = {};

try {
  for (const p of Object.values(pages)) {
    await p.go(BASE + '/');
    await prefs(p);
  }
  const { A: a, B: b, C: c } = pages;

  // ------------------------------------------------------------------ public pages, account
  await check('Trang giới thiệu: đổi giao diện, đổi ngôn ngữ', c, async () => {
    await go(c, '/');
    await c.until(`document.querySelector('h1')`);
    await c.clickSel('[aria-label="Phòng tối"]');
    await c.until(`document.documentElement.dataset.theme === 'darkroom'`);
    await c.clickSel('[aria-label="Sổ tay ký ức"]');
    await c.until(`document.documentElement.dataset.theme === 'notebook'`);
    await c.clickIn('button', 'EN');
    await c.until(`document.documentElement.lang === 'en'`);
    const enTitle = await c.js(`document.querySelector('h1').textContent`);
    await c.clickIn('button', 'VI');
    await c.until(`document.documentElement.lang === 'vi'`);
    return `EN: "${enTitle.slice(0, 40)}…"`;
  });

  await check('Đăng ký bằng email (kèm báo lỗi khi mật khẩu quá ngắn)', c, async () => {
    await go(c, '/register');
    await c.fill('input[autocomplete="nickname"]', 'Người Kiểm Thử');
    await c.fill('input[type="email"]', email);
    await c.fill('input[autocomplete="new-password"]', '123');
    await c.js(`document.querySelector('form').requestSubmit()`);
    await c.until(`document.querySelector('[aria-invalid="true"], .field-error, [role=alert]')`, 5000, 'field error');
    expect((await c.url()) === '/register', 'should stay on /register');
    await c.fill('input[autocomplete="new-password"]', password);
    await c.js(`document.querySelector('form').requestSubmit()`);
    await c.until(`location.pathname === '/today' && document.querySelector('h1')`, 10000, '/today');
    return (await c.js(`document.querySelector('h1').textContent`)).trim();
  });

  await check('Đăng xuất, đăng nhập sai mật khẩu, đăng nhập đúng', c, async () => {
    await c.clickSel('.user-btn');
    await c.until(`[...document.querySelectorAll('.menu-item')].some((m) => m.textContent.includes('Đăng xuất'))`);
    await c.clickIn('.menu-item', 'Đăng xuất');
    await c.until(`location.pathname === '/'`, 8000, 'landing after logout');
    await go(c, '/login');
    await c.fill('input[type="email"]', email);
    await c.fill('input[autocomplete="current-password"]', 'sai-mat-khau-123');
    await c.js(`document.querySelector('form').requestSubmit()`);
    await c.until(`document.body.innerText.includes('không đúng')`, 8000, 'wrong password message');
    await c.fill('input[autocomplete="current-password"]', password);
    await c.js(`document.querySelector('form').requestSubmit()`);
    await c.until(`location.pathname === '/today'`, 8000, '/today');
  });

  await check('Dùng thử bản demo (An) và vai Thu Hà', a, async () => {
    await go(a, '/');
    await a.clickIn('button, a', 'Dùng thử');
    await a.until(`location.pathname === '/today' && document.querySelector('h1')`, 10000, 'An /today');
    await go(b, '/');
    await b.clickIn('button, a', 'Thu Hà');
    await b.until(`location.pathname === '/today' && document.querySelector('h1')`, 10000, 'Thu Hà /today');
    return `An: ${(await a.js(`document.querySelector('h1').textContent`)).trim()} · ${(await b.js(`document.querySelector('h1').textContent`)).trim()}`;
  });

  // ------------------------------------------------------------------ An: everyday features
  await check('Trang Hôm nay: chào, kỷ niệm nổi bật, cuộn phim, được chia sẻ', a, async () => {
    await go(a, '/today');
    const info = await a.js(`({ imgs: document.querySelectorAll('main img').length, text: document.querySelector('main').innerText })`);
    expect(info.imgs >= 5, `only ${info.imgs} images`);
    return `${info.imgs} ảnh trên trang`;
  });

  await check('Album: lọc theo năm', a, async () => {
    await go(a, '/album');
    const all = await a.js(`document.querySelectorAll('.print').length`);
    await a.clickIn('.year', '2022');
    await a.until(`document.querySelectorAll('.print').length > 0 && document.querySelectorAll('.print').length < ${all}`, 8000, 'filtered list');
    const y2022 = await a.js(`document.querySelectorAll('.print').length`);
    await a.clickIn('.year', 'Tất cả');
    await a.until(`document.querySelectorAll('.print').length === ${all}`, 8000, 'all again');
    return `${all} kỷ niệm, năm 2022: ${y2022}`;
  });

  await check('Tạo kỷ niệm bằng form: ảnh + video, gắn người, chia sẻ cho Thu Hà', a, async () => {
    await go(a, '/today');
    await a.clickSel('.btn-new');
    await a.until(`document.querySelector('dialog[open] form')`);
    await a.fill('dialog[open] input[placeholder="Đà Lạt, chuyến đi đầu tiên"]', 'Kiểm thử hệ thống');
    await a.fill('dialog[open] input[type="number"]', '2025');
    await a.fill('dialog[open] input[placeholder="Nhà ông bà"]', 'Hồ Gươm, Hà Nội');
    await a.fill('dialog[open] textarea', 'Một kỷ niệm tạo bởi bài kiểm tra toàn hệ thống.');
    await a.setFiles('dialog[open] input[type=file]', [path.join(ROOT, 'server', 'seed-media', 'hoguom.jpg'), path.join(ROOT, 'server', 'seed-media', 'song-nho-que.mp4')]);
    await a.until(`document.querySelector('dialog[open]').innerText.includes('song-nho-que.mp4') && !document.querySelector('dialog[open]').innerText.includes('Đang xử lý')`, 90000, 'both files prepared in the browser');
    await a.js(`(() => { const chips = [...document.querySelectorAll('dialog[open] .share-fields .chip')]; const ha = chips.find((c) => c.textContent.includes('Thu Hà')); if (!ha) throw new Error('no Thu Hà chip'); ha.click(); })()`);
    await a.js(`document.querySelector('dialog[open] form').requestSubmit()`);
    await a.until(`/^\\/album\\/\\d+$/.test(location.pathname)`, 30000, 'memory page');
    state.memoryId = Number((await a.url()).split('/').pop());
    await a.until(`fetch('/api/memories/${state.memoryId}').then((r) => r.json()).then((d) => d.memory.files.length === 2)`, 60000, 'both files uploaded');
    const m = (await a.api(`/api/memories/${state.memoryId}`)).body.memory;
    const photo = m.files.find((f) => f.kind === 'image');
    const video = m.files.find((f) => f.kind === 'video');
    expect(photo && video, 'one photo and one video');
    expect(video.posterUrl, 'video has a still frame');
    state.videoUrl = video.url;
    return `#${state.memoryId}: ảnh ${photo.url.split('.').pop().toUpperCase()}, video ${video.duration ? Math.round(video.duration) + ' giây' : ''} có khung hình; chia sẻ: ${m.shareCount} người`;
  });

  await check('Xem ảnh và tua video (HTTP Range 206)', a, async () => {
    await go(a, `/album/${state.memoryId}`);
    await a.until(`document.querySelector('.viewer-stage img, .viewer-stage video')`, 8000, 'viewer');
    const range = await a.js(`fetch('${state.videoUrl}', { headers: { Range: 'bytes=0-1023' } }).then((r) => ({ status: r.status, range: r.headers.get('content-range') }))`);
    expect(range.status === 206, `status ${range.status}`);
    return `206 ${range.range}`;
  });

  await check('Sửa kỷ niệm', a, async () => {
    await a.clickIn('.memory-actions button', 'Sửa ký ức');
    await a.until(`document.querySelector('dialog[open] form')`);
    await a.fill('dialog[open] input[placeholder="Đà Lạt, chuyến đi đầu tiên"]', 'Kiểm thử hệ thống (đã sửa)');
    await a.js(`document.querySelector('dialog[open] form').requestSubmit()`);
    await a.until(`document.querySelector('main h1')?.textContent.includes('(đã sửa)')`, 10000, 'new title');
  });

  await check('Lời nhắn hiện ngay ở người kia (Server-Sent Events, hai chiều)', a, async () => {
    await go(b, `/album/${state.memoryId}`);
    await b.until(`document.querySelector('main h1')?.textContent.includes('(đã sửa)')`, 10000, 'Thu Hà sees the shared memory');
    await b.sleep(800);
    await a.fill('textarea[placeholder="Viết lời nhắn…"]', 'Lời nhắn từ An lúc kiểm thử');
    await a.clickIn('main button', 'Gửi');
    await b.until(`document.body.innerText.includes('Lời nhắn từ An lúc kiểm thử')`, 8000, 'Thu Hà sees it live');
    await b.fill('textarea[placeholder="Viết lời nhắn…"]', 'Thu Hà trả lời ngay');
    await b.clickIn('main button', 'Gửi');
    await a.until(`document.body.innerText.includes('Thu Hà trả lời ngay')`, 8000, 'An sees it live');
  });

  await check('Bỏ chia sẻ → người kia mất quyền xem; chia sẻ lại → có thông báo trực tiếp', a, async () => {
    const toggle = `(() => { const row = [...document.querySelectorAll('main label, main li, main .share-row')].find((r) => r.textContent.includes('Thu Hà') && r.querySelector('input[type=checkbox]')); if (!row) throw new Error('no share row'); row.querySelector('input[type=checkbox]').click(); })()`;
    await a.js(toggle);
    await b.until(`fetch('/api/memories/${state.memoryId}').then((r) => r.status === 404)`, 8000, '404 for Thu Hà');
    await go(b, '/today');
    await a.js(toggle);
    await b.until(`fetch('/api/memories/${state.memoryId}').then((r) => r.status === 200)`, 8000, '200 again');
    await b.until(`document.querySelector('.toasts')?.innerText.includes('chia sẻ')`, 8000, 'live toast for Thu Hà');
    return (await b.js(`document.querySelector('.toasts').innerText`)).trim();
  });

  await check('Link mời: tạo, hiện ngày giờ hết hạn, thu hồi', a, async () => {
    await go(a, '/sharing');
    const before = (await a.api('/api/invites')).body.invites;
    await a.clickIn('main button', 'Mời người thân');
    await a.until(`document.querySelector('dialog[open]')`);
    await a.clickIn('dialog[open] button', 'Tạo link mời');
    await a.until(`(document.querySelector('dialog[open]').innerText + [...document.querySelectorAll('dialog[open] input')].map((i) => i.value).join(' ')).includes('/join/')`, 8000, 'link shown');
    const hint = await a.js(`document.querySelector('dialog[open]').innerText.match(/hết hạn[^.]*/)?.[0]`);
    await a.clickIn('dialog[open] button', 'Xong');
    const after = (await a.api('/api/invites')).body.invites;
    expect(after.length === before.length + 1, 'one more invite');
    const fresh = after.find((i) => !before.some((x) => x.id === i.id));
    const revoked = await a.api(`/api/invites/${fresh.id}`, { method: 'DELETE' });
    expect(revoked.status === 204, `revoke ${revoked.status}`);
    const status = (await a.api('/api/invites')).body.invites.find((i) => i.id === fresh.id).status;
    expect(status === 'revoked', status);
    return `"${hint}" → thu hồi được`;
  });

  await check('Thẻ kỷ niệm: vẽ, đổi loại, tải về tệp JPEG', a, async () => {
    fs.mkdirSync(DOWNLOADS, { recursive: true });
    await a.cmd('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });
    await go(a, `/album/${state.memoryId}`);
    await a.clickIn('.memory-actions button', 'Tạo thẻ kỷ niệm');
    await a.until(`document.querySelector('dialog[open] .studio-preview canvas')?.width > 0`, 10000, 'canvas');
    await a.clickIn('dialog[open] .studio-controls button', 'Con tem');
    await a.sleep(1200);
    await a.clickIn('dialog[open] .form-actions button', 'Tải về');
    const until = Date.now() + 10000;
    let file;
    while (!file && Date.now() < until) {
      file = fs.readdirSync(DOWNLOADS).find((f) => f.endsWith('.jpg'));
      if (!file) await a.sleep(200);
    }
    expect(file, 'no downloaded file');
    return `${file} (${Math.round(fs.statSync(path.join(DOWNLOADS, file)).size / 1024)} KB)`;
  });

  await check('Lưu thẻ vào Kỷ vật (từ trang kỷ niệm)', a, async () => {
    await a.clickIn('dialog[open] .form-actions button', 'Lưu vào Kỷ vật');
    await a.until(`[...document.querySelectorAll('dialog[open] .form-actions button')].some((x) => x.textContent.includes('Đã lưu vào Kỷ vật'))`, 15000, 'kept');
    await a.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await a.until(`document.querySelectorAll('.kept-cards img').length === 1`, 8000, 'thumbnail on the memory page');
  });

  await check('Tab Kỷ vật: danh mục, lọc, xem, xoá', a, async () => {
    await go(a, '/artifacts');
    const count = await a.js(`document.querySelectorAll('.artifact-card').length`);
    expect(count === 7, `${count} cards`);
    await a.clickIn('.toolbar button', 'Con tem');
    await a.until(`document.querySelectorAll('.artifact-card').length === 3`, 5000, '3 stamps');
    await a.clickIn('.toolbar button', 'Tất cả');
    const newest = (await a.api('/api/artifacts')).body.artifacts.at(-1);
    await go(a, `/artifacts?open=${newest.id}`);
    await a.until(`document.querySelector('dialog[open] .artifact-view img')`, 8000, 'view');
    const label = await a.js(`document.querySelector('dialog[open] .kicker')?.textContent`);
    await a.clickIn('dialog[open] button', 'Xóa');
    await a.until(`[...document.querySelectorAll('dialog[open] button')].some((x) => x.textContent.trim() === 'Xóa' && x.closest('dialog').innerText.includes('Chỉ tấm thẻ'))`, 5000, 'confirm');
    await a.js(`[...document.querySelectorAll('dialog[open] button')].filter((x) => x.textContent.trim() === 'Xóa').pop().click()`);
    await a.until(`document.querySelectorAll('.artifact-card').length === 6`, 8000, 'back to 6');
    return `${label} → đã xoá`;
  });

  await check('Tạo kỷ vật ngay trong tab (chọn kỷ niệm → thẻ → lưu)', a, async () => {
    await go(a, '/artifacts');
    await a.clickIn('main button', 'Tạo từ một kỷ niệm');
    await a.until(`document.querySelector('dialog[open] .memory-picker button')`, 8000, 'picker');
    await a.fill('dialog[open] input[type="search"]', 'vung tau');
    await a.until(`document.querySelectorAll('dialog[open] .memory-picker button').length === 1`, 5000, 'one match');
    await a.clickSel('dialog[open] .memory-picker button');
    await a.until(`document.querySelector('dialog[open] .studio-preview canvas')?.width > 0`, 10000, 'studio');
    await a.sleep(800);
    await a.clickIn('dialog[open] .form-actions button', 'Lưu vào Kỷ vật');
    await a.until(`document.querySelector('dialog[open] .artifact-view')`, 15000, 'opens the kept card');
    const no = await a.js(`document.querySelector('dialog[open] .kicker')?.textContent`);
    const id = (await a.api('/api/artifacts')).body.artifacts.at(-1).id;
    await a.api(`/api/artifacts/${id}`, { method: 'DELETE' });
    return `${no} (đã dọn)`;
  });

  await check('Người quen: thêm, ghi chú, "đã nhắn hôm nay", xoá', a, async () => {
    await go(a, '/people');
    await a.clickIn('main button', 'Thêm người');
    await a.until(`document.querySelector('dialog[open] form')`);
    await a.fill('dialog[open] input', 'Bạn Kiểm Thử');
    await a.js(`document.querySelector('dialog[open] form').requestSubmit()`);
    await a.until(`!document.querySelector('dialog[open] form') && document.body.innerText.includes('Bạn Kiểm Thử')`, 8000, 'listed');
    const person = (await a.api('/api/people')).body.people.find((p) => p.name === 'Bạn Kiểm Thử');
    await go(a, `/people/${person.id}`);
    await a.fill('main textarea', 'Ghi chú kiểm thử');
    await a.clickIn('main button', 'Lưu ghi chú');
    await a.until(`document.body.innerText.includes('Ghi chú kiểm thử')`, 5000, 'note shown');
    await a.clickIn('main button', 'Hôm nay mình đã nhắn');
    await a.until(`fetch('/api/people/${person.id}').then((r) => r.json()).then((d) => (d.person.lastContact ?? '').length > 0)`, 5000, 'last contact saved');
    await a.clickIn('main button', 'Xóa');
    await a.until(`document.querySelector('dialog[open]')`);
    await a.js(`[...document.querySelectorAll('dialog[open] button')].filter((x) => x.textContent.trim() === 'Xóa').pop().click()`);
    await a.until(`location.pathname === '/people'`, 8000, 'back to the list');
  });

  await check('Phim & nhạc: thêm, lọc, xoá', a, async () => {
    await go(a, '/archive');
    await a.clickIn('main button', 'Thêm mục mới');
    await a.until(`document.querySelector('dialog[open] form')`);
    await a.fill('dialog[open] input[type="text"], dialog[open] input:not([type])', 'Phim kiểm thử hệ thống');
    await a.js(`document.querySelector('dialog[open] form').requestSubmit()`);
    await a.until(`!document.querySelector('dialog[open] form') && document.body.innerText.includes('Phim kiểm thử hệ thống')`, 8000, 'listed');
    await a.clickIn('main .segmented button', 'Nhạc');
    await a.until(`!document.body.innerText.includes('Phim kiểm thử hệ thống')`, 5000, 'hidden under music');
    await a.clickIn('main .segmented button', 'Tất cả');
    const item = (await a.api('/api/media')).body.media.find((m) => m.title === 'Phim kiểm thử hệ thống');
    const del = await a.api(`/api/media/${item.id}`, { method: 'DELETE' });
    expect(del.status === 204, `delete ${del.status}`);
  });

  await check('Dòng thời gian', a, async () => {
    await go(a, '/timeline');
    const text = await a.js(`document.querySelector('main').innerText`);
    expect(text.includes('2022') && text.includes('Vịnh Hạ Long'), 'years and titles');
  });

  await check('Tìm kiếm không cần gõ dấu', a, async () => {
    const found = [];
    for (const [q, want] of [['da lat', 'Đà Lạt'], ['vung tau', 'Biển Vũng Tàu'], ['bao', 'Quốc Bảo'], ['dien vien', '']]) {
      await go(a, `/search?q=${encodeURIComponent(q)}`);
      const text = await a.js(`document.querySelector('main').innerText`);
      if (want) expect(text.includes(want), `"${q}" → ${want}`);
      found.push(`"${q}"→${want || 'không có'}`);
    }
    return found.join(', ');
  });

  // ------------------------------------------------------------------ settings (new account C)
  await check('Cài đặt: giao diện, tên, ngôn ngữ', c, async () => {
    await go(c, '/settings');
    await c.clickIn('.theme-option', 'Phòng tối');
    await c.until(`document.documentElement.dataset.theme === 'darkroom'`);
    await c.clickIn('.theme-option', 'Sổ tay');
    await c.fill('input[autocomplete="nickname"]', 'Người Kiểm Thử Hai');
    await c.clickIn('main button', 'Lưu hồ sơ');
    await c.until(`fetch('/api/auth/session').then((r) => r.json()).then((d) => d.user.name === 'Người Kiểm Thử Hai')`, 5000, 'name saved');
    const langButtons = `[...document.querySelectorAll('main button')].filter((x) => x.textContent.trim() === 'EN')`;
    await c.js(`${langButtons}[0].click()`);
    await c.until(`document.documentElement.lang === 'en'`);
    await c.js(`[...document.querySelectorAll('main button')].filter((x) => x.textContent.trim() === 'VI')[0].click()`);
    await c.until(`document.documentElement.lang === 'vi'`);
  });

  await check('Chế độ kín đáo: mặc định tắt, bật theo từng tài khoản', c, async () => {
    expect(!(await c.js(`document.documentElement.classList.contains('discreet')`)), 'off by default');
    await c.clickSel('.switch[role=switch]');
    await c.until(`document.documentElement.classList.contains('discreet')`);
    await c.clickSel('.switch[role=switch]');
    await c.until(`!document.documentElement.classList.contains('discreet')`);
    expect(!(await a.js(`document.documentElement.classList.contains('discreet')`)), 'An unaffected');
  });

  await check('Đổi mật khẩu rồi đăng nhập bằng mật khẩu mới', c, async () => {
    await c.fill('input[autocomplete="current-password"]', password);
    await c.fill('input[autocomplete="new-password"]', password2);
    await c.clickIn('main button', 'Đổi mật khẩu');
    await c.until(`document.querySelector('.toasts')?.innerText.toLowerCase().includes('mật khẩu')`, 15000, 'password toast');
    const toast = await c.js(`document.querySelector('.toasts').innerText`);
    await c.api('/api/auth/logout', { method: 'POST' });
    const login = await c.api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: password2 }) });
    expect(login.status === 200, `login ${login.status}`);
    const old = await c.api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    expect(old.status === 401, `old password ${old.status}`);
    return toast.trim().split('\n').pop();
  });

  await check('Dung lượng và xuất toàn bộ dữ liệu (JSON)', c, async () => {
    await go(c, '/settings');
    const storage = await c.api('/api/me/storage');
    const exported = await c.js(`fetch('/api/me/export').then(async (r) => ({ type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), body: await r.json() }))`);
    expect(exported.body.user?.email === email, 'export has the account');
    return `${(storage.body.used / 1048576).toFixed(1)} MB / ${storage.body.quota / 1048576} MB · tệp xuất: ${exported.disposition}`;
  });

  await check('Đăng xuất khỏi mọi thiết bị', c, async () => {
    await c.clickIn('main button', 'Đăng xuất khỏi mọi thiết bị');
    await c.until(`fetch('/api/auth/session').then((r) => r.json()).then((d) => d.user === null)`, 8000, 'signed out');
  });

  await check('Xoá tài khoản (gõ email để xác nhận)', c, async () => {
    const login = await c.api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: password2 }) });
    expect(login.status === 200, 'login again');
    await go(c, '/settings');
    await c.clickIn('main button', 'Xóa tài khoản của tôi');
    await c.until(`document.querySelector('dialog[open] input[type=email]')`);
    await c.fill('dialog[open] input[type=email]', email);
    await c.js(`[...document.querySelectorAll('dialog[open] button')].find((x) => x.className.includes('danger')).click()`);
    await c.until(`location.pathname === '/'`, 8000, 'landing');
    const again = await c.api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: password2 }) });
    expect(again.status === 401, `login after delete ${again.status}`);
  });

  await check('Nút "Tiếp tục với Google" chuyển sang trang của Google (hoặc báo chưa bật)', c, async () => {
    await go(c, '/login');
    if (!GOOGLE) {
      expect(await c.js(`Boolean(document.querySelector('button.btn-google[disabled]'))`), 'disabled button with the reason');
      return 'máy chủ chưa có GOOGLE_CLIENT_ID: nút mờ kèm lời giải thích (đúng)';
    }
    const href = await c.js(`document.querySelector('a.btn-google')?.getAttribute('href')`);
    expect(href?.startsWith('/api/auth/google/start'), `href ${href}`);
    const res = await fetch(BASE + href, { redirect: 'manual' });
    const location = new URL(res.headers.get('location'));
    expect(location.host === 'accounts.google.com', location.host);
    return `→ accounts.google.com (đăng nhập thật với Google: tự thử ở http://localhost:5173)`;
  });

  await check('Link mời từ đầu đến cuối: người mới đăng ký → nhận lời mời → xem kỷ niệm được chia sẻ', c, async () => {
    const memory = (await a.api('/api/memories?q=ha%20long')).body.memories[0];
    const invite = await a.api('/api/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memoryId: memory.id }) });
    await go(c, `/join/${invite.body.token}`);
    await c.until(`document.body.innerText.includes('Tạo tài khoản để nhận lời mời')`, 8000, 'what a signed-out guest sees');
    await c.clickIn('.invite-actions a, .invite-actions button', 'Tạo tài khoản để nhận lời mời');
    await c.until(`document.querySelector('input[autocomplete="new-password"]')`, 8000, 'sign-up page');
    await c.fill('input[autocomplete="nickname"]', 'Khách Mời');
    await c.fill('input[type="email"]', guestEmail);
    await c.fill('input[autocomplete="new-password"]', password);
    await c.js(`document.querySelector('form').requestSubmit()`);
    await c.until(`location.pathname.startsWith('/join/') && document.body.innerText.includes('Nhận lời mời')`, 10000, 'back on the invite');
    await c.clickIn('.invite-actions button', 'Nhận lời mời');
    await c.until(`location.pathname === '/album/${memory.id}' && document.querySelector('main h1')`, 10000, 'the shared memory opens');
    const title = (await c.js(`document.querySelector('main h1').textContent`)).trim();
    return `mở "${title}" — ${(await c.js(`document.querySelector('.toasts')?.innerText ?? ''`)).trim()}`;
  });

  await check('Google không được (email đã có tài khoản) → đăng nhập bằng mật khẩu vẫn quay về lời mời', c, async () => {
    const second = await a.api('/api/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const target = `/join/${second.body.token}`;
    await c.api('/api/auth/logout', { method: 'POST' });
    await go(c, `/login?google=EMAIL_TAKEN&next=${encodeURIComponent(target)}`);
    await c.until(`document.querySelector('input[autocomplete="current-password"]')`, 8000, 'login page');
    await c.fill('input[type="email"]', guestEmail);
    await c.fill('input[autocomplete="current-password"]', password);
    await c.js(`document.querySelector('form').requestSubmit()`);
    await c.until(`location.pathname === ${JSON.stringify(target)} && document.body.innerText.includes('Nhận lời mời')`, 10000, 'back on the invite');
  });

  // ------------------------------------------------------------------ cross-cutting
  const mainRoutes = () => ['/today', '/album', `/album/${state.memoryId}`, '/people', '/archive', '/artifacts', '/timeline', '/sharing', '/settings'];

  await check('Giao diện Phòng tối: mọi trang không tràn', a, async () => {
    await prefs(a, 'vi', 'darkroom');
    const bad = [];
    for (const r of mainRoutes()) {
      await go(a, r);
      if (await a.overflow()) bad.push(r);
    }
        expect(!bad.length, `tràn: ${bad.join(', ')}`);
  });

  await check('Điện thoại (390 px): mọi trang không tràn, menu mở được', a, async () => {
    await prefs(a, 'vi', 'notebook');
    await a.setViewport(390, 844, true);
    const bad = [];
    for (const r of mainRoutes()) {
      await go(a, r);
      if (await a.overflow()) bad.push(r);
    }
    await go(a, '/today');
    await a.clickSel('.menu-btn');
    await a.until(`document.querySelector('dialog[open] a, dialog[open] .tab')`, 5000, 'menu');
    await a.setViewport(1280, 900);
    expect(!bad.length, `tràn: ${bad.join(', ')}`);
  });

  await check('Tiếng Anh: không thiếu câu dịch nào', a, async () => {
    await prefs(a, 'en', 'notebook');
    const before = a.consoleLines.length;
    const titles = [];
    for (const r of mainRoutes()) {
      await go(a, r);
      titles.push((await a.js(`document.querySelector('h1')?.textContent ?? ''`)).trim().slice(0, 18));
    }
    const missing = a.consoleLines.slice(before).filter((l) => l.includes('missing key'));
    await prefs(a, 'vi', 'notebook');
    expect(!missing.length, missing.join(' | '));
    return titles.join(' · ');
  });

  await check('Lỗi máy chủ: người dùng thấy "Mã lỗi", log có đúng mã đó', a, async () => {
    const tmp = path.join(DATA, 'uploads', 'tmp');
    fs.chmodSync(tmp, 0o555);
    try {
      const res = await a.js(`(async () => { const f = new FormData(); f.set('file', new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82])], { type: 'image/png' }), 'x.png');
        const r = await fetch('/api/memories/${state.memoryId}/files', { method: 'POST', body: f }); return { status: r.status, body: await r.json() }; })()`);
      expect(res.status === 500 && /^[0-9a-f]{8}$/.test(res.body.ref), JSON.stringify(res));
      const log = fs.readFileSync(LOG, 'utf8');
      expect(log.includes(`SERVER ${res.body.ref} POST /api/memories/${state.memoryId}/files`), 'log line');
      return `Mã lỗi ${res.body.ref} có trong log`;
    } finally {
      fs.chmodSync(tmp, 0o755);
    }
  });

  await check('Dọn dẹp + /api/health + npm run admin (không thiếu, không thừa tệp)', a, async () => {
    await a.api(`/api/memories/${state.memoryId}`, { method: 'DELETE' });
    const health = await a.api('/api/health');
    expect(health.body?.ok === true, 'health');
    const run = (...args) => JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'server', 'admin.js'), ...args, '--json'], { env: { ...process.env, DATA_DIR: DATA }, encoding: 'utf8' }));
    const files = run('check-files');
    const stats = run('stats');
    expect(files.missing.length === 0, `missing ${files.missing.length}`);
    return `health ok · ${stats.users.total} tài khoản · ${files.files} tệp, thiếu ${files.missing.length}, mồ côi ${files.orphans.length}`;
  });

  const errors = [...A.page.consoleLines, ...B.page.consoleLines, ...C.page.consoleLines].filter(
    (l) => /^(error|exception)/i.test(l) && !/401|Failed to load resource|favicon/.test(l),
  );
  results.push({ name: 'Không có lỗi JavaScript trong Console', ok: errors.length === 0, note: errors.slice(0, 3).join(' | ') });
  console.log(errors.length ? `✗ Console: ${errors.length} lỗi\n${errors.join('\n')}` : '✓ Không có lỗi JavaScript trong Console');
} finally {
  await A.close();
  await B.close();
  await C.close();
  server.kill();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tính năng đạt.`);
  if (failed.length) {
    console.log(`Ảnh chụp lúc lỗi và log máy chủ: ${WORK}`);
    process.exitCode = 1;
  } else {
    fs.rmSync(WORK, { recursive: true, force: true });
  }
}
