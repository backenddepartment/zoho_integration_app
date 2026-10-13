import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeEqual, sign } from "@/lib/crypto";

// Temporary single-admin login guarding the Zoho connection and sync controls.
// Phase 2 replaces this with real user accounts and roles.

const COOKIE = "admin_session";
const MAX_AGE_S = 8 * 60 * 60;

export async function createAdminSession() {
  const expires = Date.now() + MAX_AGE_S * 1000;
  const value = `${expires}.${sign(`admin.${expires}`)}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function destroyAdminSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [expires, mac] = value.split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return safeEqual(mac, sign(`admin.${expires}`));
}

/** For pages: send non-admins to the login page. */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** For route handlers: a 401 response for non-admins, or null to continue. */
export async function adminGuard(): Promise<Response | null> {
  return (await isAdmin()) ? null : Response.json({ error: "Unauthorized" }, { status: 401 });
}
