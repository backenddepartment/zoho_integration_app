import { eq } from "drizzle-orm";
import { addedName, db, displayName, isDeletedName, wdItems } from "@/db";
import { authorize, indexFile } from "@/lib/access";
import { record } from "@/lib/activity";
import { apiUser, handle, HttpError } from "@/lib/auth";
import * as wd from "@/lib/zoho/workdrive";

const MAX_BYTES = 250 * 1024 * 1024; // WorkDrive's limit for this upload endpoint

/**
 * Upload a file into this folder (edit access). Multipart fields: `file`, and `onConflict` =
 * "version" (same name becomes a new version of the existing file) or "copy" (keep both).
 * Without `onConflict`, a name clash answers 409 so the user can choose.
 */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/files/[id]/upload">) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "edit");
  if (node.kind === "file") throw new HttpError(400, "Upload into a folder");

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a file to upload");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Files over 250 MB aren't supported yet");
  const onConflict = form.get("onConflict");

  // Same name as people see it, ignoring "(Added by …)" tags; deleted items don't count.
  const siblings = await db().select({ id: wdItems.id, name: wdItems.name, isFolder: wdItems.isFolder }).from(wdItems).where(eq(wdItems.parentId, id));
  const existing = siblings.find((s) => !isDeletedName(s.name) && displayName(s.name) === file.name);
  if (existing && onConflict !== "version" && onConflict !== "copy") {
    return Response.json({ error: "A file with this name already exists", conflict: true }, { status: 409 });
  }
  if (existing?.isFolder && onConflict === "version") throw new HttpError(409, "A folder already has this name");

  // A new version must use the existing file's exact WorkDrive name so it stacks as a version;
  // anything new is named after the person adding it.
  const asVersion = Boolean(existing) && onConflict === "version";
  const resourceId = await wd.upload(id, asVersion ? existing!.name : addedName(file.name, user.name), file, asVersion);
  const stored = await wd.getFile(resourceId);
  await indexFile({ ...stored, parentId: id }, node.rootId);
  await record(user, asVersion ? "file.new_version" : "file.upload", resourceId, { name: stored.name, parentId: id, size: file.size }, { fileId: resourceId });
  return Response.json({ id: resourceId, name: stored.name, newVersion: asVersion }, { status: 201 });
});
