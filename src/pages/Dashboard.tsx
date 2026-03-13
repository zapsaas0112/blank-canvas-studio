import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { MessageSquare, CheckCircle2, Users, Send, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = ['hsl(142,70%,45%)', 'hsl(217,91%,60%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)'];

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
  const [stats, setStats] = useState({ open: 0, resolved: 0, agents: 0, messages: 0 });
  const [lineData, setLineData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    const [convRes, msgRes, profileRes] = await Promise.all([
      supabase.from('conversations').select('status, created_at'),
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    const convs = convRes.data || [];
    const open = convs.filter(c => c.status === 'open' || c.status === 'unassigned').length;
    const closed = convs.filter(c => c.status === 'closed').length;
    setStats({ open, resolved: closed, agents: profileRes.count || 0, messages: msgRes.count || 0 });

    const statusCounts = [
      { name: 'Aberto', value: convs.filter(c => c.status === 'open').length },
      { name: 'Pendente', value: convs.filter(c => c.status === 'unassigned').length },
      { name: 'Resolvido', value: closed },
    ].filter(d => d.value > 0);
    setPieData(statusCounts.length > 0 ? statusCounts : [{ name: 'Sem dados', value: 1 }]);

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      days.push({ day: d.toLocaleDateString('pt-BR', { weekday: 'short' }), conversas: convs.filter(c => c.created_at?.startsWith(dayStr)).length });
    }
    setLineData(days);
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div><h1 className="text-xl font-bold text-foreground">Dashboard</h1><p className="text-sm text-muted-foreground">Visão geral do atendimento</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={MessageSquare} label="Conversas abertas" value={stats.open} color="hsl(142,70%,45%)" />
          <StatsCard icon={CheckCircle2} label="Resolvidas" value={stats.resolved} color="hsl(217,91%,60%)" />
          <StatsCard icon={Users} label="Agentes" value={stats.agents} color="hsl(38,92%,50%)" />
          <StatsCard icon={Send} label="Mensagens" value={stats.messages} color="hsl(280,70%,55%)" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-card p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-foreground mb-4">Conversas por dia</h3>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(225,15%,16%)" />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(220,10%,50%)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(220,10%,50%)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(225,20%,12%)', border: '1px solid hsl(225,15%,16%)', borderRadius: 8, color: 'hsl(220,14%,92%)' }} />
                  <Line type="monotone" dataKey="conversas" stroke="hsl(142,70%,45%)" strokeWidth={2} dot={{ fill: 'hsl(142,70%,45%)', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Por status</h3>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {pieData.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(225,20%,12%)', border: '1px solid hsl(225,15%,16%)', borderRadius: 8, color: 'hsl(220,14%,92%)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-xs text-muted-foreground">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
