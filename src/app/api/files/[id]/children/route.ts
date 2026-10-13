import { z } from "zod";
import { addedName } from "@/db";
import { authorize, indexFile } from "@/lib/access";
import { record } from "@/lib/activity";
import { apiUser, handle, HttpError } from "@/lib/auth";
import * as wd from "@/lib/zoho/workdrive";

const body = z.object({ name: z.string().trim().min(1).max(200) });

/** Create a folder inside this folder (edit access). */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/files/[id]/children">) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Folder name is required (max 200 characters)");
  if (/[\\/:*?"<>|]/.test(parsed.data.name)) throw new HttpError(400, 'Names can\'t contain \\ / : * ? " < > |');

  const { node } = await authorize(user, id, "edit");
  if (node.kind === "file") throw new HttpError(400, "Folders can only be created inside folders");

  const folder = await wd.createFolder(id, addedName(parsed.data.name, user));
  await indexFile({ ...folder, parentId: id }, node.rootId);
  await record(user, "folder.create", folder.id, { name: folder.name, parentId: id }, { fileId: folder.id });
  return Response.json({ id: folder.id }, { status: 201 });
});
