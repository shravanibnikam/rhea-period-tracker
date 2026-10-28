import { useState, useEffect, useId } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@/app/hooks/useAuth";
import { createInviteCode, redeemInviteCode, getPartnerLink, unpair, isValidInviteCode } from "@/app/lib/pairing";
import { cn } from "@/app/lib/cn";
import { Button } from "@/app/components/ui/Button";
import { Panel, RetryRow, Row, fieldClass } from "./Section";

interface PairingSectionProps {
  userId: string;
  role: UserRole;
  onRoleChanged: () => void;
}

/**
 * Redeem input. The invite secret is a case-sensitive base64url string
 * (see isValidInviteCode) — so this NEVER upper-cases, letter-spaces, or caps
 * length; it also disables mobile auto-capitalize/-correct which would corrupt
 * the code. Only surrounding whitespace is trimmed (at submit); internal
 * characters and case are preserved verbatim.
 */
function RedeemForm({
  code,
  onChange,
  onRedeem,
  prompt,
  busy,
}: {
  code: string;
  onChange: (v: string) => void;
  onRedeem: () => void;
  prompt: string;
  busy: boolean;
}) {
  const id = useId();
  return (
    <form
      className="space-y-2 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onRedeem();
      }}
    >
      <label htmlFor={id} className="block text-sm text-foreground">
        Invite code
      </label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {prompt}
      </p>
      <div className="flex gap-2 pt-1">
        <input
          id={id}
          name="invite-code"
          type="text"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste invite code"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-hint`}
          className={cn(fieldClass, "min-w-0 flex-1 font-mono") /* taste-skill-ignore: an invite code is code */}
        />
        <Button type="submit" disabled={!code.trim() || busy}>
          Pair
        </Button>
      </div>
    </form>
  );
}

/** Pairing with a partner: the panel of the Settings "Partner" section. */
export function PairingSection({ userId, role, onRoleChanged }: PairingSectionProps) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [partnerLinked, setPartnerLinked] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    getPartnerLink(userId)
      .then((link) => {
        if (!current) return;
        setPartnerLinked(link !== null);
        setLoadFailed(false);
      })
      .catch((err) => {
        // Link state unknown (P0-06): offer neither invite nor redeem on a
        // guess — a false "not linked" would invite a second partner.
        console.error("Failed to load partner status:", err);
        if (current) setLoadFailed(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [userId, attempt]);

  /** Runs one server action; `busy` disables the buttons meanwhile. */
  const act = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInvite = () =>
    act(async () => {
      const code = await createInviteCode(userId);
      if (code) setInviteCode(code);
      else setError("Couldn't create an invite code. Check your connection and try again.");
    });

  const handleCopy = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast("Invite code copied");
    } catch {
      setError("Couldn't copy the code. Select it and copy it yourself.");
    }
  };

  const handleRedeem = () =>
    act(async () => {
      const code = redeemCode.trim();
      if (!code) return;
      // Validate against the real server format before hitting the network — but
      // NEVER mutate the code (case and internal characters preserved). A
      // wrong-looking code gets a clear message instead of a confusing rejection.
      if (!isValidInviteCode(code)) {
        setError("That doesn't look like a valid invite code. Paste the whole code your partner sent.");
        return;
      }
      const err = await redeemInviteCode(code);
      if (err) {
        setError(err);
      } else {
        toast("Paired with your partner");
        setPartnerLinked(true);
        onRoleChanged();
      }
    });

  const handleUnpair = () =>
    act(async () => {
      const err = await unpair(userId);
      if (err) {
        setError(err);
      } else {
        setPartnerLinked(false);
        setConfirmUnlink(false);
        setInviteCode(null);
        toast("Partner unlinked");
        onRoleChanged();
      }
    });

  if (loading || loadFailed) {
    return (
      <Panel>
        {loading ? (
          <p role="status" className="py-4 text-sm text-muted-foreground">
            Loading partner status…
          </p>
        ) : (
          <RetryRow
            message="Couldn't load partner status. Check your connection and try again."
            onRetry={() => {
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
          />
        )}
      </Panel>
    );
  }

  const redeem = (prompt: string) => (
    <RedeemForm
      code={redeemCode}
      onChange={(v) => {
        setRedeemCode(v);
        setError(null);
      }}
      onRedeem={handleRedeem}
      prompt={prompt}
      busy={busy}
    />
  );

  return (
    <Panel>
      <div>
        {role === "owner" && !partnerLinked && !inviteCode && (
          <Row
            title="Invite a partner"
            description="Create a one-time code to send to your partner. It works once, for 30 minutes."
            action={
              <Button onClick={handleCreateInvite} disabled={busy}>
                Generate invite code
              </Button>
            }
          />
        )}

        {role === "owner" && !partnerLinked && inviteCode && (
          <div className="space-y-3 py-4">
            <div>
              <p className="font-medium text-foreground">Send this code to your partner</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                They enter it in Rhea on their own account. It works once, and only for 30 minutes after you
                created it.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p
                className="min-w-0 flex-1 select-all break-all rounded-xl bg-muted px-4 py-2.5 font-mono text-lg text-foreground" /* taste-skill-ignore: an invite code is code */
              >
                {inviteCode}
              </p>
              <Button variant="outline" onClick={handleCopy}>
                <Copy size={16} aria-hidden="true" />
                Copy code
              </Button>
            </div>
          </div>
        )}

        {role === "owner" && partnerLinked && (
          <>
            <Row
              title="Partner linked"
              description="Your partner can open the partner view. Unlinking ends their access on the server; anything already on their device may remain."
              action={
                confirmUnlink ? undefined : (
                  <Button variant="destructive-outline" onClick={() => setConfirmUnlink(true)} disabled={busy}>
                    Unlink partner
                  </Button>
                )
              }
            />
            {confirmUnlink && (
              <div className="mb-4 space-y-3 rounded-xl bg-muted p-4">
                <p className="text-sm text-foreground">
                  Unlink your partner? You can link again later with a new invite code.
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" onClick={() => setConfirmUnlink(false)} autoFocus>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleUnpair} disabled={busy}>
                    Unlink partner
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {role === "partner" && !partnerLinked && redeem("Enter the invite code your partner shared with you.")}

        {role === "partner" && partnerLinked && (
          <Row title="Linked to your partner" description="You see the partner view they share with you." />
        )}

        {role === null && redeem("Enter an invite code from your partner to link accounts.")}

        {error && (
          <p role="alert" className="pb-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
