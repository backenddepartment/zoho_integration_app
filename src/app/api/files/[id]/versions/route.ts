import { authorize } from "@/lib/access";
import { apiUser, handle, HttpError } from "@/lib/auth";
import * as wd from "@/lib/zoho/workdrive";

/** Version history of a file (view access). */
export const GET = handle(async (request: Request, ctx: RouteContext<"/api/files/[id]/versions">) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "view");
  if (node.kind !== "file") throw new HttpError(400, "Only files have versions");
  return Response.json({ versions: await wd.listVersions(id) });
});
