"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { ContextMenuProvider, startDownload, useContextMenu, type MenuItem } from "@/components/context-menu";
import { buttonSecondary } from "@/components/ui";
import { isDeletedName } from "@/db/roles";
import { DeletedBadge, deleteItems, useFileOps } from "./file-actions";
import { useShareDialog } from "./share-dialog";

export type Place = { id: string; name: string; kind: "root" | "folder" | "file"; access: string; isTeamFolder: boolean; canManage: boolean; canShare: boolean };

/** The starting list (team folders, or what's shared with the user), with right-click menus. */
export function PlacesBrowser(props: { places: Place[]; isAdmin: boolean; isSuperadmin: boolean; needsReconnect: boolean }) {
  return (
    <ContextMenuProvider>
      <Inner {...props} />
    </ContextMenuProvider>
  );
}

function Inner({ places, isAdmin, isSuperadmin, needsReconnect }: { places: Place[]; isAdmin: boolean; isSuperadmin: boolean; needsReconnect: boolean }) {
  const router = useRouter();
  const openMenu = useContextMenu();
  const ops = useFileOps(null);
  const share = useShareDialog();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function newTeamFolder() {
    const name = window.prompt("New team folder name")?.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/teamfolders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setCreating(false);
    if (!res.ok) return setError(body.error ?? `Failed (HTTP ${res.status})`);
    router.push(`/files/${body.id}#sharing`);
  }

  const blankItems: MenuItem[] = [
    ...(isAdmin ? ([{ label: "New team folder", onSelect: newTeamFolder }, "separator"] as MenuItem[]) : []),
    { label: "Refresh", onSelect: () => router.refresh() },
  ];

  const itemMenu = (p: Place): MenuItem[] => {
    const target = { id: p.id, name: p.name, isFolder: p.kind !== "file", isTeamFolder: p.isTeamFolder };
    const deleted = isDeletedName(p.name);
    const items: MenuItem[] = [{ label: "Open", onSelect: () => router.push(`/files/${p.id}`) }];
    if (p.kind === "file") items.push({ label: "Download", onSelect: () => startDownload(p.id) });
    if (isAdmin && p.isTeamFolder && !deleted) items.push({ label: "Rename…", onSelect: () => ops.rename(target, "Rename team folder to") });
    if (isAdmin || p.canShare) items.push({ label: "Share…", onSelect: () => share.open(p.id) });
    items.push({ label: "Copy link", onSelect: () => navigator.clipboard?.writeText(`${window.location.origin}/files/${p.id}`) });
    // My Folders can't be deleted; team folders only by admins; shared items by whoever manages them.
    const deletable = p.kind === "root" ? p.isTeamFolder && isAdmin : p.canManage;
    if (deletable) items.push("separator", ...deleteItems(target, { canEdit: p.canManage, canManage: p.canManage, canShare: p.canShare, isAdmin, isSuperadmin }, ops));
    return items;
  };

  const onBlank = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-row]")) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, blankItems);
  };

  const problem = error ?? ops.error;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {isAdmin && (
          <button
            onClick={newTeamFolder}
            disabled={creating}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "#1D9FDA" }}
          >
            {creating ? "Creating…" : "New team folder"}
          </button>
        )}
        {isAdmin && needsReconnect && (
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Team folder changes need extra Zoho permissions. <Link href="/admin" className="underline">Reconnect Zoho</Link> first.
          </span>
        )}
        {ops.busy && <span className="text-sm text-zinc-500">{ops.busy}</span>}
        <span className="ml-auto hidden text-xs text-zinc-500 sm:inline">Right-click for options</span>
        {problem && <p className="w-full text-sm text-red-600">{problem}</p>}
      </div>
      <div onContextMenu={onBlank} className="min-h-[50vh]">
        <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {places.map((p) => {
            const deleted = isDeletedName(p.name);
            return (
              <li
                key={p.id}
                data-row
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(e.clientX, e.clientY, itemMenu(p));
                }}
                onDoubleClick={() => router.push(`/files/${p.id}`)}
                className={`flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900 ${deleted ? "text-zinc-400 dark:text-zinc-500" : ""}`}
              >
                <span className="truncate">
                  <Link href={`/files/${p.id}`} className={`text-sm hover:underline ${deleted ? "line-through" : ""}`}>
                    {p.kind === "file" ? "📄" : "📁"} {p.name}
                  </Link>
                  {deleted && <DeletedBadge />}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-zinc-500">{p.access}</span>
                  <button
                    aria-label={`Options for ${p.name}`}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      openMenu(r.right - 192, r.bottom + 4, itemMenu(p));
                    }}
                    className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  >
                    ⋯
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {share.element}
    </section>
  );
}
