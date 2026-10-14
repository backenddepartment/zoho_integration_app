"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, users } from "@/db";
import { audit } from "@/lib/audit";
import { endAllSessions, getCurrentUser, login, logout, startSession } from "@/lib/auth";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";

export type FormState = { error?: string; ok?: string } | undefined;
export type LoginFormState = { error: string; wrongCredentials?: true } | undefined;

export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const result = await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error, wrongCredentials: result.wrongCredentials };
  await audit(result.user.email, "auth.login", null);
  redirect(result.user.mustChangePassword ? "/account" : "/files");
}

/**
 * The login's first step, as on Zoho's sign-in page: is there an account for this email? Only
 * then does the password field show. (It tells anyone whether an email has an account, the
 * trade-off this two-step layout makes; the password itself stays guarded by the lockout.)
 */
export async function lookupEmailAction(emailInput: string): Promise<{ found: true } | { found: false; error: string }> {
  const email = String(emailInput ?? "").trim().toLowerCase();
  if (!email) return { found: false, error: "Enter your email." };
  const [user] = await db().select({ active: users.active }).from(users).where(eq(users.email, email));
  if (!user) return { found: false, error: "Couldn't find an account with this email. Check it, or ask an administrator to add you." };
  if (!user.active) return { found: false, error: "This account is disabled. Ask an administrator." };
  return { found: true };
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

/** Changes the signed-in person's display name. The email is their sign-in, so only an admin changes that. */
export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter your name." };
  if (name.length > 100) return { error: "Use 100 characters or fewer." };
  if (name === user.name) return { ok: "Nothing to change." };

  await db().update(users).set({ name }).where(eq(users.id, user.id));
  await audit(user.email, "auth.profile_update", null, { from: user.name, to: name });
  // The sidebar shows the name on every page.
  revalidatePath("/", "layout");
  return { ok: "Saved." };
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
