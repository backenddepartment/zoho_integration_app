import "server-only";
import { eq } from "drizzle-orm";
import { db, zohoConnection } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";

export const CONNECTION_ID = "default";

// WorkDrive.users.READ is not on Zoho's scope page but users/me and users/{id}/teams require it.
export const ZOHO_SCOPES = [
  "WorkDrive.users.READ",
  "WorkDrive.team.READ",
  "WorkDrive.teamfolders.READ",
  "WorkDrive.files.ALL",
  "ZohoFiles.files.READ",
  "ZohoFiles.files.CREATE",
].join(",");

const redirectUri = () => `${env().APP_URL}/api/zoho/callback`;

export function authorizeUrl(state: string): string {
  const url = new URL("/oauth/v2/auth", env().ZOHO_ACCOUNTS_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env().ZOHO_CLIENT_ID,
    scope: ZOHO_SCOPES,
    redirect_uri: redirectUri(),
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(new URL("/oauth/v2/token", env().ZOHO_ACCOUNTS_URL), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env().ZOHO_CLIENT_ID,
      client_secret: env().ZOHO_CLIENT_SECRET,
      ...params,
    }),
    cache: "no-store",
  });
  // Zoho returns 200 with {"error": "..."} for most failures.
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok && !body.error) body.error = `HTTP ${res.status}`;
  return body;
}

export async function exchangeCode(code: string) {
  const body = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  if (body.error || !body.access_token) throw new Error(`Zoho token exchange failed: ${body.error}`);
  if (!body.refresh_token) {
    throw new Error("Zoho returned no refresh token. Remove the app under Zoho → Connected Apps and connect again.");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
  };
}

export async function saveConnection(input: {
  zuid: string;
  email: string | null;
  displayName: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}) {
  const row = {
    id: CONNECTION_ID,
    zuid: input.zuid,
    email: input.email,
    displayName: input.displayName,
    refreshTokenEnc: encrypt(input.refreshToken),
    accessTokenEnc: encrypt(input.accessToken),
    accessTokenExpiresAt: input.expiresAt,
    scopes: ZOHO_SCOPES,
    connectedAt: new Date(),
    lastRefreshError: null,
    lastRefreshErrorAt: null,
  };
  await db()
    .insert(zohoConnection)
    .values(row)
    .onConflictDoUpdate({ target: zohoConnection.id, set: row });
}

export class ZohoNotConnectedError extends Error {
  constructor(message = "Zoho WorkDrive is not connected. An admin must connect it at /admin.") {
    super(message);
  }
}

// Refresh this long before expiry so a request never starts with a nearly dead token.
const EARLY_REFRESH_MS = 5 * 60 * 1000;
let inflight: Promise<string> | null = null;

/**
 * A valid access token for the boss's account. Reuses the cached token from the database;
 * Zoho allows only 10 refreshes per refresh token per 10 minutes, so never refresh per request.
 */
export async function getAccessToken(): Promise<string> {
  const [conn] = await db().select().from(zohoConnection).where(eq(zohoConnection.id, CONNECTION_ID));
  if (!conn) throw new ZohoNotConnectedError();

  if (conn.accessTokenEnc && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() - Date.now() > EARLY_REFRESH_MS) {
    return decrypt(conn.accessTokenEnc);
  }

  inflight ??= refresh(decrypt(conn.refreshTokenEnc)).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Called after a 401 from WorkDrive: the cached token was rejected, so drop it. */
export async function invalidateAccessToken() {
  await db()
    .update(zohoConnection)
    .set({ accessTokenEnc: null, accessTokenExpiresAt: null })
    .where(eq(zohoConnection.id, CONNECTION_ID));
}

async function refresh(refreshToken: string): Promise<string> {
  const body = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  if (body.error || !body.access_token) {
    const message =
      body.error === "invalid_code"
        ? "Zoho refresh token was revoked or is invalid. Reconnect at /admin."
        : `Zoho token refresh failed: ${body.error}`;
    await db()
      .update(zohoConnection)
      .set({ lastRefreshError: message, lastRefreshErrorAt: new Date() })
      .where(eq(zohoConnection.id, CONNECTION_ID));
    throw new ZohoNotConnectedError(message);
  }
  await db()
    .update(zohoConnection)
    .set({
      accessTokenEnc: encrypt(body.access_token),
      accessTokenExpiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
      lastRefreshError: null,
      lastRefreshErrorAt: null,
    })
    .where(eq(zohoConnection.id, CONNECTION_ID));
  return body.access_token;
}
