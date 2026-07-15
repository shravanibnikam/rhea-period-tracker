import { useState } from "react";

interface AuthScreenProps {
  onSignUp: (email: string, password: string) => Promise<string | null>;
  onSignIn: (email: string, password: string) => Promise<string | null>;
}

export function AuthScreen({ onSignUp, onSignIn }: AuthScreenProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const err =
      mode === "signup"
        ? await onSignUp(email, password)
        : await onSignIn(email, password);

    setSubmitting(false);

    if (err) {
      setError(err);
    } else if (mode === "signup") {
      setSignupSuccess(true);
    }
  };

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <img src="/rhea-mark.svg" alt="Rhea" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account, then come back and sign in.
          </p>
          <button
            onClick={() => {
              setSignupSuccess(false);
              setMode("signin");
            }}
            className="text-sm text-primary hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/rhea-mark.svg" alt="Rhea" className="w-14 h-14 mx-auto mb-4" />
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
            Rhea
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? "Welcome back"
              : "Create your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
            />
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl font-medium text-sm text-white bg-primary hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting
              ? "..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            {mode === "signin" ? (
              <>
                No account yet?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            Your data is encrypted and synced securely.
            <br />
            Detailed logs are only visible to you.
          </p>
        </div>
      </div>
    </div>
  );
}
