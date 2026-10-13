import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, grants, isAdminRole, isDeletedName, LEVELS, syncRuns, wdItems, wdRoots, type LevelName } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { HttpError } from "@/lib/auth";
import type { WdFile } from "@/lib/zoho/workdrive";

/** A team folder / My Folders root, or an indexed folder or file. */
export type Node = {
  id: string;
  kind: "root" | "folder" | "file";
  name: string;
  rootId: string;
  parentId: string | null;
  extn: string | null;
  sizeBytes: number | null;
  modifiedMs: number | null;
  /** Only on roots: a team folder, or the account's My Folders. */
  rootKind?: "teamfolder" | "myfolder";
};

export const LEVEL_NAMES: Record<number, LevelName> = { 1: "view", 2: "edit", 3: "manage", 4: "share" };

// External accounts can never delete, move or share, whatever they are granted.
export const ROLE_CAP: Record<CurrentUser["role"], number> = { superadmin: LEVELS.share, admin: LEVELS.share, staff: LEVELS.share, external: LEVELS.edit };

export async function getNode(id: string): Promise<Node | null> {
  const [root] = await db().select().from(wdRoots).where(eq(wdRoots.id, id));
  if (root) return { id: root.id, kind: "root", name: root.name, rootId: root.id, parentId: null, extn: null, sizeBytes: null, modifiedMs: null, rootKind: root.kind };
  const [item] = await db().select().from(wdItems).where(eq(wdItems.id, id));
  if (!item) return null;
  return {
    id: item.id,
    kind: item.isFolder ? "folder" : "file",
    name: item.name,
    rootId: item.rootId,
    parentId: item.parentId,
    extn: item.extn,
    sizeBytes: item.sizeBytes,
    modifiedMs: item.modifiedMs,
  };
}

/** The item, every folder above it, and its root, with names. */
export async function lineage(id: string): Promise<{ id: string; name: string | null }[]> {
  const result = await db().execute<{ id: string; name: string | null }>(sql`
    with recursive anc(id, parent_id, root_id, name) as (
      select id, parent_id, root_id, name from ${wdItems} where id = ${id}
      union all
      select w.id, w.parent_id, w.root_id, w.name from ${wdItems} w join anc on w.id = anc.parent_id
    )
    select id, name from anc
    union select r.id, r.name from ${wdRoots} r where r.id in (select root_id from anc) or r.id = ${id}
    union select parent_id, null from anc where parent_id is not null
    union select ${id}, null
  `);
  return result.rows;
}

/**
 * The user's level on a node: 0 = no access. Admins manage everything. For everyone else,
 * anything marked "(Deleted)", or inside something that is, no longer exists.
 */
export async function effectiveLevel(user: CurrentUser, id: string): Promise<number> {
  if (isAdminRole(user.role)) return LEVELS.share;
  const chain = await lineage(id);
  if (chain.some((c) => c.name && isDeletedName(c.name))) return 0;
  const ids = [...new Set(chain.map((c) => c.id))];
  const [row] = await db()
    .select({ level: sql<number>`coalesce(max(${grants.level}), 0)::int` })
    .from(grants)
    .where(sql`${grants.userId} = ${user.id} and ${inArray(grants.resourceId, ids)}`);
  return Math.min(row?.level ?? 0, ROLE_CAP[user.role]);
}

/** Loads a node and checks the user has at least `need` on it; 404 hides things the user can't see. */
export async function authorize(user: CurrentUser, id: string, need: LevelName): Promise<{ node: Node; level: number }> {
  const node = await getNode(id);
  const level = node ? await effectiveLevel(user, id) : 0;
  if (!node || level === 0) throw new HttpError(404, "Not found");
  if (level < LEVELS[need]) throw new HttpError(403, `You need ${need} access for this`);
  return { node, level };
}

/** Where a user's browsing starts: every root for admins, otherwise the things granted to them. */
export async function entryPoints(user: CurrentUser): Promise<(Node & { level: number })[]> {
  if (isAdminRole(user.role)) {
    const roots = (await db().select().from(wdRoots).orderBy(wdRoots.kind, wdRoots.name)).filter((r) => !isDeletedName(r.name));
    return roots.map((r) => ({ id: r.id, kind: "root", name: r.name, rootId: r.id, parentId: null, extn: null, sizeBytes: null, modifiedMs: null, rootKind: r.kind, level: LEVELS.share }));
  }
  const mine = await db().select().from(grants).where(eq(grants.userId, user.id));
  // effectiveLevel also hides grants on deleted things and folds in higher grants from above.
  const nodes = await Promise.all(mine.map(async (g) => ({ node: await getNode(g.resourceId), level: await effectiveLevel(user, g.resourceId) })));
  return nodes
    .filter((n): n is { node: Node; level: number } => n.node !== null && n.level > 0)
    .map((n) => ({ ...n.node, level: n.level }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Breadcrumb from the highest folder the user may see down to the node. */
export async function breadcrumb(user: CurrentUser, node: Node): Promise<{ id: string; name: string }[]> {
  const chain: { id: string; name: string }[] = [];
  let current: Node | null = node;
  while (current) {
    chain.unshift({ id: current.id, name: current.name });
    current = current.parentId ? await getNode(current.parentId) : current.kind === "root" ? null : await getNode(current.rootId);
    if (current?.id === chain[0].id) break;
  }
  if (isAdminRole(user.role)) return chain;
  const granted = new Set((await db().select({ id: grants.resourceId }).from(grants).where(eq(grants.userId, user.id))).map((g) => g.id));
  const top = chain.findIndex((c) => granted.has(c.id));
  return top === -1 ? chain.slice(-1) : chain.slice(top);
}

// ---------- keeping the index in step with changes made through the app ----------

export async function latestRunId(): Promise<number> {
  const [run] = await db().select({ id: syncRuns.id }).from(syncRuns).orderBy(desc(syncRuns.id)).limit(1);
  return run?.id ?? 0;
}

export async function indexFile(file: WdFile, rootId: string) {
  const row = {
    id: file.id,
    rootId,
    parentId: file.parentId,
    name: file.name,
    isFolder: file.isFolder,
    extn: file.extn,
    category: file.category,
    sizeBytes: file.sizeBytes,
    createdMs: file.createdMs,
    modifiedMs: file.modifiedMs,
    modifiedBy: file.modifiedBy,
    status: file.status,
    permalink: file.permalink,
    lastSyncRunId: await latestRunId(),
    syncedAt: new Date(),
  };
  await db().insert(wdItems).values(row).onConflictDoUpdate({ target: wdItems.id, set: row });
}

/** Drops an item and everything under it from the index (after moving it to the trash). */
export async function unindexSubtree(id: string) {
  await db().execute(sql`
    with recursive sub(id) as (
      select id from ${wdItems} where id = ${id}
      union all
      select w.id from ${wdItems} w join sub on w.parent_id = sub.id
    )
    delete from ${wdItems} where id in (select id from sub)
  `);
}

/** Moves an item's subtree to another root in the index (moving between team folders). */
export async function reRootSubtree(id: string, rootId: string) {
  await db().execute(sql`
    with recursive sub(id) as (
      select id from ${wdItems} where id = ${id}
      union all
      select w.id from ${wdItems} w join sub on w.parent_id = sub.id
    )
    update ${wdItems} set root_id = ${rootId} where id in (select id from sub)
  `);
}
