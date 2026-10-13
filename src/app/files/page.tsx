import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { db, displayName, isAdminRole, LEVELS, zohoConnection } from "@/db";
import { AppHeader } from "@/components/app-header";
import { Loading } from "@/components/ui";
import { entryPoints, LEVEL_NAMES } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { CONNECTION_ID, ZOHO_SCOPES } from "@/lib/zoho/oauth";
import { LiveSync } from "./live-sync";
import { PlacesBrowser } from "./places-browser";

export const metadata = { title: "Files" };

export default function FilesHome() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const user = await requireUser();
  const isAdmin = isAdminRole(user.role);
  const places = await entryPoints(user);
  const [conn] = isAdmin ? await db().select({ scopes: zohoConnection.scopes }).from(zohoConnection).where(eq(zohoConnection.id, CONNECTION_ID)) : [];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
        {isAdmin && <LiveSync url="/api/sync/roots" />}
        <h1 className="text-2xl font-semibold">{isAdmin ? "All team folders" : "Shared with you"}</h1>
        {places.length === 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {isAdmin ? "Nothing indexed yet. Run a scan on the WorkDrive page." : "Nothing has been shared with you yet. Ask an administrator for access."}
          </p>
        )}
        <PlacesBrowser
          places={places.map((p) => ({
            id: p.id,
            name: displayName(p.name),
            kind: p.kind,
            access: LEVEL_NAMES[p.level],
            isTeamFolder: p.rootKind === "teamfolder",
            canManage: p.level >= LEVELS.manage,
          }))}
          isAdmin={isAdmin}
          isSuperadmin={user.role === "superadmin"}
          needsReconnect={Boolean(conn) && conn.scopes !== ZOHO_SCOPES}
        />
      </main>
    </>
  );
}
