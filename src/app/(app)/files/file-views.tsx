"use client";

import Link from "next/link";
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { useContextMenu, type MenuItem } from "@/components/context-menu";
import { FileIcon } from "@/components/file-icon";
import { FolderGlyph, TileName } from "@/components/folder-tile";
import { fmtSize, fmtTime } from "@/components/ui";
import { isDeletedName, isZohoNative } from "@/db/roles";
import type { Row } from "./file-actions";

// How a folder's contents show, laid out like WorkDrive: a list by default (Name, Last modified,
// Size), or big icons. The view, the sort and whether the Details panel is open last while moving
// between folders; the Details panel is also remembered in this browser.

export type FileView = "icons" | "list";
export type SortKey = "name" | "modified" | "size";
export type Sort = { key: SortKey; desc: boolean };

/** A tiny shared value that components subscribe to. */
function store<T>(initial: T, persistKey?: string) {
  let value = initial;
  let loaded = !persistKey;
  const listeners = new Set<() => void>();
  const read = () => {
    if (!loaded) {
      loaded = true;
      try {
        const saved = localStorage.getItem(persistKey!);
        if (saved !== null) value = JSON.parse(saved) as T;
      } catch {}
    }
    return value;
  };
  return {
    read,
    set(next: T) {
      value = next;
      loaded = true;
      if (persistKey) {
        try {
          localStorage.setItem(persistKey, JSON.stringify(next));
        } catch {}
      }
      listeners.forEach((notify) => notify());
    },
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
  };
}

const viewStore = store<FileView>("list");
const sortStore = store<Sort>({ key: "name", desc: false });
const detailsStore = store<boolean>(false, "details-panel");

export const setFileView = viewStore.set;
export const setSort = sortStore.set;
export const setDetailsOpen = detailsStore.set;

export function useFileView() {
  return useSyncExternalStore(viewStore.subscribe, viewStore.read, (): FileView => "list");
}
export function useSort() {
  return useSyncExternalStore(sortStore.subscribe, sortStore.read, () => sortStore.read());
}
export function useDetailsOpen() {
  return useSyncExternalStore(detailsStore.subscribe, detailsStore.read, () => false);
}

/** Folders first, then by the chosen column. */
export function sortRows<T extends Pick<Row, "name" | "isFolder" | "modifiedMs" | "sizeBytes">>(rows: T[], sort: Sort): T[] {
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    const by =
      sort.key === "modified"
        ? (a.modifiedMs ?? 0) - (b.modifiedMs ?? 0)
        : sort.key === "size"
          ? (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)
          : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return (by || a.name.localeCompare(b.name)) * dir;
  });
}

const SORT_LABELS: Record<SortKey, string> = { name: "Name", modified: "Last modified", size: "Size" };

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const toolButton =
  "flex h-9 w-9 items-center justify-center rounded-full text-[var(--ink-3)] transition-colors hover:bg-[var(--tint)] hover:text-[var(--ink)] aria-pressed:bg-[var(--tint-2)] aria-pressed:text-[var(--accent-deep)]";

/** The ⇅ button: pick the column to sort by; picking the current one flips the order. */
export function SortButton() {
  const sort = useSort();
  const open = useContextMenu();
  const items: MenuItem[] = (Object.keys(SORT_LABELS) as SortKey[]).map((key) => ({
    label: `${sort.key === key ? (sort.desc ? "↓ " : "↑ ") : "  "}${SORT_LABELS[key]}`,
    onSelect: () => setSort({ key, desc: sort.key === key ? !sort.desc : key !== "name" }),
  }));
  return (
    <button
      type="button"
      title={`Sort: ${SORT_LABELS[sort.key]}`}
      aria-label="Sort"
      aria-haspopup="menu"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        open(r.right - 192, r.bottom + 6, items);
      }}
      className={toolButton}
    >
      <ToolIcon>
        <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />
      </ToolIcon>
    </button>
  );
}

/** The ⓘ button that opens and closes the Details panel. */
export function DetailsButton() {
  const open = useDetailsOpen();
  return (
    <button type="button" onClick={() => setDetailsOpen(!open)} aria-pressed={open} title="Details" aria-label="Details" className={toolButton}>
      <ToolIcon>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 7.5v.5" />
      </ToolIcon>
    </button>
  );
}

/** Two-part pill switch, like Google Drive's list / grid toggle. */
export function ViewToggle({ view }: { view: FileView }) {
  const option = (value: FileView, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setFileView(value)}
      aria-pressed={view === value}
      title={label}
      aria-label={label}
      className={`flex h-8 items-center gap-1 px-3.5 transition-colors ${
        view === value ? "bg-[var(--tint-2)] text-[var(--accent-deep)]" : "text-[var(--ink-3)] hover:bg-[var(--tint)] hover:text-[var(--ink)]"
      }`}
    >
      {view === value && (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      )}
      {icon}
    </button>
  );
  return (
    <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-full border border-[var(--outline)] bg-[var(--canvas)]">
      {option(
        "list",
        "List",
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>,
      )}
      <span className="w-px bg-[var(--outline)]" aria-hidden="true" />
      {option(
        "icons",
        "Large icons",
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
        </svg>,
      )}
    </div>
  );
}

type Handlers = {
  onContextMenu: (row: Row, e: MouseEvent) => void;
  onOptions: (row: Row, e: MouseEvent<HTMLButtonElement>) => void;
  onOpen: (row: Row) => void;
  badge: (row: Row) => ReactNode;
};

const sizeOf = (row: Row) => (isZohoNative(row.extn) ? "Zoho document" : fmtSize(row.sizeBytes));

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

/** Big icons with the name underneath: grid items placed inside the folders' grid, after the folders. */
export function FileIconTiles({ files, ...h }: { files: Row[] } & Handlers) {
  return (
    <>
      {files.map((row) => {
        const deleted = isDeletedName(row.name);
        return (
          <li
            key={row.id}
            data-row
            onContextMenu={(e) => h.onContextMenu(row, e)}
            onDoubleClick={() => h.onOpen(row)}
            className={`group relative rounded-2xl transition-colors hover:bg-[var(--tint)] ${deleted ? "opacity-50" : ""}`}
          >
            <Link href={`/files/${row.id}`} className="flex flex-col items-center gap-2.5 px-2 pt-5 pb-3 text-center">
              <FileIcon name={row.name} extn={row.extn} className="h-20 w-[70px] drop-shadow-sm transition-transform duration-150 group-hover:-translate-y-0.5" />
              <span className="w-full">
                <TileName name={row.name} lines={2} center struck={deleted} />
              </span>
              <span className="-mt-1.5 text-xs text-[var(--ink-3)]">{sizeOf(row)}</span>
            </Link>
            {h.badge(row) && <div className="-mt-2 pb-2 text-center">{h.badge(row)}</div>}
            <button
              aria-label={`Options for ${row.name}`}
              onClick={(e) => h.onOptions(row, e)}
              className="absolute top-1.5 right-1.5 rounded-full p-1.5 text-[var(--ink-3)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--tint-2)] hover:text-[var(--ink)] focus-visible:opacity-100"
            >
              <MoreIcon />
            </button>
          </li>
        );
      })}
    </>
  );
}

/** A column heading that sorts by its column; the arrow shows the current order. */
function SortHeader({ label, column, className = "" }: { label: string; column: SortKey; className?: string }) {
  const sort = useSort();
  const active = sort.key === column;
  return (
    <th className={`py-3 pr-4 font-medium ${className}`} aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        onClick={() => setSort({ key: column, desc: active ? !sort.desc : column !== "name" })}
        className={`inline-flex items-center gap-1 rounded hover:text-[var(--ink)] ${active ? "text-[var(--ink)]" : ""}`}
      >
        {label}
        {active && <span aria-hidden="true">{sort.desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );
}

/**
 * WorkDrive-style list of everything in the folder: Name (with who changed it underneath),
 * Last modified, Size, and a ⋮ menu. Clicking a row selects it (for the Details panel);
 * the name, or a double-click, opens it.
 */
export function ItemList({
  rows,
  selectedId,
  onSelect,
  ...h
}: { rows: Row[]; selectedId: string | null; onSelect: (row: Row) => void } & Handlers) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm text-[var(--ink)]">
        <thead>
          <tr className="border-b border-[var(--rule)] text-[13px] text-[var(--ink-3)]">
            <SortHeader label="Name" column="name" className="pl-3" />
            <SortHeader label="Last modified" column="modified" className="w-56" />
            <SortHeader label="Size" column="size" className="w-32" />
            <th className="w-12 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const deleted = isDeletedName(row.name);
            const selected = row.id === selectedId;
            return (
              <tr
                key={row.id}
                data-row
                aria-selected={selected}
                onClick={() => onSelect(row)}
                onContextMenu={(e) => {
                  onSelect(row);
                  h.onContextMenu(row, e);
                }}
                onDoubleClick={() => h.onOpen(row)}
                className={`cursor-default border-b border-[var(--rule)] transition-colors ${
                  selected ? "bg-[var(--tint-2)]" : "hover:bg-[var(--tint)]"
                } ${deleted ? "text-[var(--ink-3)]" : ""}`}
              >
                <td className="py-2.5 pr-4 pl-3">
                  <span className="flex min-w-0 items-center gap-3">
                    {row.isFolder ? <FolderGlyph id={row.id} /> : <FileIcon name={row.name} extn={row.extn} className="h-7 w-8" />}
                    <span className="min-w-0">
                      <span className="flex items-center">
                        <Link
                          href={`/files/${row.id}`}
                          title={row.name}
                          onClick={(e) => e.stopPropagation()}
                          className={`truncate font-medium hover:underline ${deleted ? "line-through" : ""}`}
                        >
                          {row.name}
                        </Link>
                        {h.badge(row)}
                      </span>
                      {row.changedBy && (
                        <span
                          className="block truncate text-xs text-[var(--ink-3)]"
                          title={row.changedInApp ? "Recorded by this app" : "As reported by WorkDrive (the connected account)"}
                        >
                          {row.isFolder ? "Changed" : "Uploaded"} by {row.changedBy}
                          {!row.changedInApp && " (WorkDrive)"}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-[var(--ink-3)]">{fmtTime(row.modifiedMs)}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-[var(--ink-3)]">{row.isFolder ? "—" : sizeOf(row)}</td>
                <td className="py-2.5 pr-2 text-right">
                  <button
                    aria-label={`Options for ${row.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(row);
                      h.onOptions(row, e);
                    }}
                    className="rounded-full p-1.5 text-[var(--ink-3)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
                  >
                    <MoreIcon />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The facts the Details panel shows about the selected item (or the folder itself). */
export function detailFacts(row: Pick<Row, "name" | "isFolder" | "extn" | "sizeBytes" | "modifiedMs" | "changedBy" | "changedInApp">) {
  const ext = (row.extn ?? (row.name.includes(".") ? row.name.split(".").pop()! : "")).toUpperCase();
  return [
    { label: "Type", value: row.isFolder ? "Folder" : isZohoNative(row.extn) ? "Zoho document" : ext ? `${ext} file` : "File" },
    ...(row.isFolder ? [] : [{ label: "Size", value: sizeOf(row as Row) }]),
    { label: "Last modified", value: fmtTime(row.modifiedMs) },
    ...(row.changedBy ? [{ label: "Modified by", value: `${row.changedBy}${row.changedInApp ? "" : " (WorkDrive)"}` }] : []),
  ];
}
