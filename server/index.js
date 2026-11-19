import fs from 'node:fs';
import { createApp } from './app.js';
import { warmClip } from './lib/clip.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = openDb(config);
const app = createApp({ db, config });

// App Service (and every other host here) reaches the process on PORT, on all interfaces.
const server = app.listen(config.port, '0.0.0.0', () => {
  const built = fs.existsSync(config.clientDist);
  // Started by `npm run dev`? Then the page to open is Vite's (5173), even if an old build exists in client/dist.
  const viaDev = process.env.npm_lifecycle_event === 'dev:api';
  console.log(`\n  Memory Lane API  → http://localhost:${config.port}/api`);
  console.log(
    built && !viaDev
      ? `  App (built)    → http://localhost:${config.port}`
      : '  App (dev)      → http://localhost:5173  (`npm run dev` — open this one)',
  );
  console.log(`  Database       → ${config.azureSql ? 'Azure SQL' : 'SQLite'}`);
  console.log(`  Media          → ${config.azureStorage ? `Azure Blob (${config.azureStorage.container})` : 'local disk'}\n`);
});

// Slowloris: drop a client that will not finish its headers. The body may still take
// a few minutes — a video upload on a slow connection is legitimate.
server.headersTimeout = 20_000;
server.requestTimeout = 5 * 60_000;
server.keepAliveTimeout = 5_000;

// The drawing check is a few hundred megabytes. Start it after the port is open
// so a cold boot still answers health checks, and so the first upload is not
// the one that pays for the download.
if (config.isProd) {
  setTimeout(() => {
    warmClip().catch((err) => {
      console.error(`[${new Date().toISOString()}] CLIP warm-up failed: ${err instanceof Error ? err.message : err}`);
    });
  }, 5_000).unref();
}

// The port is taken — almost always by another `npm run dev` / `npm start` that is still running.
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(
    `\n  ✗ Cổng ${config.port} đang được một chương trình khác dùng — thường là một "npm run dev" khác vẫn đang chạy.\n` +
      `    Tìm nó: lsof -nP -iTCP:${config.port} -sTCP:LISTEN   ·   tắt bằng Ctrl+C ở cửa sổ đó (hoặc kill <PID>), rồi chạy lại.\n`,
  );
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    Promise.resolve(db.close()).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
