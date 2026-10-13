import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, displayName, grants, isAdminRole, LEVELS, levelLabel, users } from "@/db";
import { authorize, lineage, ROLE_CAP } from "@/lib/access";
import { record } from "@/lib/activity";
import { apiUser, handle, HttpError } from "@/lib/auth";

type Ctx = RouteContext<"/api/files/[id]/sharing">;

// Like WorkDrive's Share dialog: who has access to this item, and changing it. Open to app admins
// and to anyone who is a Folder admin of the item (directly or through a folder above it).

/** Who has access: direct grants, grants inherited from folders above, and app admins. */
export const GET = handle(async (request: Request, ctx: Ctx) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "share");

  const chain = await lineage(id);
  const above = chain.filter((c) => c.id !== id).map((c) => c.id);
  const names = new Map(chain.filter((c) => c.name).map((c) => [c.id, displayName(c.name!)]));

  const [direct, inherited, admins, people] = await Promise.all([
    db()
      .select({ grantId: grants.id, userId: users.id, name: users.name, email: users.email, role: users.role, level: grants.level })
      .from(grants)
      .innerJoin(users, eq(users.id, grants.userId))
      .where(eq(grants.resourceId, id))
      .orderBy(asc(users.name)),
    above.length
      ? db()
          .select({ userId: users.id, name: users.name, email: users.email, role: users.role, level: grants.level, fromId: grants.resourceId })
          .from(grants)
          .innerJoin(users, eq(users.id, grants.userId))
          .where(inArray(grants.resourceId, above))
          .orderBy(asc(users.name))
      : [],
    db().select({ name: users.name, email: users.email, role: users.role }).from(users).where(inArray(users.role, ["superadmin", "admin"])).orderBy(asc(users.name)),
    db()
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(eq(users.active, true), inArray(users.role, ["staff", "external"])))
      .orderBy(asc(users.name)),
  ]);

  const cap = (role: string, level: number) => Math.min(level, ROLE_CAP[role as keyof typeof ROLE_CAP] ?? level);
  return Response.json({
    name: displayName(node.name),
    kind: node.kind,
    canManageUsers: isAdminRole(user.role),
    direct: direct.map((d) => ({ ...d, level: cap(d.role, d.level), label: levelLabel(cap(d.role, d.level)) })),
    inherited: inherited.map((g) => ({ ...g, level: cap(g.role, g.level), label: levelLabel(cap(g.role, g.level)), from: names.get(g.fromId) ?? "a folder above" })),
    admins,
    people: people.map((p) => ({ ...p, maxLevel: ROLE_CAP[p.role] })),
  });
});

const grantBody = z.object({ userId: z.string().uuid(), level: z.number().int().min(LEVELS.view).max(LEVELS.share) });

/** Give a person access, or change their access (Folder admin or app admin). */
export const POST = handle(async (request: Request, ctx: Ctx) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "share");
  const parsed = grantBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Choose a person and a role");
  const { userId, level } = parsed.data;

  const [target] = await db().select().from(users).where(eq(users.id, userId));
  if (!target || !target.active) throw new HttpError(404, "Unknown or disabled user");
  if (isAdminRole(target.role)) throw new HttpError(400, `${target.name} is an ${target.role} and already has access to everything`);
  if (level > ROLE_CAP[target.role]) throw new HttpError(400, `External users can be at most ${levelLabel(ROLE_CAP[target.role])}`);

  await db()
    .insert(grants)
    .values({ userId, resourceId: id, level, grantedBy: user.id })
    .onConflictDoUpdate({ target: [grants.userId, grants.resourceId], set: { level, grantedBy: user.id, createdAt: new Date() } });
  await record(user, "grant.set", id, { user: target.name, email: target.email, level: levelLabel(level), item: displayName(node.name) });
  return Response.json({ ok: true });
});

/** Remove a person's direct access to this item (Folder admin or app admin). */
export const DELETE = handle(async (request: Request, ctx: Ctx) => {
  const user = await apiUser(request);
  const { id } = await ctx.params;
  const { node } = await authorize(user, id, "share");
  const grantId = Number(new URL(request.url).searchParams.get("grantId"));
  if (!grantId) throw new HttpError(400, "Which access to remove?");

  // Folder admins can't remove their own access, so they can't lock themselves out by accident.
  const where = isAdminRole(user.role) ? and(eq(grants.id, grantId), eq(grants.resourceId, id)) : and(eq(grants.id, grantId), eq(grants.resourceId, id), ne(grants.userId, user.id));
  const [removed] = await db().delete(grants).where(where).returning();
  if (!removed) throw new HttpError(404, "That access wasn't found (you can't remove your own)");
  const [target] = await db().select({ name: users.name, email: users.email }).from(users).where(eq(users.id, removed.userId));
  await record(user, "grant.remove", id, { user: target?.name, email: target?.email, item: displayName(node.name) });
  return Response.json({ ok: true });
});
