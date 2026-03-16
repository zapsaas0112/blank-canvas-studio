import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => {
          fetchUserData(session.user.id);
        }, 0);
      } else {
        clearState();
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
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
    await Promise.all([
      fetchProfile(userId),
      fetchRole(userId),
      fetchWorkspace(userId),
    ]);
  }

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (data) setProfile(data as Profile);
  }

  async function fetchRole(userId: string) {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    if (data) setRole(data.role);
  }

  async function fetchWorkspace(userId: string) {
    // Get workspace membership
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (memberData) {
      setWorkspaceMember(memberData as WorkspaceMember);
      // Get workspace details
      const { data: wsData } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', memberData.workspace_id)
        .single();
      if (wsData) setWorkspace(wsData as Workspace);
    } else {
      setWorkspaceMember(null);
      setWorkspace(null);
    }
  }

  async function refreshWorkspace() {
    if (user) {
      await fetchWorkspace(user.id);
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
