import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Onboarding() {
  const { user, profile, refreshWorkspace } = useAuth();
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!workspaceName.trim() || !user) return;
    setLoading(true);
    try {
      const slug = workspaceName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      // 1. Create workspace
      const { data: ws, error: wsErr } = await supabase.from('workspaces').insert({
        name: workspaceName.trim(),
        slug,
        owner_id: user.id,
      }).select().single();
      if (wsErr) throw wsErr;

      // 2. Add as member (owner)
      const { error: memErr } = await supabase.from('workspace_members').insert({
        workspace_id: ws.id,
        user_id: user.id,
        role: 'owner',
      });
      if (memErr) throw memErr;

      // 3. Create default agent
      await supabase.from('agents').insert({
        workspace_id: ws.id,
        user_id: user.id,
        name: profile?.name || 'Agente',
        email: profile?.email || user.email || '',
        role: 'admin',
      });

      await refreshWorkspace();
      toast.success('Workspace criado com sucesso!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar workspace');
    } finally {
      setLoading(false);
    }
  }

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
