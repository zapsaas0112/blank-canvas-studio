import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile, Workspace, WorkspaceMember } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  role: string | null;
  workspace: Workspace | null;
  workspaceMember: WorkspaceMember | null;
  hasWorkspace: boolean;
  refreshWorkspace: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  role: null,
  workspace: null,
  workspaceMember: null,
  hasWorkspace: false,
  refreshWorkspace: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceMember, setWorkspaceMember] = useState<WorkspaceMember | null>(null);
  const fetchingRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    // 1. Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        // Avoid double-fetch if getSession already handled it
        if (!fetchingRef.current) {
          await fetchUserData(newSession.user.id);
        }
      } else {
        clearState();
        setLoading(false);
      }
    });

    // 2. Then get initial session
    supabase.auth.getSession().then(async ({ data: { session: initSession } }) => {
      setSession(initSession);
      setUser(initSession?.user ?? null);
      if (initSession?.user) {
        fetchingRef.current = true;
        await fetchUserData(initSession.user.id);
        fetchingRef.current = false;
      }
      setLoading(false);
      initializedRef.current = true;
    });

    return () => subscription.unsubscribe();
  }, []);

  function clearState() {
    setProfile(null);
    setRole(null);
    setWorkspace(null);
    setWorkspaceMember(null);
  }

  async function fetchUserData(userId: string) {
    try {
      const [profileRes, roleRes, memberRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
        supabase.from('workspace_members').select('*').eq('user_id', userId).limit(1).maybeSingle(),
      ]);

      if (profileRes.data) setProfile(profileRes.data as Profile);
      if (roleRes.data) setRole(roleRes.data.role);

      if (memberRes.data) {
        setWorkspaceMember(memberRes.data as WorkspaceMember);
        const { data: wsData } = await supabase
          .from('workspaces')
          .select('*')
          .eq('id', memberRes.data.workspace_id)
          .single();
        if (wsData) setWorkspace(wsData as Workspace);
      } else {
        setWorkspaceMember(null);
        setWorkspace(null);
      }
    } catch (err) {
      console.error('fetchUserData error:', err);
    }

    // Only set loading false after initial load if getSession hasn't done it
    if (!initializedRef.current) {
      setLoading(false);
    }
  }

  async function refreshWorkspace() {
    if (user) {
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
        if (wsData) setWorkspace(wsData as Workspace);
      }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    clearState();
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading, profile, role,
      workspace, workspaceMember,
      hasWorkspace: !!workspace,
      refreshWorkspace, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
