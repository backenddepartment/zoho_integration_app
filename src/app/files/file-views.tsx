"use client";

import Link from "next/link";
import { useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { FileIcon } from "@/components/file-icon";
import { TileName } from "@/components/folder-tile";
import { fmtSize, fmtTime } from "@/components/ui";
import { isDeletedName, isZohoNative } from "@/db/roles";
import type { Row } from "./file-actions";

// How a folder's contents show: big icons (like File Explorer) or a list (like Google Drive).
// Every page load starts on big icons; a switch to the list lasts while moving between folders.

export type FileView = "icons" | "list";

let currentView: FileView = "icons";
const viewListeners = new Set<() => void>();

const readView = () => currentView;

export function setFileView(view: FileView) {
  currentView = view;
  viewListeners.forEach((notify) => notify());
}

function subscribeView(notify: () => void) {
  viewListeners.add(notify);
  return () => {
    viewListeners.delete(notify);
  };
}

/** Big icons by default, on the server and in the browser. */
export function useFileView() {
  return useSyncExternalStore(subscribeView, readView, (): FileView => "icons");
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

/** Google Drive-style list: icon and name, size, last change, and a ⋮ menu per row. */
export function FileList({ files, ...h }: { files: Row[] } & Handlers) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm text-[var(--ink)]">
        <thead>
          <tr className="border-b border-[var(--rule)] text-[13px] text-[var(--ink-3)]">
            <th className="py-3 pr-4 pl-3 font-medium">Name</th>
            <th className="w-32 py-3 pr-4 font-medium">Size</th>
            <th className="w-72 py-3 pr-4 font-medium">Last change</th>
            <th className="w-12 py-3" />
          </tr>
        </thead>
        <tbody>
          {files.map((row) => {
            const deleted = isDeletedName(row.name);
            return (
              <tr
                key={row.id}
                data-row
                onContextMenu={(e) => h.onContextMenu(row, e)}
                onDoubleClick={() => h.onOpen(row)}
                className={`border-b border-[var(--rule)] transition-colors hover:bg-[var(--tint)] ${deleted ? "text-[var(--ink-3)]" : ""}`}
              >
                <td className="py-2.5 pr-4 pl-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <FileIcon name={row.name} extn={row.extn} className="h-7 w-6" />
                    <Link href={`/files/${row.id}`} title={row.name} className={`truncate font-medium hover:underline ${deleted ? "line-through" : ""}`}>
                      {row.name}
                    </Link>
                    {h.badge(row)}
                  </span>
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-[var(--ink-3)]">{sizeOf(row)}</td>
                <td className="py-2.5 pr-4 text-[var(--ink-3)]">
                  <span className="whitespace-nowrap">{fmtTime(row.modifiedMs)}</span>
                  {row.changedBy && (
                    <span className="block truncate text-xs" title={row.changedInApp ? "Recorded by this app" : "As reported by WorkDrive (the connected account)"}>
                      by {row.changedBy}
                      {!row.changedInApp && " (WorkDrive)"}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-2 text-right">
                  <button
                    aria-label={`Options for ${row.name}`}
                    onClick={(e) => h.onOptions(row, e)}
                    className="rounded-full p-1.5 text-[var(--ink-3)] hover:bg-[var(--tint-2)] hover:text-[var(--ink)]"
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
