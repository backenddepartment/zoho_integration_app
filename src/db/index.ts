import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  instance ??= drizzle(neon(env().DATABASE_URL), { schema });
  return instance;
}

export * from "./schema";
