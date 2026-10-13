import { apiUser, handle } from "@/lib/auth";
import { refreshRoots } from "@/lib/sync/live";

/** Admins: re-reads the team folder list from WorkDrive; answers whether it changed. */
export const POST = handle(async (request: Request) => {
  await apiUser(request, { admin: true });
  return Response.json({ exists: true, changed: await refreshRoots() });
});
