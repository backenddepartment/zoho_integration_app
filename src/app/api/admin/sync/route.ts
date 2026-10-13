import { after } from "next/server";
import { adminGuard } from "@/lib/admin-session";
import { audit } from "@/lib/audit";
import { crawl, startSyncRun } from "@/lib/sync/crawl";

// Crawls can take minutes on a large drive; allow the post-response work to finish
// where the host enforces a duration limit.
export const maxDuration = 800;

export async function POST() {
  const denied = await adminGuard();
  if (denied) return denied;

  const runId = await startSyncRun();
  if (runId === null) return Response.json({ error: "A sync is already running" }, { status: 409 });

  await audit("admin", "sync.start", null, { runId });
  after(() => crawl(runId));
  return Response.json({ runId }, { status: 202 });
}
