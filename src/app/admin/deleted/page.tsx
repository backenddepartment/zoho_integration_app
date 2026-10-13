import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Suspense } from "react";
import { db, deletedByFromName, displayName, wdItems, wdRoots } from "@/db";
import { AppHeader } from "@/components/app-header";
import { Loading } from "@/components/ui";
import { activityFor } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { DeletedList, type DeletedRow } from "./deleted-list";

export const metadata = { title: "Deleted items" };

export default function DeletedPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

// Postgres regex equivalent of DELETED_PATTERN in src/db/roles.ts; keep the two in step.
const DELETED_SQL = "^\\(Deleted\\y[^)]*\\) ";

async function Content() {
  const me = await requireAdmin();
  const parent = alias(wdItems, "parent");

  const [roots, items] = await Promise.all([
    db().select({ id: wdRoots.id, name: wdRoots.name }).from(wdRoots).where(sql`${wdRoots.name} ~ ${DELETED_SQL}`),
    db()
      .select({ id: wdItems.id, name: wdItems.name, isFolder: wdItems.isFolder, rootName: wdRoots.name, parentName: parent.name })
      .from(wdItems)
      .leftJoin(wdRoots, eq(wdRoots.id, wdItems.rootId))
      .leftJoin(parent, eq(parent.id, wdItems.parentId))
      .where(sql`${wdItems.name} ~ ${DELETED_SQL}`),
  ]);
  const who = await activityFor([...roots.map((r) => r.id), ...items.map((i) => i.id)]);

  const rows: DeletedRow[] = [
    ...roots.map((r) => ({ id: r.id, name: r.name, kind: "teamfolder" as const, location: "Team folders" })),
    ...items.map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.isFolder ? ("folder" as const) : ("file" as const),
      location: [i.rootName && displayName(i.rootName), i.parentName && displayName(i.parentName)].filter((x, n, a) => x && a.indexOf(x) === n).join(" / ") || "—",
    })),
  ]
    .map((r) => {
      const last = who.get(r.id)?.last;
      const viaApp = last && (last.action === "file.delete" || last.action === "teamfolder.delete");
      return {
        ...r,
        originalName: displayName(r.name),
        deletedBy: (viaApp ? last.name : null) ?? deletedByFromName(r.name) ?? "Unknown (renamed in WorkDrive)",
        deletedAt: viaApp ? last.at.getTime() : null,
      };
    })
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  return (
    <>
      <AppHeader user={me} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Deleted items</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Deleting renames an item in WorkDrive to &quot;(Deleted by name) …&quot; and hides it from everyone in this app. Restore puts the original name back.
          {me.role === "superadmin" ? " As a superadmin you can also delete permanently." : " Only a superadmin can delete permanently."}
        </p>
        <DeletedList rows={rows} isSuperadmin={me.role === "superadmin"} />
      </main>
    </>
  );
}
