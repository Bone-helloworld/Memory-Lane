# Deploy Memory Lane

Production runs on **Azure App Service** (Linux, Node 22 LTS, B1) at [https://memorylane.azurewebsites.net](https://memorylane.azurewebsites.net).

Accounts, sessions, memories, and contact-form notes live in **Azure SQL**. Photos, videos, posters, and keepsake images live in a **private** blob container. A restart or a new deploy does not wipe them.

On a laptop, with those settings unset, the same process uses **SQLite** and `DATA_DIR/uploads`. Tests do that too. Nothing in Azure is required to run `npm test` or `npm run dev`.

The data that was on Render's free disk is gone on every restart. There is nothing to copy across. New production data starts empty.

## App Service

Already created:

| Resource | Value |
| --- | --- |
| App | `memorylane` → `https://memorylane.azurewebsites.net` |
| Plan | Linux, Node 22 LTS, **B1** |
| Azure SQL | server `memorylane-sql-29823.database.windows.net`, database `memorylane-db`, user `mladmin` |
| Storage | account `memorylanest2555`, private container `media` |

The SQL firewall already allows the App Service outbound addresses. The blob container has no public access. The app checks who may see a file, then streams it (including `Range` for video).

### Build and start

In **Configuration → Application settings**:

| Name | Value |
| --- | --- |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~22` |

Oryx then runs `npm install` during deploy and, because `package.json` has a `build` script, `npm run build` (the Vite client). `sharp`, `ffmpeg-static`, and `nsfwjs` publish Linux x64 binaries, so the image does not need `apt install ffmpeg`.

**Startup command** (Configuration → General settings):

```bash
npm run start:demo
```

That listens on `process.env.PORT` (App Service sets it; do not hard-code a port). When `ALLOW_DEMO=true` it recreates only the demo accounts (`*@memorylane.local`) and their files. Real accounts are not deleted. When `ALLOW_DEMO=false` the same command skips the seed and only starts the server.

`npm start` is the same process with no seed. Use it only if you do not want the demo button's data refreshed on boot.

The server trusts **one** proxy hop. App Service appends the visitor to `X-Forwarded-For` and sets `X-Forwarded-Proto`. There is no Cloudflare in front, so `CF-Connecting-IP` is ignored. Secure cookies follow `X-Forwarded-Proto`.

`PUBLIC_URL` is what Google's redirect URI is built from. Set it to `https://memorylane.azurewebsites.net` (no trailing slash).

### Azure SQL may pause

The free serverless database sleeps after idle time. The first connection after that can take about a minute. The pool retries with backoff (about three attempts, 60 seconds each) before the process gives up. Health checks answer `503` until the database responds. Later queries that hit a dropped connection reconnect once.

### What a restart keeps

| Kept in Azure | Still local / ephemeral |
| --- | --- |
| Users, sessions, Google links, memories, circles, notes, keepsakes, contact messages | In-flight upload temp files under `DATA_DIR` |
| WebP images, videos, posters, thumbnails, card images | The SQLite file, which production does not open |
| Demo rows, replaced only when `ALLOW_DEMO=true` | Render's old disk. It was wiped on restart. Do not expect it here. |

Deleting a memory or an account deletes that owner's blobs. Contact messages are not tied to an account, so deleting an account leaves them in `contact_messages`.

## Environment variables

Set secrets in the App Service **Configuration** blade. Do not commit them.

| Variable | Production | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `production` | `Secure` cookies, trust the platform proxy, send HSTS |
| `PORT` | set by App Service | Port to bind. Do not override it |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~22` | Node 22 LTS for Oryx |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | `npm install` and `npm run build` on deploy |
| `AZURE_SQL_SERVER` | `memorylane-sql-29823.database.windows.net` | Azure SQL host |
| `AZURE_SQL_DATABASE` | `memorylane-db` | Database name |
| `AZURE_SQL_USER` | `mladmin` | SQL login |
| `AZURE_SQL_PASSWORD` | *(secret)* | SQL password. Never commit it |
| `AZURE_SQL_CONNECTION_STRING` | optional | Instead of the four settings above. If both styles are set, this string is the one used. Include `Encrypt=True` |
| `AZURE_SQL_TRUST_SERVER_CERTIFICATE` | unset | `true` only for a local SQL Server container, never for Azure |
| `AZURE_STORAGE_ACCOUNT` | `memorylanest2555` | Storage account |
| `AZURE_STORAGE_KEY` | *(secret)* | Account key. `AZURE_STORAGE_ACCOUNT_KEY` is accepted as the same value |
| `AZURE_STORAGE_CONNECTION_STRING` | optional | Instead of account + key. If both styles are set, this string is the one used |
| `AZURE_STORAGE_CONTAINER` | `media` | Private container. Default is `media` |
| `PUBLIC_URL` | `https://memorylane.azurewebsites.net` | Builds Google's redirect URI |
| `GOOGLE_CLIENT_ID` | from Google Cloud | Turns on "Continue with Google" |
| `GOOGLE_CLIENT_SECRET` | *(secret)* | OAuth client secret |
| `ALLOW_DEMO` | `true` for a class demo, `false` for real use | Shows "Try the demo". The start command seeds only when this is `true` |
| `SMTP_HOST` | `smtp.gmail.com` or empty | Contact form email. Empty: the note is stored and written to the log, and no mail is sent |
| `SMTP_PORT` | `587` | `587` is STARTTLS. `465` is TLS from the start |
| `SMTP_USER` | the Gmail address | SMTP login, and the **From** address |
| `SMTP_PASS` | *(secret)* | Gmail App Password, 16 characters, spaces removed. Not the Gmail login password |
| `FEEDBACK_TO` | `bonenguyen.19@gmail.com` | Inbox for contact notes. This is the default when unset. **Reply-To** is the visitor |
| `CONTACT_RATE_LIMIT` | `8` | Contact posts per IP per 15 minutes |
| `SESSION_DAYS` | `30` | How long a login lasts |
| `MAX_UPLOAD_MB` | `15` | Largest photo |
| `MAX_VIDEO_MB` | `100` | Largest video |
| `STORAGE_MB` | `2048` | Per-account quota for photos, videos, and keepsake images |
| `INVITE_DAYS` | `7` | How long an invite link lasts |
| `AUTH_RATE_LIMIT` | `20` | Login and register attempts per IP per 15 minutes |
| `DATA_DIR` | optional | Scratch folder for an upload that has not been stored yet. With Blob Storage configured, this is not the photo archive |

Leave every `AZURE_SQL_*` and `AZURE_STORAGE_*` variable unset to stay on SQLite and local files.

## Contact form mail

`/contact` accepts feedback, a suggestion, or a collaboration note. The server always inserts a row in `contact_messages` (SQLite locally, Azure SQL in production). With `SMTP_HOST` set it also sends mail to `FEEDBACK_TO` through nodemailer. **Reply-To** is the address the visitor typed.

Gmail will not accept the normal account password for SMTP. Turn on 2-Step Verification, then create an App Password:

1. Sign in as the account that sends the mail (for example `bonenguyen.19@gmail.com`).
2. Open [Google Account security](https://myaccount.google.com/security) and turn on **2-Step Verification**.
3. Open [App passwords](https://myaccount.google.com/apppasswords). If that page is missing, 2-Step Verification is off, or a Workspace admin has blocked app passwords.
4. Name it `Memory Lane` and create it. Google shows 16 characters (`abcd efgh ijkl mnop`).
5. Copy them into `SMTP_PASS` with the spaces removed.

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=bonenguyen.19@gmail.com
SMTP_PASS=abcdefghijklmnop
FEEDBACK_TO=bonenguyen.19@gmail.com
```

Put `SMTP_PASS` in App Service configuration, not in git. Locally, uncomment the same lines in `.env` and restart `npm run dev`.

## Continue with Google

The button is on the sign-in page. Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` it stays disabled.

1. Open [Google Auth Platform clients](https://console.cloud.google.com/auth/clients) and create or pick a project.
2. Audience: **External**. Scopes: `openid`, `email`, `profile` only.
3. While the app is in **Testing**, add the people who should sign in under **Audience → Test users**. **Publish app** lets anyone in, because those three scopes do not need a Google review.
4. Create a **Web application** client. Authorized redirect URIs, character for character:

   | Where | Redirect URI |
   | --- | --- |
   | `npm run dev` | `http://localhost:5173/api/auth/google/callback` |
   | `npm start` on this machine | `http://localhost:3001/api/auth/google/callback` |
   | This App Service | `https://memorylane.azurewebsites.net/api/auth/google/callback` |

5. Put the client id and secret in App Service (and in `.env` locally via `npm run setup:google`). Set `PUBLIC_URL` only on the server, not in the laptop `.env`.

`redirect_uri_mismatch` means the URI Google has and the URI the app sent differ (`https`, host, port, or a trailing slash). The error page's details show the URI the app sent.

## After it is up

- `https://memorylane.azurewebsites.net/api/health` returns `{"ok":true}` once SQL answers. During a cold resume it can be `503` for about a minute.
- Register, upload a photo and a short video, restart the app, and confirm the account and the files are still there.
- Open an image URL in a private window: **401**. Another signed-in person who was not given that memory: **404**.
- Submit `/contact`. The row is in `contact_messages`. With SMTP set, the inbox receives it.
- Sign in with Google. The redirect URI is the one in the table above.

`npm run admin` uses the same database. `stats`, `users`, `reset-password`, and `check-files` work against Azure SQL and the blob container. `backup` does not download them: Azure SQL has its own point-in-time restore, and the blobs stay in the storage account.
