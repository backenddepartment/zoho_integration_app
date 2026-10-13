import { authorize } from "@/lib/access";
import { record } from "@/lib/activity";
import { apiUser, handle } from "@/lib/auth";
import { restoreDeleted } from "@/lib/deletion";

/** Admins only: undo a delete by removing the "(Deleted)" mark. */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/files/[id]/restore">) => {
  const user = await apiUser(request, { admin: true });
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "manage");
  const name = await restoreDeleted(node);
  await record(user, node.kind === "root" ? "teamfolder.restore" : "file.restore", id, { from: node.name, to: name }, node.kind === "root" ? undefined : { fileId: id });
  return Response.json({ ok: true, name });
});
