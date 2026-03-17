import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, Workspace, WorkspaceMember } from '@/types/database';

const DEBUG = true;
function log(...args: any[]) {
  if (DEBUG) console.log('[Auth]', ...args);
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: string | null;
  workspace: Workspace | null;
  workspaceMember: WorkspaceMember | null;
  hasWorkspace: boolean;
  /** true = still initializing, show global spinner */
  loading: boolean;
  /** false until first session check completes */
  initialized: boolean;
  refreshWorkspace: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, profile: null, role: null,
  workspace: null, workspaceMember: null, hasWorkspace: false,
  loading: true, initialized: false,
  refreshWorkspace: async () => {}, signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceMember, setWorkspaceMember] = useState<WorkspaceMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // ── Fetch all user data in one shot ──────────────────────────
  const fetchUserData = useCallback(async (userId: string): Promise<boolean> => {
    log('fetchUserData start', userId);
    try {
      const [profileRes, roleRes, memberRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
        supabase.from('workspace_members').select('*').eq('user_id', userId).limit(1).maybeSingle(),
      ]);

      log('profile:', profileRes.data ? 'found' : 'none');
      log('role:', roleRes.data?.role ?? 'none');
      log('membership:', memberRes.data ? 'found' : 'none');

      setProfile((profileRes.data as Profile) ?? null);
      setRole(roleRes.data?.role ?? null);

      if (memberRes.data) {
        setWorkspaceMember(memberRes.data as WorkspaceMember);
        const { data: wsData } = await supabase
          .from('workspaces')
          .select('*')
          .eq('id', memberRes.data.workspace_id)
          .single();
        log('workspace:', wsData ? wsData.name : 'none');
        setWorkspace((wsData as Workspace) ?? null);
      } else {
        setWorkspaceMember(null);
        setWorkspace(null);
      }
      return true;
    } catch (err) {
      console.error('[Auth] fetchUserData error:', err);
      return false;
    }
  }, []);

  // ── Clear all user state ─────────────────────────────────────
  const clearState = useCallback(() => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setWorkspace(null);
    setWorkspaceMember(null);
  }, []);

  // ── Bootstrap: getSession first, then listen ─────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      log('init: getting session...');
      const { data: { session: initSession } } = await supabase.auth.getSession();

      if (cancelled) return;

      if (initSession?.user) {
        log('init: session found for', initSession.user.email);
        setSession(initSession);
        setUser(initSession.user);
        await fetchUserData(initSession.user.id);
      } else {
        log('init: no session');
        clearState();
      }

      if (!cancelled) {
        setLoading(false);
        setInitialized(true);
        log('init: done, loading=false');
      }
    }

    init();

    // Listen for subsequent auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        log('onAuthStateChange:', event);

        // Ignore INITIAL_SESSION — we handle it in init()
        if (event === 'INITIAL_SESSION') return;

        if (event === 'SIGNED_OUT') {
          clearState();
          setLoading(false);
          return;
        }

        if (newSession?.user) {
          setSession(newSession);
          setUser(newSession.user);

          // Use setTimeout(0) to avoid awaiting inside the callback
          // which can deadlock Supabase's internal event processing
          setTimeout(async () => {
            if (!cancelled) {
              setLoading(true);
              await fetchUserData(newSession.user.id);
              if (!cancelled) setLoading(false);
            }
          }, 0);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchUserData, clearState]);

  // ── Refresh workspace (after onboarding creates one) ─────────
  const refreshWorkspace = useCallback(async () => {
    if (!user) return;
    log('refreshWorkspace');
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (memberData) {
      setWorkspaceMember(memberData as WorkspaceMember);
      const { data: wsData } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', memberData.workspace_id)
        .single();
      if (wsData) {
        setWorkspace(wsData as Workspace);
        log('refreshWorkspace: workspace set', wsData.name);
      }
    }
  }, [user]);

  // ── Sign out ─────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    log('signOut');
    await supabase.auth.signOut();
    clearState();
  }, [clearState]);

  return (
    <AuthContext.Provider value={{
      user, session, loading, initialized, profile, role,
      workspace, workspaceMember,
      hasWorkspace: !!workspace,
      refreshWorkspace, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
