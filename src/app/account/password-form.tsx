"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { button, input } from "@/components/ui";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Current password
        <input name="current" type="password" autoComplete="current-password" required className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        New password (at least 10 characters)
        <input name="next" type="password" autoComplete="new-password" minLength={10} required className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Confirm new password
        <input name="confirm" type="password" autoComplete="new-password" minLength={10} required className={input} />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={button}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
