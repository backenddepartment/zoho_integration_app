import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, wdItems, wdRoots, zohoConnection } from "@/db";
import { indexFile, latestRunId, type Node } from "@/lib/access";
import { upsert } from "@/lib/sync/crawl";
import { CONNECTION_ID } from "@/lib/zoho/oauth";
import { getFile, listChildren, listRoots, WorkDriveError, type WdFile } from "@/lib/zoho/workdrive";

// The full scan keeps the whole index; these keep what a user is looking at in step with changes
// made directly in WorkDrive (deleted, renamed, added there). Each refresh is one WorkDrive call,
// skipped if the same thing was refreshed moments ago, and a WorkDrive hiccup never breaks a page:
// it just shows the last known state.

const FOLDER_TTL_MS = 10_000;
const ROOTS_TTL_MS = 60_000;
const lastRefresh = new Map<string, number>();

function due(key: string, ttl: number): boolean {
  const now = Date.now();
  if (now - (lastRefresh.get(key) ?? 0) < ttl) return false;
  lastRefresh.set(key, now);
  return true;
}

const ACTIVE = 1; // WorkDrive status: 1 active, 51 trashed

/** Removes items (and everything under them) from the index. */
async function dropSubtrees(ids: string[]) {
  if (!ids.length) return;
  await db().execute(sql`
    with recursive sub(id) as (
      select id from ${wdItems} where ${inArray(wdItems.id, ids)}
      union all
      select w.id from ${wdItems} w join sub on w.parent_id = sub.id
    )
    delete from ${wdItems} where id in (select id from sub)
  `);
}

export type RefreshResult = { exists: boolean; changed: boolean };
const UNCHANGED: RefreshResult = { exists: true, changed: false };

/** What a listing shows, to tell whether a refresh changed anything. */
async function snapshot(where: ReturnType<typeof eq>): Promise<string> {
  const rows = await db()
    .select({ id: wdItems.id, name: wdItems.name, m: wdItems.modifiedMs, s: wdItems.sizeBytes })
    .from(wdItems)
    .where(where)
    .orderBy(wdItems.id);
  return JSON.stringify(rows);
}

/** Re-reads a folder's direct children from WorkDrive. */
export async function refreshFolder(node: Node): Promise<RefreshResult> {
  if (node.kind === "file" || !due(`folder:${node.id}`, FOLDER_TTL_MS)) return UNCHANGED;
  const before = await snapshot(eq(wdItems.parentId, node.id));
  try {
    const seen: WdFile[] = [];
    const isRoot = node.kind === "root";
    for await (const page of listChildren({ kind: node.rootKind ?? "teamfolder" }, node.id, isRoot)) seen.push(...page);
    const active = seen.filter((f) => f.status === ACTIVE);

    if (active.length) await upsert(node.rootId, node.id, active, await latestRunId());
    const keep = active.map((f) => f.id);
    const stale = await db()
      .select({ id: wdItems.id })
      .from(wdItems)
      .where(keep.length ? and(eq(wdItems.parentId, node.id), notInArray(wdItems.id, keep)) : eq(wdItems.parentId, node.id));
    await dropSubtrees(stale.map((s) => s.id));
    return { exists: true, changed: (await snapshot(eq(wdItems.parentId, node.id))) !== before };
  } catch (e) {
    if (e instanceof WorkDriveError && e.status === 404) {
      if (!isRootNode(node)) await dropSubtrees([node.id]);
      return { exists: false, changed: true };
    }
    lastRefresh.delete(`folder:${node.id}`);
    console.warn(`Live refresh of folder ${node.id} failed; showing indexed state:`, e instanceof Error ? e.message : e);
    return UNCHANGED;
  }
}

const isRootNode = (node: Node) => node.kind === "root";

/** Re-reads one file's details from WorkDrive. */
export async function refreshFile(node: Node): Promise<RefreshResult> {
  if (node.kind !== "file" || !due(`file:${node.id}`, FOLDER_TTL_MS)) return UNCHANGED;
  const before = await snapshot(eq(wdItems.id, node.id));
  try {
    const file = await getFile(node.id);
    if (file.status !== ACTIVE) {
      await dropSubtrees([node.id]);
      return { exists: false, changed: true };
    }
    await indexFile({ ...file, parentId: file.parentId ?? node.parentId }, node.rootId);
    return { exists: true, changed: (await snapshot(eq(wdItems.id, node.id))) !== before };
  } catch (e) {
    if (e instanceof WorkDriveError && e.status === 404) {
      await dropSubtrees([node.id]);
      return { exists: false, changed: true };
    }
    lastRefresh.delete(`file:${node.id}`);
    console.warn(`Live refresh of file ${node.id} failed; showing indexed state:`, e instanceof Error ? e.message : e);
    return UNCHANGED;
  }
}

/** Re-reads the list of team folders (new, renamed or removed in WorkDrive). Returns whether it changed. */
export async function refreshRoots(): Promise<boolean> {
  if (!due("roots", ROOTS_TTL_MS)) return false;
  const rootsNow = async () => JSON.stringify(await db().select({ id: wdRoots.id, name: wdRoots.name }).from(wdRoots).orderBy(wdRoots.id));
  const before = await rootsNow();
  try {
    const [conn] = await db().select({ zuid: zohoConnection.zuid }).from(zohoConnection).where(eq(zohoConnection.id, CONNECTION_ID));
    if (!conn) return false;
    const roots = await listRoots(conn.zuid);
    for (const root of roots) {
      await db()
        .insert(wdRoots)
        .values({ ...root })
        .onConflictDoUpdate({ target: wdRoots.id, set: { name: root.name, kind: root.kind, teamId: root.teamId, teamName: root.teamName } });
    }
    if (roots.length) {
      const gone = await db().select({ id: wdRoots.id }).from(wdRoots).where(notInArray(wdRoots.id, roots.map((r) => r.id)));
      if (gone.length) {
        const ids = gone.map((g) => g.id);
        await db().delete(wdItems).where(inArray(wdItems.rootId, ids));
        await db().delete(wdRoots).where(inArray(wdRoots.id, ids));
      }
    }
    return (await rootsNow()) !== before;
  } catch (e) {
    lastRefresh.delete("roots");
    console.warn("Live refresh of team folders failed; showing indexed state:", e instanceof Error ? e.message : e);
    return false;
  }
}
