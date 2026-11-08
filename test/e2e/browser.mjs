// A tiny driver for Google Chrome over the DevTools protocol (no Playwright/Puppeteer dependency): enough to click,
// type, upload files and read the page like a person would. Used by `npm run test:e2e` (test/e2e/system.mjs).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

// macOS default; elsewhere set CHROME_PATH (e.g. /usr/bin/google-chrome or "C:\…\chrome.exe").
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch({ profileDir, port, width = 1280, height = 900 }) {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const chrome = spawn(
    CHROME,
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=vi-VN', 'about:blank'],
    { stdio: 'ignore' },
  );
  chrome.on('error', (err) => {
    console.error(`Không mở được Chrome (${CHROME}): ${err.message}. Đặt CHROME_PATH tới tệp chạy của Chrome.`);
    process.exit(1);
  });
  let wsUrl;
  for (let i = 0; i < 75 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  if (!wsUrl) throw new Error('Chrome did not start');
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let nextId = 1;
  const pending = new Map();
  const waiters = [];
  const consoleLines = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') consoleLines.push(`exception: ${msg.params.exceptionDetails.exception?.description}`);
    for (const w of [...waiters]) {
      if (w.method === msg.method) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg.params);
      }
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const once = (method, timeout = 15000) =>
    new Promise((resolve) => {
      const w = { method, resolve };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i !== -1) waiters.splice(i, 1);
        resolve(null);
      }, timeout);
    });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (method, params) => send(method, params, sessionId);
  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const page = {
    cmd,
    consoleLines,
    sleep,
    /** Runs JavaScript in the page and returns its (JSON) value; awaits promises. */
    async evaluate(expression) {
      const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    async go(url) {
      const loaded = once('Page.loadEventFired');
      await cmd('Page.navigate', { url });
      await loaded;
      await sleep(300);
    },
    /** Types into a React-controlled input, textarea or select. */
    async fill(selector, value) {
      await page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('missing ${selector}');
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      })()`);
    },
    url: () => page.evaluate('location.pathname + location.search'),
    async shot(file) {
      const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(data, 'base64'));
    },
    async setViewport(w, h, mobile = false) {
      await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
    },
  };

  return {
    page,
    async close() {
      ws.close();
      chrome.kill();
      await sleep(300);
      rmSync(profileDir, { recursive: true, force: true });
    },
  };
}
