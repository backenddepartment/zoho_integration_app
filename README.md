# Getmeds Files

A web portal that lets staff and external users create, view, edit and delete company files stored in Zoho WorkDrive, without each person needing a Zoho account. The server acts through one connected Zoho account and enforces its own permissions and audit log.

**Status: Phases 1–3** (WorkDrive connection, users and permissions, file CRUD). See [Roadmap](#roadmap).

## Setup

1. **Install:** `npm install`
2. **Database:** create a Neon project and copy its pooled connection string.
3. **Zoho app:** in the [Zoho API Console](https://api-console.zoho.com), add a **Server-based Application**:
   - Homepage URL: your main domain
   - Authorized Redirect URIs (use ⊕ to add each): `<origin>/api/zoho/callback` for every origin in `APP_URL`, e.g.
     `http://localhost:3000/api/zoho/callback`, `https://zoho-integration-app.vercel.app/api/zoho/callback`, `https://workdrive.getmeds.ph/api/zoho/callback`
   - Copy the Client ID and Client Secret.
   - **Sign in with Zoho** (the button on the login page) also needs `<origin>/api/auth/zoho/callback` for every
     origin, e.g. `http://localhost:3000/api/auth/zoho/callback`. It only asks Zoho for the person's verified
     email. A verified @getmeds.ph or @2mginc.com email gets a Staff account on first sign-in (seeing nothing until
     a folder is shared with it; the list is `COMPANY_DOMAINS` in `src/lib/auth.ts`); any other email must have been
     added by an admin. To give it its own
     client instead (recommended, so you can turn on **Multi-DC** for people whose Zoho account is in the EU,
     India, …), add a second Server-based Application with that redirect URI and set `ZOHO_LOGIN_CLIENT_ID`
     and `ZOHO_LOGIN_CLIENT_SECRET`.
4. **Environment:** copy `.env.example` to `.env.local` and fill in every value. Generate the two secrets with:
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Keep `TOKEN_ENCRYPTION_KEY` out of the database. It is what keeps the stored Zoho token unreadable.
5. **Create tables:** `npm run db:push`
6. **First admin:** `npm run create-admin -- you@getmeds.ph "Your Name"`. It prints a temporary password.
   You'll have to change it at first sign-in.
7. **Run:** `npm run dev`, then open http://localhost:3000/login.
8. **Connect Zoho:** click **Connect Zoho WorkDrive**. The account owner signs in to Zoho in that same browser tab and approves. They can sign in to `/admin` themselves to do it.
9. **Index:** click **Scan WorkDrive now**. The scan walks every team folder the account belongs to, plus its My Folders. Refresh the page to watch progress, then browse the results.

## Roles and permissions

| Role | Can do |
|---|---|
| superadmin | Everything an admin can, plus **delete permanently** (including whole team folders) and managing other superadmins |
| admin | Everything: every file, Users page, sharing, Zoho connection, scans, restoring deleted items |
| staff | Only what is shared with them, up to the level granted |
| external | Same as staff, but never more than **edit** (no delete or move) |

Sharing works like WorkDrive: right-click any team folder, folder or file → **Share…** (or the **Share**
button on its page). Pick a person and a role. Access on a folder covers everything inside it. If someone
has several grants, the highest one on the item or any folder above it applies.

| Role | Allows |
|---|---|
| Viewer | Browse, download, see versions |
| Editor | Also upload (or save a new version), create folders, rename |
| Organizer | Also delete and move |
| Folder admin | Also share that item with others and change their access |

App admins and superadmins have everything everywhere. External users can be at most Editor. Folder
admins can't remove their own access.

**Deleting** renames the item in WorkDrive to `(Deleted by Jade Madigal) name`. If that name is
taken, the date is added: `(Deleted by Jade Madigal 2026-10-13 1215) name`. Nothing is removed. The
item, and everything inside it, disappears from every screen in the app. Admins find it under
**Deleted items** and can **Restore** it. Only a superadmin can **Delete permanently**:
- **Files and folders** are purged from WorkDrive.
- **Team folders** need the exact name typed to confirm. Only a Zoho team admin can restore one, from
  WorkDrive's Admin Console, within the retention period.

**Who did what.** WorkDrive records every change under the connected Zoho account. The app keeps the
real person in three places:
- **The app's own log.** File lists show "Last change … by", and file pages show "Created by" and a
  full Activity history.
- **WorkDrive comments.** Each change also leaves a comment on the file, e.g. "Uploaded by Jade
  Madigal (jade@…) via Getmeds Files". This needs the `WorkDrive.comments.CREATE` permission.
- **Team folder descriptions.** New team folders get "Created by …" as their description.

Make the first superadmin with `npm run make-superadmin -- you@getmeds.ph`. The account must already exist.

Every action is recorded in `audit_log` under the person who did it. The admin WorkDrive page shows the latest 50.

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
| `src/lib/auth.ts`, `src/lib/password.ts` | Sign-in, database sessions, lockout after 5 failed attempts, scrypt hashing |
| `src/lib/access.ts` | Permission checks (`authorize`), what each user starts from, index updates after changes |
| `src/app/api/files/[id]/…` | CRUD API: read, rename, move, trash, create folder, upload, save content (with conflict copy), versions, download |
| `src/app/files` | File browser and the admin-only Sharing panel |
| `src/app/admin` | WorkDrive connection, scan, activity log; `admin/users` manages accounts |

### Zoho limits to keep in mind

- **Refresh-token limit.** A refresh token can create only 10 access tokens per 10 minutes, so the app caches the access token in the database and refreshes it about 5 minutes before it expires.
- **Revoked tokens.** If the account owner revokes the app (Zoho Accounts → Connected Apps), or Zoho reports `invalid_code`, the admin page shows the error. Click **Reconnect Zoho** to restore access.
- **Empty folders and retries.** WorkDrive returns `204 No Content` for empty folders. The client retries 429 and 5xx responses with backoff.
- **Undocumented upload response.** Zoho doesn't document the upload response, so `upload()` reads `resource_id` the way rclone does. Check this on the first real upload.

## Roadmap

1. ✅ WorkDrive connection and folder indexing
2. ✅ User accounts (staff and external), roles, per-folder permissions
3. ✅ File browser for users: create, view, edit, delete. Edits save as new versions, and deletes go to the trash.
   - Still to do: scans that resume across several short runs (for Vercel's time limit), and uploads over 4.5 MB on Vercel
4. Word editing with a fork of WordCraft. On save, check whether the file changed since it was opened; if it did, save a copy instead of overwriting. Needs the Rust toolchain.
5. Nightly backup, rate-limit tuning, then PdfCraft, GridCraft and DeckCraft
