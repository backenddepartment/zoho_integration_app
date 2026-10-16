"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/app/actions/auth";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">Name</span>
          <input name="name" defaultValue={name} required maxLength={100} autoComplete="name" className="field-input field-sm" />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input value={email} readOnly disabled className="field-input field-sm cursor-not-allowed opacity-70" aria-describedby="email-note" />
        </label>
      </div>
      <p id="email-note" className="m-0 ml-1 text-xs text-[var(--ink-3)]">
        Your email is how you sign in, so only an admin can change it.
      </p>
      {state?.error && (
        <div className="alert alert-bad" role="alert">
          <div>{state.error}</div>
        </div>
      )}
      {state?.ok && (
        <div className="alert alert-info" role="status">
          <div>{state.ok}</div>
        </div>
      )}
      <div>
        <button disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
