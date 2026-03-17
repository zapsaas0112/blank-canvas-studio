import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { MessageSquare, CheckCircle2, Users, Send, TrendingUp } from 'lucide-react';

function StatsCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <TrendingUp className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function Dashboard() {
  const { workspace } = useAuth();
  const [stats, setStats] = useState({ open: 0, resolved: 0, agents: 0, messages: 0, contacts: 0, broadcasts: 0 });

  useEffect(() => { if (workspace) fetchStats(); }, [workspace?.id]);

  async function fetchStats() {
    if (!workspace) return;
    const [convRes, msgRes, agentRes, contactRes, broadcastRes] = await Promise.all([
      supabase.from('conversations').select('status').eq('workspace_id', workspace.id),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
      supabase.from('agents').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
      supabase.from('broadcasts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
    ]);
    const convs = convRes.data || [];
    const open = convs.filter(c => c.status === 'open' || c.status === 'unassigned').length;
    const closed = convs.filter(c => c.status === 'closed').length;
    setStats({
      open, resolved: closed,
      agents: agentRes.count || 0,
      messages: msgRes.count || 0,
      contacts: contactRes.count || 0,
      broadcasts: broadcastRes.count || 0,
    });
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-foreground">Dashboard</h1><p className="text-sm text-muted-foreground">Visão geral do atendimento</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={MessageSquare} label="Conversas abertas" value={stats.open} color="hsl(142,70%,45%)" />
          <StatsCard icon={CheckCircle2} label="Resolvidas" value={stats.resolved} color="hsl(217,91%,60%)" />
          <StatsCard icon={Users} label="Contatos" value={stats.contacts} color="hsl(38,92%,50%)" />
          <StatsCard icon={Send} label="Mensagens" value={stats.messages} color="hsl(280,70%,55%)" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card p-5">
            <p className="text-xs text-muted-foreground">Agentes</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.agents}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs text-muted-foreground">Disparos</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.broadcasts}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
