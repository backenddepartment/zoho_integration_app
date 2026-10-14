import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { allowedOrigin } from "@/lib/env";
import { loginAuthorizeUrl } from "@/lib/zoho/login";

// "Sign in with Zoho": sends the person to Zoho's sign-in page; Zoho sends them back to ./callback.
export async function GET(request: NextRequest) {
  const origin = allowedOrigin(request.nextUrl);
  if (!origin) return Response.json({ error: `${request.nextUrl.origin} is not listed in APP_URL` }, { status: 400 });

  const state = randomToken();
  (await cookies()).set("zoho_login_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/zoho",
    maxAge: 10 * 60,
  });
  return Response.redirect(loginAuthorizeUrl(state, origin), 302);
}
