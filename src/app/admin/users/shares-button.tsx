"use client";

import Link from "next/link";
import { notify } from "@/components/dialogs";
import { FileIcon } from "@/components/file-icon";
import { FolderGlyph } from "@/components/folder-tile";

export type SharedItem = {
  id: string;
  name: string;
  kind: "teamfolder" | "folder" | "file" | "gone";
  extn: string | null;
  /** The team folder it sits in, for items inside one. */
  where: string | null;
  access: string;
};

/** The share count in the Users table; clicking it lists what is shared with that person. */
export function SharesButton({ person, items }: { person: string; items: SharedItem[] }) {
  if (items.length === 0) return <span className="tag tag-mute">0</span>;
  return (
    <button
      type="button"
      className="tag tag-info cursor-pointer hover:brightness-95"
      title={`See what's shared with ${person}`}
      onClick={() => notify({ title: `Shared with ${person}`, message: <SharesList items={items} /> })}
    >
      {items.length} {items.length === 1 ? "share" : "shares"}
    </button>
  );
}

function SharesList({ items }: { items: SharedItem[] }) {
  return (
    <ul className="m-0 mt-2 flex max-h-[55vh] list-none flex-col overflow-y-auto p-0 whitespace-normal">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-3 border-b border-[var(--rule)] py-2.5 last:border-b-0">
          {it.kind === "file" ? <FileIcon name={it.name} extn={it.extn} className="h-7 w-6" /> : <FolderGlyph id={it.id} />}
          <div className="min-w-0 flex-1">
            {it.kind === "gone" ? (
              <span className="block truncate font-medium text-[var(--ink-3)]">No longer in WorkDrive</span>
            ) : (
              <Link href={`/files/${it.id}`} className="block truncate font-medium text-[var(--ink)] hover:underline" title={it.name}>
                {it.name}
              </Link>
            )}
            <span className="block truncate text-xs text-[var(--ink-3)]">
              {it.kind === "teamfolder" ? "Team folder" : it.kind === "folder" ? "Folder" : it.kind === "file" ? "File" : "Removed item"}
              {it.where && ` · in ${it.where}`}
            </span>
          </div>
          <span className="tag tag-mute shrink-0">{it.access}</span>
        </li>
      ))}
    </ul>
  );
}
