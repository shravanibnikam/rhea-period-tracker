import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/app/lib/supabase";
import { setSyncReadOnly } from "@/app/lib/sync";
import { useContainer } from "@/app/di";
import type { User, Session } from "@supabase/supabase-js";

export type UserRole = "owner" | "partner" | null;

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

  const detectRole = useCallback(async (userId: string) => {
    if (!supabase) return;

    try {
      // Check if user is a partner (linked to an owner)
      const { data: asPartner } = await supabase
        .from("partner_links")
        .select("owner_id")
        .eq("partner_id", userId)
        .maybeSingle();

      if (asPartner) {
        setRole("partner");
        setLinkedOwnerId(asPartner.owner_id);
        setHasPartnerLinked(false);
        setSyncReadOnly(true); // a partner never pushes owner data
        return;
      }

      // User is an owner — check if they have a partner linked
      setRole("owner");
      setLinkedOwnerId(null);
      setSyncReadOnly(false);

      const { data: asOwner } = await supabase
        .from("partner_links")
        .select("partner_id")
        .eq("owner_id", userId)
        .maybeSingle();

      setHasPartnerLinked(asOwner !== null);
    } catch (err) {
      console.error("Failed to detect role:", err);
      // Default to owner so the app doesn't hang
      setRole("owner");
      setLinkedOwnerId(null);
      setHasPartnerLinked(false);
      setSyncReadOnly(false);
    }
  }, []);

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
        setRole(null);
        setLinkedOwnerId(null);
        setHasPartnerLinked(false);
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
  }, [detectRole, container]);

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
    setRole(null);
    setLinkedOwnerId(null);
    setHasPartnerLinked(false);
  }, [role, container]);

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
