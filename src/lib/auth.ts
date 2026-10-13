import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { db, isAdminRole, sessions, users, type Role } from "@/db";
import { burnPasswordCheck, verifyPassword } from "@/lib/password";
import { env } from "@/lib/env";
import { ZohoNotConnectedError } from "@/lib/zoho/oauth";
import { WorkDriveError } from "@/lib/zoho/workdrive";

const COOKIE = "sid";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

export type CurrentUser = { id: string; email: string; name: string; role: Role; mustChangePassword: boolean };

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export type LoginResult = { ok: true; user: CurrentUser } | { ok: false; error: string };

export async function login(emailInput: string, password: string): Promise<LoginResult> {
  const email = emailInput.trim().toLowerCase();
  const generic = { ok: false as const, error: "Wrong email or password." };
  const [user] = await db().select().from(users).where(eq(users.email, email));

  if (!user) {
    await burnPasswordCheck(password);
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: "Too many failed attempts. Try again in 15 minutes." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db()
      .update(users)
      .set(failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: failed })
      .where(eq(users.id, user.id));
    return generic;
  }
  if (!user.active) return { ok: false, error: "This account is disabled. Ask an administrator." };

  await db().update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await startSession(user.id);
  return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword } };
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db().insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  await setSessionCookie(token, expiresAt);
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(COOKIE);
}

/** Ends every session of a user (password reset, role change, disabling). */
export async function endAllSessions(userId: string) {
  await db().delete(sessions).where(eq(sessions.userId, userId));
}

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Compares against the current time, so it must run per request, never prerendered.
  await connection();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db()
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, mustChangePassword: users.mustChangePassword })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, sql`now()`), eq(users.active, true)));
  return row ?? null;
});

// ---------- pages ----------

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isAdminRole(user.role)) redirect("/files");
  return user;
}

// ---------- route handlers ----------

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The signed-in user for an API request, or throws 401. Requests that change data must come from
 * one of this app's own origins, which blocks cross-site form posts.
 */
export async function apiUser(request: Request, opts: { admin?: boolean } = {}): Promise<CurrentUser> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = (await headers()).get("origin");
    const allowed = env().APP_URL.map((u) => new URL(u).origin);
    if (!origin || !allowed.includes(origin)) throw new HttpError(403, "Cross-site request refused");
  }
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Sign in required");
  if (user.mustChangePassword) throw new HttpError(403, "Change your password first");
  if (opts.admin && !isAdminRole(user.role)) throw new HttpError(403, "Administrators only");
  return user;
}

/** Wraps a route handler so HttpErrors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof WorkDriveError && e.code === "F7004") {
        return Response.json({ error: "Zoho hasn't given this app permission for that yet. An admin must click Reconnect Zoho on the WorkDrive page and approve." }, { status: 403 });
      }
      if (e instanceof WorkDriveError) {
        console.error(e);
        return Response.json({ error: e.message }, { status: e.status === 404 || e.status === 409 ? e.status : 502 });
      }
      if (e instanceof ZohoNotConnectedError) return Response.json({ error: e.message }, { status: 503 });
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
    }
  };
}
