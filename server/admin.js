// npm run admin -- <lệnh> — looking after a running Memory Lane (PLAN.md, Phần C).
//
// It opens the same database as the server (DATA_DIR, from .env or the environment), so run it where the server
// runs: on your computer, or in the hosting platform's shell. Read-only commands never change anything and are
// safe while the server is running; the others say exactly what they change.
//
// Private by design: it prints counts, dates, emails and file names, never what people wrote or their pictures.
// Memory titles, stories, notes and comments stay private even from whoever looks after the server.
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { transaction } from './db.js';
import { NAME_PATTERN } from './lib/files.js';

const config = loadConfig();
const MIGRATIONS = fs
  .readdirSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations'))
  .filter((file) => file.endsWith('.sql')).length;

const [command = 'help', ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
const args = rest.filter((arg) => !arg.startsWith('--'));

// ---------------------------------------------------------------------------------------------------------------
// Commands

function help() {
  console.log(`Công cụ quản trị Memory Lane — chạy ở nơi máy chủ chạy, cùng DATA_DIR (hiện tại: ${config.dataDir})

  npm run admin -- <lệnh> [tuỳ chọn]

Xem (chỉ đọc, an toàn khi máy chủ đang chạy):
  stats                          Tổng quan: tài khoản, kỷ niệm, tệp, dung lượng, phiên, lời mời, cấu hình
  users [từ khoá]                Danh sách tài khoản (lọc theo email hoặc tên)
  user <email|id>                Một tài khoản: đăng nhập, Google, dung lượng, kỷ niệm, chia sẻ, lời mời
  memory <id>                    Một kỷ niệm (số trong địa chỉ /album/<id>): chủ, tệp còn trên đĩa không, chia sẻ với ai
  sessions <email|id>            Các phiên đăng nhập của một tài khoản
  check-files                    Đối chiếu cơ sở dữ liệu với thư mục uploads: tệp mồ côi, tệp bị mất, tệp tạm cũ

Sửa (ghi vào dữ liệu — nên chạy "backup" trước):
  sessions <email|id> --revoke   Đăng xuất tài khoản khỏi mọi thiết bị
  reset-password <email|id>      Đặt một mật khẩu tạm (in ra một lần) và đăng xuất mọi nơi
  check-files --fix              Xoá tệp mồ côi (cũ hơn 10 phút) và tệp tạm cũ; không đụng tệp đang được dùng

Sao lưu:
  backup [thư mục]               Chụp cơ sở dữ liệu + chép thư mục uploads (mặc định: DATA_DIR/backups)

Tuỳ chọn: --json  in kết quả dạng JSON (cho script và kiểm thử)
Không bao giờ in tiêu đề, câu chuyện, ghi chú hay lời nhắn của người dùng.`);
}

/** The whole server at a glance. */
function stats() {
  const db = openDatabase();
  const now = new Date().toISOString();
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  const data = {
    dataDir: config.dataDir,
    database: { version: schemaVersion(db), expected: MIGRATIONS, bytes: sizeOf(config.dbFile) + sizeOf(`${config.dbFile}-wal`) },
    uploads: folderStats(config.uploadDir),
    users: {
      total: count('SELECT COUNT(*) AS n FROM users'),
      demo: count("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@memorylane.local'"),
      withGoogle: count('SELECT COUNT(*) AS n FROM users WHERE google_sub IS NOT NULL'),
      googleOnly: count("SELECT COUNT(*) AS n FROM users WHERE password_hash = ''"),
    },
    activeSessions: count('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?', now),
    memories: count('SELECT COUNT(*) AS n FROM memories'),
    files: {
      images: count("SELECT COUNT(*) AS n FROM memory_files WHERE kind = 'image'"),
      videos: count("SELECT COUNT(*) AS n FROM memory_files WHERE kind = 'video'"),
      bytes: count('SELECT COALESCE(SUM(size), 0) AS n FROM memory_files'),
    },
    artifacts: { count: count('SELECT COUNT(*) AS n FROM artifacts'), bytes: count('SELECT COALESCE(SUM(size), 0) AS n FROM artifacts') },
    people: count('SELECT COUNT(*) AS n FROM people'),
    media: count('SELECT COUNT(*) AS n FROM media'),
    comments: count('SELECT COUNT(*) AS n FROM comments'),
    connections: count('SELECT COUNT(*) AS n FROM connections') / 2, // stored both ways
    invites: inviteCounts(db, now),
    config: {
      storageMb: config.storageMb,
      allowDemo: config.allowDemo,
      google: Boolean(config.google),
      production: config.isProd,
      publicUrl: config.publicUrl,
    },
  };
  out(data, (d) => {
    console.log(`Memory Lane — tổng quan (DATA_DIR: ${d.dataDir})\n`);
    facts([
      ['Cơ sở dữ liệu', `${mb(d.database.bytes)} · phiên bản ${d.database.version}/${d.database.expected}`],
      ['Thư mục uploads', `${d.uploads.files} tệp · ${mb(d.uploads.bytes)}`],
      ['Tài khoản', `${d.users.total} (${d.users.demo} demo) · ${d.users.withGoogle} liên kết Google · ${d.users.googleOnly} chỉ dùng Google`],
      ['Phiên còn hạn', d.activeSessions],
      ['Kỷ niệm', `${d.memories} · ${d.files.images} ảnh, ${d.files.videos} video · ${mb(d.files.bytes)}`],
      ['Kỷ vật', `${d.artifacts.count} thẻ · ${mb(d.artifacts.bytes)}`],
      ['Người quen · phim nhạc', `${d.people} · ${d.media}`],
      ['Vòng thân quen', `${d.connections} cặp kết nối · ${d.comments} lời nhắn`],
      ['Lời mời', inviteLine(d.invites)],
      [
        'Cấu hình',
        `STORAGE_MB=${d.config.storageMb} · ALLOW_DEMO=${d.config.allowDemo} · Google: ${d.config.google ? 'đã bật' : 'chưa bật'} · ` +
          `${d.config.production ? 'production' : 'development'}${d.config.publicUrl ? ` · ${d.config.publicUrl}` : ''}`,
      ],
    ]);
  });
}

/** Every account (or those whose email or name contains a word), with the numbers that matter for support. */
function users() {
  const db = openDatabase();
  const word = args[0] ?? '';
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at, u.google_email IS NOT NULL AS google, u.password_hash <> '' AS has_password,
              (SELECT COUNT(*) FROM memories m WHERE m.user_id = u.id) AS memories,
              (SELECT COALESCE(SUM(size), 0) FROM memory_files f WHERE f.user_id = u.id)
                + (SELECT COALESCE(SUM(size), 0) FROM artifacts a WHERE a.user_id = u.id) AS bytes,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions,
              (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login
         FROM users u
        WHERE ? = '' OR u.email LIKE ? OR u.name LIKE ?
        ORDER BY u.id`,
    )
    .all(new Date().toISOString(), word, `%${word}%`, `%${word}%`)
    .map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
      google: Boolean(row.google),
      hasPassword: Boolean(row.has_password),
      memories: row.memories,
      bytes: row.bytes,
      activeSessions: row.sessions,
      lastLogin: row.last_login,
    }));
  out(rows, (list) => {
    if (!list.length) return console.log(word ? `Không có tài khoản nào khớp "${word}".` : 'Chưa có tài khoản nào.');
    table(list, [
      ['id', (u) => u.id],
      ['email', (u) => u.email],
      ['tên', (u) => u.name],
      ['tạo lúc', (u) => when(u.createdAt)],
      ['đăng nhập bằng', (u) => [u.hasPassword && 'mật khẩu', u.google && 'Google'].filter(Boolean).join(' + ')],
      ['kỷ niệm', (u) => u.memories],
      ['dung lượng', (u) => mb(u.bytes)],
      ['phiên', (u) => u.activeSessions],
      ['đăng nhập gần nhất', (u) => when(u.lastLogin)],
    ]);
  });
}

/** One account in detail — what support needs to know, nothing of what the person wrote. */
function user() {
  const db = openDatabase();
  const row = findUser(db, args[0]);
  const now = new Date().toISOString();
  const count = (sql) => db.prepare(sql).get(row.id).n;
  const data = {
    id: row.id,
    email: row.email,
    name: row.name,
    locale: row.locale,
    createdAt: row.created_at,
    hasPassword: row.password_hash !== '',
    google: row.google_email,
    sessions: {
      active: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?').get(row.id, now).n,
      lastLogin: db.prepare('SELECT MAX(created_at) AS t FROM sessions WHERE user_id = ?').get(row.id).t,
    },
    memories: count('SELECT COUNT(*) AS n FROM memories WHERE user_id = ?'),
    files: {
      images: count("SELECT COUNT(*) AS n FROM memory_files WHERE user_id = ? AND kind = 'image'"),
      videos: count("SELECT COUNT(*) AS n FROM memory_files WHERE user_id = ? AND kind = 'video'"),
    },
    artifacts: count('SELECT COUNT(*) AS n FROM artifacts WHERE user_id = ?'),
    people: count('SELECT COUNT(*) AS n FROM people WHERE user_id = ?'),
    media: count('SELECT COUNT(*) AS n FROM media WHERE user_id = ?'),
    storage: {
      used:
        count('SELECT COALESCE(SUM(size), 0) AS n FROM memory_files WHERE user_id = ?') +
        count('SELECT COALESCE(SUM(size), 0) AS n FROM artifacts WHERE user_id = ?'),
      quota: config.storageMb * 1024 * 1024,
    },
    connections: count('SELECT COUNT(*) AS n FROM connections WHERE user_id = ?'),
    invites: inviteCounts(db, now, row.id),
    sharing: {
      memoriesShared: count('SELECT COUNT(DISTINCT s.memory_id) AS n FROM shares s JOIN memories m ON m.id = s.memory_id WHERE m.user_id = ?'),
      sharedWithThem: count('SELECT COUNT(*) AS n FROM shares WHERE user_id = ?'),
    },
    commentsWritten: count('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?'),
  };
  out(data, (d) => {
    const percent = Math.round((d.storage.used / d.storage.quota) * 100);
    console.log(`Tài khoản #${d.id} — ${d.email}\n`);
    facts([
      ['Tên · ngôn ngữ', `${d.name} · ${d.locale}`],
      ['Tạo lúc', when(d.createdAt)],
      ['Đăng nhập bằng', [d.hasPassword ? 'mật khẩu' : 'chưa có mật khẩu', d.google ? `Google (${d.google})` : 'chưa liên kết Google'].join(' · ')],
      ['Phiên còn hạn', `${d.sessions.active} · gần nhất: ${when(d.sessions.lastLogin)}`],
      ['Kỷ niệm', `${d.memories} · ${d.files.images} ảnh, ${d.files.videos} video`],
      ['Kỷ vật · người quen · phim nhạc', `${d.artifacts} · ${d.people} · ${d.media}`],
      ['Dung lượng', `${mb(d.storage.used)} / ${mb(d.storage.quota)} (${percent}%)`],
      ['Vòng thân quen', `${d.connections} người`],
      ['Lời mời đã gửi', inviteLine(d.invites)],
      ['Chia sẻ', `${d.sharing.memoriesShared} kỷ niệm của họ đang chia sẻ · ${d.sharing.sharedWithThem} kỷ niệm người khác chia sẻ cho họ`],
      ['Lời nhắn đã viết', d.commentsWritten],
    ]);
  });
}

/** One memory, by the number in its address (/album/29): is every file still on disk, who can see it. */
function memory() {
  const db = openDatabase();
  const id = Number(args[0]);
  if (!Number.isInteger(id) || id <= 0) fail('Cần số id của kỷ niệm — con số trong địa chỉ /album/<id>.', 2);
  const row = db
    .prepare('SELECT m.id, m.user_id, u.email, m.year, m.month, m.day, m.created_at FROM memories m JOIN users u ON u.id = m.user_id WHERE m.id = ?')
    .get(id);
  if (!row) fail(`Không có kỷ niệm số ${id}.`);
  const files = db
    .prepare('SELECT id, kind, file, poster, size, width, height, duration, position FROM memory_files WHERE memory_id = ? ORDER BY position')
    .all(id)
    .map((f) => ({ ...f, onDisk: onDisk(f.file), posterOnDisk: f.poster ? onDisk(f.poster) : null }));
  const data = {
    id: row.id,
    owner: { id: row.user_id, email: row.email },
    date: [row.year, row.month && two(row.month), row.day && two(row.day)].filter(Boolean).join('-'), // month, day may be unknown
    createdAt: row.created_at,
    files,
    sharedWith: db
      .prepare('SELECT u.id, u.email, s.created_at AS sharedAt FROM shares s JOIN users u ON u.id = s.user_id WHERE s.memory_id = ? ORDER BY s.created_at')
      .all(id),
    comments: db.prepare('SELECT COUNT(*) AS n FROM comments WHERE memory_id = ?').get(id).n,
    artifacts: db.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE memory_id = ?').get(id).n,
  };
  out(data, (d) => {
    console.log(`Kỷ niệm #${d.id} — chủ: ${d.owner.email} (#${d.owner.id}) · ngày ${d.date} · lưu lúc ${when(d.createdAt)}\n`);
    if (d.files.length) {
      table(d.files, [
        ['#', (f) => f.position],
        ['loại', (f) => (f.kind === 'video' ? 'video' : 'ảnh')],
        ['tệp', (f) => f.file],
        ['kích thước', (f) => mb(f.size)],
        ['trên đĩa', (f) => (f.onDisk ? 'có' : 'MẤT')],
        ['ảnh nhỏ', (f) => (f.poster ? (f.posterOnDisk ? 'có' : 'MẤT') : '—')],
      ]);
    } else {
      console.log('(chưa có ảnh hay video)');
    }
    console.log(`\nChia sẻ với: ${d.sharedWith.length ? d.sharedWith.map((s) => s.email).join(', ') : 'không ai (chỉ chủ xem được)'}`);
    console.log(`Lời nhắn: ${d.comments} · thẻ trong Kỷ vật: ${d.artifacts}`);
    if (d.files.some((f) => !f.onDisk || f.posterOnDisk === false)) {
      console.log('\n! Có tệp bị mất trên đĩa: khôi phục từ bản sao lưu (PLAN.md, C6) hoặc nhờ chủ kỷ niệm tải lại.');
    }
  });
}

/** The login sessions of one account; --revoke logs it out everywhere. */
function sessions() {
  const revoke = flags.has('--revoke');
  const db = openDatabase({ write: revoke });
  const row = findUser(db, args[0]);
  const now = new Date().toISOString();
  if (revoke) {
    const { changes } = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
    return out({ email: row.email, revoked: Number(changes) }, (d) =>
      console.log(`✓ Đã đăng xuất ${d.email} khỏi ${d.revoked} phiên. Lần sau họ phải đăng nhập lại.`),
    );
  }
  const list = db
    .prepare('SELECT created_at AS createdAt, expires_at AS expiresAt FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
    .all(row.id)
    .map((s) => ({ ...s, active: s.expiresAt > now }));
  out({ email: row.email, sessions: list }, (d) => {
    if (!d.sessions.length) return console.log(`${d.email} không có phiên đăng nhập nào (đã đăng xuất ở mọi nơi).`);
    console.log(`Phiên đăng nhập của ${d.email} (mỗi trình duyệt/thiết bị một phiên):\n`);
    table(d.sessions, [
      ['đăng nhập lúc', (s) => when(s.createdAt)],
      ['hết hạn', (s) => when(s.expiresAt)],
      ['trạng thái', (s) => (s.active ? 'còn hạn' : 'đã hết hạn')],
    ]);
    console.log('\nĐăng xuất ở mọi nơi: npm run admin -- sessions <email> --revoke');
  });
}

/**
 * "I forgot my password": there is no reset email in this MVP, so whoever looks after the server sets a temporary
 * password, tells it to the owner privately, and the owner changes it in Settings. Only after checking who is asking.
 */
async function resetPassword() {
  const db = openDatabase({ write: true });
  const row = findUser(db, args[0]);
  const { hashPassword } = await import('./lib/password.js');
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  const revoked = transaction(db, () => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.id);
    return Number(db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id).changes);
  });
  out({ email: row.email, temporaryPassword: password, sessionsRevoked: revoked }, (d) => {
    console.log(`✓ Đã đặt mật khẩu tạm cho ${d.email} và đăng xuất ${d.sessionsRevoked} phiên.\n`);
    console.log(`    Mật khẩu tạm:  ${d.temporaryPassword}\n`);
    console.log('  • Chỉ báo mật khẩu này cho đúng chủ tài khoản, qua kênh riêng (gọi điện, nhắn trực tiếp).');
    console.log('  • Họ đăng nhập bằng email + mật khẩu tạm, rồi vào Cài đặt → Đổi mật khẩu ngay.');
    console.log('  • Liên kết Google (nếu có) vẫn giữ nguyên.');
  });
}

/**
 * The database and the uploads folder should agree. Orphans: files nobody refers to (an upload interrupted at the
 * wrong moment, a hand-made copy). Missing: files the database refers to but the disk has lost — only a backup
 * brings those back. --fix deletes orphans older than 10 minutes (a younger one may be an upload being saved right
 * now) and leftovers in uploads/tmp; it never touches a file in use.
 */
function checkFiles() {
  const fix = flags.has('--fix');
  const db = openDatabase();
  const used = new Map(); // file name → where it is used
  for (const f of db.prepare('SELECT f.file, f.poster, f.memory_id, u.email FROM memory_files f JOIN users u ON u.id = f.user_id').all()) {
    for (const name of [f.file, f.poster].filter(Boolean)) used.set(name, { memoryId: f.memory_id, email: f.email });
  }
  for (const a of db.prepare('SELECT a.file, a.preview, a.id, u.email FROM artifacts a JOIN users u ON u.id = a.user_id').all()) {
    for (const name of [a.file, a.preview].filter(Boolean)) used.set(name, { artifactId: a.id, email: a.email });
  }

  const now = Date.now();
  const entries = listFiles(config.uploadDir);
  const orphans = [];
  const unknown = [];
  for (const { name, stat } of entries) {
    if (!NAME_PATTERN.test(name)) unknown.push(name);
    else if (!used.has(name)) orphans.push({ name, bytes: stat.size, minutesOld: Math.floor((now - stat.mtimeMs) / 60_000) });
  }
  const present = new Set(entries.map((entry) => entry.name));
  const missing = [...used].filter(([name]) => !present.has(name)).map(([name, where]) => ({ name, ...where }));
  const tmpDir = path.join(config.uploadDir, 'tmp');
  const staleTmp = listFiles(tmpDir)
    .filter(({ stat }) => now - stat.mtimeMs > 3_600_000)
    .map(({ name, stat }) => ({ name, bytes: stat.size }));

  const removed = [];
  if (fix) {
    for (const orphan of orphans.filter((o) => o.minutesOld >= 10)) {
      fs.rmSync(path.join(config.uploadDir, orphan.name), { force: true });
      removed.push(orphan);
    }
    for (const leftover of staleTmp) {
      fs.rmSync(path.join(tmpDir, leftover.name), { force: true });
      removed.push(leftover);
    }
  }

  const data = { files: entries.length, used: used.size, orphans, missing, staleTmp, unknown, removed, freedBytes: sum(removed) };
  out(data, (d) => {
    console.log(`Đối chiếu ${d.files} tệp trong uploads với cơ sở dữ liệu (${d.used} tệp đang được dùng)\n`);
    console.log(d.orphans.length ? `! ${d.orphans.length} tệp mồ côi (${mb(sum(d.orphans))}): không bản ghi nào dùng` : '✓ Không có tệp mồ côi');
    for (const o of d.orphans) console.log(`    ${o.name}  ${mb(o.bytes)}  ${o.minutesOld} phút trước`);
    console.log(d.missing.length ? `! ${d.missing.length} tệp bị MẤT: cơ sở dữ liệu cần nhưng đĩa không có` : '✓ Không thiếu tệp nào');
    for (const m of d.missing) console.log(`    ${m.name}  ${m.memoryId ? `kỷ niệm #${m.memoryId}` : `kỷ vật #${m.artifactId}`} của ${m.email}`);
    console.log(d.staleTmp.length ? `! ${d.staleTmp.length} tệp tạm cũ trong uploads/tmp (${mb(sum(d.staleTmp))})` : '✓ Không có tệp tạm cũ');
    if (d.unknown.length) console.log(`? ${d.unknown.length} tệp lạ (tên không do app đặt), để nguyên: ${d.unknown.join(', ')}`);
    if (fix) console.log(`\n✓ Đã xoá ${d.removed.length} tệp, giải phóng ${mb(d.freedBytes)}.`);
    else if (d.orphans.length || d.staleTmp.length) console.log('\nXoá tệp mồ côi và tệp tạm cũ: npm run admin -- check-files --fix');
    if (d.missing.length) console.log('Tệp bị mất không tự sửa được: khôi phục từ bản sao lưu (PLAN.md, C6).');
  });
}

/**
 * A backup you can restore: a consistent snapshot of the database (VACUUM INTO — safe while the server is writing)
 * and a copy of the uploads folder, side by side, with a short restore guide. Then copy it OFF this machine.
 */
function backup() {
  const db = openDatabase();
  const base = args[0] ? path.resolve(args[0]) : path.join(config.dataDir, 'backups');
  const target = path.join(base, `memory-lane-${stamp(new Date())}`);
  if (target.startsWith(config.uploadDir + path.sep)) fail('Không đặt bản sao lưu bên trong thư mục uploads.', 2);
  if (fs.existsSync(target)) fail(`Đã có ${target} — đợi một phút rồi chạy lại.`);
  fs.mkdirSync(target, { recursive: true });

  const dbCopy = path.join(target, 'memorylane.db');
  db.exec(`VACUUM INTO '${dbCopy.replaceAll("'", "''")}'`);
  const tmpDir = path.join(config.uploadDir, 'tmp');
  fs.cpSync(config.uploadDir, path.join(target, 'uploads'), { recursive: true, filter: (source) => source !== tmpDir });
  fs.writeFileSync(
    path.join(target, 'README.txt'),
    `Bản sao lưu Memory Lane — ${new Date().toISOString()}
Từ DATA_DIR: ${config.dataDir} · phiên bản cơ sở dữ liệu ${schemaVersion(db)}

memorylane.db  cơ sở dữ liệu (bản chụp nhất quán bằng VACUUM INTO)
uploads/       ảnh, video, ảnh nhỏ và thẻ kỷ vật — tên tệp khớp với cơ sở dữ liệu

Khôi phục (chi tiết: PLAN.md, mục C6):
1. Dừng máy chủ.
2. Đổi tên thư mục DATA_DIR đang dùng (ví dụ data → data-cu). Đừng xoá.
3. Tạo lại DATA_DIR, chép memorylane.db và thư mục uploads/ của bản này vào.
4. Khởi động máy chủ, mở /api/health, rồi chạy: npm run admin -- stats  và  npm run admin -- check-files
`,
  );

  const data = { path: target, database: { bytes: sizeOf(dbCopy) }, uploads: folderStats(path.join(target, 'uploads')) };
  out(data, (d) => {
    console.log(`✓ Đã sao lưu vào ${d.path}`);
    console.log(`    memorylane.db  ${mb(d.database.bytes)}`);
    console.log(`    uploads/       ${d.uploads.files} tệp · ${mb(d.uploads.bytes)}`);
    console.log('\nBản sao lưu nằm cùng máy với dữ liệu thật: hãy chép nó ra nơi khác (máy bạn, ổ ngoài, dịch vụ lưu trữ).');
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers

function out(data, print) {
  if (flags.has('--json')) console.log(JSON.stringify(data, null, 2));
  else print(data);
}

function fail(message, code = 1) {
  console.error(`✗ ${message}`);
  process.exit(code);
}

/** The server's database — read-only unless the command changes something. Never creates an empty one. */
function openDatabase({ write = false } = {}) {
  if (!fs.existsSync(config.dbFile)) {
    fail(`Không tìm thấy cơ sở dữ liệu: ${config.dbFile}\n  DATA_DIR phải trùng với thư mục máy chủ đang dùng (xem .env hoặc biến môi trường).`);
  }
  const db = new DatabaseSync(config.dbFile, { readOnly: !write });
  db.exec('PRAGMA busy_timeout = 5000');
  if (write) db.exec('PRAGMA foreign_keys = ON');
  const version = schemaVersion(db);
  if (version !== MIGRATIONS) {
    console.error(`! Cơ sở dữ liệu ở phiên bản ${version}, mã nguồn cần ${MIGRATIONS}: khởi động máy chủ một lần để chạy migration.`);
  }
  return db;
}

const schemaVersion = (db) => db.prepare('PRAGMA user_version').get().user_version;

function findUser(db, who) {
  if (!who) fail('Cần email hoặc số id của tài khoản.', 2);
  const row = /^\d+$/.test(who)
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(Number(who))
    : db.prepare('SELECT * FROM users WHERE email = ?').get(who.trim()); // the email column ignores upper/lower case
  if (!row) fail(`Không có tài khoản nào là "${who}".`);
  return row;
}

function inviteCounts(db, now, inviterId = null) {
  const where = inviterId === null ? '' : 'AND inviter_id = ?';
  const params = inviterId === null ? [] : [inviterId];
  const count = (condition, ...extra) => db.prepare(`SELECT COUNT(*) AS n FROM invites WHERE ${condition} ${where}`).get(...extra, ...params).n;
  return {
    pending: count('accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', now),
    accepted: count('accepted_at IS NOT NULL'),
    expired: count('accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= ?', now),
    revoked: count('revoked_at IS NOT NULL AND accepted_at IS NULL'),
  };
}

const inviteLine = (i) => `${i.pending} đang chờ · ${i.accepted} đã nhận · ${i.expired} hết hạn · ${i.revoked} đã thu hồi`;

/** Easy to read out over the phone: no look-alike letters or digits (l/1, o/0). ~59 bits of randomness. */
function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

const onDisk = (name) => fs.existsSync(path.join(config.uploadDir, name));

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/** The files directly inside a folder (not sub-folders), with their stat. */
function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, stat: fs.statSync(path.join(dir, entry.name)) }));
}

function folderStats(dir) {
  const files = listFiles(dir);
  return { files: files.length, bytes: files.reduce((total, f) => total + f.stat.size, 0) };
}

const sum = (list) => list.reduce((total, item) => total + item.bytes, 0);

const two = (n) => String(n).padStart(2, '0');
/** 2026-10-13_2055 — local time, sortable, safe in a folder name. */
const stamp = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}`;
/** 13/10/2026 20:55 in the server's local time. */
function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** 340 KB · 12,5 MB — small files in KB so they never read "0 MB". */
const mb = (bytes) =>
  bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;

function facts(pairs) {
  const width = Math.max(...pairs.map(([label]) => label.length));
  for (const [label, value] of pairs) console.log(`  ${label.padEnd(width)}  ${value}`);
}

/** Rows as aligned columns: [[header, value(row)], …]. */
function table(rows, columns) {
  const cells = rows.map((row) => columns.map(([, value]) => String(value(row))));
  const widths = columns.map(([header], i) => Math.max(header.length, ...cells.map((line) => line[i].length)));
  const line = (values) => values.map((value, i) => value.padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(columns.map(([header]) => header)));
  console.log(line(widths.map((width) => '─'.repeat(width))));
  for (const values of cells) console.log(line(values));
}

// ---------------------------------------------------------------------------------------------------------------
// Run (at the end, once every helper above exists)

const COMMANDS = {
  help,
  stats,
  users,
  user,
  memory,
  sessions,
  'reset-password': resetPassword,
  'check-files': checkFiles,
  backup,
};

const run = COMMANDS[command];
if (!run) {
  console.error(`Không có lệnh "${command}".\n`);
  help();
  process.exit(2);
}
await run();
