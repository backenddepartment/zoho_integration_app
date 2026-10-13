// Promotes an existing account to superadmin (can delete permanently). Password is unchanged.
//   npm run make-superadmin -- you@getmeds.ph
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run make-superadmin -- you@getmeds.ph");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`update users set role = 'superadmin', active = true where email = ${email} returning id, name`;
if (!rows.length) {
  console.error(`No account with email ${email}. Create it first with npm run create-admin.`);
  process.exit(1);
}
// Role changes end existing sessions so the new role applies on next sign-in.
await sql`delete from sessions where user_id = ${rows[0].id}`;
await sql`insert into audit_log (actor, action, detail) values ('cli', 'user.make_superadmin', ${JSON.stringify({ email })})`;
console.log(`${rows[0].name} (${email}) is now a superadmin. Sign in again.`);
