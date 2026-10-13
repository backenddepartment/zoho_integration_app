import { after } from "next/server";
import { audit } from "@/lib/audit";
import { apiUser, handle } from "@/lib/auth";
import { crawl, startSyncRun } from "@/lib/sync/crawl";

// Crawls can take minutes on a large drive; allow the post-response work to finish
// where the host enforces a duration limit.
export const maxDuration = 800;

export const POST = handle(async (request: Request) => {
  const user = await apiUser(request, { admin: true });
  const runId = await startSyncRun();
  if (runId === null) return Response.json({ error: "A sync is already running" }, { status: 409 });

  await audit(user.email, "sync.start", null, { runId });
  after(() => crawl(runId));
  return Response.json({ runId }, { status: 202 });
});
