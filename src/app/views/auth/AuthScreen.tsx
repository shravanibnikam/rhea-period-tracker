import { useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { cn } from "@/app/lib/cn";
import { RheaMark } from "@/app/components/shared/RheaMark";
import { PrivacyPolicy } from "@/app/views/settings/PrivacyPolicy";

interface AuthScreenProps {
  onSignUp: (email: string, password: string) => Promise<string | null>;
  onSignIn: (email: string, password: string) => Promise<string | null>;
  /** Which form opens first (the landing page's "Create your account" opens sign-up). */
  initialMode?: "signin" | "signup";
}

/** Shared by the sign-in and partner-invite screens: one centred, narrow column. */
export const AUTH_SCREEN = "flex min-h-svh items-center justify-center bg-background px-4 py-12";
export const AUTH_INPUT =
  "h-12 w-full rounded-xl border border-input bg-input-background px-4 text-base text-foreground placeholder:text-muted-foreground";
export const AUTH_LINK = "font-semibold text-foreground underline underline-offset-4 hover:text-foreground/75";

/** The auth card: a soft pastel header (the mark, the title, one kind sentence) over its body. */
export function AuthCard({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <header className="bg-accent px-6 pt-8 pb-7 text-center text-accent-foreground">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-card shadow-soft">
          <RheaMark size={32} label="Rhea" />
        </span>
        <h1 className="mt-5 text-3xl text-foreground">{title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-base">{intro}</p>
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

/** The honest sync note under every auth form, and the policy it links to. */
export function PrivacyNote() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-8 text-center text-sm text-muted-foreground">
      <p>Your logs sync to your account over TLS. Synced data is not end-to-end encrypted.</p>
      <button type="button" onClick={() => setOpen(true)} className={cn(AUTH_LINK, "inline-flex min-h-11 items-center")}>
        Read the privacy policy
      </button>
      {open && <PrivacyPolicy onClose={() => setOpen(false)} />}
    </div>
  );
}

export function AuthScreen({ onSignUp, onSignIn, initialMode = "signin" }: AuthScreenProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
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
          <AuthCard
            title="Check your email"
            intro={
              <>
                We sent a confirmation link to <strong className="font-semibold break-all">{email}</strong>. Open it
                to activate your account, then sign in here.
              </>
            }
          >
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => {
                setSignupSuccess(false);
                setMode("signin");
              }}
            >
              Back to sign in
            </Button>
          </AuthCard>
        </div>
      </main>
    );
  }

  return (
    <main className={AUTH_SCREEN}>
      <div className="w-full max-w-sm">
        <AuthCard
          title={signup ? "Create your account" : "Welcome back"}
          intro={
            signup
              ? "Glad you're here. An account keeps your logs in step across your devices and lets you link a partner if you'd like."
              : "Sign in to see your logs, or the view a partner shares with you."
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="text-sm text-foreground">
                Email
              </label>
              <input
                id="auth-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                spellCheck={false}
                placeholder="you@example.com"
                className={`mt-2 ${AUTH_INPUT}`}
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="text-sm text-foreground">
                Password
              </label>
              <div className="relative mt-2">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder={signup ? undefined : "Your password"}
                  aria-describedby={signup ? "auth-password-hint" : undefined}
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
              {signup && (
                <p id="auth-password-hint" className="mt-2 text-sm text-muted-foreground">
                  At least 6 characters.
                </p>
              )}
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
        </AuthCard>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {signup ? "Already have an account?" : "New to Rhea?"}{" "}
          <button type="button" onClick={switchMode} className={cn(AUTH_LINK, "inline-flex min-h-11 min-w-11 items-center justify-center")}>
            {signup ? "Sign in" : "Create an account"}
          </button>
        </p>

        <PrivacyNote />
      </div>
    </main>
  );
}
