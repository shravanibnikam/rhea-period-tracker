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

  // `resolvedUid`: the account whose role state is a POSITIVE lookup answer.
  // `lookupSeq`: only the newest lookup may write state — a newer lookup, an
  // account switch or a sign-out supersedes any lookup still in flight.
  const resolvedUid = useRef<string | null>(null);
  const lookupSeq = useRef(0);

  /** No role, no link, no write capability (signed out, or a new account). */
  const clearRole = useCallback(() => {
    lookupSeq.current++;
    resolvedUid.current = null;
    setRole(null);
    setLinkedOwnerId(null);
    setHasPartnerLinked(false);
    setSyncReadOnly(true);
  }, []);

  const detectRole = useCallback(
    async (userId: string) => {
      // Fail closed for an account without a positive answer yet: another
      // account's role never stands in, and there is no write capability until
      // this one's role is known. A re-check of the SAME resolved account keeps
      // its role (and its write capability) while the lookup is in flight.
      if (resolvedUid.current !== userId) clearRole();
      const seq = ++lookupSeq.current;

      let resolved: ResolvedRole | null = null;
      try {
        if (supabase) resolved = await lookupRole(supabase, userId);
      } catch (err) {
        console.error("Failed to detect role:", err);
      }
      if (seq !== lookupSeq.current) return; // superseded: this answer is stale

      // A failed lookup changes nothing. It grants nothing to an account that
      // has no positive answer (it stays at role null), and it does not revoke
      // a role positively resolved for this same account: supabase-js re-runs
      // this on every tab refocus and token refresh, and an offline blip must
      // not stop the owner engine or drop a partner out of partner mode. Only a
      // positive contrary answer, another account, or a sign-out changes it.
      if (!resolved) return;

      resolvedUid.current = userId;
      setRole(resolved.role);
      setLinkedOwnerId(resolved.linkedOwnerId);
      setHasPartnerLinked(resolved.hasPartnerLinked);
      // A partner never pushes owner data (sync stays read-only).
      setSyncReadOnly(resolved.role !== "owner");
      if (resolved.role === "partner") {
        // Mark this store as holding someone else's rows so the one-time seed
        // can never upload them if the account later resolves as owner. Best
        // effort: a failed write grants nothing.
        void container.setMeta(META_LAST_KNOWN_ROLE, "partner").catch(() => {});
      }
    },
    [clearRole, container]
  );

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let handled = false;

    // Use onAuthStateChange as the single source of truth (Supabase v2 pattern)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // Scope the local database to the signed-in account (or local-only).
      container.setAccount(s?.user?.id ?? null);

      if (s?.user) {
        await detectRole(s.user.id).catch(() => {});
      } else {
        clearRole();
      }

      // Always resolve loading regardless of outcome
      if (!handled) {
        handled = true;
        setLoading(false);
      }
    });

    // Fallback: if no auth event fires within 3 seconds, stop loading
    const timeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        setLoading(false);
      }
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [detectRole, clearRole, container]);

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
    clearRole();
  }, [role, container, clearRole]);

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
