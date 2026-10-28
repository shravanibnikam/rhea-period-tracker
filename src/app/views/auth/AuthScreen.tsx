import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { PrivacyPolicy } from "@/app/views/settings/PrivacyPolicy";

interface AuthScreenProps {
  onSignUp: (email: string, password: string) => Promise<string | null>;
  onSignIn: (email: string, password: string) => Promise<string | null>;
  /** Which form opens first (the landing page's "Create your account" opens sign-up). */
  initialMode?: "signin" | "signup";
}

/** Shared by the sign-in and partner-invite screens. */
export const AUTH_SCREEN = "flex min-h-svh items-center justify-center bg-background px-4 py-12";
export const AUTH_MARK = `${import.meta.env.BASE_URL}rhea-mark.svg`;
export const AUTH_TITLE = "mt-6 font-display text-[28px] font-bold leading-tight text-foreground sm:text-[32px]";
export const AUTH_INPUT =
  "h-12 w-full rounded-xl border border-input bg-input-background px-4 text-base text-foreground placeholder:text-muted-foreground";
export const AUTH_LINK = "font-medium text-foreground underline underline-offset-4 hover:text-foreground/75";

export function AuthScreen({ onSignUp, onSignIn, initialMode = "signin" }: AuthScreenProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const signup = mode === "signup";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const err = signup ? await onSignUp(email, password) : await onSignIn(email, password);
    setSubmitting(false);
    if (err) setError(err);
    else if (signup) setSignupSuccess(true);
  };

  const switchMode = () => {
    setMode(signup ? "signin" : "signup");
    setError(null);
  };

  if (signupSuccess) {
    return (
      <main className={AUTH_SCREEN}>
        <div className="w-full max-w-sm">
          <img src={AUTH_MARK} alt="Rhea" className="size-12" />
          <h1 className={AUTH_TITLE}>Check your email</h1>
          <p className="mt-3 text-base text-muted-foreground">
            We sent a confirmation link to <strong className="font-semibold text-foreground">{email}</strong>.
            Open it to activate your account, then sign in here.
          </p>
          <Button
            variant="outline"
            size="lg"
            className="mt-8 w-full"
            onClick={() => {
              setSignupSuccess(false);
              setMode("signin");
            }}
          >
            Back to sign in
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className={AUTH_SCREEN}>
      <div className="w-full max-w-sm">
        <img src={AUTH_MARK} alt="Rhea" className="size-12" />
        <h1 className={AUTH_TITLE}>{signup ? "Create your account" : "Sign in to Rhea"}</h1>
        <p className="mt-3 text-base text-muted-foreground">
          {signup
            ? "An account keeps your logs in step across devices and lets you link a partner."
            : "See your logs, or the view a partner shares with you."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div>
            <label htmlFor="auth-email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={`mt-2 ${AUTH_INPUT}`}
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <div className="relative mt-2">
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder={signup ? "At least 6 characters" : "Your password"}
                className={`${AUTH_INPUT} pr-12`}
              />
              <button
                type="button"
                aria-label="Show password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting
              ? signup
                ? "Creating account…"
                : "Signing in…"
              : signup
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {signup ? "Already have an account?" : "New to Rhea?"}{" "}
          <button type="button" onClick={switchMode} className={`${AUTH_LINK} inline-flex min-h-11 items-center`}>
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>

        <p className="mt-6 text-sm text-muted-foreground">
          Your logs sync to your account over TLS. Synced data is not end-to-end encrypted.{" "}
          <button type="button" onClick={() => setShowPolicy(true)} className={AUTH_LINK}>
            Privacy policy
          </button>
        </p>
      </div>
      {showPolicy && <PrivacyPolicy onClose={() => setShowPolicy(false)} />}
    </main>
  );
}
