"use client";

import Link from "next/link";
import { FileIcon } from "@/components/file-icon";
import { FolderGlyph } from "@/components/folder-tile";
import { fmtTime } from "@/components/ui";
import { useFileOps } from "@/app/(app)/files/file-actions";

export type DeletedRow = {
  id: string;
  name: string;
  originalName: string;
  kind: "teamfolder" | "folder" | "file";
  location: string;
  deletedBy: string;
  deletedAt: number | null;
};

const KIND_LABEL = { teamfolder: "Team folder", folder: "Folder", file: "File" };

export function DeletedList({ rows, isSuperadmin }: { rows: DeletedRow[]; isSuperadmin: boolean }) {
  const ops = useFileOps(null);
  if (rows.length === 0) {
    return (
      <div className="board empty-state">
        <svg width="96" height="72" viewBox="0 0 96 72" aria-hidden="true" className="mx-auto">
          <ellipse cx="48" cy="66" rx="34" ry="4" fill="var(--tint-2)" />
          <path d="M26 20h44l-4 40H30z" fill="var(--tint)" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
          <path d="M20 20h56M38 20v-6h20v6" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="48" cy="40" r="9" fill="var(--brand)" />
          <path d="m44 40 3 3 5-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h3>Nothing is deleted</h3>
        <p>Items people delete show up here, and you can put them back.</p>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="section-title">In the bin</h2>
        <span className="tag tag-mute">{rows.length}</span>
        {ops.busy && <span className="text-sm text-[var(--ink-3)]">{ops.busy}</span>}
      </div>
      {ops.error && (
        <div className="alert alert-bad" role="alert">
          <div>{ops.error}</div>
        </div>
      )}
      <div className="table-wrap">
        <table className="data-table min-w-[820px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Was in</th>
              <th>Deleted by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const target = { id: r.id, name: r.name, isFolder: r.kind !== "file", isTeamFolder: r.kind === "teamfolder" };
              return (
                <tr key={r.id}>
                  <td>
                    <div className="cell-who">
                      {r.kind === "file" ? <FileIcon name={r.originalName} /> : <FolderGlyph id={r.id} />}
                      <div className="min-w-0">
                        <Link href={`/files/${r.id}`} className="name">
                          {r.originalName}
                        </Link>
                        <span className="sub">
                          {KIND_LABEL[r.kind]} · In WorkDrive: {r.name}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{r.location}</td>
                  <td>
                    {r.deletedBy}
                    {r.deletedAt && <span className="sub">{fmtTime(r.deletedAt)}</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <span className="inline-flex gap-2">
                      <button onClick={() => ops.restore(target)} disabled={ops.busy !== null} className="btn btn-secondary btn-sm">
                        Restore
                      </button>
                      {isSuperadmin && (
                        <button onClick={() => ops.purge(target)} disabled={ops.busy !== null} className="btn btn-danger btn-sm">
                          Delete permanently
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
