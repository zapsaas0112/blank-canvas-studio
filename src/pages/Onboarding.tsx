import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function buildSlug(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function Onboarding() {
  const { user, profile, refreshWorkspace, hasWorkspace, initialized, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialized || authLoading) return;
    if (!user) {
      navigate('/login', { replace: true });
    } else if (hasWorkspace) {
      navigate('/', { replace: true });
    }
  }, [initialized, authLoading, user, hasWorkspace, navigate]);

  async function createWorkspaceWithUniqueSlug(name: string, ownerId: string) {
    const baseSlug = buildSlug(name) || 'workspace';
    const candidates = [
      baseSlug,
      `${baseSlug}-${ownerId.slice(0, 6)}`,
      `${baseSlug}-${ownerId.slice(0, 6)}-${Date.now().toString().slice(-4)}`,
    ];

    for (const slug of candidates) {
      const { data: ws, error } = await supabase
        .from('workspaces')
        .insert({ name, slug, owner_id: ownerId })
        .select()
        .single();

      if (!error && ws) return ws;

      if (!(error?.code === '23505' && error?.message?.includes('workspaces_slug_key'))) {
        throw error;
      }
    }

    throw new Error('Não foi possível criar um slug único para o workspace');
  }

  async function handleCreate() {
    if (!workspaceName.trim() || !user) return;
    setLoading(true);
    try {
      const ws = await createWorkspaceWithUniqueSlug(workspaceName.trim(), user.id);

      const { error: memErr } = await supabase.from('workspace_members').insert({
        workspace_id: ws.id,
        user_id: user.id,
        role: 'owner',
      });
      if (memErr) throw memErr;

      await supabase.from('agents').insert({
        workspace_id: ws.id,
        user_id: user.id,
        name: profile?.name || 'Agente',
        email: profile?.email || user.email || '',
        role: 'admin',
      });

      await refreshWorkspace();
      toast.success('Workspace criado com sucesso!');
      // refreshWorkspace sets hasWorkspace=true, useEffect will redirect
    } catch (err: any) {
      if (err?.code === '42501') {
        toast.error('Permissão negada ao criar workspace. Faça login novamente e tente de novo.');
      } else {
        toast.error(err?.message || 'Erro ao criar workspace');
      }
    } finally {
      setLoading(false);
    }
  }

  // Don't render form until we know user is authenticated without workspace
  if (!initialized || authLoading || !user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4 glow-primary">
            <MessageSquare className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Bem-vindo ao ZapDesk!</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie seu workspace para começar</p>
        </div>
        <div className="glass-card p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-foreground text-sm">Nome do workspace</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Ex: Minha Empresa"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value)}
                className="pl-10 bg-muted/50 border-border"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={loading || !workspaceName.trim()} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {loading ? 'Criando...' : 'Criar workspace'}
          </Button>
        </div>
      </div>
    </div>
  );
}
