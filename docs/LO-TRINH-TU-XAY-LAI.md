# Lộ trình tự xây lại Memory Lane

Mục tiêu: từ một thư mục trống, tự tay viết một album nhỏ cùng **họ** với dự án này (React + Vite + Express + SQLite), đủ để bạn giải thích từng file khi thầy hỏi. Bản trong repo là đích để **đọc**, không phải bản để chép nguyên.

Lộ trình dưới đây bám đúng những gì repo đang dùng, và nói rõ chỗ nào là lớp sơn do AI thêm vào. Đọc [KIEN-TRUC.md](KIEN-TRUC.md) một lượt trước mốc 0.

Quy ước mỗi mốc:

- **Học**: khái niệm vừa đủ cho mốc đó.
- **Đọc**: file trong repo này, mở sau khi bạn đã thử tự viết.
- **Làm**: cái bạn tạo trong thư mục của bạn.
- **Xong khi**: kiểm tra được bằng mắt hoặc bằng `curl`, không cần giống pixel giao diện Memory Lane.

Giữ một git repo riêng. Mỗi mốc một commit. Khi hỏng, `git diff` cho biết mốc nào làm vỡ.

## Trước khi viết: cái gì đáng học, cái gì nên bỏ

Bản trong repo làm được nhiều việc một đồ án không cần có ngay:

| Phần | File nặng | Làm gì với nó |
| --- | --- | --- |
| Hai giao diện Sổ tay / Phòng tối | `client/src/styles/` khoảng vài nghìn dòng | Bản của bạn: **một** file CSS, một màu giấy. Theme là bài tập CSS sau khi API đã chạy. |
| Song ngữ | `client/src/i18n/vi.js`, `en.js` mỗi file khoảng 800 dòng | Viết câu tiếng Việt thẳng trong JSX. Thêm `t()` khi bạn chán sửa chữ ở mười file. |
| Vẽ bưu thiếp trên canvas | `client/src/lib/cards.js` (~400 dòng), `CardStudio.jsx`, `pages/Artifacts.jsx` | Bỏ hẳn ở bản đầu. Kỷ vật không nằm trên đường đi của album. |
| Đăng nhập Google | `server/lib/google.js`, `server/routes/google.js` | Làm sau email + mật khẩu. OAuth dễ sai `redirect_uri` và che mất bài học về cookie. |
| Lời nhắn hiện ngay (SSE) | `server/lib/live.js`, `client/src/components/LiveUpdates.jsx` | Tải lại trang vẫn đúng. SSE cần khi hai người cùng mở một kỷ niệm. |
| Nén WebP và xoá GPS trong trình duyệt | `client/src/lib/image.js`, `video.js` | Bản đầu cho phép JPEG nhỏ. **Trước khi đưa ảnh gia đình thật lên mạng**, quay lại `server/lib/metadata.js`: máy chủ phải tự xoá GPS, không tin trình duyệt. |
| Tìm không dấu | `server/lib/text.js`, hàm SQL `fold` trong `server/db.js` | `LIKE` thường là đủ. "da lat" không ra "Đà Lạt" thì mới thêm `fold`. |
| Thế giới demo 6 người | `server/seed.js` rất dài, `server/seed-media/` 34 MB | Một user tự đăng ký là đủ. Đừng mang thư mục video demo vào bài của bạn. |
| Công cụ admin, e2e Chrome | `server/admin.js`, `test/e2e/` | Học `node:test` với một bài "đăng ký rồi tạo kỷ niệm". Admin là việc vận hành, xem [DEPLOY-VA-VAN-HANH.md](DEPLOY-VA-VAN-HANH.md). |
| `state.jsx` | một file ôm fetch, cache, chế độ kín | Trong bản của bạn, mỗi trang `useEffect` + `useState` là đủ. |

Những thứ **không** được bỏ khi bạn đã cho người khác dùng: kiểm tra `user_id` trên mọi câu SQL, cookie `HttpOnly`, mật khẩu băm, file ảnh không public, `NODE_ENV=production` lúc deploy.

## Mốc 0 — Thư mục trống và một lệnh chạy được

**Học:** terminal, `package.json`, `"type": "module"` (để dùng `import`), Node 22 trở lên.

**Đọc:** `package.json` (chỉ mục `scripts` và `dependencies`).

**Làm:**

```bash
mkdir album && cd album
git init
npm init -y
```

Thêm vào `package.json`: `"type": "module"`. Tạo `.gitignore` với `node_modules/`, `.env`, `data/`.

**Xong khi:** `node -e "console.log('ok')"` in `ok`, và `git status` không thấy `node_modules`.

## Mốc 1 — Express trả một câu JSON

**Học:** HTTP method, status, JSON, cổng, `listen`.

**Đọc:** `server/index.js` (chỉ phần `listen` và lỗi `EADDRINUSE`), đoạn `GET /health` trong `server/app.js`.

**Làm:** `npm install express`. File `server/index.js` có `GET /api/health` trả `{ ok: true }`.

**Xong khi:**

```bash
node server/index.js
curl http://localhost:3001/api/health
```

in ra `{"ok":true}`. Tắt bằng Ctrl+C. Chạy lần thứ hai khi lần thứ nhất còn sống thì bạn hiểu lỗi chiếm cổng.

## Mốc 2 — Cấu hình, không ghi số cổng rải rác

**Học:** biến môi trường, vì sao không commit bí mật, giá trị mặc định.

**Đọc:** `server/config.js`, `.env.example`. Node 22 có `process.loadEnvFile`, không cần gói `dotenv`.

**Làm:** `config.js` đọc `PORT` và `DATA_DIR`. `.env.example` chỉ có tên biến và giá trị mẫu. `.env` nằm trong `.gitignore`.

**Xong khi:** đổi `PORT=4000` trong `.env`, khởi động lại, `curl` tới cổng 4000 được. Xoá `.env` thì app vẫn chạy ở cổng mặc định.

## Mốc 3 — Một file SQLite và bảng kỷ niệm

**Học:** bảng, khoá chính, `user_id`, `INSERT`/`SELECT` với dấu `?` (không nối chuỗi SQL), migration.

**Đọc:** `server/db.js`, `server/migrations/001_init.sql` (bảng `users` và `memories` là đủ), `server/models/memories.js` (xem cách mọi câu đều có `user_id`).

**Làm:** mở database bằng `node:sqlite` (`import { DatabaseSync } from 'node:sqlite'`). Tạo thư mục `data/` nếu chưa có. Một file SQL tạo bảng `memories` với `id`, `title`, `story`, `year`. Chạy file đó khi bảng chưa tồn tại.

Bỏ qua WAL, `busy_timeout`, và năm file migration cho đến khi bạn có hai bảng thật.

**Xong khi:** chạy app hai lần không báo "table already exists", và một script nhỏ `INSERT` rồi `SELECT` in ra đúng dòng. File `data/*.db` không xuất hiện trong `git status`.

## Mốc 4 — API kỷ niệm, chưa cần đăng nhập

**Học:** REST: `GET` danh sách, `POST` tạo, `PUT` sửa, `DELETE` xoá. Mã lỗi ổn định thay vì câu văn.

**Đọc:** `server/routes/memories.js` (bỏ qua đoạn file, share, comment), `server/lib/errors.js`, `server/lib/validate.js`, `shared/limits.js`.

**Làm:** bốn route dưới `/api/memories`. Từ chối tiêu đề rỗng và năm lạ. Trả `{ error: "VALIDATION" }` kèm field, không trả một câu tiếng Việt từ máy chủ.

Ở mốc này chưa có user, nên mọi kỷ niệm là của "cả máy". Đó là nợ có chủ đích. Mốc 5 trả nợ.

**Xong khi:** `curl` tạo được một kỷ niệm, lấy lại bằng id, sửa tiêu đề, xoá, rồi `GET` id đó ra 404. Gửi tiêu đề rỗng thì được 400.

## Mốc 5 — Tài khoản, mật khẩu, cookie

**Học:** băm mật khẩu (scrypt có sẵn trong `node:crypto`), session phía máy chủ, cookie `HttpOnly` và `SameSite`, middleware "ai đang gọi".

**Đọc:** `server/lib/password.js`, `server/lib/sessions.js`, `server/routes/auth.js` (register, login, logout; bỏ `/demo`).

**Làm:**

- Bảng `users` (`email` unique, `password_hash`) và `sessions` (`token_hash`, `user_id`, `expires_at`).
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`.
- Cookie do bạn đặt tên. Database chỉ lưu SHA-256 của token.
- Thêm `user_id` vào `memories`. Mọi câu SQL của mốc 4 phải lọc theo `req.user.id`. Người khác đụng id của bạn thì 404.

Chưa cần rate limit, Google, hay nút demo.

**Xong khi:** đăng ký xong thì `GET /api/auth/session` ra đúng user và **không** có `password_hash`. Xoá cookie (hoặc logout) thì `POST /api/memories` trả 401. Hai user không thấy kỷ niệm của nhau. Bạn giải thích được vì sao không lưu token thô trong SQLite.

## Mốc 6 — React nhìn thấy API

**Học:** component, `useState`, `useEffect`, JSX, SPA, proxy của Vite.

**Đọc:** `vite.config.js` (mục `root` và `proxy`), `client/src/main.jsx`, `client/src/App.jsx` (chỉ route `/login` và `/album`), `client/src/api.js`, `client/src/auth.jsx`, `client/src/pages/Login.jsx`, `client/src/pages/Album.jsx`.

**Làm:** `npm install react react-dom react-router` và devDependency `vite @vitejs/plugin-react`. Cấu hình Vite gốc `client/`, proxy `/api` sang cổng Express. Một trang đăng nhập, một trang danh sách kỷ niệm, một form tạo. Gọi server qua một hàm `api` duy nhất, `credentials: 'same-origin'`.

Bỏ `React.lazy`, hai theme, và từ điển i18n. CSS một file, chữ tiếng Việt viết thẳng.

**Xong khi:** `npm run dev` mở được trang ở cổng 5173, đăng ký, tạo kỷ niệm, tải lại trình duyệt vẫn còn đăng nhập. Tab Network cho thấy request đi tới `/api/...` trên cổng 5173 (Vite chuyển tiếp), không phải bạn tự gọi cổng 3001 từ React.

## Mốc 7 — Ảnh riêng tư

**Học:** `multipart/form-data`, lưu file ra đĩa, không tin đuôi file người dùng gửi, không phục vụ thư mục upload bằng `express.static`.

**Đọc:** `server/lib/files.js` (hàm `sniff` và `uploader`), `server/routes/files.js`, `client/src/lib/upload.js`.

**Làm:** `npm install multer`. `POST /api/memories/:id/files` nhận một ảnh. Đọc vài byte đầu để biết JPEG/PNG/WebP. Đổi tên thành chuỗi ngẫu nhiên. `GET /api/files/:name` chỉ gửi file nếu kỷ niệm thuộc user đang đăng nhập. `<img>` trên trang chi tiết dùng URL đó.

Giới hạn kích thước bằng biến `MAX_UPLOAD_MB`. Bỏ video, thanh tiến trình, và nén canvas cho đến khi một ảnh JPEG đi hết vòng này.

**Xong khi:** ảnh hiện sau khi tải lại trang. Mở URL ảnh trong cửa sổ ẩn danh thì 404. Đổi tên file thành `anh.jpg.exe` mà bên trong là JPEG thì server vẫn nhận đúng là ảnh, hoặc từ chối nếu bạn chưa nhận JPEG — điều quan trọng là quyết định dựa trên byte, không dựa trên tên.

## Mốc 8 — Lặp lại khuôn: người quen, phim nhạc

**Học:** cùng một khuôn route + model cho bảng mới. Đây là lúc kiến trúc "model viết SQL, route viết HTTP" trả công.

**Đọc:** `server/models/people.js`, `server/routes/people.js`, `server/routes/media.js`, `client/src/pages/People.jsx`. Chỉ cần một trong hai tính năng.

**Làm:** bảng `people` (tên, quan hệ, ngày liên lạc) **hoặc** bảng `media` (film/music, tiêu đề, url). CRUD có `user_id`. Một trang React.

Nếu làm `media.url`, chỉ cho `http:` và `https:`. Repo từ chối `javascript:` — xem bài test trong `test/api.test.js`.

**Xong khi:** user A không sửa được người của user B. Bạn thêm bảng thứ hai mà không copy-paste SQL vào file React.

## Mốc 9 — Chia sẻ, bản nhỏ

**Học:** khả năng đoán token, lưu mã băm, hết hạn, kiểm tra quyền lúc đọc.

**Đọc:** `server/routes/invites.js`, phần đầu của `server/models/social.js`. File model này dài vì vòng thân quen hai chiều, thu hồi, gắn kỷ niệm sau khi tạo link. Đừng chép hết.

**Làm một trong hai, cái đơn giản hơn:**

- Cách A: bảng `shares (memory_id, email)`. Chủ gõ email người được xem. `GET /api/memories/:id` cho phép nếu bạn là chủ **hoặc** email của bạn nằm trong `shares`.
- Cách B: giống repo hơn: token ngẫu nhiên, một lần, hết hạn. Người nhận phải đăng nhập rồi mới accept.

Cách A đủ để hiểu "quyền". Cách B mới giống sản phẩm. Lời nhắn (`comments`) là một bảng nữa với cùng luật: chỉ chủ và người được share.

Bỏ SSE. Sau khi gửi lời nhắn, tải lại trang.

**Xong khi:** user B xem được đúng một kỷ niệm được share và không xem được kỷ niệm bên cạnh. Rút share xong, URL cũ của B trả 404, kể cả URL ảnh.

## Mốc 10 — Một cổng, sẵn sàng đưa lên mạng

**Học:** build ra file tĩnh, Express phục vụ SPA, vì sao refresh `/album/3` vẫn phải trả `index.html`.

**Đọc:** nửa dưới `server/app.js` (đoạn `client/dist` và `sendFile` của `index.html`), script `build` và `start` trong `package.json`.

**Làm:**

```bash
npm run build
npm start
```

Tắt `npm run dev` trước. Mở cổng của Express (không mở cổng Vite). Thêm `GET /api/health` nếu mốc 1 đã bị bạn gộp mất.

Viết `.env.example` gồm ít nhất: `PORT`, `DATA_DIR`, `NODE_ENV`. Khi `NODE_ENV=production`, cookie phiên có `Secure`.

**Xong khi:** không chạy Vite, bạn vẫn đăng nhập, tạo kỷ niệm, xem ảnh. F5 trên `/album` không ra 404 của Express. `client/dist/` không bị commit.

Đưa lên hosting theo [DEPLOY-VA-VAN-HANH.md](DEPLOY-VA-VAN-HANH.md). Bản mini của bạn deploy cùng cách, vì nó cũng là một tiến trình Node và một thư mục dữ liệu.

## Làm sau, khi bản mini đã chạy

Mỗi mục là một commit riêng. Đọc file rồi viết lại ngắn hơn, đừng kéo nguyên file 400 dòng vào bài.

1. **Xoá GPS trên máy chủ** — `server/lib/metadata.js`. Làm trước ngày có ảnh nhà thật.
2. **Rate limit đăng nhập** — `server/lib/rateLimit.js` và `AUTH_RATE_LIMIT`. Bộ đếm trong RAM là đủ cho một instance.
3. **Header bảo mật** — `server/lib/security.js` (CSP, `X-Content-Type-Options`, HSTS khi production).
4. **Hai ngôn ngữ** — `client/src/i18n/`. Bắt đầu với mười câu, không phải tám trăm.
5. **Một giao diện đẹp** — đọc `docs/design/DESIGN.md` để lấy ý, viết CSS mới. Đừng fork cả `notebook.css` và `darkroom.css`.
6. **SSE** — `server/lib/live.js`. Nhớ: nhiều instance thì sự kiện không sang được máy bên kia.
7. **Google** — `server/routes/google.js` cùng [DEPLOY.md](DEPLOY.md). Giữ kiểm tra issuer, audience, hạn dùng, email đã xác minh, nonce. Đoạn code cố ý không tự kiểm chữ ký JWT lần nữa vì token đến trực tiếp từ HTTPS của Google; đừng "rút gọn" bằng cách bỏ các kiểm tra còn lại.
8. **Thẻ kỷ niệm** — `client/src/lib/cards.js` chỉ sau khi bạn đã quen canvas.
9. **Bài test** — `test/api.test.js` dùng `node:test`. Một file, năm bài (đăng ký, cô lập user, upload, share, health) dạy nhiều hơn bộ 72 bài.

## Khi kẹt

1. Đọc thông báo từ trên xuống, tìm file của **bạn** chứ không phải file trong `node_modules`.
2. Tab Network: status, body, header `Set-Cookie`.
3. `console.error` phía server. Bản repo gắn lỗi 500 với một `ref` ngắn để đối chiếu log (`server/app.js`).
4. So với file "Đọc" của đúng mốc, không so với cả repo.
5. Tab Network và log của Express thường đủ. Nếu vẫn kẹt, đọc lại file "Đọc" của đúng mốc, không đọc cả repo.
