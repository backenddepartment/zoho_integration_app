"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, users } from "@/db";
import { audit } from "@/lib/audit";
import { endAllSessions, getCurrentUser, login, logout, startSession } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";

export type FormState = { error?: string; ok?: string } | undefined;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  await audit(result.user.email, "auth.login", null);
  redirect(result.user.mustChangePassword ? "/account/password" : "/files");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (next !== confirm) return { error: "The new passwords don't match." };
  if (next === current) return { error: "Choose a password different from the current one." };

  const [row] = await db().select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  if (!row || !(await verifyPassword(current, row.passwordHash))) return { error: "Current password is wrong." };

  await db()
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(users.id, user.id));
  // Sign out other devices; keep this one signed in with a fresh session.
  await endAllSessions(user.id);
  await startSession(user.id);
  await audit(user.email, "auth.password_change", null);
  redirect("/files");
}
