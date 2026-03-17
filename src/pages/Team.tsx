import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Plus, Users, Loader2, Shield, UserPlus, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { name: string; email: string; avatar_url: string | null } | null;
  agent?: { is_active: boolean; id: string } | null;
}

const ROLES = [
  { value: 'owner', label: 'Owner', color: 'text-yellow-600 border-yellow-400' },
  { value: 'admin', label: 'Admin', color: 'text-primary border-primary' },
  { value: 'supervisor', label: 'Supervisor', color: 'text-blue-500 border-blue-400' },
  { value: 'member', label: 'Agente', color: 'text-muted-foreground border-muted-foreground' },
];

export default function Team() {
  const { workspace, user, role: myRole } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);

    const { data: wMembers } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at');

    if (!wMembers) { setLoading(false); return; }

    const userIds = wMembers.map(m => m.user_id);

    const [profilesRes, agentsRes] = await Promise.all([
      supabase.from('profiles').select('user_id, name, email, avatar_url').in('user_id', userIds),
      supabase.from('agents').select('id, user_id, is_active').eq('workspace_id', workspace.id).in('user_id', userIds),
    ]);

    const profileMap = new Map((profilesRes.data || []).map(p => [p.user_id, p]));
    const agentMap = new Map((agentsRes.data || []).map(a => [a.user_id, a]));

    setMembers(wMembers.map(m => ({
      ...m,
      profile: profileMap.get(m.user_id) || null,
      agent: agentMap.get(m.user_id) || null,
    })));
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const canManage = myRole === 'admin' || workspace?.owner_id === user?.id || members.find(m => m.user_id === user?.id)?.role === 'owner' || members.find(m => m.user_id === user?.id)?.role === 'admin';

  async function handleInvite() {
    if (!workspace || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      // Find profile by email
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', inviteEmail.trim().toLowerCase())
        .maybeSingle();

      if (!profile) {
        toast.error('Usuário não encontrado. Ele precisa estar cadastrado no sistema.');
        return;
      }

      // Check if already member
      const { data: existing } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspace.id)
        .eq('user_id', profile.user_id)
        .maybeSingle();

      if (existing) {
        toast.error('Usuário já é membro deste workspace.');
        return;
      }

      // Add to workspace_members
      const { error: memErr } = await supabase.from('workspace_members').insert({
        workspace_id: workspace.id,
        user_id: profile.user_id,
        role: inviteRole,
      });

      if (memErr) throw memErr;

      // Also create agent entry
      const { data: profData } = await supabase.from('profiles').select('name, email').eq('user_id', profile.user_id).single();
      await supabase.from('agents').insert({
        workspace_id: workspace.id,
        user_id: profile.user_id,
        name: profData?.name || '',
        email: profData?.email || inviteEmail,
        role: inviteRole === 'owner' ? 'admin' : inviteRole,
        is_active: true,
      });

      toast.success('Membro adicionado!');
      setInviteOpen(false);
      setInviteEmail('');
      await fetchMembers();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao convidar');
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    await supabase.from('workspace_members').update({ role: newRole }).eq('id', memberId);
    toast.success('Papel atualizado');
    await fetchMembers();
  }

  async function toggleActive(member: TeamMember) {
    if (!member.agent) return;
    const newActive = !member.agent.is_active;
    await supabase.from('agents').update({ is_active: newActive }).eq('id', member.agent.id);
    toast.success(newActive ? 'Agente ativado' : 'Agente desativado');
    await fetchMembers();
  }

  async function removeMember(memberId: string, userId: string) {
    if (!confirm('Remover este membro do workspace?')) return;
    await supabase.from('workspace_members').delete().eq('id', memberId);
    if (workspace) await supabase.from('agents').delete().eq('workspace_id', workspace.id).eq('user_id', userId);
    toast.success('Membro removido');
    await fetchMembers();
  }

  const getRoleConfig = (role: string) => ROLES.find(r => r.value === role) || ROLES[3];

  if (loading) return <AppLayout><div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Equipe</h1>
            <p className="text-sm text-muted-foreground">{members.length} membro{members.length !== 1 ? 's' : ''} no workspace</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="w-4 h-4 mr-1" /> Convidar
            </Button>
          )}
        </div>

        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Membro</TableHead>
                <TableHead className="text-muted-foreground">Papel</TableHead>
                <TableHead className="text-muted-foreground">Ativo</TableHead>
                <TableHead className="text-muted-foreground">Desde</TableHead>
                {canManage && <TableHead className="text-muted-foreground text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(m => {
                const rc = getRoleConfig(m.role);
                const isOwner = m.user_id === workspace?.owner_id;
                const isSelf = m.user_id === user?.id;
                return (
                  <TableRow key={m.id} className="border-border/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                          {m.profile?.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{m.profile?.name || 'Sem nome'}{isSelf && <span className="text-xs text-muted-foreground ml-1">(você)</span>}</p>
                          <p className="text-xs text-muted-foreground">{m.profile?.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManage && !isOwner && !isSelf ? (
                        <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}>
                          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            <SelectItem value="member">Agente</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={`text-[10px] ${rc.color}`}>
                          <Shield className="w-3 h-3 mr-1" /> {rc.label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.agent ? (
                        <Switch checked={m.agent.is_active} onCheckedChange={() => toggleActive(m)} disabled={!canManage || isOwner} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(m.created_at), 'dd/MM/yy')}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {!isOwner && !isSelf && (
                          <Button variant="ghost" size="sm" className="text-destructive text-xs h-7" onClick={() => removeMember(m.id, m.user_id)}>
                            Remover
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {members.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8"><Users className="w-8 h-8 mx-auto mb-2 opacity-30" />Nenhum membro</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Invite dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader><DialogTitle className="text-foreground">Convidar Membro</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-foreground text-sm">Email do usuário</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="pl-9 bg-muted/50 border-border" placeholder="usuario@email.com" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">O usuário precisa ter uma conta no ZapDesk</p>
              </div>
              <div>
                <Label className="text-foreground text-sm">Papel</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="mt-1 bg-muted/50 border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="member">Agente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="w-full">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserPlus className="w-4 h-4 mr-1" />}
                Convidar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
