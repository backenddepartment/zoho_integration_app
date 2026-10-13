import { eq } from "drizzle-orm";
import { db, wdItems } from "@/db";
import { adminGuard } from "@/lib/admin-session";
import { audit } from "@/lib/audit";
import { download } from "@/lib/zoho/workdrive";

// Streams a file from WorkDrive through this server; the browser never sees the Zoho token.
// Only indexed files are served, so ids outside the crawled folders are refused.
export async function GET(_request: Request, ctx: RouteContext<"/api/files/[id]/download">) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { id } = await ctx.params;
  const [item] = await db().select().from(wdItems).where(eq(wdItems.id, id));
  if (!item || item.isFolder) return Response.json({ error: "Not found" }, { status: 404 });

  const upstream = await download(id);
  await audit("admin", "file.download", id, { name: item.name });

  const filename = item.extn && !item.name.toLowerCase().endsWith(`.${item.extn.toLowerCase()}`) ? `${item.name}.${item.extn}` : item.name;
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
      "Cache-Control": "private, no-store",
    },
  });
}
