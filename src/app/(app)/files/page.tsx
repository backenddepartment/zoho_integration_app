import { eq } from "drizzle-orm";
import { db, displayName, isAdminRole, levelLabel, LEVELS, zohoConnection } from "@/db";
import { entryPoints } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { CONNECTION_ID, ZOHO_SCOPES } from "@/lib/zoho/oauth";
import { LiveSync } from "./live-sync";
import { PlacesBrowser } from "./places-browser";

export const metadata = { title: "Files" };
// The page reads the signed-in user, so it can't be instant; loading.tsx beside it shows
// the loading page meanwhile.
export const instant = false;

export default function FilesHome() {
  return <Content />;
}

async function Content() {
  const user = await requireUser();
  const isAdmin = isAdminRole(user.role);
  const places = await entryPoints(user);
  const [conn] = isAdmin ? await db().select({ scopes: zohoConnection.scopes }).from(zohoConnection).where(eq(zohoConnection.id, CONNECTION_ID)) : [];

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pt-3 sm:pt-4 pb-8">
        {/* Top Banner with Illustration */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#182232] via-[#1d2b3e] to-[#25374e] px-6 py-5 sm:px-8 sm:py-5.5 text-white border border-[#2b3e58]">
          {/* Subtle background glow */}
          <div
            className="absolute -right-8 -top-8 h-48 w-48 rounded-full bg-[#1EA0DA]/20 blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col justify-center max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#1EA0DA]/20 border border-[#1EA0DA]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[#38BDF8] w-fit mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1EA0DA] animate-pulse" />
              Zoho WorkDrive
            </div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
              {isAdmin ? "All team folders" : "Shared with you"}
            </h1>
            <p className="mt-1 text-xs sm:text-[13px] text-slate-300/90 whitespace-nowrap">
              Centralized repository for all departments and team files synced with Zoho WorkDrive.
            </p>
          </div>

          {/* Illustration on the right side */}
          <div className="absolute right-0 bottom-0 hidden md:flex items-end justify-end pointer-events-none pr-2 lg:pr-6 overflow-hidden h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bannerimage.png"
              alt="WorkDrive team folders illustration"
              className="max-h-24 md:max-h-26 lg:max-h-28 w-auto object-contain object-bottom drop-shadow-xl select-none"
            />
          </div>
        </div>

        {isAdmin && <LiveSync url="/api/sync/roots" />}

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
            access: isAdmin ? "" : levelLabel(p.level),
            isTeamFolder: p.rootKind === "teamfolder",
            canManage: p.level >= LEVELS.manage,
            canShare: p.level >= LEVELS.share,
          }))}
          isAdmin={isAdmin}
          isSuperadmin={user.role === "superadmin"}
          needsReconnect={Boolean(conn) && conn.scopes !== ZOHO_SCOPES}
        />
      </main>
    </>
  );
}
