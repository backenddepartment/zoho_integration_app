import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, deletedName, grants, isDeletedName, stripDeleted, wdItems, wdRoots } from "@/db";
import { indexFile, type Node } from "@/lib/access";
import { HttpError } from "@/lib/auth";
import * as wd from "@/lib/zoho/workdrive";

// "Delete" in this app renames the item in WorkDrive to "(Deleted by <name>) name": nothing is lost,
// anyone in WorkDrive can see what was deleted and by whom, and it disappears from the app's screens.
// Admins restore it from the Deleted items page.
// Only superadmins can delete for real (purge).

async function renameNode(node: Node, name: string) {
  if (node.kind === "root") {
    await wd.renameTeamFolder(node.id, name);
    await db().update(wdRoots).set({ name }).where(eq(wdRoots.id, node.id));
  } else {
    const updated = await wd.rename(node.id, name);
    await indexFile({ ...updated, parentId: updated.parentId ?? node.parentId }, node.rootId);
  }
}

const isNameClash = (e: unknown) => e instanceof wd.WorkDriveError && e.status >= 400 && e.status < 500 && ![401, 403, 404].includes(e.status);

/** Marks a node "(Deleted by <name>)". Returns the new name. */
export async function softDelete(node: Node, byName: string): Promise<string> {
  if (isDeletedName(node.name)) throw new HttpError(409, "Already deleted");
  const plain = deletedName(node.name, byName);
  try {
    await renameNode(node, plain);
    return plain;
  } catch (e) {
    if (!isNameClash(e)) throw e;
    // "(Deleted) name" is taken by an earlier deletion: date this one instead.
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "");
    const dated = deletedName(node.name, byName, stamp);
    await renameNode(node, dated);
    return dated;
  }
}

/** Removes the "(Deleted)" mark. Returns the restored name. */
export async function restoreDeleted(node: Node): Promise<string> {
  if (!isDeletedName(node.name)) throw new HttpError(409, "This item isn't deleted");
  const name = stripDeleted(node.name);
  try {
    await renameNode(node, name);
  } catch (e) {
    if (isNameClash(e)) throw new HttpError(409, `Something named "${name}" already exists here. Rename that first, then restore.`);
    throw e;
  }
  return name;
}

/** Superadmin purge: removes the node in WorkDrive and every trace of it from the index and sharing. */
export async function purge(node: Node): Promise<number> {
  const inside =
    node.kind === "root"
      ? await db().select({ id: wdItems.id }).from(wdItems).where(eq(wdItems.rootId, node.id))
      : (
          await db().execute<{ id: string }>(sql`
            with recursive sub(id) as (
              select id from ${wdItems} where id = ${node.id}
              union all
              select w.id from ${wdItems} w join sub on w.parent_id = sub.id
            )
            select id from sub`)
        ).rows;

  if (node.kind === "root") await wd.deleteTeamFolder(node.id);
  else await wd.permanentlyDelete(node.id);

  const ids = [...new Set([node.id, ...inside.map((i) => i.id)])];
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    await db().delete(grants).where(inArray(grants.resourceId, chunk));
    await db().delete(wdItems).where(inArray(wdItems.id, chunk));
  }
  if (node.kind === "root") await db().delete(wdRoots).where(eq(wdRoots.id, node.id));
  return ids.length - 1;
}
