import { asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { db, syncRuns, wdItems, wdRoots, zohoConnection } from "@/db";
import { requireAdminPage } from "@/lib/admin-session";
import { CONNECTION_ID } from "@/lib/zoho/oauth";
import { logout } from "./actions";
import { SyncButton } from "./sync-button";

export const metadata = { title: "Admin" };

const ZOHO_MESSAGES: Record<string, string> = {
  connected: "WorkDrive connected.",
  state_mismatch: "Connection expired or was tampered with. Try again.",
  wrong_data_center: "That Zoho account is not on zoho.com (US).",
  connect_failed: "Connecting failed. Check the server log.",
  access_denied: "Approval was declined in Zoho.",
};

const fmtSize = (n: number | null) =>
  n === null ? "" : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
const fmtTime = (d: Date | number | null) => (d === null ? "—" : new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }));

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="px-4 py-10 text-sm text-zinc-500">Loading…</p>}>
      <AdminContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminContent({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await requireAdminPage();
  const params = await searchParams;
  const folder = typeof params.folder === "string" ? params.folder : null;
  const zohoStatus = typeof params.zoho === "string" ? params.zoho : null;

  const [conn] = await db().select().from(zohoConnection).where(eq(zohoConnection.id, CONNECTION_ID));
  const [lastRun] = await db().select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(1);
  const roots = await db()
    .select({ id: wdRoots.id, name: wdRoots.name, kind: wdRoots.kind, teamName: wdRoots.teamName, syncedAt: wdRoots.syncedAt, count: sql<number>`(select count(*)::int from ${wdItems} where ${wdItems.rootId} = ${wdRoots.id})` })
    .from(wdRoots)
    .orderBy(asc(wdRoots.kind), asc(wdRoots.name));

  const [current] = folder ? await db().select().from(wdItems).where(eq(wdItems.id, folder)) : [];
  const currentRoot = folder ? roots.find((r) => r.id === folder) : undefined;
  const children = folder
    ? await db().select().from(wdItems).where(eq(wdItems.parentId, folder)).orderBy(desc(wdItems.isFolder), asc(wdItems.name))
    : [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">WorkDrive admin</h1>
        <form action={logout}>
          <button className="text-sm text-zinc-600 underline dark:text-zinc-400">Sign out</button>
        </form>
      </header>

      {zohoStatus && (
        <p className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">{ZOHO_MESSAGES[zohoStatus] ?? `Zoho: ${zohoStatus}`}</p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Zoho connection</h2>
        {conn ? (
          <>
            <p className="text-sm">
              Connected as <b>{conn.displayName ?? conn.zuid}</b> {conn.email && `(${conn.email})`} since {fmtTime(conn.connectedAt)}.
            </p>
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
            {lastRun.finishedAt && `, finished ${fmtTime(lastRun.finishedAt)}`} — {lastRun.rootsSeen} roots, {lastRun.foldersSeen} folders, {lastRun.filesSeen} files.
          </p>
        ) : (
          <p className="text-sm">No scan yet.</p>
        )}
        {lastRun?.error && <pre className="whitespace-pre-wrap text-sm text-red-600">{lastRun.error}</pre>}
        <SyncButton disabled={!conn || lastRun?.status === "running"} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{folder ? (currentRoot?.name ?? current?.name ?? "Folder") : "Team folders"}</h2>
        {folder && (
          <Link href={current?.parentId ? `/admin?folder=${current.parentId}` : "/admin"} className="text-sm underline">
            ← Up
          </Link>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-4 font-normal">Name</th>
                <th className="py-1 pr-4 font-normal">{folder ? "Size" : "Items"}</th>
                <th className="py-1 font-normal">{folder ? "Modified" : "Scanned"}</th>
              </tr>
            </thead>
            <tbody>
              {!folder &&
                roots.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-1 pr-4">
                      <Link href={`/admin?folder=${r.id}`} className="underline">
                        {r.name}
                      </Link>{" "}
                      <span className="text-zinc-500">{r.kind === "myfolder" ? "(My Folders)" : r.teamName && `· ${r.teamName}`}</span>
                    </td>
                    <td className="py-1 pr-4">{r.count}</td>
                    <td className="py-1">{fmtTime(r.syncedAt)}</td>
                  </tr>
                ))}
              {folder &&
                children.map((c) => (
                  <tr key={c.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-1 pr-4">
                      {c.isFolder ? (
                        <Link href={`/admin?folder=${c.id}`} className="underline">
                          📁 {c.name}
                        </Link>
                      ) : (
                        <a href={`/api/files/${c.id}/download`} className="underline">
                          {c.name}
                        </a>
                      )}
                    </td>
                    <td className="py-1 pr-4">{c.isFolder ? "" : fmtSize(c.sizeBytes)}</td>
                    <td className="py-1">{fmtTime(c.modifiedMs)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {((folder && !children.length) || (!folder && !roots.length)) && <p className="py-2 text-sm text-zinc-500">Nothing here yet. Run a scan.</p>}
        </div>
      </section>
    </main>
  );
}
