import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { isAdminRole } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { safeEqual } from "@/lib/crypto";
import { allowedOrigin, env } from "@/lib/env";
import { exchangeCode, saveConnection } from "@/lib/zoho/oauth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role) || user.mustChangePassword) return Response.json({ error: "Administrators only" }, { status: 403 });

  const origin = allowedOrigin(request.nextUrl);
  if (!origin) return Response.json({ error: `${request.nextUrl.origin} is not listed in APP_URL` }, { status: 400 });
  const back = (status: string) => Response.redirect(`${origin}/admin?zoho=${encodeURIComponent(status)}`, 302);
  const params = request.nextUrl.searchParams;

  const jar = await cookies();
  const expected = jar.get("zoho_oauth_state")?.value;
  jar.delete({ name: "zoho_oauth_state", path: "/api/zoho" });
  const state = params.get("state");
  if (!expected || !state || !safeEqual(expected, state)) return back("state_mismatch");

  if (params.get("error")) return back(params.get("error")!);
  const code = params.get("code");
  if (!code) return back("missing_code");

  // This app is US-only (zoho.com); refuse tokens from another data center.
  const server = params.get("accounts-server");
  if (server && new URL(server).host !== new URL(env().ZOHO_ACCOUNTS_URL).host) return back("wrong_data_center");

  try {
    const tokens = await exchangeCode(code, origin);
    // users/me needs a stored connection to authenticate, so ask Zoho directly with the fresh token.
    const res = await fetch(`${env().ZOHO_API_URL}/users/me`, {
      headers: { Authorization: `Zoho-oauthtoken ${tokens.accessToken}`, Accept: "application/vnd.api+json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`users/me failed: HTTP ${res.status}`);
    const me = (await res.json()) as { data: { id: string; attributes: { email_id?: string; display_name?: string } } };

    await saveConnection({
      zuid: me.data.id,
      email: me.data.attributes.email_id ?? null,
      displayName: me.data.attributes.display_name ?? null,
      ...tokens,
    });
    await audit(user.email, "zoho.connect", null, { zuid: me.data.id, email: me.data.attributes.email_id });
    return back("connected");
  } catch (e) {
    console.error("Zoho connect failed", e);
    return back("connect_failed");
  }
}
