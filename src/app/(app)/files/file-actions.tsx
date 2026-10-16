"use client";

import Link from "next/link";
import { useRouter } from "@/components/top-progress";
import { useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { ContextMenuProvider, MenuButton, startDownload, useContextMenu, type MenuItem } from "@/components/context-menu";
import { askChoice, askConfirm, askText, askTyped, notify } from "@/components/dialogs";
import { FileIcon } from "@/components/file-icon";
import { FolderGlyph, FolderGrid, FolderTile } from "@/components/folder-tile";
import { fmtTime } from "@/components/ui";
import { isDeletedName, isZohoNative } from "@/db/roles";
import {
  DetailsButton,
  detailFacts,
  FileIconTiles,
  ItemList,
  setDetailsOpen,
  SortButton,
  sortRows,
  useDetailsOpen,
  useFileView,
  useSort,
  ViewToggle,
} from "./file-views";
import { useShareDialog } from "./share-dialog";

export type Row = {
  id: string;
  name: string;
  isFolder: boolean;
  extn: string | null;
  sizeBytes: number | null;
  modifiedMs: number | null;
  /** The real person from the app's records, or WorkDrive's account name when the app has none. */
  changedBy: string | null;
  changedInApp: boolean;
};
type Target = Pick<Row, "id" | "name" | "isFolder">;
export type Powers = { canEdit: boolean; canManage: boolean; canShare: boolean; isAdmin: boolean; isSuperadmin: boolean };

const VIEWABLE = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp"]);
const extOf = (r: Pick<Row, "name" | "extn">) => (r.extn ?? (r.name.includes(".") ? r.name.split(".").pop()! : "")).toLowerCase();

async function call(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

const errorOf = (r: { status: number; body: Record<string, unknown> }) => String(r.body.error ?? `Request failed (HTTP ${r.status})`);
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** File operations shared by the toolbar, menus, drag-and-drop and the home page. */
export function useFileOps(folderId: string | null) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<string | null>, after?: string) => {
    setBusy(label);
    setError(null);
    const problem = await fn().catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
    setBusy(null);
    if (problem) setError(problem);
    else if (after) router.push(after);
    router.refresh();
  };

  const newFolder = async () => {
    const name = await askText({ title: "New folder", label: "Name", placeholder: "Untitled folder", confirmLabel: "Create" });
    if (!name || !folderId) return;
    return run("Creating folder…", async () => {
      const r = await call(`/api/files/${folderId}/children`, json("POST", { name }));
      return r.ok ? null : errorOf(r);
    });
  };

  const uploadOne = async (file: File): Promise<string | null> => {
    const send = (onConflict?: "version" | "copy") => {
      const form = new FormData();
      form.set("file", file);
      if (onConflict) form.set("onConflict", onConflict);
      return call(`/api/files/${folderId}/upload`, { method: "POST", body: form });
    };
    let r = await send();
    if (r.status === 409 && r.body.conflict) {
      const choice = await askChoice({
        title: "File already exists",
        message: `"${file.name}" is already in this folder. Replace it with a new version, or keep both under different names?`,
        choices: [
          { label: "Keep both", value: "copy" },
          { label: "Replace (new version)", value: "version", primary: true },
        ],
      });
      if (choice !== "version" && choice !== "copy") return null;
      r = await send(choice);
    }
    if (r.ok && r.body.convertedToZoho) {
      return `${file.name}: uploaded, but WorkDrive converted it to a Zoho document (its "Convert all files to Zoho WorkDrive's format on upload" setting is on), so it can't be downloaded as the original file.`;
    }
    return r.ok ? null : `${file.name}: ${errorOf(r)}`;
  };

  const upload = (files: File[]) => {
    if (!files.length || !folderId) return;
    return run("Uploading…", async () => {
      const problems: string[] = [];
      for (const [i, file] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const problem = await uploadOne(file);
        if (problem) problems.push(problem);
      }
      return problems.length ? problems.join("\n") : null;
    });
  };

  const rename = async (t: Target, title = "Rename") => {
    const name = await askText({ title, label: "New name", initial: t.name, confirmLabel: "Rename" });
    if (!name || name === t.name) return;
    return run("Renaming…", async () => {
      const r = await call(`/api/files/${t.id}`, json("PATCH", { name }));
      return r.ok ? null : errorOf(r);
    });
  };

  /** Marks the item "(Deleted) name" in WorkDrive; admins can restore it. */
  const remove = async (t: Target, after?: string) => {
    const what = t.isFolder ? `the folder "${t.name}" and everything in it` : `"${t.name}"`;
    const ok = await askConfirm({
      title: t.isFolder ? "Delete folder?" : "Delete file?",
      message: `This deletes ${what}. It disappears from this app, and in WorkDrive it is renamed "(Deleted by <your name>) ${t.name}". An admin can restore it from Deleted items.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    return run(
      "Deleting…",
      async () => {
        const r = await call(`/api/files/${t.id}`, { method: "DELETE" });
        return r.ok ? null : errorOf(r);
      },
      after,
    );
  };

  const restore = (t: Target) =>
    run("Restoring…", async () => {
      const r = await call(`/api/files/${t.id}/restore`, { method: "POST" });
      return r.ok ? null : errorOf(r);
    });

  /** Superadmin only: removes the item from WorkDrive for good. Team folders require typing the name. */
  const purge = async (t: Target & { isTeamFolder?: boolean }, after?: string) => {
    const headers: Record<string, string> = {};
    if (t.isTeamFolder) {
      const ok = await askTyped({
        title: "Permanently delete team folder?",
        message: `This deletes the team folder "${t.name}" and everything in it from WorkDrive. Only a Zoho team admin can restore it, from WorkDrive's Admin Console, within your retention period.`,
        label: `Type "${t.name}" to confirm`,
        phrase: t.name,
        confirmLabel: "Delete permanently",
      });
      if (!ok) return;
      headers["X-Confirm-Name"] = encodeURIComponent(t.name);
    } else {
      const what = t.isFolder ? `the folder "${t.name}" and everything in it` : `"${t.name}"`;
      const ok = await askConfirm({
        title: "Delete permanently?",
        message: `This removes ${what} from WorkDrive. It can't be restored from this app.`,
        confirmLabel: "Delete permanently",
        danger: true,
      });
      if (!ok) return;
    }
    return run(
      "Deleting permanently…",
      async () => {
        const r = await call(`/api/files/${t.id}?permanent=1`, { method: "DELETE", headers });
        return r.ok ? null : errorOf(r);
      },
      after,
    );
  };

  /** Replace a file's content with one picked from the computer; WorkDrive keeps the old one as a version. */
  const newVersion = (t: Target & { extn: string | null }) => {
    if (isZohoNative(t.extn)) {
      return void notify({
        title: "Can't upload a new version",
        message: "This is a Zoho document (WorkDrive converted it when it was uploaded), so it can't take a new version from a file. Edit it in WorkDrive instead.",
      });
    }
    const picker = document.createElement("input");
    picker.type = "file";
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const want = (t.extn ?? t.name.split(".").pop() ?? "").toLowerCase();
      const got = (file.name.split(".").pop() ?? "").toLowerCase();
      if (
        want &&
        got !== want &&
        !(await askConfirm({
          title: "Different file type",
          message: `"${t.name}" is a .${want} file but you picked a .${got} file. Upload it as the new version anyway?`,
          confirmLabel: "Upload anyway",
        }))
      )
        return;
      run(`Uploading new version of ${t.name}…`, async () => {
        // No X-Base-Modified: the person is deliberately replacing whatever is there now.
        const r = await call(`/api/files/${t.id}/content`, { method: "PUT", body: file });
        return r.ok ? null : errorOf(r);
      });
    };
    picker.click();
  };

  return { busy, error, newFolder, upload, rename, remove, restore, purge, newVersion };
}

const copyLink = (id: string) => navigator.clipboard?.writeText(`${window.location.origin}/files/${id}`);

/** The delete-related menu entries for one item, by role. */
export function deleteItems(t: Target & { isTeamFolder?: boolean }, p: Powers, ops: ReturnType<typeof useFileOps>, after?: string): MenuItem[] {
  const deleted = isDeletedName(t.name);
  const items: MenuItem[] = [];
  if (deleted && p.isAdmin) items.push({ label: "Restore", onSelect: () => ops.restore(t) });
  if (!deleted) items.push({ label: "Delete", onSelect: () => ops.remove(t, after), danger: true, disabled: !p.canManage });
  if (p.isSuperadmin) items.push({ label: "Delete permanently…", onSelect: () => ops.purge(t, after), danger: true });
  return items;
}

/** The folder being shown: what the header, the Manage menu and the Details panel need about it. */
export type FolderInfo = {
  id: string;
  name: string;
  deleted: boolean;
  /** A team folder or My Folders (rename and delete are admin-only, and My Folders can't go). */
  isRoot: boolean;
  isTeamFolder: boolean;
  /** Where to go once it's deleted. */
  parentHref: string;
  accessLabel: string;
  modifiedMs: number | null;
};
export type Crumb = { id: string; name: string };

/**
 * A folder, laid out like WorkDrive: a header with the folder's name and its Manage menu, the
 * New button, the path, sort / view / details tools; then its contents (right-click menus, a ⋮
 * per row, drag-and-drop upload) with an optional Details panel on the right.
 */
export function FileBrowser(props: { folder: FolderInfo; crumbs: Crumb[]; rows: Row[]; activity: ReactNode } & Powers) {
  return (
    <ContextMenuProvider>
      <FileBrowserInner {...props} />
    </ContextMenuProvider>
  );
}

function FileBrowserInner({ folder, crumbs, rows, activity, ...powers }: { folder: FolderInfo; crumbs: Crumb[]; rows: Row[]; activity: ReactNode } & Powers) {
  const { canEdit, canShare, canManage, isAdmin } = powers;
  const folderId = folder.id;
  const router = useRouter();
  const openMenu = useContextMenu();
  const ops = useFileOps(folderId);
  const share = useShareDialog();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const view = useFileView();
  const sort = useSort();
  const detailsOpen = useDetailsOpen();

  const sorted = sortRows(rows, sort);
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const self: Target = { id: folder.id, name: folder.name, isFolder: true };

  // WorkDrive's "+ New": everything that adds to this folder.
  const newItems: MenuItem[] = [
    { label: "New folder", onSelect: () => ops.newFolder() },
    { label: "Upload files…", onSelect: () => fileInput.current?.click() },
  ];

  // WorkDrive's "Manage": everything about the folder itself.
  const canRenameSelf = folder.isRoot ? isAdmin && folder.isTeamFolder : canEdit;
  const canDeleteSelf = folder.isRoot ? isAdmin && folder.isTeamFolder : canManage;
  const manageItems: MenuItem[] = [
    ...(canShare ? [{ label: "Share…", onSelect: () => share.open(folderId) }] : []),
    ...(canRenameSelf && !folder.deleted ? [{ label: "Rename…", onSelect: () => ops.rename(self, folder.isRoot ? "Rename team folder" : "Rename") }] : []),
    { label: "Copy link", onSelect: () => copyLink(folderId) },
    { label: detailsOpen ? "Hide details" : "Show details", onSelect: () => setDetailsOpen(!detailsOpen) },
    { label: "Refresh", onSelect: () => router.refresh() },
    ...(canDeleteSelf
      ? (["separator", ...deleteItems({ ...self, isTeamFolder: folder.isTeamFolder }, powers, ops, folder.parentHref)] as MenuItem[])
      : []),
  ];

  const blankItems: MenuItem[] = [...(canEdit ? [...newItems, "separator" as const] : []), ...manageItems.filter((i) => i === "separator" || !i.danger)];

  const itemMenu = (row: Row): MenuItem[] => {
    const items: MenuItem[] = [{ label: "Open", onSelect: () => router.push(`/files/${row.id}`) }];
    if (!row.isFolder) {
      items.push({ label: "Download", onSelect: () => startDownload(row.id) });
      if (VIEWABLE.has(extOf(row))) items.push({ label: "Open in browser", onSelect: () => window.open(`/api/files/${row.id}/download?inline=1`, "_blank", "noopener") });
    }
    items.push("separator");
    if (!row.isFolder) items.push({ label: "Upload new version…", onSelect: () => ops.newVersion(row), disabled: !canEdit || isZohoNative(row.extn) });
    items.push({ label: "Rename…", onSelect: () => ops.rename(row), disabled: !canEdit });
    if (canShare) items.push({ label: "Share…", onSelect: () => share.open(row.id) });
    items.push({ label: "Copy link", onSelect: () => copyLink(row.id) });
    items.push({ label: "Details", onSelect: () => (setSelectedId(row.id), setDetailsOpen(true)) });
    items.push("separator", ...deleteItems(row, powers, ops));
    return items;
  };

  const folders = sorted.filter((r) => r.isFolder);
  const files = sorted.filter((r) => !r.isFolder);
  const fileHandlers = {
    onContextMenu: (row: Row, e: MouseEvent) => {
      e.preventDefault();
      openMenu(e.clientX, e.clientY, itemMenu(row));
    },
    onOptions: (row: Row, e: MouseEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      openMenu(r.right - 192, r.bottom + 4, itemMenu(row));
    },
    onOpen: (row: Row) => router.push(`/files/${row.id}`),
    badge: (row: Row) => (isDeletedName(row.name) ? <DeletedBadge /> : null),
  };
  const folderProps = (row: Row) => ({
    id: row.id,
    name: row.name,
    detail: row.modifiedMs !== null && fmtTime(row.modifiedMs),
    deleted: isDeletedName(row.name),
    badge: isDeletedName(row.name) && <DeletedBadge />,
    onContextMenu: (e: MouseEvent) => fileHandlers.onContextMenu(row, e),
    onDoubleClick: () => fileHandlers.onOpen(row),
    onOptions: (e: MouseEvent<HTMLButtonElement>) => fileHandlers.onOptions(row, e),
  });

  const onBlankContext = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-row]")) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, blankItems);
  };

  const dragProps = canEdit
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          ops.upload(Array.from(e.dataTransfer.files));
        },
      }
    : {};

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-2 border-b border-[var(--rule)] px-4 pt-4 pb-2 sm:px-6">
        {/* Title row: the folder and its Manage menu; New on the right. On phones the name has its
            own line, with Manage and New sharing the line under it. */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
          <span className="flex min-w-0 items-center gap-2 max-sm:w-full sm:gap-3">
            <span className="shrink-0">
              <FolderGlyph id={folder.id} />
            </span>
            <h1 className="min-w-0 truncate text-lg sm:text-xl font-semibold tracking-tight text-[var(--ink)]" title={folder.name}>
              {folder.name}
            </h1>
            {folder.deleted && <DeletedBadge />}
          </span>
          <MenuButton label="Manage" items={manageItems} icon={<GearIcon />} className="max-sm:flex-1" />
          <span className={`flex shrink-0 items-center gap-2 sm:ml-auto ${canEdit && !folder.deleted ? "max-sm:flex-1" : ""}`}>
            {ops.busy && <span className="hidden text-sm text-[var(--ink-3)] sm:inline">{ops.busy}</span>}
            {canEdit && !folder.deleted && (
              <MenuButton label="New" items={newItems} icon={<span className="text-base leading-none">+</span>} primary disabled={ops.busy !== null} className="max-sm:flex-1" />
            )}
          </span>
        </div>
        {/* Path row: where you are; sort, view and details on the right, never pushed off screen */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Breadcrumb crumbs={crumbs} />
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <span className="mr-1 hidden text-xs text-[var(--ink-3)] lg:inline">{folder.accessLabel}</span>
            <SortButton />
            <ViewToggle view={view} />
            <DetailsButton />
          </span>
        </div>
        {ops.error && <pre className="m-0 text-sm whitespace-pre-wrap text-red-600">{ops.error}</pre>}
      </header>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          ops.upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <div className="flex min-h-0 flex-1">
        <div
          onContextMenu={onBlankContext}
          onClick={(e) => !(e.target as HTMLElement).closest("[data-row]") && setSelectedId(null)}
          {...dragProps}
          className={`min-h-[60vh] min-w-0 flex-1 px-4 py-4 sm:px-6 ${dragging ? "rounded-xl bg-[var(--tint)] outline-2 outline-offset-[-8px] outline-dashed outline-[var(--brand)]" : ""}`}
        >
          {rows.length === 0 ? (
            <div className="empty-state">
              <svg width="104" height="80" viewBox="0 0 104 80" aria-hidden="true" className="mx-auto">
                <ellipse cx="52" cy="74" rx="38" ry="4" fill="var(--tint-2)" />
                <path d="M18 22a6 6 0 0 1 6-6h18l6 7h32a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" fill="var(--tint)" stroke="var(--brand)" strokeWidth="2" />
                <path d="M52 36v18M43 45h18" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <h3>This folder is empty</h3>
              <p>{canEdit ? "Use + New, or drop files here, to add something." : "Nothing has been added here yet."}</p>
            </div>
          ) : view === "icons" ? (
            <FolderGrid>
              {folders.map((row) => (
                <FolderTile key={row.id} {...folderProps(row)} />
              ))}
              <FileIconTiles files={files} {...fileHandlers} />
            </FolderGrid>
          ) : (
            <ItemList rows={sorted} selectedId={selectedId} onSelect={(row) => setSelectedId(row.id)} {...fileHandlers} />
          )}
        </div>

        {detailsOpen && (
          <DetailsPanel
            onClose={() => setDetailsOpen(false)}
            item={selected}
            folder={folder}
            activity={activity}
            onOpen={(row) => router.push(`/files/${row.id}`)}
          />
        )}
      </div>
      {share.element}
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  );
}

/** Where you are, from the top folder you can see down to this one. */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-[var(--ink-3)]" aria-label="Breadcrumb">
      <Link href="/files" className="rounded px-1 hover:text-[var(--ink)] hover:underline">
        Home
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.id} className="flex min-w-0 items-center gap-1">
          <span aria-hidden="true">›</span>
          {i === crumbs.length - 1 ? (
            <span className="truncate px-1 text-[var(--ink)]" aria-current="page">
              {c.name}
            </span>
          ) : (
            <Link href={`/files/${c.id}`} className="truncate rounded px-1 hover:text-[var(--ink)] hover:underline">
              {c.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/** WorkDrive's Details panel: the selected item, or the folder itself (with its activity) when nothing is selected. */
function DetailsPanel({
  item,
  folder,
  activity,
  onOpen,
  onClose,
}: {
  item: Row | null;
  folder: FolderInfo;
  activity: ReactNode;
  onOpen: (row: Row) => void;
  onClose: () => void;
}) {
  const facts = item
    ? detailFacts(item)
    : [
        { label: "Type", value: folder.isTeamFolder ? "Team folder" : "Folder" },
        { label: "Last modified", value: fmtTime(folder.modifiedMs) },
        { label: "Your access", value: folder.accessLabel },
      ];
  const name = item?.name ?? folder.name;
  return (
    <aside
      aria-label="Details"
      className="fixed inset-y-0 right-0 z-30 flex w-[min(340px,100vw)] flex-col border-l border-[var(--rule)] bg-[var(--canvas)] shadow-2xl lg:sticky lg:top-14 lg:z-auto lg:h-[calc(100vh-3.5rem)] lg:shadow-none"
    >
      <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-3">
        <h2 className="m-0 text-sm font-semibold text-[var(--ink)]">Details</h2>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded-full px-2 text-xl leading-none text-[var(--ink-3)] hover:bg-[var(--tint)] hover:text-[var(--ink)]">
          ×
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--tint)] px-4 py-6 text-center">
          {item && !item.isFolder ? (
            <FileIcon name={item.name} extn={item.extn} className="h-16 w-14" />
          ) : (
            <span className="[&>svg]:h-14 [&>svg]:w-16">
              <FolderGlyph id={item?.id ?? folder.id} />
            </span>
          )}
          <p className="m-0 text-sm font-semibold break-all text-[var(--ink)]">{name}</p>
        </div>
        <dl className="m-0 flex flex-col gap-3">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-[var(--ink-3)]">{f.label}</dt>
              <dd className="m-0 text-sm font-medium text-[var(--ink)]">{f.value}</dd>
            </div>
          ))}
        </dl>
        {item && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onOpen(item)} className="btn btn-secondary btn-sm">
              Open
            </button>
            {!item.isFolder && (
              <button type="button" onClick={() => startDownload(item.id)} className="btn btn-secondary btn-sm">
                Download
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-[var(--rule)] pt-4">
          <h3 className="m-0 text-sm font-semibold text-[var(--ink)]">Activity</h3>
          {item ? (
            <p className="m-0 text-[13px] text-[var(--ink-3)]">Open it to see who changed it and when.</p>
          ) : (
            activity
          )}
        </div>
      </div>
    </aside>
  );
}

export function DeletedBadge() {
  return <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 no-underline dark:bg-red-950 dark:text-red-300">deleted</span>;
}

/**
 * A file's own page header, like WorkDrive's: the file and its Manage menu, Download (and Open in
 * browser) on the right, and the path underneath.
 */
export function FileHeader(props: { id: string; name: string; extn: string | null; deleted: boolean; afterDelete: string; crumbs: Crumb[]; accessLabel: string } & Powers) {
  return (
    <ContextMenuProvider>
      <FileHeaderInner {...props} />
    </ContextMenuProvider>
  );
}

function FileHeaderInner({ id, name, extn, deleted, afterDelete, crumbs, accessLabel, ...powers }: Parameters<typeof FileHeader>[0]) {
  const router = useRouter();
  const ops = useFileOps(null);
  const share = useShareDialog();
  const t = { id, name, isFolder: false };
  const manageItems: MenuItem[] = [
    ...(powers.canEdit && !deleted ? [{ label: "Upload new version…", onSelect: () => ops.newVersion({ ...t, extn }), disabled: isZohoNative(extn) }] : []),
    ...(powers.canEdit && !deleted ? [{ label: "Rename…", onSelect: () => ops.rename(t) }] : []),
    ...(powers.canShare ? [{ label: "Share…", onSelect: () => share.open(id) }] : []),
    { label: "Copy link", onSelect: () => copyLink(id) },
    { label: "Refresh", onSelect: () => router.refresh() },
    "separator",
    ...deleteItems(t, powers, ops, afterDelete),
  ];
  return (
    <header className="flex flex-col gap-2 border-b border-[var(--rule)] px-4 pt-4 pb-2 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <FileIcon name={name} extn={extn} className="h-8 w-7 shrink-0" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-[var(--ink)] sm:flex-none sm:text-xl" title={name}>
          {name}
        </h1>
        {deleted && <DeletedBadge />}
        <MenuButton label="Manage" items={manageItems} icon={<GearIcon />} compact />
        <span className="ml-auto flex items-center gap-2">
          {ops.busy && <span className="text-sm text-[var(--ink-3)]">{ops.busy}</span>}
          {VIEWABLE.has(extOf({ name, extn })) && (
            <a href={`/api/files/${id}/download?inline=1`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
              Open in browser
            </a>
          )}
          <a href={`/api/files/${id}/download`} className="btn btn-primary btn-sm !bg-[var(--brand)] !text-white hover:!bg-[var(--accent-deep)]">
            Download
          </a>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Breadcrumb crumbs={crumbs} />
        <span className="ml-auto hidden text-xs text-[var(--ink-3)] sm:inline">{accessLabel}</span>
      </div>
      {ops.error && <pre className="m-0 text-sm whitespace-pre-wrap text-red-600">{ops.error}</pre>}
      {share.element}
    </header>
  );
}
