"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { loginAction, lookupEmailAction } from "@/app/actions/auth";
import { StepLoader } from "@/components/stepper";

// Two steps, like Zoho's sign-in page: the email first ("Next"), and only when there's an account
// for it, the password. Every message sits under the field it's about.

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailProblem(email: string) {
  if (!email.trim()) return "Enter your email.";
  if (!EMAIL_PATTERN.test(email.trim())) return "Enter a valid email, like yourname@getmeds.ph.";
  return undefined;
}

/** The message under a field, tied to its input by `id` (the input's aria-describedby). */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="login-field-error" role="alert" key={message}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 7v6M12 16.5v.5" />
      </svg>
      {message}
    </p>
  );
}

export function LoginForm() {
  const [step, setStep] = useState<"email" | "password">("email");
  // Controlled so they survive going back and forth, and a failed attempt (React resets the form after an action).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [checking, startChecking] = useTransition();
  const [state, action, pending] = useActionState(loginAction, undefined);
  // The server's answer stays until the person types again or goes back.
  const [dismissed, setDismissed] = useState<typeof state>(undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const serverError = state && state !== dismissed ? state : undefined;
  // The email is known to exist by now, so a failed sign-in means the password was wrong.
  const wrongPassword = serverError?.wrongCredentials ? "Wrong password. Try again, or use Forgot password." : undefined;
  const shownPasswordError = passwordError ?? wrongPassword;

  // Moving between the steps puts the cursor in that step's field.
  useEffect(() => {
    (step === "password" ? passwordRef : emailRef).current?.focus();
  }, [step]);
  // After a wrong password, select it so typing replaces it.
  useEffect(() => {
    if (state?.wrongCredentials) passwordRef.current?.select();
  }, [state]);

  const next = () => {
    const problem = emailProblem(email);
    if (problem) {
      setEmailError(problem);
      emailRef.current?.focus();
      return;
    }
    startChecking(async () => {
      const found = await lookupEmailAction(email);
      if (!found.found) {
        setEmailError(found.error);
        emailRef.current?.select();
        return;
      }
      setStep("password");
    });
  };

  const back = () => {
    setStep("email");
    setPassword("");
    setPasswordError(undefined);
    setShowForgot(false);
    setDismissed(state);
  };

  return (
    <>
      <div className="login-step-header">
        <h1 className="login-step-title">{step === "email" ? "Sign in" : "Enter your password"}</h1>
        {step === "email" ? (
          <p className="login-step-subtitle">to continue to Getmeds Files</p>
        ) : (
          // Which account the password is for, with a way back, like Zoho's email chip.
          <div className="login-account-chip">
            <span className="login-account-avatar" aria-hidden="true">
              {email.trim()[0]?.toUpperCase()}
            </span>
            <span className="login-account-email" title={email}>
              {email.trim()}
            </span>
            <button type="button" className="login-link-btn" onClick={back} disabled={pending}>
              Change
            </button>
          </div>
        )}
      </div>

      {step === "email" ? (
        <form
          className="login-form login-step-in"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <div className="login-field">
            <label className="login-label" htmlFor="login-email">
              Email
            </label>
            <input
              ref={emailRef}
              id="login-email"
              name="email"
              className="login-input"
              type="email"
              placeholder="yourname@getmeds.ph"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(undefined);
              }}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "login-email-error" : undefined}
              autoFocus
              required
            />
            <FieldError id="login-email-error" message={emailError} />
          </div>

          <button type="submit" className="login-submit-btn" disabled={checking}>
            {checking ? <span className="login-spinner" /> : null}
            {checking ? "Checking" : "Next"}
          </button>
        </form>
      ) : (
        <form
          action={action}
          className="login-form login-step-in"
          noValidate
          onSubmit={(e) => {
            if (password) return;
            e.preventDefault();
            setPasswordError("Enter your password.");
            passwordRef.current?.focus();
          }}
        >
          {/* The email from step one goes along with the password (and lets password managers match the account). */}
          <input type="email" name="email" value={email.trim()} autoComplete="username" readOnly hidden />
          <div className="login-field">
            <label className="login-label" htmlFor="login-password">
              Password
            </label>
            <div className="login-password-wrap">
              <input
                ref={passwordRef}
                id="login-password"
                name="password"
                className="login-input"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(undefined);
                  setDismissed(state);
                }}
                aria-invalid={!!shownPasswordError}
                aria-describedby={shownPasswordError ? "login-password-error" : undefined}
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
            <FieldError id="login-password-error" message={shownPasswordError} />
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

          {/* Errors about the account rather than the password (locked, disabled) sit just above the button. */}
          {serverError && !serverError.wrongCredentials && (
            <div className="login-error" role="alert">
              {serverError.error}
            </div>
          )}

          <button type="submit" className="login-submit-btn" disabled={pending}>
            {pending ? <span className="login-spinner" /> : null}
            {pending ? "Signing in" : "Sign in"}
          </button>
          {pending && (
            <div className="login-steps">
              <StepLoader steps={["Checking", "Verifying", "Signing in", "Opening"]} compact />
            </div>
          )}
        </form>
      )}
    </>
  );
}
