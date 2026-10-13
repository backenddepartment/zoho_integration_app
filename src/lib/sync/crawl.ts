import "server-only";
import { and, eq, gt, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db, syncRuns, wdItems, wdRoots, zohoConnection } from "@/db";
import { CONNECTION_ID } from "@/lib/zoho/oauth";
import { listChildren, listRoots, type WdFile, type WdRoot } from "@/lib/zoho/workdrive";

// Folders listed at once. WorkDrive has no published rate limit; keep this modest.
const CONCURRENCY = 4;
// A "running" sync older than this is assumed dead (server restarted mid-crawl).
const STALE_RUN_MS = 2 * 60 * 60 * 1000;

/** Starts a sync run row, or returns null if one is already running. */
export async function startSyncRun(): Promise<number | null> {
  const running = await db()
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(and(eq(syncRuns.status, "running"), gt(syncRuns.startedAt, new Date(Date.now() - STALE_RUN_MS))));
  if (running.length) return null;
  const [run] = await db().insert(syncRuns).values({ status: "running" }).returning({ id: syncRuns.id });
  return run.id;
}

/**
 * Index every team folder and My Folders the connected account can see into wd_items.
 * Items not seen in a root's successful crawl are removed from the index afterwards.
 */
export async function crawl(runId: number): Promise<void> {
  const counts = { roots: 0, folders: 0, files: 0 };
  const failedRoots: string[] = [];
  try {
    const [conn] = await db().select({ zuid: zohoConnection.zuid }).from(zohoConnection).where(eq(zohoConnection.id, CONNECTION_ID));
    if (!conn) throw new Error("Zoho is not connected");

    const roots = await listRoots(conn.zuid);
    for (const root of roots) {
      await db()
        .insert(wdRoots)
        .values({ ...root })
        .onConflictDoUpdate({ target: wdRoots.id, set: { name: root.name, kind: root.kind, teamId: root.teamId, teamName: root.teamName } });
    }

    for (const root of roots) {
      try {
        await crawlRoot(root, runId, counts);
        // Whole root walked without error: anything not touched this run is gone from WorkDrive.
        await db().delete(wdItems).where(and(eq(wdItems.rootId, root.id), ne(wdItems.lastSyncRunId, runId)));
        await db().update(wdRoots).set({ lastSyncRunId: runId, syncedAt: new Date() }).where(eq(wdRoots.id, root.id));
        counts.roots++;
      } catch (e) {
        failedRoots.push(`${root.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Roots the account can no longer see (left team folder, deleted) drop out of the index.
    const seen = roots.map((r) => r.id);
    if (seen.length) {
      const gone = await db().select({ id: wdRoots.id }).from(wdRoots).where(notInArray(wdRoots.id, seen));
      if (gone.length) {
        const ids = gone.map((g) => g.id);
        await db().delete(wdItems).where(inArray(wdItems.rootId, ids));
        await db().delete(wdRoots).where(inArray(wdRoots.id, ids));
      }
    }

    await finish(runId, failedRoots.length ? "failed" : "succeeded", counts, failedRoots.join("\n") || null);
  } catch (e) {
    await finish(runId, "failed", counts, e instanceof Error ? e.message : String(e));
  }
}

async function crawlRoot(root: WdRoot, runId: number, counts: { folders: number; files: number }) {
  const queue: { id: string; isRoot: boolean }[] = [{ id: root.id, isRoot: true }];

  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      for await (const page of listChildren(root, job.id, job.isRoot)) {
        await upsert(root.id, job.id, page, runId);
        for (const item of page) {
          if (item.isFolder) {
            counts.folders++;
            queue.push({ id: item.id, isRoot: false });
          } else {
            counts.files++;
          }
        }
      }
    }
  };

  // Workers exit when the queue is momentarily empty, so keep relaunching until it stays empty.
  while (queue.length) {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  }
}

async function upsert(rootId: string, parentId: string, items: WdFile[], runId: number) {
  const rows = items.map((f) => ({
    id: f.id,
    rootId,
    parentId: f.parentId ?? parentId,
    name: f.name,
    isFolder: f.isFolder,
    extn: f.extn,
    category: f.category,
    sizeBytes: f.sizeBytes,
    createdMs: f.createdMs,
    modifiedMs: f.modifiedMs,
    modifiedBy: f.modifiedBy,
    status: f.status,
    permalink: f.permalink,
    lastSyncRunId: runId,
    syncedAt: new Date(),
  }));
  const excluded = (col: string) => sql.raw(`excluded.${col}`);
  await db()
    .insert(wdItems)
    .values(rows)
    .onConflictDoUpdate({
      target: wdItems.id,
      set: {
        rootId: excluded("root_id"),
        parentId: excluded("parent_id"),
        name: excluded("name"),
        isFolder: excluded("is_folder"),
        extn: excluded("extn"),
        category: excluded("category"),
        sizeBytes: excluded("size_bytes"),
        createdMs: excluded("created_ms"),
        modifiedMs: excluded("modified_ms"),
        modifiedBy: excluded("modified_by"),
        status: excluded("status"),
        permalink: excluded("permalink"),
        lastSyncRunId: excluded("last_sync_run_id"),
        syncedAt: excluded("synced_at"),
      },
    });
}

async function finish(runId: number, status: "succeeded" | "failed", counts: { roots: number; folders: number; files: number }, error: string | null) {
  await db()
    .update(syncRuns)
    .set({ status, finishedAt: new Date(), rootsSeen: counts.roots, foldersSeen: counts.folders, filesSeen: counts.files, error })
    .where(eq(syncRuns.id, runId));
}
