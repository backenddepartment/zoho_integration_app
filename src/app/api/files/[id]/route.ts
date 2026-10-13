import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { addedTag, db, displayName, isAdminRole, isDeletedName, stripAdded, wdItems, wdRoots } from "@/db";
import { authorize, getNode, indexFile, LEVEL_NAMES, reRootSubtree } from "@/lib/access";
import { purge, softDelete } from "@/lib/deletion";
import { record } from "@/lib/activity";
import { apiUser, handle, HttpError } from "@/lib/auth";
import * as wd from "@/lib/zoho/workdrive";

type Ctx = RouteContext<"/api/files/[id]">;

/** A node and, for folders, its children. */
export const GET = handle(async (request: Request, ctx: Ctx) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node, level } = await authorize(user, id, "view");
  const children =
    node.kind === "file"
      ? []
      : await db().select().from(wdItems).where(eq(wdItems.parentId, id)).orderBy(desc(wdItems.isFolder), asc(wdItems.name));
  // Deleted items are hidden from every listing; admins reach them through the Deleted items page.
  const visible = children.filter((c) => !isDeletedName(c.name));
  return Response.json({
    node,
    access: LEVEL_NAMES[level],
    children: visible.map((c) => ({ id: c.id, name: c.name, isFolder: c.isFolder, extn: c.extn, sizeBytes: c.sizeBytes, modifiedMs: c.modifiedMs })),
  });
});

const patchBody = z.union([z.object({ name: z.string().trim().min(1).max(200) }), z.object({ parentId: z.string().min(1) })]);

/** Rename (edit access) or move (manage on the item, edit on the destination). */
export const PATCH = handle(async (request: Request, ctx: Ctx) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Send { name } to rename or { parentId } to move");
  const body = parsed.data;

  if ("name" in body) {
    const { node } = await authorize(user, id, "edit");
    if (/[\\/:*?"<>|]/.test(body.name)) throw new HttpError(400, 'Names can\'t contain \\ / : * ? " < > |');
    if (node.kind === "root") {
      if (user.role !== "admin" || node.rootKind !== "teamfolder") throw new HttpError(403, "Only admins can rename team folders");
      await wd.renameTeamFolder(id, body.name);
      await db().update(wdRoots).set({ name: body.name }).where(eq(wdRoots.id, id));
      await record(user, "teamfolder.rename", id, { from: node.name, to: body.name });
      return Response.json({ ok: true });
    }
    // People rename the name they see; the "(Added by …)" credit in WorkDrive stays.
    const newName = addedTag(node.name) + stripAdded(body.name);
    const updated = await wd.rename(id, newName);
    await indexFile(updated, node.rootId);
    await record(user, "file.rename", id, { from: displayName(node.name), to: displayName(newName) }, { fileId: id, text: `Renamed from "${displayName(node.name)}"` });
    return Response.json({ ok: true });
  }

  const { node } = await authorize(user, id, "manage");
  if (node.kind === "root") throw new HttpError(400, "Team folders can't be moved");
  const { node: dest } = await authorize(user, body.parentId, "edit");
  if (dest.kind === "file") throw new HttpError(400, "Destination must be a folder");
  // Refuse moving a folder into itself or below itself.
  for (let n: typeof dest | null = dest; n && n.kind !== "root"; n = n.parentId ? await getNode(n.parentId) : null) {
    if (n.id === id) throw new HttpError(400, "A folder can't be moved inside itself");
  }
  const updated = await wd.move(id, dest.id);
  await indexFile({ ...updated, parentId: dest.id }, dest.rootId);
  if (dest.rootId !== node.rootId) await reRootSubtree(id, dest.rootId);
  await record(user, "file.move", id, { name: node.name, from: node.parentId, to: dest.id }, { fileId: id, text: `Moved to "${dest.name}"` });
  return Response.json({ ok: true });
});

/**
 * Delete. By default this marks the item "(Deleted) name" in WorkDrive (manage access; team folders
 * need an admin). With `?permanent=1`, a superadmin removes it from WorkDrive for good; team folders
 * also need the header `X-Confirm-Name` set to the URI-encoded exact name.
 */
export const DELETE = handle(async (request: Request, ctx: Ctx) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";
  const { node } = await authorize(user, id, "manage");
  if (node.kind === "root" && node.rootKind !== "teamfolder") throw new HttpError(400, "My Folders can't be deleted");

  if (permanent) {
    if (user.role !== "superadmin") throw new HttpError(403, "Only a superadmin can delete permanently");
    if (node.kind === "root" && request.headers.get("x-confirm-name") !== encodeURIComponent(node.name)) {
      throw new HttpError(400, "Type the team folder's exact name to confirm");
    }
    const removed = await purge(node);
    await record(user, node.kind === "root" ? "teamfolder.purge" : "file.purge", id, { name: node.name, itemsInside: removed });
    return Response.json({ ok: true, removed });
  }

  if (node.kind === "root" && !isAdminRole(user.role)) throw new HttpError(403, "Only admins can delete team folders");
  const name = await softDelete(node, user);
  await record(user, node.kind === "root" ? "teamfolder.delete" : "file.delete", id, { from: node.name, to: name }, node.kind === "root" ? undefined : { fileId: id });
  return Response.json({ ok: true, name });
});
