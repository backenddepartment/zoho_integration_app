import "server-only";
import { env } from "@/lib/env";

// "Sign in with Zoho" (OpenID Connect). Only proves who someone is: it asks Zoho for their
// verified email and nothing else, and keeps no Zoho token. It has nothing to do with the
// boss's WorkDrive connection in ./oauth.ts.

const SCOPES = "openid,email,profile";

function client() {
  const e = env();
  return e.ZOHO_LOGIN_CLIENT_ID && e.ZOHO_LOGIN_CLIENT_SECRET
    ? { id: e.ZOHO_LOGIN_CLIENT_ID, secret: e.ZOHO_LOGIN_CLIENT_SECRET }
    : { id: e.ZOHO_CLIENT_ID, secret: e.ZOHO_CLIENT_SECRET };
}

export const loginRedirectUri = (origin: string) => `${origin}/api/auth/zoho/callback`;

export function loginAuthorizeUrl(state: string, origin: string): string {
  const url = new URL("/oauth/v2/auth", env().ZOHO_ACCOUNTS_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: client().id,
    scope: SCOPES,
    redirect_uri: loginRedirectUri(origin),
    state,
  }).toString();
  return url.toString();
}

/**
 * Zoho's accounts server for the person's data center (accounts.zoho.com, .eu, .in, …), as sent
 * back in `accounts-server`. Only real Zoho accounts hosts are accepted, so the code and client
 * secret are never sent anywhere else.
 */
export function accountsServer(param: string | null): string {
  if (!param) return env().ZOHO_ACCOUNTS_URL;
  const url = new URL(param);
  if (url.protocol !== "https:" || !/^accounts\.zoho\.[a-z]{2,3}(\.[a-z]{2})?$/.test(url.host)) throw new Error(`Unexpected accounts server ${param}`);
  return url.origin;
}

export type ZohoIdentity = { sub: string; email: string; name: string | null };

/** Trades the code for an ID token and returns the verified identity in it. */
export async function exchangeLoginCode(code: string, origin: string, server: string): Promise<ZohoIdentity> {
  const { id, secret } = client();
  const res = await fetch(new URL("/oauth/v2/token", server), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "authorization_code", code, redirect_uri: loginRedirectUri(origin) }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!body.id_token) throw new Error(`Zoho sign-in token exchange failed: ${body.error ?? `HTTP ${res.status}`}`);

  // The token came straight from Zoho over TLS in exchange for our client secret, so (as OpenID
  // Connect allows for this flow) its claims are checked rather than its signature.
  const [, payload] = body.id_token.split(".");
  const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as {
    sub?: string;
    aud?: string | string[];
    iss?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    first_name?: string;
    last_name?: string;
  };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(id)) throw new Error("Zoho ID token is for another app");
  if (!claims.iss || !/^(https:\/\/)?accounts\.zoho\./.test(claims.iss)) throw new Error(`Zoho ID token from unexpected issuer ${claims.iss}`);
  if (!claims.exp || claims.exp * 1000 < Date.now() - 60_000) throw new Error("Zoho ID token has expired");
  if (!claims.sub || !claims.email) throw new Error("Zoho didn't share the account's email");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new UnverifiedEmailError();

  const name = claims.name ?? ([claims.first_name, claims.last_name].filter(Boolean).join(" ") || null);
  return { sub: claims.sub, email: claims.email.trim().toLowerCase(), name };
}

export class UnverifiedEmailError extends Error {
  constructor() {
    super("The Zoho account's email isn't verified");
  }
}
