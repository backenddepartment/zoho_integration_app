import { authorize } from "@/lib/access";
import { apiUser, handle } from "@/lib/auth";
import { refreshFile, refreshFolder } from "@/lib/sync/live";

/** Re-reads this file or folder from WorkDrive (view access); answers whether anything changed. */
export const POST = handle(async (request: Request, ctx: RouteContext<"/api/files/[id]/sync">) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "view");
  const result = node.kind === "file" ? await refreshFile(node) : await refreshFolder(node);
  return Response.json(result);
});
