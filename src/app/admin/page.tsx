import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { auditLog, db, syncRuns, zohoConnection } from "@/db";
import { AppShell } from "@/components/app-shell";
import { fmtTime, Loading } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { CONNECTION_ID, ZOHO_SCOPES } from "@/lib/zoho/oauth";
import { SyncButton } from "./sync-button";

export const metadata = { title: "WorkDrive" };

const ZOHO_MESSAGES: Record<string, string> = {
  connected: "WorkDrive connected.",
  state_mismatch: "Connection expired or was tampered with. Try again.",
  wrong_data_center: "That Zoho account is not on zoho.com (US).",
  connect_failed: "Connecting failed. Check the server log.",
  access_denied: "Approval was declined in Zoho.",
};

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const me = await requireAdmin();
  const params = await searchParams;
  const zohoStatus = typeof params.zoho === "string" ? params.zoho : null;

  const [conn] = await db().select().from(zohoConnection).where(eq(zohoConnection.id, CONNECTION_ID));
  const [lastRun] = await db().select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(1);
  const activity = await db().select().from(auditLog).orderBy(desc(auditLog.id)).limit(50);

  return (
    <AppShell user={me}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
        <h1 className="text-2xl font-semibold">WorkDrive</h1>

        {zohoStatus && (
          <p className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">{ZOHO_MESSAGES[zohoStatus] ?? `Zoho: ${zohoStatus}`}</p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Zoho connection</h2>
          {conn ? (
            <>
              <p className="text-sm">
                Connected as <b>{conn.displayName ?? conn.zuid}</b> {conn.email && `(${conn.email})`} since {fmtTime(conn.connectedAt)}. Every change made in this app
                shows in WorkDrive as this account.
              </p>
              {conn.scopes !== ZOHO_SCOPES && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  The app now needs extra Zoho permissions (creating, renaming and deleting team folders). Click Reconnect Zoho and approve as {conn.email ?? "the connected account"}.
                </p>
              )}
              {conn.lastRefreshError && (
                <p className="text-sm text-red-600">
                  Token problem ({fmtTime(conn.lastRefreshErrorAt)}): {conn.lastRefreshError}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm">Not connected. The account owner signs in to Zoho and approves this app once.</p>
          )}
          <a href="/api/zoho/connect" className="w-fit rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            {conn ? "Reconnect Zoho" : "Connect Zoho WorkDrive"}
          </a>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Index</h2>
          {lastRun ? (
            <p className="text-sm">
              Last scan #{lastRun.id}: <b>{lastRun.status}</b>, started {fmtTime(lastRun.startedAt)}
              {lastRun.finishedAt && `, finished ${fmtTime(lastRun.finishedAt)}`}. {lastRun.rootsSeen} roots, {lastRun.foldersSeen} folders, {lastRun.filesSeen}{" "}
              files.
            </p>
          ) : (
            <p className="text-sm">No scan yet.</p>
          )}
          {lastRun?.error && <pre className="text-sm whitespace-pre-wrap text-red-600">{lastRun.error}</pre>}
          <SyncButton disabled={!conn || lastRun?.status === "running"} />
          <Link href="/files" className="w-fit text-sm underline">
            Browse files
          </Link>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Recent activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-4 font-normal">When</th>
                  <th className="py-1 pr-4 font-normal">Who</th>
                  <th className="py-1 pr-4 font-normal">What</th>
                  <th className="py-1 font-normal">Details</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="py-1 pr-4 whitespace-nowrap">{fmtTime(a.at)}</td>
                    <td className="py-1 pr-4">{a.actor}</td>
                    <td className="py-1 pr-4">{a.action}</td>
                    <td className="py-1 break-all text-zinc-500">{a.detail ? JSON.stringify(a.detail) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
