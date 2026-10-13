"use server";

import { redirect } from "next/navigation";
import { createAdminSession, destroyAdminSession } from "@/lib/admin-session";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!safeEqual(password, env().ADMIN_PASSWORD)) return { error: "Wrong password" };
  await createAdminSession();
  redirect("/admin");
}

export async function logout() {
  await destroyAdminSession();
  redirect("/admin/login");
}
