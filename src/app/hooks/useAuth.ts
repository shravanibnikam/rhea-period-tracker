import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/app/lib/supabase";
import { setSyncReadOnly } from "@/app/lib/sync";
import { useContainer } from "@/app/di";
import { META_LAST_KNOWN_ROLE } from "@/data/schema";
import type { User, Session, SupabaseClient } from "@supabase/supabase-js";

export type UserRole = "owner" | "partner" | null;

interface ResolvedRole {
  role: "owner" | "partner";
  linkedOwnerId: string | null;
  hasPartnerLinked: boolean;
}

/**
 * Look up the account's role in `partner_links`. THROWS on any failure —
 * including the errors PostgREST RETURNS rather than throws — so the caller can
 * fail closed. `.limit(2)`, not `.maybeSingle()`: a multi-link row set is a
 * detectable state, not an error that used to read as "no link" → owner (N11).
 */
async function lookupRole(client: SupabaseClient, userId: string): Promise<ResolvedRole> {
  const asPartner = await client
    .from("partner_links")
    .select("owner_id")
    .eq("partner_id", userId)
    .limit(2);
  if (asPartner.error || !asPartner.data) {
    throw asPartner.error ?? new Error("partner lookup returned no rows array");
  }
  if (asPartner.data.length > 0) {
    // One link → that owner. Several → still a read-only partner (NEVER owner),
    // but the owner is ambiguous, so none is selected.
    return {
      role: "partner",
      linkedOwnerId: asPartner.data.length === 1 ? asPartner.data[0].owner_id : null,
      hasPartnerLinked: false,
    };
  }

  const asOwner = await client
    .from("partner_links")
    .select("partner_id")
    .eq("owner_id", userId)
    .limit(2);
  if (asOwner.error || !asOwner.data) {
    throw asOwner.error ?? new Error("owner lookup returned no rows array");
  }
  return { role: "owner", linkedOwnerId: null, hasPartnerLinked: asOwner.data.length > 0 };
}

/** With no auth event at all, show the app after this long (unchanged). */
const AUTH_EVENT_WAIT_MS = 3_000;
/**
 * Longest the splash waits for a NEW account's first role lookup (P0-06). It
 * outlasts postgrest's retry backoff (1 s + 2 s + 4 s), so an offline start ends
 * through the lookup's own error; the bound only stops a hung request from
 * holding the splash forever.
 */
const FIRST_LOOKUP_WAIT_MS = 10_000;

interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  role: UserRole;
  linkedOwnerId: string | null;
  hasPartnerLinked: boolean;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
  isConfigured: boolean;
}

export function useAuth(): UseAuthReturn {
  const container = useContainer();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [linkedOwnerId, setLinkedOwnerId] = useState<string | null>(null);
  const [hasPartnerLinked, setHasPartnerLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  // `accountUid`: the account whose role is tracked (its first lookup has
  //   started); null when signed out.
  // `accountEpoch`: bumped on every account change and sign-out — a lookup that
  //   began under another epoch belongs to someone else and never applies.
  // `lookupSeq` / `appliedSeq`: the newest lookup started / the newest whose
  //   POSITIVE answer applied. An older answer never overrides a newer applied
  //   one, but a newer lookup that FAILS does not discard an older success.
  const accountUid = useRef<string | null>(null);
  const accountEpoch = useRef(0);
  const lookupSeq = useRef(0);
  const appliedSeq = useRef(0);

  // The splash (`loading`) is always bounded by a timer.
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endSplash = useCallback(() => {
    if (splashTimer.current !== null) clearTimeout(splashTimer.current);
    splashTimer.current = null;
    setLoading(false);
  }, []);
  const holdSplash = useCallback(
    (ms: number) => {
      if (splashTimer.current !== null) clearTimeout(splashTimer.current);
      splashTimer.current = setTimeout(endSplash, ms);
      setLoading(true);
    },
    [endSplash]
  );

  /** No role, no link, no write capability (signed out, or a new account). */
  const clearRole = useCallback(() => {
    accountEpoch.current++; // every lookup still in flight is now stale
    setRole(null);
    setLinkedOwnerId(null);
    setHasPartnerLinked(false);
    setSyncReadOnly(true);
  }, []);

  /** Signed out: no role, and the next account gets its own first-lookup splash. */
  const signedOut = useCallback(() => {
    clearRole();
    accountUid.current = null;
    endSplash();
  }, [clearRole, endSplash]);

  const detectRole = useCallback(
    async (userId: string) => {
      if (accountUid.current !== userId) {
        // A NEW account fails closed: another account's role never stands in,
        // and there is no write capability until this one's role is known. Its
        // FIRST lookup holds the splash, so nothing can be logged in the owner
        // UI while the role is unknown. Re-checks of the same account (tab
        // refocus, token refresh) keep its role and never touch the splash.
        clearRole();
        accountUid.current = userId;
        holdSplash(FIRST_LOOKUP_WAIT_MS);
      }
      const epoch = accountEpoch.current;
      const seq = ++lookupSeq.current;

      let resolved: ResolvedRole | null = null;
      try {
        if (supabase) resolved = await lookupRole(supabase, userId);
      } catch (err) {
        console.error("Failed to detect role:", err);
      }
      // Another account or a sign-out since this lookup began, or a newer answer
      // already applied: this answer is stale.
      const stale = () => epoch !== accountEpoch.current || seq < appliedSeq.current;
      if (stale()) return;

      // A failed lookup changes nothing. It grants nothing to an account that
      // has no positive answer (it stays at role null), and it does not revoke
      // a role positively resolved for this same account: supabase-js re-runs
      // this on every tab refocus and token refresh, and an offline blip must
      // not stop the owner engine or drop a partner out of partner mode. Only a
      // positive contrary answer, another account, or a sign-out changes it.
      if (!resolved) {
        if (seq === lookupSeq.current) endSplash(); // nothing newer to wait for
        return;
      }

      if (resolved.role === "partner") {
        // Mark this store as holding someone else's rows BEFORE exposing role
        // partner: the legacy partner pull (gated on the role) caches the
        // owner's rows into it, and the one-time seed / legacy bulk push must
        // never upload them if the account later resolves as owner. Best
        // effort: a failed write grants nothing (the partner stays read-only).
        await container.setMeta(META_LAST_KNOWN_ROLE, "partner").catch(() => {});
        if (stale()) return;
      }

      appliedSeq.current = seq;
      setRole(resolved.role);
      setLinkedOwnerId(resolved.linkedOwnerId);
      setHasPartnerLinked(resolved.hasPartnerLinked);
      // A partner never pushes owner data (sync stays read-only).
      setSyncReadOnly(resolved.role !== "owner");
      endSplash();
    },
    [clearRole, holdSplash, endSplash, container]
  );

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Splash until the first auth event (bounded); a signed-in event then
    // holds it for that account's first role lookup (see detectRole).
    holdSplash(AUTH_EVENT_WAIT_MS);

    // Use onAuthStateChange as the single source of truth (Supabase v2 pattern)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      // Scope the local database to the signed-in account (or local-only)
      // BEFORE exposing the user, so anything keyed on the account reads its store.
      container.setAccount(s?.user?.id ?? null);
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        await detectRole(s.user.id).catch(() => {});
      } else {
        signedOut();
      }
    });

    return () => {
      subscription.unsubscribe();
      if (splashTimer.current !== null) clearTimeout(splashTimer.current);
      splashTimer.current = null;
    };
  }, [detectRole, signedOut, holdSplash, container]);

  const signUp = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!supabase) return "Supabase not configured";
      const { error } = await supabase.auth.signUp({ email, password });
      return error?.message ?? null;
    },
    []
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!supabase) return "Supabase not configured";
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return error?.message ?? null;
    },
    []
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    // A partner caches the owner's data locally; clear it on the way out so it
    // never lingers after access ends. An owner keeps their own local data.
    if (role === "partner") {
      await container.wipeLocalData().catch(() => {});
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    signedOut();
  }, [role, container, signedOut]);

  const refreshRole = useCallback(async () => {
    if (user) await detectRole(user.id);
  }, [user, detectRole]);

  return {
    user,
    session,
    role,
    linkedOwnerId,
    hasPartnerLinked,
    loading,
    signUp,
    signIn,
    signOut,
    refreshRole,
    isConfigured: configured,
  };
}
