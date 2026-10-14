import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { auditLog, db, syncRuns, zohoConnection } from "@/db";
import { Pager } from "@/components/pager";
import { fmtTime } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { CONNECTION_ID, ZOHO_SCOPES } from "@/lib/zoho/oauth";
import { SyncButton } from "./sync-button";

export const metadata = { title: "WorkDrive" };
// The page reads the signed-in user, so it can't be instant; loading.tsx beside it shows
// the loading page meanwhile.
export const instant = false;

const ACTIVITY_PAGE = 15;

const ZOHO_MESSAGES: Record<string, string> = {
  connected: "WorkDrive connected.",
  state_mismatch: "Connection expired or was tampered with. Try again.",
  wrong_data_center: "That Zoho account is not on zoho.com (US).",
  connect_failed: "Connecting failed. Check the server log.",
  access_denied: "Approval was declined in Zoho.",
};

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return <Content searchParams={searchParams} />;
}

async function Content({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const zohoStatus = typeof params.zoho === "string" ? params.zoho : null;

  const [conn] = await db().select().from(zohoConnection).where(eq(zohoConnection.id, CONNECTION_ID));
  const [lastRun] = await db().select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(1);
  // Recent activity, ACTIVITY_PAGE rows at a time; ?page=n picks the page.
  const [{ total }] = await db().select({ total: count() }).from(auditLog);
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1));
  const activity = await db()
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.id))
    .limit(ACTIVITY_PAGE)
    .offset((page - 1) * ACTIVITY_PAGE);
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    if (zohoStatus) q.set("zoho", zohoStatus);
    if (n > 1) q.set("page", String(n));
    const s = q.toString();
    return `/admin${s ? `?${s}` : ""}#activity`;
  };

  const runTag =
    lastRun?.status === "succeeded" ? "tag-good" : lastRun?.status === "running" ? "tag-info" : lastRun?.status === "failed" ? "tag-bad" : "tag-mute";

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header>
          <p className="eyebrow">Administration</p>
          <h1 className="page-title">WorkDrive</h1>
          <p className="page-lead">The Zoho account this app works through, and the index of team folders and files it shows.</p>
        </header>

        {zohoStatus && (
          <div className={`alert ${zohoStatus === "connected" ? "alert-info" : "alert-bad"}`} role="status">
            <div>{ZOHO_MESSAGES[zohoStatus] ?? `Zoho: ${zohoStatus}`}</div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="board flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">Zoho connection</h2>
              {conn ? (
                <span className="tag tag-good">
                  <span className="dot" />
                  Connected
                </span>
              ) : (
                <span className="tag tag-bad">
                  <span className="dot" />
                  Not connected
                </span>
              )}
            </div>
            {conn ? (
              <>
                <p className="m-0 text-sm text-[var(--ink-2)]">Every change made in this app shows in WorkDrive as this account.</p>
                <div className="facts">
                  <div>
                    <small>Account</small>
                    <b>{conn.displayName ?? conn.zuid}</b>
                  </div>
                  {conn.email && (
                    <div>
                      <small>Email</small>
                      <b className="break-all">{conn.email}</b>
                    </div>
                  )}
                  <div>
                    <small>Since</small>
                    <b>{fmtTime(conn.connectedAt)}</b>
                  </div>
                </div>
                {conn.scopes !== ZOHO_SCOPES && (
                  <div className="alert alert-warn">
                    <div>
                      <b>Reconnect needed</b>
                      The app now needs extra Zoho permissions (creating, renaming and deleting team folders). Click Reconnect Zoho and approve as{" "}
                      {conn.email ?? "the connected account"}.
                    </div>
                  </div>
                )}
                {conn.lastRefreshError && (
                  <div className="alert alert-bad">
                    <div>
                      <b>Token problem ({fmtTime(conn.lastRefreshErrorAt)})</b>
                      {conn.lastRefreshError}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="m-0 text-sm text-[var(--ink-2)]">The account owner signs in to Zoho and approves this app once.</p>
            )}
            <div className="mt-auto">
              <a href="/api/zoho/connect" className={`btn btn-sm ${conn ? "btn-secondary" : "btn-primary"}`}>
                {conn ? "Reconnect Zoho" : "Connect Zoho WorkDrive"}
              </a>
            </div>
          </section>

          <section className="board flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="section-title">Index</h2>
              <span className={`tag ${runTag}`}>
                <span className="dot" />
                {lastRun ? lastRun.status.charAt(0).toUpperCase() + lastRun.status.slice(1) : "No scan yet"}
              </span>
            </div>
            {lastRun ? (
              <div className="facts">
                <div>
                  <small>Last scan</small>
                  <b>#{lastRun.id}</b>
                </div>
                <div>
                  <small>Started</small>
                  <b>{fmtTime(lastRun.startedAt)}</b>
                </div>
                <div>
                  <small>Finished</small>
                  <b>{lastRun.finishedAt ? fmtTime(lastRun.finishedAt) : "—"}</b>
                </div>
                <div>
                  <small>Found</small>
                  <b>
                    {lastRun.rootsSeen} roots · {lastRun.foldersSeen} folders · {lastRun.filesSeen} files
                  </b>
                </div>
              </div>
            ) : (
              <p className="m-0 text-sm text-[var(--ink-2)]">Scan WorkDrive to list its team folders and files here.</p>
            )}
            {lastRun?.error && (
              <div className="alert alert-bad">
                <pre className="m-0 font-[inherit] whitespace-pre-wrap">{lastRun.error}</pre>
              </div>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <SyncButton disabled={!conn || lastRun?.status === "running"} />
              <Link href="/files" className="btn btn-secondary btn-sm">
                Browse files
              </Link>
            </div>
          </section>
        </div>

        <section className="flex scroll-mt-6 flex-col gap-3" id="activity">
          <div className="flex items-baseline gap-3">
            <h2 className="section-title">Recent activity</h2>
            <span className="tag tag-mute">{total}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="whitespace-nowrap">{fmtTime(a.at)}</td>
                    <td>{a.actor}</td>
                    <td>
                      <span className="code-chip whitespace-nowrap">{a.action}</span>
                    </td>
                    {/* The cell must stay a table cell: `.sub` makes things display: block, so it goes on an inner span. */}
                    <td>
                      <span className="sub break-words">{describeDetail(a.detail)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activity.length === 0 ? <p className="empty-state m-0">Nothing yet.</p> : <Pager page={page} perPage={ACTIVITY_PAGE} total={total} href={pageHref} />}
          </div>
        </section>
      </main>
    </>
  );
}

/** An audit entry's details as "key: value" pairs, e.g. "item: Admin Department · level: Folder admin". */
function describeDetail(detail: unknown): string {
  if (detail === null || detail === undefined) return "";
  if (typeof detail !== "object") return String(detail);
  return Object.entries(detail as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}
