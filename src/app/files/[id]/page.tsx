import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { addedByFromName, db, deletedByFromName, displayName, isAdminRole, isDeletedName, isZohoNative, levelLabel, LEVELS, wdItems } from "@/db";
import { AppShell } from "@/components/app-shell";
import { fmtSize, fmtTime, Loading } from "@/components/ui";
import { breadcrumb, effectiveLevel, getNode } from "@/lib/access";
import { ACTION_LABELS, activityFor, history } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { listVersions } from "@/lib/zoho/workdrive";
import { DeletedBadge, FileBrowser, FileButtons, type Powers } from "../file-actions";
import { LiveSync } from "../live-sync";
import { ShareButton } from "../share-dialog";

export const metadata = { title: "Files" };

const VIEWABLE = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp"]);

export default function NodePage({ params }: PageProps<"/files/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/files/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const node = await getNode(id);
  const level = node ? await effectiveLevel(user, id) : 0;
  if (!node || level === 0) notFound();

  const crumbs = await breadcrumb(user, node);
  const powers: Powers = {
    canEdit: level >= LEVELS.edit,
    canManage: level >= LEVELS.manage,
    canShare: level >= LEVELS.share,
    isAdmin: isAdminRole(user.role),
    isSuperadmin: user.role === "superadmin",
  };

  return (
    <AppShell user={user}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8">
        <LiveSync url={`/api/files/${node.id}/sync`} goneTo={node.parentId ? `/files/${node.parentId}` : "/files"} />
        <nav className="flex flex-wrap items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/files" className="hover:underline">
            Files
          </Link>
          {crumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span>/</span>
              {c.id === node.id ? (
                <span className="text-zinc-900 dark:text-zinc-100">{displayName(c.name)}</span>
              ) : (
                <Link href={`/files/${c.id}`} className="hover:underline">
                  {displayName(c.name)}
                </Link>
              )}
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold break-all">
            {displayName(node.name)}
            {isDeletedName(node.name) && <DeletedBadge />}
          </h1>
          <span className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">Your access: {isAdminRole(user.role) ? `${user.role} (everything)` : levelLabel(level)}</span>
            {powers.canShare && <ShareButton id={node.id} />}
          </span>
        </div>
        {isDeletedName(node.name) && (
          <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            Deleted{deletedByFromName(node.name) ? ` by ${deletedByFromName(node.name)}` : ""}. It&apos;s hidden from everyone else. Restore it from{" "}
            <Link href="/admin/deleted" className="underline">
              Deleted items
            </Link>
            .
          </p>
        )}

        {node.kind === "file" ? (
          <FileDetails id={node.id} rawName={node.name} extn={node.extn} sizeBytes={node.sizeBytes} modifiedMs={node.modifiedMs} parentId={node.parentId} powers={powers} />
        ) : (
          <FolderListing id={node.id} powers={powers} />
        )}

        <ActivityList id={node.id} />

      </main>
    </AppShell>
  );
}

async function FolderListing({ id, powers }: { id: string; powers: Powers }) {
  const children = await db().select().from(wdItems).where(eq(wdItems.parentId, id));
  // Deleted items are hidden from every listing; admins reach them through the Deleted items page.
  const visible = children
    .filter((c) => !isDeletedName(c.name))
    .sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || displayName(a.name).localeCompare(displayName(b.name)));
  const who = await activityFor(visible.map((c) => c.id));
  const rows = visible.map((c) => {
    const last = who.get(c.id)?.last;
    return {
      id: c.id,
      name: displayName(c.name),
      isFolder: c.isFolder,
      extn: c.extn,
      sizeBytes: c.sizeBytes,
      // Prefer the app's record of the real person, then the "(Added by …)" credit, then what WorkDrive reports.
      modifiedMs: last && (c.modifiedMs === null || last.at.getTime() >= c.modifiedMs - 60_000) ? last.at.getTime() : c.modifiedMs,
      changedBy: last?.name ?? addedByFromName(c.name) ?? c.modifiedBy,
      changedInApp: Boolean(last ?? addedByFromName(c.name)),
    };
  });
  return <FileBrowser folderId={id} rows={rows} {...powers} />;
}

async function FileDetails(props: { id: string; rawName: string; extn: string | null; sizeBytes: number | null; modifiedMs: number | null; parentId: string | null; powers: Powers }) {
  const [versions, [item], who] = await Promise.all([
    listVersions(props.id).catch(() => null),
    db().select({ modifiedBy: wdItems.modifiedBy }).from(wdItems).where(eq(wdItems.id, props.id)),
    activityFor([props.id]),
  ]);
  const mine = who.get(props.id);
  const name = displayName(props.rawName);
  const addedBy = addedByFromName(props.rawName);
  const ext = (props.extn ?? name.split(".").pop() ?? "").toLowerCase();
  return (
    <section className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-zinc-500">Size</dt>
        <dd>{isZohoNative(props.extn) ? "Zoho document (converted by WorkDrive on upload)" : fmtSize(props.sizeBytes)}</dd>
        <dt className="text-zinc-500">Created by</dt>
        <dd>{mine?.created ? `${mine.created.name}, ${fmtTime(mine.created.at)}` : (addedBy ?? "Before this app (in WorkDrive)")}</dd>
        <dt className="text-zinc-500">Last change</dt>
        <dd>
          {mine?.last
            ? `${ACTION_LABELS[mine.last.action] ?? mine.last.action} by ${mine.last.name}, ${fmtTime(mine.last.at)}`
            : `${fmtTime(props.modifiedMs)}${item?.modifiedBy ? ` by ${item.modifiedBy} (in WorkDrive)` : ""}`}
        </dd>
      </dl>
      <div className="flex flex-wrap items-center gap-4">
        <a href={`/api/files/${props.id}/download`} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          Download
        </a>
        {VIEWABLE.has(ext) && (
          <a href={`/api/files/${props.id}/download?inline=1`} target="_blank" rel="noopener" className="text-sm underline">
            Open in browser
          </a>
        )}
        <FileButtons id={props.id} name={name} extn={props.extn} deleted={isDeletedName(props.rawName)} afterDelete={props.parentId ? `/files/${props.parentId}` : "/files"} {...props.powers} />
      </div>

      <div>
        <h2 className="mb-2 font-medium">Versions</h2>
        {versions === null ? (
          <p className="text-sm text-zinc-500">Couldn&apos;t load versions from WorkDrive.</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-zinc-500">No earlier versions.</p>
        ) : (
          <ul className="text-sm">
            {versions.map((v) => (
              <li key={String(v.versionNumber)} className="flex gap-4 py-1">
                <span className="w-12">v{v.versionNumber}</span>
                <span className="w-40">{fmtTime(v.createdMs)}</span>
                <span className="w-24">{fmtSize(v.sizeBytes)}</span>
                <a href={`/api/files/${props.id}/download?version=${v.versionNumber}`} className="underline">
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Who did what to this item, from the app's own records (WorkDrive only knows the connected account). */
async function ActivityList({ id }: { id: string }) {
  const rows = await history(id);
  return (
    <section>
      <h2 className="mb-2 font-medium">Activity</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No changes made through this app yet.</p>
      ) : (
        <ul className="text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-4 py-1">
              <span className="w-44 text-zinc-500">{fmtTime(r.at)}</span>
              <span>
                <b>{r.name}</b> · {ACTION_LABELS[r.action] ?? r.action}
                {describe(r.detail)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describe(detail: unknown): string {
  const d = (detail ?? {}) as Record<string, unknown>;
  if (typeof d.from === "string" && typeof d.to === "string") return ` ("${d.from}" → "${d.to}")`;
  if (typeof d.user === "string") return ` with ${d.user}${typeof d.level === "string" ? ` (${d.level})` : ""}`;
  return "";
}
