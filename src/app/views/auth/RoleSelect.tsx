import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { redeemInviteCode, isValidInviteCode } from "@/app/lib/pairing";
import { Button } from "@/app/components/ui/Button";
import { cn } from "@/app/lib/cn";
import { PrivacyPolicy } from "@/app/views/settings/PrivacyPolicy";
import { AUTH_INPUT, AUTH_LINK, AUTH_MARK, AUTH_SCREEN, AUTH_TITLE } from "@/app/views/auth/AuthScreen";

interface RoleSelectProps {
  onChooseOwner: () => void;
  onPaired: () => void;
}

// One tile per person, each in its own hue: hers the brand (menstrual) tint, the partner's blue.
const CHOICE =
  "flex min-h-[5.5rem] w-full items-center gap-4 rounded-2xl px-5 py-4 text-left transition-[box-shadow,transform] duration-150 hover:ring-2 hover:ring-current/25 active:scale-[0.99]";

export function RoleSelect({ onChooseOwner, onPaired }: RoleSelectProps) {
  const [mode, setMode] = useState<"choose" | "invite">("choose");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

  const handleRedeem = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    // The secret is a case-sensitive base64url string — validate against the
    // real format, but never mutate it (case/internal chars preserved).
    if (!isValidInviteCode(trimmed)) {
      setError("That doesn't look like a valid invite code — paste the full code your partner shared.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const err = await redeemInviteCode(trimmed);
    setSubmitting(false);

    if (err) {
      setError(err);
    } else {
      onPaired();
    }
  };

  const privacy = (
    <p className="mt-8 text-sm text-muted-foreground">
      Your logs sync to your account over TLS. Synced data is not end-to-end encrypted.{" "}
      <button type="button" onClick={() => setShowPolicy(true)} className={AUTH_LINK}>
        Privacy policy
      </button>
    </p>
  );

  return (
    <main className={AUTH_SCREEN}>
      {mode === "invite" ? (
        <div className="w-full max-w-sm">
          <Button
            variant="ghost"
            className="-ml-4 mb-4"
            onClick={() => {
              setMode("choose");
              setError(null);
              setCode("");
            }}
          >
            <ChevronLeft size={18} aria-hidden="true" />
            Back
          </Button>
          <img src={AUTH_MARK} alt="Rhea" className="size-12" />
          <h1 className={AUTH_TITLE}>Join as a partner</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Paste the invite code your partner shared with you. Codes expire 30 minutes after they are made.
          </p>

          <form onSubmit={handleRedeem} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div>
              <label htmlFor="invite-code" className="text-sm font-medium text-foreground">
                Invite code
              </label>
              <input
                id="invite-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste invite code"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className={`mt-2 font-mono ${AUTH_INPUT}`} /* taste-skill-ignore: invite codes are code (docs/DESIGN.md) */
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={submitting || !code.trim()}>
              {submitting ? "Connecting…" : "Connect"}
            </Button>
          </form>
          {privacy}
        </div>
      ) : (
        <div className="w-full max-w-md">
          <img src={AUTH_MARK} alt="Rhea" className="size-12" />
          <h1 className={AUTH_TITLE}>How will you use the app?</h1>

          <div className="mt-8 grid gap-3">
            <button type="button" onClick={onChooseOwner} className={cn(CHOICE, "bg-accent text-accent-foreground")}>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">I&apos;m tracking my cycle</span>
                <span className="mt-1 block text-sm">Log periods, symptoms, mood and energy</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className="shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setMode("invite")}
              className={cn(CHOICE, "bg-(--partner-tint) text-(color:--partner-ink)")}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">I&apos;m joining as a partner</span>
                <span className="mt-1 block text-sm">I have an invite code from my partner</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className="shrink-0" />
            </button>
          </div>
          {privacy}
        </div>
      )}
      {showPolicy && <PrivacyPolicy onClose={() => setShowPolicy(false)} />}
    </main>
  );
}
