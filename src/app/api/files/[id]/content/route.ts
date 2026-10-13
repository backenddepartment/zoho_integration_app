import { addedName, displayName } from "@/db";
import { authorize, indexFile } from "@/lib/access";
import { record } from "@/lib/activity";
import { apiUser, handle, HttpError } from "@/lib/auth";
import * as wd from "@/lib/zoho/workdrive";

/**
 * Save edited content of an existing file (edit access); used by the in-browser editors.
 * Body: the raw file bytes. Header `X-Base-Modified`: the file's modifiedMs when it was opened.
 *
 * If WorkDrive's copy changed since then, someone else saved in between: the content is stored
 * as a separate "(copy …)" file instead of overwriting. Otherwise it becomes a new version.
 */
export const PUT = handle(async (request: Request, ctx: RouteContext<"/api/files/[id]/content">) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "edit");
  if (node.kind !== "file") throw new HttpError(400, "Only files have content");

  const base = Number(request.headers.get("x-base-modified"));
  const content = await request.blob();
  if (content.size === 0) throw new HttpError(400, "Empty content");

  const current = await wd.getFile(id);
  if (!current.parentId) throw new HttpError(409, "WorkDrive didn't report the file's folder");

  if (base && current.modifiedMs !== null && current.modifiedMs !== base) {
    const copyName = addedName(conflictName(displayName(current.name), user.name), user.name);
    const copyId = await wd.upload(current.parentId, copyName, content, false);
    await indexFile({ ...(await wd.getFile(copyId)), parentId: current.parentId }, node.rootId);
    await record(user, "file.save_conflict_copy", copyId, { original: id, name: copyName }, { fileId: copyId });
    return Response.json({ conflict: true, id: copyId, name: copyName }, { status: 201 });
  }

  // Same name in the same folder with overwrite on: WorkDrive keeps the old content as a prior version.
  await wd.upload(current.parentId, current.name, content, true);
  const saved = await wd.getFile(id);
  await indexFile(saved, node.rootId);
  await record(user, "file.save", id, { name: saved.name, size: content.size }, { fileId: id });
  return Response.json({ conflict: false, id, modifiedMs: saved.modifiedMs });
});

function conflictName(name: string, who: string): string {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "");
  return `${stem} (copy - ${who.replace(/[\\/:*?"<>|]/g, "")} - ${stamp})${ext}`;
}
