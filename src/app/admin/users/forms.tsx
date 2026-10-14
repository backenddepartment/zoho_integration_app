"use client";

import { useActionState } from "react";
import { askConfirm } from "@/components/dialogs";
import { createUserAction, resetPasswordAction } from "./actions";

export function CreateUserForm({ canCreateSuperadmin }: { canCreateSuperadmin: boolean }) {
  const [state, action, pending] = useActionState(createUserAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_auto]">
        <label className="field">
          <span className="field-label">Name</span>
          <input name="name" required placeholder="Juan dela Cruz" className="field-input" />
        </label>
        <label className="field">
          <span className="field-label">Email</span>
          <input name="email" type="email" required placeholder="name@getmeds.ph" className="field-input" />
        </label>
        <label className="field">
          <span className="field-label">Role</span>
          <select name="role" defaultValue="staff" className="field-select">
            <option value="staff">Staff</option>
            <option value="external">External</option>
            <option value="admin">Admin</option>
            {canCreateSuperadmin && <option value="superadmin">Superadmin</option>}
          </select>
        </label>
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Creating…" : "Create user"}
        </button>
      </div>
      {state?.error && (
        <div className="alert alert-bad" role="alert">
          <div>
            <b>The user wasn&apos;t created</b>
            {state.error}
          </div>
        </div>
      )}
      {state?.created && (
        <div className="alert alert-warn" role="status">
          <div>
            <b>Created {state.created.email}</b>
            Temporary password: <code className="code-chip font-mono select-all">{state.created.password}</code>. Send it to them privately. It is shown only
            once, and they must change it at first sign-in.
          </div>
        </div>
      )}
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="userId" value={userId} />
      {state?.password ? (
        <span className="text-sm">
          New password: <code className="code-chip font-mono select-all">{state.password}</code>
        </span>
      ) : (
        <button
          disabled={pending}
          className="btn btn-quiet btn-xs"
          onClick={async (e) => {
            // Hold the submit until the modal answers, then send the form ourselves.
            e.preventDefault();
            const form = e.currentTarget.form;
            const ok = await askConfirm({
              title: "Reset password?",
              message: "They'll get a new temporary password and be signed out everywhere.",
              confirmLabel: "Reset password",
              danger: true,
            });
            if (ok) form?.requestSubmit();
          }}
        >
          Reset password
        </button>
      )}
      {state?.error && <span className="tag tag-bad ml-2">{state.error}</span>}
    </form>
  );
}
