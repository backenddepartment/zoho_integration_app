import "server-only";
import { z } from "zod";

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const schema = z.object({
  DATABASE_URL: z.string().url(),
  // One or more public origins this app is served from, comma-separated. Each one's
  // /api/zoho/callback must be registered as a redirect URI in the Zoho API Console.
  APP_URL: z
    .string()
    .transform((v) => v.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  ZOHO_CLIENT_ID: z.string().min(1),
  ZOHO_CLIENT_SECRET: z.string().min(1),
  // "Sign in with Zoho" can use its own Zoho API Console client (recommended, so it can have
  // multi-DC turned on); without these it uses the client above. Either way, each origin's
  // /api/auth/zoho/callback must be registered as a redirect URI.
  ZOHO_LOGIN_CLIENT_ID: z.string().optional().transform((v) => v || undefined),
  ZOHO_LOGIN_CLIENT_SECRET: z.string().optional().transform((v) => v || undefined),
  ZOHO_ACCOUNTS_URL: z.string().url().default("https://accounts.zoho.com"),
  ZOHO_API_URL: z.string().url().default("https://www.zohoapis.com/workdrive/api/v1"),
  ZOHO_DOWNLOAD_URL: z.string().url().default("https://download.zoho.com/v1/workdrive"),
  TOKEN_ENCRYPTION_KEY: base64Key,
  SESSION_SECRET: z.string().min(32),
});

let cached: z.infer<typeof schema> | undefined;

/** Validated server environment. Throws on first use if anything is missing. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** The request's origin if it is one of APP_URL's origins, otherwise null. */
export function allowedOrigin(requestUrl: URL): string | null {
  const origin = requestUrl.origin;
  return env().APP_URL.some((u) => new URL(u).origin === origin) ? origin : null;
}
