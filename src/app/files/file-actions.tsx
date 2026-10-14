"use client";

import { useRouter } from "@/components/top-progress";
import { useRef, useState, type DragEvent, type MouseEvent } from "react";
import { ContextMenuProvider, startDownload, useContextMenu, type MenuItem } from "@/components/context-menu";
import { askChoice, askConfirm, askText, askTyped, notify } from "@/components/dialogs";
import { FolderChip, FolderChipGrid, FolderGrid, FolderTile } from "@/components/folder-tile";
import { fmtTime } from "@/components/ui";
import { isDeletedName, isZohoNative } from "@/db/roles";
import { FileIconTiles, FileList, useFileView, ViewToggle } from "./file-views";
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

/** Folder contents with a toolbar, right-click menus, a "⋯" button per row, and drag-and-drop upload. */
export function FileBrowser(props: { folderId: string; rows: Row[] } & Powers) {
  return (
    <ContextMenuProvider>
      <FileBrowserInner {...props} />
    </ContextMenuProvider>
  );
}

function FileBrowserInner({ folderId, rows, ...powers }: { folderId: string; rows: Row[] } & Powers) {
  const { canEdit, canShare } = powers;
  const router = useRouter();
  const openMenu = useContextMenu();
  const ops = useFileOps(folderId);
  const share = useShareDialog();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const folderItems: MenuItem[] = [
    { label: "New folder", onSelect: () => ops.newFolder(), disabled: !canEdit },
    { label: "Upload files…", onSelect: () => fileInput.current?.click(), disabled: !canEdit },
    "separator",
    ...(canShare ? [{ label: "Share this folder…", onSelect: () => share.open(folderId) }] : []),
    { label: "Refresh", onSelect: () => router.refresh() },
    { label: "Copy link to this folder", onSelect: () => copyLink(folderId) },
  ];

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
    items.push("separator", ...deleteItems(row, powers, ops));
    return items;
  };

  const folders = rows.filter((r) => r.isFolder);
  const files = rows.filter((r) => !r.isFolder);
  const view = useFileView();
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
  // Shared by the folder tiles (large icons) and the folder cards (list).
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
    openMenu(e.clientX, e.clientY, folderItems);
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
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <>
            <button onClick={() => ops.newFolder()} disabled={ops.busy !== null} className="btn btn-secondary btn-sm">
              New folder
            </button>
            <button onClick={() => fileInput.current?.click()} disabled={ops.busy !== null} className="btn btn-secondary btn-sm">
              Upload files
            </button>
          </>
        )}
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
        {ops.busy && <span className="text-sm text-zinc-500">{ops.busy}</span>}
        <span className="ml-auto hidden text-xs text-zinc-500 sm:inline">Right-click for options{canEdit ? " · drop files to upload" : ""}</span>
        <ViewToggle view={view} />
        {ops.error && <pre className="w-full text-sm whitespace-pre-wrap text-red-600">{ops.error}</pre>}
      </div>

      <div
        onContextMenu={onBlankContext}
        {...dragProps}
        className={`flex min-h-32 flex-col gap-6 overflow-x-auto rounded border ${dragging ? "border-dashed border-blue-500 bg-blue-50 dark:bg-blue-950/40" : "border-transparent"}`}
      >
        {view === "icons" ? (
          // Large icons: folders then files in one grid, so files carry on right after the last folder.
          rows.length > 0 && (
            <FolderGrid>
              {folders.map((row) => (
                <FolderTile key={row.id} {...folderProps(row)} />
              ))}
              <FileIconTiles files={files} {...fileHandlers} />
            </FolderGrid>
          )
        ) : (
          // List: Drive-style folder cards, then the file list.
          <>
            {folders.length > 0 && (
              <FolderChipGrid>
                {folders.map((row) => (
                  <FolderChip key={row.id} {...folderProps(row)} />
                ))}
              </FolderChipGrid>
            )}
            {files.length > 0 && <FileList files={files} {...fileHandlers} />}
          </>
        )}
        {rows.length === 0 && <p className="p-3 text-sm text-zinc-500">This folder is empty.{canEdit && " Right-click here or drop files to add something."}</p>}
      </div>
      {share.element}
    </section>
  );
}

export function DeletedBadge() {
  return <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 no-underline dark:bg-red-950 dark:text-red-300">deleted</span>;
}

/** Rename, delete, restore and permanent delete on a file's own page. */
export function FileButtons(props: { id: string; name: string; extn: string | null; deleted: boolean; afterDelete: string } & Powers) {
  const ops = useFileOps(null);
  const t = { id: props.id, name: props.name, isFolder: false };
  const deleted = props.deleted;
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {props.canEdit && !deleted && !isZohoNative(props.extn) && (
        <button onClick={() => ops.newVersion({ ...t, extn: props.extn })} disabled={ops.busy !== null} className="btn btn-secondary btn-sm">
          Upload new version
        </button>
      )}
      {props.canEdit && !deleted && (
        <button onClick={() => ops.rename(t)} disabled={ops.busy !== null} className="btn btn-secondary btn-sm">
          Rename
        </button>
      )}
      {deleted && props.isAdmin && (
        <button onClick={() => ops.restore(t)} disabled={ops.busy !== null} className="btn btn-secondary btn-sm">
          Restore
        </button>
      )}
      {!deleted && props.canManage && (
        <button onClick={() => ops.remove(t, props.afterDelete)} disabled={ops.busy !== null} className="btn btn-danger btn-sm">
          Delete
        </button>
      )}
      {props.isSuperadmin && (
        <button onClick={() => ops.purge(t, props.afterDelete)} disabled={ops.busy !== null} className="btn btn-danger btn-sm">
          Delete permanently
        </button>
      )}
      {ops.busy && <span className="text-sm text-zinc-500">{ops.busy}</span>}
      {ops.error && <span className="text-sm text-red-600">{ops.error}</span>}
    </span>
  );
}
