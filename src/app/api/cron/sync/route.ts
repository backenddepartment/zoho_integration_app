import { audit } from "@/lib/audit";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { crawl, startSyncRun } from "@/lib/sync/crawl";

// Same ceiling as the manual scan: 300 s is the most Vercel's Hobby plan allows.
export const maxDuration = 300;

/**
 * Scheduled WorkDrive scan, called by Vercel Cron (see vercel.json) at 6:00 AM and 3:00 PM
 * Philippine time. Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startSyncRun();
  if (runId === null) return Response.json({ skipped: "A sync is already running" });

  await audit("cron", "sync.start", null, { runId });
  await crawl(runId);
  return Response.json({ runId });
}
