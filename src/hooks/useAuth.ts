import { useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [linkedOwnerId, setLinkedOwnerId] = useState<string | null>(null);
  const [hasPartnerLinked, setHasPartnerLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  const detectRole = useCallback(async (userId: string) => {
    if (!supabase) return;

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
      return;
    }

    // User is an owner — check if they have a partner linked
    setRole("owner");
    setLinkedOwnerId(null);

    const { data: asOwner } = await supabase
      .from("partner_links")
      .select("partner_id")
      .eq("owner_id", userId)
      .maybeSingle();

    setHasPartnerLinked(asOwner !== null);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        detectRole(s.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        detectRole(s.user.id);
      } else {
        setRole(null);
        setLinkedOwnerId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [detectRole]);

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
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setLinkedOwnerId(null);
    setHasPartnerLinked(false);
  }, []);

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
