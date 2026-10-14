import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { loginWithVerifiedEmail } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { allowedOrigin } from "@/lib/env";
import { accountsServer, exchangeLoginCode, UnverifiedEmailError, type ZohoIdentity } from "@/lib/zoho/login";

// Zoho sends the person back here after "Sign in with Zoho". Problems go back to the login page
// as ?zoho=<reason>, which the form shows under the Zoho button.
export async function GET(request: NextRequest) {
  const origin = allowedOrigin(request.nextUrl);
  if (!origin) return Response.json({ error: `${request.nextUrl.origin} is not listed in APP_URL` }, { status: 400 });
  const fail = (reason: string) => Response.redirect(`${origin}/login?zoho=${encodeURIComponent(reason)}`, 302);
  const params = request.nextUrl.searchParams;

  const jar = await cookies();
  const expected = jar.get("zoho_login_state")?.value;
  jar.delete({ name: "zoho_login_state", path: "/api/auth/zoho" });
  const state = params.get("state");
  if (!expected || !state || !safeEqual(expected, state)) return fail("expired");

  if (params.get("error")) return fail(params.get("error") === "access_denied" ? "cancelled" : "failed");
  const code = params.get("code");
  if (!code) return fail("failed");

  let identity: ZohoIdentity;
  try {
    identity = await exchangeLoginCode(code, origin, accountsServer(params.get("accounts-server")));
  } catch (e) {
    if (e instanceof UnverifiedEmailError) return fail("unverified");
    console.error("Zoho sign-in failed", e);
    return fail("failed");
  }

  // A company email with no account yet gets one here (see loginWithVerifiedEmail).
  const result = await loginWithVerifiedEmail(identity.email, identity.name);
  if (!result.ok) return fail(result.error.startsWith("There's no") ? "no_account" : "disabled");
  if (result.created) await audit(result.user.email, "user.create", null, { email: result.user.email, role: result.user.role, via: "zoho" });
  await audit(result.user.email, "auth.login", null, { method: "zoho" });
  return Response.redirect(`${origin}${result.user.mustChangePassword ? "/account" : "/files"}`, 302);
}
