"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, isAdminRole, ROLES, users } from "@/db";
import { audit } from "@/lib/audit";
import { endAllSessions, getCurrentUser } from "@/lib/auth";
import { generatePassword, hashPassword } from "@/lib/password";

export type UserFormState = { error?: string; created?: { email: string; password: string } } | undefined;
export type ResetState = { error?: string; password?: string } | undefined;

async function admin() {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mustChangePassword) throw new Error("Administrators only");
  return user;
}

// Only a superadmin may create, change or reset a superadmin, or make someone one.
const SUPER_ONLY = "Only a superadmin can manage superadmin accounts";

const newUser = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
});

export async function createUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const me = await admin();
  const parsed = newUser.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email, a name and a role." };
  const { email, name, role } = parsed.data;
  if (role === "superadmin" && me.role !== "superadmin") return { error: SUPER_ONLY };

  const [exists] = await db().select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) return { error: "A user with this email already exists." };

  const password = generatePassword();
  await db()
    .insert(users)
    .values({ email, name, role, passwordHash: await hashPassword(password), mustChangePassword: true });
  await audit(me.email, "user.create", null, { email, role });
  revalidatePath("/admin/users");
  return { created: { email, password } };
}

export async function updateUserAction(formData: FormData) {
  const me = await admin();
  const id = z.string().uuid().parse(formData.get("userId"));
  const role = z.enum(ROLES).parse(formData.get("role"));
  const active = formData.get("active") === "on";
  if (id === me.id && (role !== me.role || !active)) throw new Error("You can't change your own role or disable yourself");

  const [before] = await db().select().from(users).where(eq(users.id, id));
  if (!before) throw new Error("Unknown user");
  if ((before.role === "superadmin" || role === "superadmin") && me.role !== "superadmin") throw new Error(SUPER_ONLY);
  await db().update(users).set({ role, active }).where(eq(users.id, id));
  if (before.role !== role || (before.active && !active)) await endAllSessions(id);
  await audit(me.email, "user.update", null, { email: before.email, role, active });
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const me = await admin();
  const id = z.string().uuid().parse(formData.get("userId"));
  const [target] = await db().select({ email: users.email, role: users.role }).from(users).where(eq(users.id, id));
  if (!target) return { error: "Unknown user" };
  if (target.role === "superadmin" && me.role !== "superadmin") return { error: SUPER_ONLY };

  const password = generatePassword();
  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, id));
  await endAllSessions(id);
  await audit(me.email, "user.reset_password", null, { email: target.email });
  return { password };
}
