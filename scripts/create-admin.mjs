// Creates (or resets) an admin account. Usage:
//   npm run create-admin -- you@getmeds.ph "Your Name"
// Prints a temporary password; you must change it at first sign-in.
import { randomBytes, scryptSync } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const [emailArg, ...nameParts] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
const name = nameParts.join(" ").trim() || email;
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run create-admin -- you@getmeds.ph "Your Name"');
  process.exit(1);
}

// Same format as src/lib/password.ts.
const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const password = Array.from(randomBytes(14), (b) => alphabet[b % alphabet.length]).join("");
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const passwordHash = `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  insert into users (email, name, password_hash, role, active, must_change_password)
  values (${email}, ${name}, ${passwordHash}, 'admin', true, true)
  on conflict (email) do update set password_hash = excluded.password_hash, role = 'admin', active = true,
    must_change_password = true, failed_logins = 0, locked_until = null
  returning id`;
await sql`delete from sessions where user_id = ${rows[0].id}`;
await sql`insert into audit_log (actor, action, detail) values ('cli', 'user.create_admin', ${JSON.stringify({ email })})`;

console.log(`Admin ready: ${email}\nTemporary password: ${password}\nSign in at /login and set your own password.`);
