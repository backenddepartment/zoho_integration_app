"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, grants, isAdminRole, LEVELS, users } from "@/db";
import { getNode } from "@/lib/access";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

async function admin() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mustChangePassword) throw new Error("Administrators only");
  return user;
}

const grantInput = z.object({
  resourceId: z.string().min(1),
  userId: z.string().uuid(),
  level: z.enum(["view", "edit", "manage"]),
});

export async function addGrantAction(formData: FormData) {
  const me = await admin();
  const input = grantInput.parse(Object.fromEntries(formData));
  const [target] = await db().select({ email: users.email }).from(users).where(eq(users.id, input.userId));
  if (!target || !(await getNode(input.resourceId))) throw new Error("Unknown user or file");

  await db()
    .insert(grants)
    .values({ userId: input.userId, resourceId: input.resourceId, level: LEVELS[input.level], grantedBy: me.id })
    .onConflictDoUpdate({ target: [grants.userId, grants.resourceId], set: { level: LEVELS[input.level], grantedBy: me.id, createdAt: new Date() } });
  await audit(me.email, "grant.set", input.resourceId, { user: target.email, level: input.level });
  revalidatePath(`/files/${input.resourceId}`);
}

export async function removeGrantAction(formData: FormData) {
  const me = await admin();
  const id = Number(formData.get("grantId"));
  const [removed] = await db().delete(grants).where(and(eq(grants.id, id))).returning();
  if (removed) {
    await audit(me.email, "grant.remove", removed.resourceId, { userId: removed.userId, level: removed.level });
    revalidatePath(`/files/${removed.resourceId}`);
  }
}
