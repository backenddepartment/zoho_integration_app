"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type MouseEvent } from "react";
import { ContextMenuProvider, startDownload, useContextMenu, type MenuItem } from "@/components/context-menu";
import { buttonSecondary, danger, fmtSize, fmtTime, linkButton } from "@/components/ui";
import { isDeletedName } from "@/db/roles";

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
export type Powers = { canEdit: boolean; canManage: boolean; isAdmin: boolean; isSuperadmin: boolean };

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

  const newFolder = () => {
    const name = window.prompt("New folder name")?.trim();
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
      if (window.confirm(`"${file.name}" already exists here.\n\nOK: save it as a new version of the existing file.\nCancel: choose whether to keep both.`)) {
        r = await send("version");
      } else if (window.confirm("Keep both? The upload will be saved under a new name.")) {
        r = await send("copy");
      } else {
        return null;
      }
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

  const rename = (t: Target, label = "Rename to") => {
    const name = window.prompt(label, t.name)?.trim();
    if (!name || name === t.name) return;
    return run("Renaming…", async () => {
      const r = await call(`/api/files/${t.id}`, json("PATCH", { name }));
      return r.ok ? null : errorOf(r);
    });
  };

  /** Marks the item "(Deleted) name" in WorkDrive; admins can restore it. */
  const remove = (t: Target, after?: string) => {
    const what = t.isFolder ? `the folder "${t.name}" and everything in it` : `"${t.name}"`;
    if (!window.confirm(`Delete ${what}?\n\nIt disappears from this app, and in WorkDrive it is renamed "(Deleted by <your name>) ${t.name}". An admin can restore it from Deleted items.`)) return;
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
  const purge = (t: Target & { isTeamFolder?: boolean }, after?: string) => {
    const headers: Record<string, string> = {};
    if (t.isTeamFolder) {
      const typed = window.prompt(
        `PERMANENTLY delete the team folder "${t.name}" and everything in it?\n\nOnly a Zoho team admin can restore it, from WorkDrive's Admin Console, within your retention period.\n\nType the folder's exact name to confirm:`,
      );
      if (typed === null) return;
      if (typed !== t.name) return window.alert("The name didn't match. Nothing was deleted.");
      headers["X-Confirm-Name"] = encodeURIComponent(t.name);
    } else {
      const what = t.isFolder ? `the folder "${t.name}" and everything in it` : `"${t.name}"`;
      if (!window.confirm(`PERMANENTLY delete ${what}?\n\nThis removes it from WorkDrive. It can't be restored from this app.`)) return;
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

  return { busy, error, newFolder, upload, rename, remove, restore, purge };
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
  const { canEdit, isAdmin } = powers;
  const router = useRouter();
  const openMenu = useContextMenu();
  const ops = useFileOps(folderId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const folderItems: MenuItem[] = [
    { label: "New folder", onSelect: () => ops.newFolder(), disabled: !canEdit },
    { label: "Upload files…", onSelect: () => fileInput.current?.click(), disabled: !canEdit },
    "separator",
    { label: "Refresh", onSelect: () => router.refresh() },
    { label: "Copy link to this folder", onSelect: () => copyLink(folderId) },
  ];

  const itemMenu = (row: Row): MenuItem[] => {
    const items: MenuItem[] = [{ label: "Open", onSelect: () => router.push(`/files/${row.id}`) }];
    if (!row.isFolder) {
      items.push({ label: "Download", onSelect: () => startDownload(row.id) });
      if (VIEWABLE.has(extOf(row))) items.push({ label: "Open in browser", onSelect: () => window.open(`/api/files/${row.id}/download?inline=1`, "_blank", "noopener") });
    }
    items.push("separator", { label: "Rename…", onSelect: () => ops.rename(row), disabled: !canEdit });
    if (isAdmin) items.push({ label: "Share…", onSelect: () => router.push(`/files/${row.id}#sharing`) });
    items.push({ label: "Copy link", onSelect: () => copyLink(row.id) });
    items.push("separator", ...deleteItems(row, powers, ops));
    return items;
  };

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
            <button onClick={() => ops.newFolder()} disabled={ops.busy !== null} className={buttonSecondary}>
              New folder
            </button>
            <button onClick={() => fileInput.current?.click()} disabled={ops.busy !== null} className={buttonSecondary}>
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
        {ops.error && <pre className="w-full text-sm whitespace-pre-wrap text-red-600">{ops.error}</pre>}
      </div>

      <div
        onContextMenu={onBlankContext}
        {...dragProps}
        className={`min-h-[50vh] overflow-x-auto rounded border ${dragging ? "border-dashed border-blue-500 bg-blue-50 dark:bg-blue-950/40" : "border-transparent"}`}
      >
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-2 pr-4 pl-2 font-normal">Name</th>
              <th className="py-2 pr-4 font-normal">Size</th>
              <th className="py-2 pr-4 font-normal">Last change</th>
              <th className="w-10 py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const deleted = isDeletedName(row.name);
              return (
                <tr
                  key={row.id}
                  data-row
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, itemMenu(row));
                  }}
                  onDoubleClick={() => router.push(`/files/${row.id}`)}
                  className={`border-t border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900 ${deleted ? "text-zinc-400 dark:text-zinc-500" : ""}`}
                >
                  <td className="py-2 pr-4 pl-2">
                    <Link href={`/files/${row.id}`} className={`hover:underline ${deleted ? "line-through" : ""}`}>
                      {row.isFolder ? "📁" : "📄"} {row.name}
                    </Link>
                    {deleted && <DeletedBadge />}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{row.isFolder ? "" : fmtSize(row.sizeBytes)}</td>
                  <td className="py-2 pr-4">
                    <div className="whitespace-nowrap">{fmtTime(row.modifiedMs)}</div>
                    {row.changedBy && (
                      <div className="text-xs text-zinc-500" title={row.changedInApp ? "Recorded by this app" : "As reported by WorkDrive (the connected account)"}>
                        by {row.changedBy}
                        {!row.changedInApp && " (WorkDrive)"}
                      </div>
                    )}
                  </td>
                  <td className="py-1 text-right">
                    <button
                      aria-label={`Options for ${row.name}`}
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        openMenu(r.right - 192, r.bottom + 4, itemMenu(row));
                      }}
                      className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-3 text-sm text-zinc-500">This folder is empty.{canEdit && " Right-click here or drop files to add something."}</p>}
      </div>
    </section>
  );
}

export function DeletedBadge() {
  return <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 no-underline dark:bg-red-950 dark:text-red-300">deleted</span>;
}

/** Rename, delete, restore and permanent delete on a file's own page. */
export function FileButtons(props: { id: string; name: string; deleted: boolean; afterDelete: string } & Powers) {
  const ops = useFileOps(null);
  const t = { id: props.id, name: props.name, isFolder: false };
  const deleted = props.deleted;
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {props.canEdit && !deleted && (
        <button onClick={() => ops.rename(t)} disabled={ops.busy !== null} className={linkButton}>
          Rename
        </button>
      )}
      {deleted && props.isAdmin && (
        <button onClick={() => ops.restore(t)} disabled={ops.busy !== null} className={linkButton}>
          Restore
        </button>
      )}
      {!deleted && props.canManage && (
        <button onClick={() => ops.remove(t, props.afterDelete)} disabled={ops.busy !== null} className={danger}>
          Delete
        </button>
      )}
      {props.isSuperadmin && (
        <button onClick={() => ops.purge(t, props.afterDelete)} disabled={ops.busy !== null} className={danger}>
          Delete permanently
        </button>
      )}
      {ops.busy && <span className="text-sm text-zinc-500">{ops.busy}</span>}
      {ops.error && <span className="text-sm text-red-600">{ops.error}</span>}
    </span>
  );
}
