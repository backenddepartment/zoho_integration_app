import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, wdRoots } from "@/db";
import { record } from "@/lib/activity";
import { apiUser, handle, HttpError } from "@/lib/auth";
import { createTeamFolder, WorkDriveError } from "@/lib/zoho/workdrive";

const body = z.object({ name: z.string().trim().min(1).max(200) });

/** Admins only: create a new team folder in the connected account's team. */
export const POST = handle(async (request: Request) => {
  const user = await apiUser(request, { admin: true });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Team folder name is required (max 200 characters)");
  if (/[\/:*?"<>|]/.test(parsed.data.name)) throw new HttpError(400, 'Names can\'t contain \ / : * ? " < > |');

  // Team folders live in the team the existing ones belong to.
  const [sibling] = await db().select({ teamId: wdRoots.teamId, teamName: wdRoots.teamName }).from(wdRoots).where(eq(wdRoots.kind, "teamfolder")).limit(1);
  if (!sibling) throw new HttpError(409, "Run a scan first so the app knows your Zoho team");

  try {
    const created = await createTeamFolder(sibling.teamId, parsed.data.name, `Created by ${user.name} (${user.email}) via Getmeds Files`);
    await db().insert(wdRoots).values({ id: created.id, kind: "teamfolder", name: created.name, teamId: sibling.teamId, teamName: sibling.teamName, syncedAt: new Date() });
    await record(user, "teamfolder.create", created.id, { name: created.name });
    return Response.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof WorkDriveError && e.code === "F7004") {
      throw new HttpError(403, "Zoho hasn't allowed this app to create team folders yet. Click Reconnect Zoho on the WorkDrive page, approve, and try again.");
    }
    throw e;
  }
});
