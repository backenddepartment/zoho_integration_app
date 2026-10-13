import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Same files Next.js reads; .env.local wins over .env.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
