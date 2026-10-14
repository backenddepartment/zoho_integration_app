import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addedByFromName, db, deletedByFromName, displayName, isAdminRole, isDeletedName, isZohoNative, levelLabel, LEVELS, wdItems } from "@/db";
import { AppShell } from "@/components/app-shell";
import { FileIcon } from "@/components/file-icon";
import { fmtSize, fmtTime } from "@/components/ui";
import { breadcrumb, effectiveLevel, getNode } from "@/lib/access";
import { ACTION_LABELS, activityFor, history } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { listVersions } from "@/lib/zoho/workdrive";
import { DeletedBadge, FileBrowser, FileButtons, type Powers } from "../file-actions";
import { LiveSync } from "../live-sync";
import { ShareButton } from "../share-dialog";

export const metadata = { title: "Files" };
// Navigating here waits for the page's data, keeping the previous page (and the loading line) up
// meanwhile; the boundary is in the root layout.
export const instant = false;

const VIEWABLE = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp"]);

export default function NodePage({ params }: PageProps<"/files/[id]">) {
  return <Content params={params} />;
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-6 pb-10">
        <LiveSync url={`/api/files/${node.id}/sync`} goneTo={node.parentId ? `/files/${node.parentId}` : "/files"} />
        <header className="flex flex-col gap-2">
          <nav className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--ink-3)]" aria-label="Breadcrumb">
            <Link href="/files" className="hover:text-[var(--ink)] hover:underline">
              Files
            </Link>
            {crumbs.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5">
                <span aria-hidden="true">›</span>
                {c.id === node.id ? (
                  <span className="text-[var(--ink)]">{displayName(c.name)}</span>
                ) : (
                  <Link href={`/files/${c.id}`} className="hover:text-[var(--ink)] hover:underline">
                    {displayName(c.name)}
                  </Link>
                )}
              </span>
            ))}
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="page-title break-all">
              {displayName(node.name)}
              {isDeletedName(node.name) && <DeletedBadge />}
            </h1>
            <span className="flex items-center gap-3">
              <span className="tag tag-mute">Your access: {isAdminRole(user.role) ? `${user.role} (everything)` : levelLabel(level)}</span>
              {powers.canShare && <ShareButton id={node.id} />}
            </span>
          </div>
        </header>
        {isDeletedName(node.name) && (
          <div className="alert alert-bad">
            <div>
              <b>Deleted{deletedByFromName(node.name) ? ` by ${deletedByFromName(node.name)}` : ""}</b>
              It&apos;s hidden from everyone else. Restore it from{" "}
              <Link href="/admin/deleted" className="underline">
                Deleted items
              </Link>
              .
            </div>
          </div>
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
    <section className="flex flex-col gap-6">
      <div className="board flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <FileIcon name={name} extn={props.extn} className="h-12 w-10" />
          <div className="facts flex-1 border-t-0 pt-0">
            <div>
              <small>Size</small>
              <b>{isZohoNative(props.extn) ? "Zoho document (converted by WorkDrive on upload)" : fmtSize(props.sizeBytes)}</b>
            </div>
            <div>
              <small>Created by</small>
              <b>{mine?.created ? `${mine.created.name}, ${fmtTime(mine.created.at)}` : (addedBy ?? "Before this app (in WorkDrive)")}</b>
            </div>
            <div>
              <small>Last change</small>
              <b>
                {mine?.last
                  ? `${ACTION_LABELS[mine.last.action] ?? mine.last.action} by ${mine.last.name}, ${fmtTime(mine.last.at)}`
                  : `${fmtTime(props.modifiedMs)}${item?.modifiedBy ? ` by ${item.modifiedBy} (in WorkDrive)` : ""}`}
              </b>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule)] pt-5">
          <a href={`/api/files/${props.id}/download`} className="btn btn-primary btn-sm">
            Download
          </a>
          {VIEWABLE.has(ext) && (
            <a href={`/api/files/${props.id}/download?inline=1`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
              Open in browser
            </a>
          )}
          <FileButtons id={props.id} name={name} extn={props.extn} deleted={isDeletedName(props.rawName)} afterDelete={props.parentId ? `/files/${props.parentId}` : "/files"} {...props.powers} />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Versions</h2>
        {versions === null ? (
          <div className="alert alert-warn">
            <div>Couldn&apos;t load versions from WorkDrive.</div>
          </div>
        ) : versions.length === 0 ? (
          <p className="m-0 text-sm text-[var(--ink-3)]">No earlier versions.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Saved</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={String(v.versionNumber)}>
                    <td>
                      <span className="code-chip">v{v.versionNumber}</span>
                    </td>
                    <td>{fmtTime(v.createdMs)}</td>
                    <td>{fmtSize(v.sizeBytes)}</td>
                    <td className="text-right">
                      <a href={`/api/files/${props.id}/download?version=${v.versionNumber}`} className="btn btn-secondary btn-xs">
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

/** Who did what to this item, from the app's own records (WorkDrive only knows the connected account). */
async function ActivityList({ id }: { id: string }) {
  const rows = await history(id);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="section-title">Activity</h2>
        {rows.length > 0 && <span className="tag tag-mute">{rows.length}</span>}
      </div>
      {rows.length === 0 ? (
        <div className="board empty-state">
          <svg width="104" height="76" viewBox="0 0 104 76" aria-hidden="true" className="mx-auto">
            <ellipse cx="52" cy="70" rx="38" ry="4" fill="var(--tint-2)" />
            <rect x="24" y="10" width="44" height="54" rx="6" fill="var(--tint)" stroke="var(--brand)" strokeWidth="2" />
            <path d="M33 24h26M33 33h26M33 42h16" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
            <circle cx="70" cy="48" r="14" fill="var(--brand)" />
            <path d="M70 41v7.5l5 3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3>No activity yet</h3>
          <p>Changes made through this app, like uploads, renames and shares, show up here with who made them.</p>
        </div>
      ) : (
        <ol className="board m-0 flex list-none flex-col gap-0 py-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-b border-[var(--rule)] py-3 last:border-b-0">
              <span className="avatar h-9 w-9 text-xs">{initials(r.name)}</span>
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-semibold text-[var(--ink)]">{r.name}</span>{" "}
                <span className="text-[var(--ink-2)]">
                  {ACTION_LABELS[r.action] ?? r.action}
                  {describe(r.detail)}
                </span>
              </div>
              <time className="shrink-0 text-xs whitespace-nowrap text-[var(--ink-3)]">{fmtTime(r.at)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1];
  return `${parts[0]?.[0] ?? ""}${last ?? ""}`.toUpperCase();
}

function describe(detail: unknown): string {
  const d = (detail ?? {}) as Record<string, unknown>;
  if (typeof d.from === "string" && typeof d.to === "string") return ` ("${d.from}" → "${d.to}")`;
  if (typeof d.user === "string") return ` with ${d.user}${typeof d.level === "string" ? ` (${d.level})` : ""}`;
  return "";
}
