import "server-only";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Errors where the connection to the database was never made, so the query was never sent and
// retrying it is safe even for writes. A flaky network otherwise fails the whole page.
const CONNECT_ERRORS = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);

neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      const code = ((e as { cause?: { code?: string } }).cause ?? {}).code;
      if (attempt >= 3 || !code || !CONNECT_ERRORS.has(code)) throw e;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
};

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  instance ??= drizzle(neon(env().DATABASE_URL), { schema });
  return instance;
}

export * from "./schema";
export * from "./roles";
