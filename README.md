# Getmeds Files

A web portal that lets staff and external users create, view, edit and delete company files stored in Zoho WorkDrive, without each person needing a Zoho account. The server acts through one connected Zoho account and enforces its own permissions and audit log.

**Status: Phase 1** (WorkDrive connection and indexing). See [Roadmap](#roadmap).

## Setup

1. **Install:** `npm install`
2. **Database:** create a Neon project and copy its pooled connection string.
3. **Zoho app:** in the [Zoho API Console](https://api-console.zoho.com), add a **Server-based Application**:
   - Homepage URL: your `APP_URL`
   - Authorized Redirect URI: `${APP_URL}/api/zoho/callback` (e.g. `http://localhost:3000/api/zoho/callback`)
   - Copy the Client ID and Client Secret.
4. **Environment:** copy `.env.example` to `.env.local` and fill in every value. Generate the two secrets with:
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Keep `TOKEN_ENCRYPTION_KEY` out of the database. It is what keeps the stored Zoho token unreadable.
5. **Create tables:** `npm run db:push`
6. **Run:** `npm run dev`, then open http://localhost:3000/admin and sign in with `ADMIN_PASSWORD`.
7. **Connect Zoho:** click **Connect Zoho WorkDrive**. The account owner signs in to Zoho in that same browser tab and approves. They can sign in to `/admin` themselves to do it.
8. **Index:** click **Scan WorkDrive now**. The scan walks every team folder the account belongs to, plus its My Folders. Refresh the page to watch progress, then browse the results.

## How it fits together

```
Browser → Next.js server (permissions, audit log) → Zoho WorkDrive API (boss's account)
                    ↕
             Neon Postgres (token, file index, audit log)
```

| Path | What it does |
|---|---|
| `src/lib/zoho/oauth.ts` | OAuth connect, encrypted token storage, access-token reuse and refresh |
| `src/lib/zoho/workdrive.ts` | WorkDrive client: list, metadata, download, upload/new version, rename, move, trash, versions |
| `src/lib/sync/crawl.ts` | Indexes all team folders and My Folders into `wd_items` |
| `src/db/schema.ts` | Tables: `zoho_connection`, `wd_roots`, `wd_items`, `sync_runs`, `audit_log` |
| `src/app/admin` | Temporary admin UI: connect, scan, browse, download |

### Zoho limits to keep in mind

- **Refresh-token limit.** A refresh token can create only 10 access tokens per 10 minutes, so the app caches the access token in the database and refreshes it about 5 minutes before it expires.
- **Revoked tokens.** If the account owner revokes the app (Zoho Accounts → Connected Apps), or Zoho reports `invalid_code`, the admin page shows the error. Click **Reconnect Zoho** to restore access.
- **Empty folders and retries.** WorkDrive returns `204 No Content` for empty folders. The client retries 429 and 5xx responses with backoff.
- **Undocumented upload response.** Zoho doesn't document the upload response, so `upload()` reads `resource_id` the way rclone does. Check this on the first real upload.

## Roadmap

1. ✅ WorkDrive connection and folder indexing
2. User accounts (staff and external), roles, per-folder permissions
3. File browser for users: create, view, edit, delete. Edits save as new versions, and deletes go to the trash.
4. Word editing with a fork of WordCraft. On save, check whether the file changed since it was opened; if it did, save a copy instead of overwriting. Needs the Rust toolchain.
5. Nightly backup, rate-limit tuning, then PdfCraft, GridCraft and DeckCraft
