"use client";

import { useActionState } from "react";
import { button, input, linkButton } from "@/components/ui";
import { createUserAction, resetPasswordAction } from "./actions";

export function CreateUserForm({ canCreateSuperadmin }: { canCreateSuperadmin: boolean }) {
  const [state, action, pending] = useActionState(createUserAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Role
          <select name="role" defaultValue="staff" className={input}>
            <option value="staff">staff</option>
            <option value="external">external</option>
            <option value="admin">admin</option>
            {canCreateSuperadmin && <option value="superadmin">superadmin</option>}
          </select>
        </label>
        <button disabled={pending} className={button}>
          {pending ? "Creating…" : "Create user"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.created && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Created <b>{state.created.email}</b>. Temporary password: <code className="font-mono select-all">{state.created.password}</code>
          <br />
          Send it to them privately. It is shown only once, and they must change it at first sign-in.
        </p>
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
          New password: <code className="font-mono select-all">{state.password}</code>
        </span>
      ) : (
        <button
          disabled={pending}
          className={linkButton}
          onClick={(e) => {
            if (!window.confirm("Reset this user's password? They will be signed out everywhere.")) e.preventDefault();
          }}
        >
          Reset password
        </button>
      )}
      {state?.error && <span className="text-sm text-red-600"> {state.error}</span>}
    </form>
  );
}
