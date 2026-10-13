import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { isAdminRole } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { allowedOrigin } from "@/lib/env";
import { authorizeUrl } from "@/lib/zoho/oauth";

// Starts the one-time approval: the boss signs in to Zoho and approves this app.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mustChangePassword) return Response.json({ error: "Administrators only" }, { status: 403 });

  const origin = allowedOrigin(request.nextUrl);
  if (!origin) return Response.json({ error: `${request.nextUrl.origin} is not listed in APP_URL` }, { status: 400 });

  const state = randomToken();
  (await cookies()).set("zoho_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/zoho",
    maxAge: 10 * 60,
  });
  return Response.redirect(authorizeUrl(state, origin), 302);
}
