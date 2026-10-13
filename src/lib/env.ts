import "server-only";
import { z } from "zod";

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const schema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url(),
  ZOHO_CLIENT_ID: z.string().min(1),
  ZOHO_CLIENT_SECRET: z.string().min(1),
  ZOHO_ACCOUNTS_URL: z.string().url().default("https://accounts.zoho.com"),
  ZOHO_API_URL: z.string().url().default("https://www.zohoapis.com/workdrive/api/v1"),
  ZOHO_DOWNLOAD_URL: z.string().url().default("https://download.zoho.com/v1/workdrive"),
  TOKEN_ENCRYPTION_KEY: base64Key,
  SESSION_SECRET: z.string().min(32),
  ADMIN_PASSWORD: z.string().min(12),
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
