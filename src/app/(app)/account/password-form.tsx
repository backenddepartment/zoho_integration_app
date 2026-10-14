"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions/auth";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="field">
        <span className="field-label">Current password</span>
        <input name="current" type="password" autoComplete="current-password" required className="field-input field-sm" />
      </label>
      <div className="flex flex-col gap-3">
        <label className="field">
          <span className="field-label">New password</span>
          <input name="next" type="password" autoComplete="new-password" minLength={10} required className="field-input field-sm" />
        </label>
        <label className="field">
          <span className="field-label">Confirm new password</span>
          <input name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field-input field-sm" />
        </label>
      </div>
      <p className="m-0 ml-1 text-xs text-[var(--ink-3)]">At least 10 characters. Saving signs you out on your other devices.</p>
      {state?.error && (
        <div className="alert alert-bad" role="alert">
          <div>{state.error}</div>
        </div>
      )}
      <div>
        <button disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Saving…" : "Save password"}
        </button>
      </div>
    </form>
  );
}
