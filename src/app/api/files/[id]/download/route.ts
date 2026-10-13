import { displayName } from "@/db";
import { authorize } from "@/lib/access";
import { record } from "@/lib/activity";
import { apiUser, handle, HttpError } from "@/lib/auth";
import { download } from "@/lib/zoho/workdrive";

const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

// Streams a file from WorkDrive through this server; the browser never sees the Zoho token.
// `?inline=1` asks the browser to display instead of save (PDFs, images, and later the editors).
export const GET = handle(async (request: Request, ctx: RouteContext<"/api/files/[id]/download">) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "view");
  if (node.kind !== "file") throw new HttpError(400, "Folders can't be downloaded");

  const version = new URL(request.url).searchParams.get("version") ?? undefined;
  const upstream = await download(id, version);
  const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "application/octet-stream";
  // Only types that can't run script on this origin may open inline (no HTML, no SVG).
  const inline = new URL(request.url).searchParams.get("inline") === "1" && INLINE_TYPES.has(contentType);
  await record(user, "file.download", id, { name: node.name, version });

  // Save under the name people see, without the "(Added by …)" tag.
  const shown = displayName(node.name);
  const filename = node.extn && !shown.toLowerCase().endsWith(`.${node.extn.toLowerCase()}`) ? `${shown}.${node.extn}` : shown;
  return new Response(upstream.body, {
    headers: {
      "Content-Type": inline ? contentType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
