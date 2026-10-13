import "server-only";
import { auditLog, db } from "@/db";

export async function audit(actor: string, action: string, resourceId: string | null, detail?: Record<string, unknown>) {
  await db().insert(auditLog).values({ actor, action, resourceId, detail: detail ?? null });
}
