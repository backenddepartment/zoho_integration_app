"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { loginAction } from "@/app/actions/auth";
import { poppins } from "./font";

const ICON_PATHS = {
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
};

function Icon({ name, size = 16 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// The card's entrance animation leaves a transform on an ancestor, which would trap a fixed toast inside the card.
function LoginToast({ message }: { message?: string }) {
  if (!message) return null;
  return createPortal(
    <div className={`login-toast ${poppins.variable}`} role="alert" key={message}>
      {message}
    </div>,
    document.body,
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  // Controlled so the email survives a failed attempt (React resets the form after an action).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  return (
    <>
      <div className="login-step-header">
        <h1 className="login-step-title">Welcome</h1>
        <p className="login-step-subtitle">Sign in with the account your administrator gave you.</p>
      </div>

      <form action={action} className="login-form">
        <div className="login-field">
          <label className="login-label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            name="email"
            className="login-input"
            type="email"
            placeholder="yourname@getmeds.ph"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="login-field">
          <label className="login-label" htmlFor="login-password">
            Password
          </label>
          <div className="login-password-wrap">
            <input
              id="login-password"
              name="password"
              className="login-input"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="login-password-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              <Icon name={showPassword ? "eye" : "eyeOff"} size={16} />
            </button>
          </div>
        </div>
        <div className="login-switch" style={{ justifyContent: "flex-end", marginTop: -4 }}>
          <button type="button" className="login-link-btn" onClick={() => setShowForgot((s) => !s)} aria-expanded={showForgot}>
            Forgot password?
          </button>
        </div>
        {/* There is no self-service reset: an admin issues a temporary password from the Users page. */}
        {showForgot && (
          <div className="login-hint" role="status" style={{ display: "block" }}>
            Ask an app admin to reset it. They&apos;ll give you a temporary password, and you&apos;ll choose a new one when you sign in.
          </div>
        )}

        <LoginToast message={state?.error} />

        <button type="submit" className="login-submit-btn" disabled={pending}>
          {pending ? <span className="login-spinner" /> : null}
          {pending ? "Signing in" : "Login"}
        </button>
      </form>
    </>
  );
}
