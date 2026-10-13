import { cookies } from "next/headers";
import { adminGuard } from "@/lib/admin-session";
import { randomToken } from "@/lib/crypto";
import { authorizeUrl } from "@/lib/zoho/oauth";

// Starts the one-time approval: the boss signs in to Zoho and approves this app.
export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

  const state = randomToken();
  (await cookies()).set("zoho_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/zoho",
    maxAge: 10 * 60,
  });
  return Response.redirect(authorizeUrl(state), 302);
}
