import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { auditLog, db, users } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { addComment } from "@/lib/zoho/workdrive";

// Zoho attributes every change to the one connected account, so the app keeps its own record of
// who did what (audit_log) and, for files, also leaves a WorkDrive comment naming the real person.

/** Human wording for audit actions, used on screen and in WorkDrive comments. */
export const ACTION_LABELS: Record<string, string> = {
  "file.upload": "Uploaded",
  "file.new_version": "Uploaded a new version",
  "file.save": "Saved changes",
  "file.save_conflict_copy": "Saved a copy (someone else had changed the file)",
  "file.rename": "Renamed",
  "file.move": "Moved",
  "file.delete": "Deleted",
  "file.restore": "Restored",
  "file.purge": "Permanently deleted",
  "file.download": "Downloaded",
  "folder.create": "Created",
  "teamfolder.create": "Created",
  "teamfolder.rename": "Renamed",
  "teamfolder.delete": "Deleted",
  "teamfolder.restore": "Restored",
  "teamfolder.purge": "Permanently deleted",
  "grant.set": "Shared",
  "grant.remove": "Stopped sharing",
};

const CREATE_ACTIONS = ["file.upload", "folder.create", "teamfolder.create", "file.save_conflict_copy"];
// Reads don't count as "last changed by".
const CHANGE_ACTIONS = Object.keys(ACTION_LABELS).filter((a) => a !== "file.download" && !a.startsWith("grant."));

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Logs an action by a signed-in user. With `zohoNote`, also comments on the WorkDrive file after the
 * response is sent; a failed comment (e.g. folders, or the permission not yet approved) never fails the action.
 */
export async function record(
  user: CurrentUser,
  action: string,
  resourceId: string | null,
  detail?: Record<string, unknown>,
  zohoNote?: { fileId: string; text?: string },
) {
  await db().insert(auditLog).values({ actor: user.email, action, resourceId, detail: detail ?? null });
  if (zohoNote) {
    const text = zohoNote.text ?? ACTION_LABELS[action] ?? action;
    const html = `${escapeHtml(text)} by <b>${escapeHtml(user.name)}</b> (${escapeHtml(user.email)}) via Getmeds Files`;
    after(() =>
      addComment(zohoNote.fileId, html).catch((e) => console.warn(`WorkDrive comment on ${zohoNote.fileId} failed:`, e instanceof Error ? e.message : e)),
    );
  }
}

export type Who = { name: string; at: Date; action: string };

/** For each id: who created it in this app, and who changed it last. Items untouched by the app get nothing. */
export async function activityFor(ids: string[]): Promise<Map<string, { created?: Who; last?: Who }>> {
  const result = new Map<string, { created?: Who; last?: Who }>();
  if (!ids.length) return result;
  const rows = await db()
    .select({ resourceId: auditLog.resourceId, action: auditLog.action, at: auditLog.at, name: sql<string>`coalesce(${users.name}, ${auditLog.actor})` })
    .from(auditLog)
    .leftJoin(users, eq(users.email, auditLog.actor))
    .where(sql`${inArray(auditLog.resourceId, ids)} and ${inArray(auditLog.action, CHANGE_ACTIONS)}`)
    .orderBy(auditLog.id);
  for (const r of rows) {
    const entry = result.get(r.resourceId!) ?? {};
    const who = { name: r.name, at: r.at, action: r.action };
    if (CREATE_ACTIONS.includes(r.action) && !entry.created) entry.created = who;
    entry.last = who;
    result.set(r.resourceId!, entry);
  }
  return result;
}

/** Full history of one item, newest first. */
export async function history(id: string, limit = 30) {
  return db()
    .select({ id: auditLog.id, action: auditLog.action, at: auditLog.at, detail: auditLog.detail, name: sql<string>`coalesce(${users.name}, ${auditLog.actor})` })
    .from(auditLog)
    .leftJoin(users, eq(users.email, auditLog.actor))
    .where(eq(auditLog.resourceId, id))
    .orderBy(desc(auditLog.id))
    .limit(limit);
}
