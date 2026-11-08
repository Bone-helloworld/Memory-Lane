import fs from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = openDb(config.dbFile);
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  const built = fs.existsSync(config.clientDist);
  // Started by `npm run dev`? Then the page to open is Vite's (5173), even if an old build exists in client/dist.
  const viaDev = process.env.npm_lifecycle_event === 'dev:api';
  console.log(`\n  Memory Lane API  → http://localhost:${config.port}/api`);
  console.log(
    built && !viaDev
      ? `  App (built)    → http://localhost:${config.port}\n`
      : '  App (dev)      → http://localhost:5173  (`npm run dev` — open this one)\n',
  );
});

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
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
