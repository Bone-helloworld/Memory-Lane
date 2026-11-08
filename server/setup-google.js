// npm run setup:google — switches on "Continue with Google" ("Tiếp tục với Google") on this computer.
// It asks for the Client ID and Client secret of YOUR OAuth client (Google Cloud Console → Google Auth
// Platform → Clients) and writes them into .env, next to package.json. Nothing is sent anywhere, and
// .env is never committed (.gitignore). The full guide is in docs/DEPLOY.md, "Bật Tiếp tục với Google".
// ENV_FILE=path/to/file writes somewhere else instead (the tests use a temporary file).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { ROOT } from './config.js';
import { isGoogleClientId, setEnvValue } from './lib/envfile.js';

const envFile = path.resolve(ROOT, process.env.ENV_FILE || '.env');
const shown = envFile.startsWith(ROOT + path.sep) ? path.relative(ROOT, envFile) : envFile; // ".env"
const CALLBACK = '/api/auth/google/callback';

console.log(`
Bật "Tiếp tục với Google" cho Memory Lane trên máy này
──────────────────────────────────────────────────────
Bạn cần một OAuth client của chính bạn (miễn phí, khoảng 10 phút):
  1. Mở https://console.cloud.google.com/auth/clients và chọn (hoặc tạo) một project.
     Lần đầu, Google hỏi vài thông tin: tên ứng dụng "Memory Lane", email của bạn, Audience: External.
  2. Mục Audience → Test users → Add users: thêm các email Google sẽ dùng để thử.
  3. Mục Clients → Create client → Application type: Web application.
     Ở "Authorized redirect URIs", thêm đúng từng ký tự:
       http://localhost:5173${CALLBACK}     (npm run dev)
       http://localhost:3001${CALLBACK}     (npm start)
       https://TEN-MIEN-CUA-BAN${CALLBACK}  (bản online, nếu có)
  4. Bấm Create, rồi dán Client ID và Client secret vào dưới đây.
`);

// One reader for every answer: lines typed (or piped in) are queued until they are asked for.
const lines = readline.createInterface({ input: process.stdin, terminal: false })[Symbol.asyncIterator]();
async function ask(question) {
  process.stdout.write(question);
  const { value = '' } = await lines.next();
  return value.trim();
}
function stop(message) {
  console.error(`\n✗ ${message}\nChưa ghi gì vào ${shown}. Chạy lại: npm run setup:google`);
  process.exit(1);
}

const clientId = await ask('Client ID: ');
if (!isGoogleClientId(clientId)) stop('Client ID phải có dạng …apps.googleusercontent.com (chép ở cột "Client ID" trong mục Clients).');
const clientSecret = await ask('Client secret: ');
if (!/^\S{8,}$/.test(clientSecret)) stop('Client secret trống hoặc có khoảng trắng (thường bắt đầu bằng GOCSPX-).');

// Start from the current .env, or from .env.example (all the other settings, commented) the first time.
const example = path.join(ROOT, '.env.example');
const before = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : fs.existsSync(example) ? fs.readFileSync(example, 'utf8') : '';
const after = setEnvValue(setEnvValue(before, 'GOOGLE_CLIENT_ID', clientId), 'GOOGLE_CLIENT_SECRET', clientSecret);
fs.writeFileSync(envFile, after);
fs.chmodSync(envFile, 0o600); // a secret: readable by you only

// A running `npm run dev` restarts the API (node --watch) when a file it loaded changes — touching
// config.js makes it read the new .env right away.
if (!process.env.ENV_FILE) {
  const now = new Date();
  fs.utimesSync(path.join(ROOT, 'server', 'config.js'), now, now);
}

console.log(`
✓ Đã ghi GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET vào ${shown}.
  • Nếu "npm run dev" đang chạy, máy chủ API vừa tự khởi động lại; nếu chưa, chạy: npm run dev
  • Tải lại http://localhost:5173/login — nút "Tiếp tục với Google" giờ đã bấm được.
  • Bản online: đặt hai biến này cùng PUBLIC_URL trong mục Environment của nơi hosting (docs/DEPLOY.md).
`);
process.exit(0);
