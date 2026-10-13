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
} from "drizzle-orm/pg-core";

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
