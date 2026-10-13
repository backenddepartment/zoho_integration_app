"use client";

import Link from "next/link";
import { danger, fmtTime, linkButton } from "@/components/ui";
import { useFileOps } from "@/app/files/file-actions";

export type DeletedRow = {
  id: string;
  name: string;
  originalName: string;
  kind: "teamfolder" | "folder" | "file";
  location: string;
  deletedBy: string;
  deletedAt: number | null;
};

const KIND_ICON = { teamfolder: "🗂️", folder: "📁", file: "📄" };

export function DeletedList({ rows, isSuperadmin }: { rows: DeletedRow[]; isSuperadmin: boolean }) {
  const ops = useFileOps(null);
  if (rows.length === 0) return <p className="text-sm text-zinc-500">Nothing is deleted.</p>;
  return (
    <div className="flex flex-col gap-2">
      {ops.busy && <p className="text-sm text-zinc-500">{ops.busy}</p>}
      {ops.error && <p className="text-sm text-red-600">{ops.error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-2 pr-4 font-normal">Name</th>
              <th className="py-2 pr-4 font-normal">Was in</th>
              <th className="py-2 pr-4 font-normal">Deleted by</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const target = { id: r.id, name: r.name, isFolder: r.kind !== "file", isTeamFolder: r.kind === "teamfolder" };
              return (
                <tr key={r.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                  <td className="py-2 pr-4">
                    <Link href={`/files/${r.id}`} className="hover:underline">
                      {KIND_ICON[r.kind]} {r.originalName}
                    </Link>
                    <div className="text-xs text-zinc-500">In WorkDrive: {r.name}</div>
                  </td>
                  <td className="py-2 pr-4">{r.location}</td>
                  <td className="py-2 pr-4">
                    {r.deletedBy}
                    {r.deletedAt && <div className="text-xs text-zinc-500">{fmtTime(r.deletedAt)}</div>}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <span className="inline-flex gap-3">
                      <button onClick={() => ops.restore(target)} disabled={ops.busy !== null} className={linkButton}>
                        Restore
                      </button>
                      {isSuperadmin && (
                        <button onClick={() => ops.purge(target)} disabled={ops.busy !== null} className={danger}>
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
    </div>
  );
}
