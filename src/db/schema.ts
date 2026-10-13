import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ROLES } from "./roles";

/** The single Zoho account the app acts through (the boss's). One row, id = "default". */
export const zohoConnection = pgTable("zoho_connection", {
  id: text("id").primaryKey(),
  zuid: text("zuid").notNull(),
  email: text("email"),
  displayName: text("display_name"),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  scopes: text("scopes").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastRefreshError: text("last_refresh_error"),
  lastRefreshErrorAt: timestamp("last_refresh_error_at", { withTimezone: true }),
});

/** Top-level containers found in WorkDrive: team folders and the account's My Folders. */
export const wdRoots = pgTable("wd_roots", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["teamfolder", "myfolder"] }).notNull(),
  name: text("name").notNull(),
  teamId: text("team_id").notNull(),
  teamName: text("team_name"),
  lastSyncRunId: integer("last_sync_run_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
});

/** Index of every file and folder under the roots, refreshed by the crawler. */
export const wdItems = pgTable(
  "wd_items",
  {
    id: text("id").primaryKey(),
    rootId: text("root_id").notNull(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    isFolder: boolean("is_folder").notNull(),
    extn: text("extn"),
    category: text("category"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    createdMs: bigint("created_ms", { mode: "number" }),
    modifiedMs: bigint("modified_ms", { mode: "number" }),
    modifiedBy: text("modified_by"),
    status: integer("status").notNull(),
    permalink: text("permalink"),
    lastSyncRunId: integer("last_sync_run_id").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wd_items_parent_idx").on(t.parentId), index("wd_items_root_idx").on(t.rootId)],
);

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
  rootsSeen: integer("roots_seen").notNull().default(0),
  foldersSeen: integer("folders_seen").notNull().default(0),
  filesSeen: integer("files_seen").notNull().default(0),
  error: text("error"),
});

/** Our own record of who did what. Zoho will attribute every action to the boss. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    resourceId: text("resource_id"),
    detail: jsonb("detail"),
  },
  (t) => [index("audit_log_resource_idx").on(t.resourceId)],
);

// ---------- people and access ----------



/** Portal accounts. None of these people need a Zoho account. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    active: boolean("active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Login sessions. The id is the SHA-256 of the cookie token, so a database leak can't be replayed. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Permission levels, ordered: each includes everything below it. */
export const LEVELS = { view: 1, edit: 2, manage: 3 } as const;
export type LevelName = keyof typeof LEVELS;

/**
 * A user's access to a team folder, folder or file. A grant on a folder covers everything inside it;
 * the user's effective level is the highest grant on the item or any ancestor.
 */
export const grants = pgTable(
  "grants",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull(),
    level: integer("level").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("grants_user_resource_idx").on(t.userId, t.resourceId), index("grants_resource_idx").on(t.resourceId)],
);
