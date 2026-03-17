import { useState, useEffect } from 'react';
import { useBroadcasts } from '@/hooks/useBroadcasts';
import { useContacts } from '@/hooks/useContacts';
import { useTags } from '@/hooks/useTags';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Send, ArrowRight, ArrowLeft, Loader2, Radio, Search, Eye, Pause, Play, XCircle, CheckCircle2, Clock, AlertTriangle, Users, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { isValidWhatsAppNumber, normalizeWhatsAppNumber } from '@/lib/whatsapp-utils';

interface Recipient {
  id: string;
  contact_id: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  customers: { name: string; phone: string } | null;
}

function interpolatePreview(template: string, name: string): string {
  let result = template;
  result = result.replace(/\{\{nome\}\}/gi, name);
  result = result.replace(/\{\{name\}\}/gi, name);
  result = result.replace(/\{\{telefone\}\}/gi, '11999999999');
  result = result.replace(/\{\{phone\}\}/gi, '11999999999');
  return result;
}

export default function Broadcast() {
  const { broadcasts, loading, create, refetch, deleteBroadcast } = useBroadcasts();
  const { contacts } = useContacts();
  const { tags } = useTags();
  const { workspace } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [delayMinStr, setDelayMinStr] = useState('20');
  const [delayMaxStr, setDelayMaxStr] = useState('25');
  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [contactTags, setContactTags] = useState<Record<string, string[]>>({});
  const [recipientSearch, setRecipientSearch] = useState('');
  const [sending, setSending] = useState(false);

  const delayMin = parseFloat(delayMinStr) || 0;
  const delayMax = parseFloat(delayMaxStr) || 0;
  const delayValid = delayMin > 0 && delayMax >= delayMin;

  // Load contact_tags
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('contact_tags').select('contact_id, tag_id');
      if (data) {
        const map: Record<string, string[]> = {};
        data.forEach(ct => {
          if (!map[ct.contact_id]) map[ct.contact_id] = [];
          map[ct.contact_id].push(ct.tag_id);
        });
        setContactTags(map);
      }
    })();
  }, []);

  // Realtime for broadcast progress
  useEffect(() => {
    if (!workspace) return;
    const channel = supabase
      .channel('broadcast-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcasts', filter: `workspace_id=eq.${workspace.id}` }, () => {
        refetch();
        if (detailId) openDetail(detailId);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'broadcast_recipients' }, () => {
        if (detailId) openDetail(detailId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspace?.id, detailId]);

  function openWizard() {
    setStep(1); setName(''); setMessage(''); setSelectedContacts([]);
    setDelayMinStr('20'); setDelayMaxStr('25');
    setSearchTerm(''); setTagFilter('all'); setSending(false);
    setDialogOpen(true);
  }

  function toggleContact(id: string) { setSelectedContacts(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]); }

  const filteredContacts = contacts.filter(c => {
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!c.name.toLowerCase().includes(s) && !c.phone.includes(s)) return false;
    }
    if (tagFilter !== 'all') {
      if (!(contactTags[c.id] || []).includes(tagFilter)) return false;
    }
    return true;
  });

  const validCount = selectedContacts.filter(id => {
    const c = contacts.find(ct => ct.id === id);
    return c && isValidWhatsAppNumber(normalizeWhatsAppNumber(c.phone));
  }).length;
  const invalidCount = selectedContacts.length - validCount;

  async function handleSend() {
    if (!name.trim() || !message.trim() || selectedContacts.length === 0) { toast.error('Preencha todos os campos'); return; }
    if (validCount === 0) { toast.error('Nenhum contato válido selecionado'); return; }
    if (!delayValid) { toast.error('Configure o delay corretamente (máximo ≥ mínimo, ambos > 0)'); return; }
    if (sending) return;
    setSending(true);
    try {
      await create(name.trim(), message.trim(), selectedContacts, delayMin, delayMax);
      toast.success('Campanha iniciada!');
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar campanha');
    } finally {
      setSending(false);
    }
  }

  async function openDetail(id: string) {
    setDetailId(id);
    setRecipientsLoading(true);
    const { data } = await supabase
      .from('broadcast_recipients')
      .select('id, contact_id, status, sent_at, error_message, customers:contact_id(name, phone)')
      .eq('broadcast_id', id)
      .order('created_at');
    setRecipients((data || []) as unknown as Recipient[]);
    setRecipientsLoading(false);
  }

  async function pauseBroadcast(id: string) {
    await supabase.from('broadcasts').update({ status: 'paused' }).eq('id', id);
    toast.success('Campanha pausada');
    refetch();
  }

  async function resumeBroadcast(id: string) {
    await supabase.from('broadcasts').update({ status: 'sending' }).eq('id', id);
    toast.success('Campanha retomada');
    refetch();
  }

  async function cancelBroadcast(id: string) {
    if (!confirm('Cancelar esta campanha? Os envios pendentes serão ignorados.')) return;
    await supabase.from('broadcasts').update({ status: 'canceled' }).eq('id', id);
    await supabase.from('broadcast_recipients').update({ status: 'skipped' }).eq('broadcast_id', id).eq('status', 'pending');
    toast.success('Campanha cancelada');
    refetch();
  }

  async function handleDelete(id: string, status: string) {
    if (status === 'sending') {
      toast.error('Cancele a campanha antes de excluir');
      return;
    }
    if (!confirm('Excluir esta campanha permanentemente?')) return;
    try {
      await deleteBroadcast(id);
      if (detailId === id) setDetailId(null);
      toast.success('Campanha excluída');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir');
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { draft: 'bg-muted text-muted-foreground', sending: 'bg-yellow-500/20 text-yellow-600', done: 'bg-primary/20 text-primary', failed: 'bg-destructive/20 text-destructive', paused: 'bg-orange-500/20 text-orange-600', canceled: 'bg-muted text-muted-foreground' };
    return map[s] || '';
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: 'Rascunho', sending: 'Enviando', done: 'Concluída', failed: 'Falhou', paused: 'Pausada', canceled: 'Cancelada' };
    return map[s] || s;
  };

  const detailBroadcast = broadcasts.find(b => b.id === detailId);
  const filteredRecipients = recipients.filter(r => {
    if (!recipientSearch) return true;
    const s = recipientSearch.toLowerCase();
    return (r.customers?.name || '').toLowerCase().includes(s) || (r.customers?.phone || '').includes(s);
  });

  if (loading) return <AppLayout><div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-foreground">Campanhas de Disparo</h1><p className="text-sm text-muted-foreground">Envie mensagens em massa para seus contatos</p></div>
          <Button size="sm" onClick={openWizard}><Plus className="w-4 h-4 mr-1" /> Nova Campanha</Button>
        </div>

        {/* Metrics cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{broadcasts.length}</p><p className="text-xs text-muted-foreground">Campanhas</p></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{broadcasts.reduce((a, b) => a + (b.total_sent || 0), 0)}</p><p className="text-xs text-muted-foreground">Enviadas</p></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{broadcasts.reduce((a, b) => a + (b.total_delivered || 0), 0)}</p><p className="text-xs text-muted-foreground">Entregues</p></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-foreground">{broadcasts.reduce((a, b) => a + (b.total_read || 0), 0)}</p><p className="text-xs text-muted-foreground">Lidas</p></CardContent></Card>
          <Card className="border-border"><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{broadcasts.reduce((a, b) => a + (b.total_failed || 0), 0)}</p><p className="text-xs text-muted-foreground">Falhas</p></CardContent></Card>
        </div>

        {/* Campaign list */}
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader><TableRow className="border-border">
              <TableHead className="text-muted-foreground">Campanha</TableHead>
              <TableHead className="text-muted-foreground">Contatos</TableHead>
              <TableHead className="text-muted-foreground">Enviados</TableHead>
              <TableHead className="text-muted-foreground">Falhas</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Data</TableHead>
              <TableHead className="text-muted-foreground text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {broadcasts.map(b => (
                <TableRow key={b.id} className="border-border/50">
                  <TableCell><p className="font-medium text-foreground">{b.name}</p><p className="text-xs text-muted-foreground truncate max-w-[200px]">{b.message}</p></TableCell>
                  <TableCell className="text-muted-foreground">{b.total_recipients || b.contacts_count}</TableCell>
                  <TableCell className="text-primary font-medium">{b.total_sent || 0}</TableCell>
                  <TableCell className="text-destructive font-medium">{b.total_failed || 0}</TableCell>
                  <TableCell><Badge className={`text-[10px] border-0 ${statusBadge(b.status)}`}>{statusLabel(b.status)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{b.created_at ? format(new Date(b.created_at), 'dd/MM/yy HH:mm') : ''}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDetail(b.id)}><Eye className="w-3.5 h-3.5 mr-1" /> Ver</Button>
                      {b.status === 'sending' && <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-600" onClick={() => pauseBroadcast(b.id)}><Pause className="w-3 h-3" /></Button>}
                      {b.status === 'paused' && <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => resumeBroadcast(b.id)}><Play className="w-3 h-3" /></Button>}
                      {(b.status === 'sending' || b.status === 'paused') && <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => cancelBroadcast(b.id)}><XCircle className="w-3 h-3" /></Button>}
                      {b.status !== 'sending' && <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDelete(b.id, b.status)}><Trash2 className="w-3 h-3" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {broadcasts.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8"><Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />Nenhuma campanha</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        {/* New campaign wizard */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-foreground">Nova Campanha — Passo {step}/3</DialogTitle></DialogHeader>
            {step === 1 && (
              <div className="space-y-3">
                <div><Label className="text-foreground text-sm">Nome da campanha</Label><Input value={name} onChange={e => setName(e.target.value)} className="bg-muted/50 border-border mt-1" /></div>
                <div>
                  <Label className="text-foreground text-sm">Mensagem</Label>
                  <Textarea value={message} onChange={e => setMessage(e.target.value)} className="bg-muted/50 border-border mt-1 min-h-[100px]" placeholder="Olá {{nome}}, temos novidades..." />
                  <p className="text-[10px] text-muted-foreground mt-1">Use {"{{nome}}"} para personalizar com o nome do contato</p>
                </div>
                {message && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Preview (exemplo):</p>
                    <p className="text-sm text-foreground">{interpolatePreview(message, 'João Silva')}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-foreground text-xs">Delay mínimo (segundos)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={delayMinStr}
                      onChange={e => setDelayMinStr(e.target.value)}
                      onBlur={() => {
                        const v = parseFloat(delayMinStr);
                        if (!delayMinStr || isNaN(v) || v < 1) setDelayMinStr('1');
                      }}
                      className="bg-muted/50 border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-foreground text-xs">Delay máximo (segundos)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={delayMaxStr}
                      onChange={e => setDelayMaxStr(e.target.value)}
                      onBlur={() => {
                        const v = parseFloat(delayMaxStr);
                        if (!delayMaxStr || isNaN(v) || v < 1) setDelayMaxStr('1');
                        else if (v < delayMin) setDelayMaxStr(String(delayMin));
                      }}
                      className="bg-muted/50 border-border mt-1"
                    />
                  </div>
                </div>
                {!delayValid && delayMinStr && delayMaxStr && (
                  <p className="text-[10px] text-destructive">Delay máximo deve ser ≥ mínimo, e ambos devem ser &gt; 0</p>
                )}
                <p className="text-[10px] text-muted-foreground">Intervalo aleatório entre {delayMin}s e {delayMax}s por mensagem</p>
                <Button onClick={() => setStep(2)} disabled={!name.trim() || !message.trim() || !delayValid} className="w-full">Próximo <ArrowRight className="w-4 h-4 ml-1" /></Button>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Buscar contato..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-muted/50 border-border h-9 text-sm" />
                  </div>
                  <Select value={tagFilter} onValueChange={setTagFilter}>
                    <SelectTrigger className="w-36 h-9 text-xs bg-muted/50"><SelectValue placeholder="Tag" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as tags</SelectItem>
                      {tags.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>{selectedContacts.length} selecionados</span>
                  <span>•</span>
                  <span className="text-primary">{validCount} válidos</span>
                  {invalidCount > 0 && <><span>•</span><span className="text-destructive">{invalidCount} inválidos</span></>}
                </div>
                <div className="flex gap-2 mb-1">
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setSelectedContacts(filteredContacts.map(c => c.id))}>Selecionar todos</Button>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setSelectedContacts([])}>Limpar</Button>
                </div>
                <div className="max-h-52 overflow-y-auto border border-border rounded-lg">
                  {filteredContacts.map(c => {
                    const norm = normalizeWhatsAppNumber(c.phone);
                    const valid = isValidWhatsAppNumber(norm);
                    return (
                      <button key={c.id} onClick={() => toggleContact(c.id)} className={`w-full flex items-center gap-3 p-2.5 border-b border-border/50 text-left transition-colors ${selectedContacts.includes(c.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                        <div className={`w-4 h-4 rounded border ${selectedContacts.includes(c.id) ? 'bg-primary border-primary' : 'border-muted-foreground'} flex items-center justify-center`}>{selectedContacts.includes(c.id) && <span className="text-primary-foreground text-[10px]">✓</span>}</div>
                        <div className="flex-1 min-w-0"><p className="text-sm text-foreground truncate">{c.name}</p><p className="text-xs text-muted-foreground">{c.phone}</p></div>
                        {!valid && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                      </button>
                    );
                  })}
                  {filteredContacts.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">Nenhum contato encontrado</div>}
                </div>
                <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(1)} className="flex-1"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button><Button onClick={() => setStep(3)} disabled={selectedContacts.length === 0} className="flex-1">Próximo <ArrowRight className="w-4 h-4 ml-1" /></Button></div>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <div className="glass-card p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Campanha</span><span className="text-foreground font-medium">{name}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contatos</span><span className="text-foreground font-medium">{selectedContacts.length} ({validCount} válidos)</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Intervalo</span><span className="text-foreground font-medium">{delayMin}s — {delayMax}s</span></div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Mensagem:</span>
                    <p className="text-foreground mt-1 bg-muted/50 p-2 rounded-lg text-xs">{interpolatePreview(message, 'João Silva')}</p>
                  </div>
                  {invalidCount > 0 && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {invalidCount} contato(s) com número inválido serão ignorados</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
                  <Button onClick={handleSend} disabled={sending} className="flex-1">
                    {sending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Iniciando...</> : <><Send className="w-4 h-4 mr-1" /> Iniciar Campanha</>}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Detail dialog */}
        <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
          <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-foreground">Detalhes: {detailBroadcast?.name}</DialogTitle></DialogHeader>
            {detailBroadcast && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: 'Total', value: detailBroadcast.total_recipients || 0, icon: Users, color: 'text-foreground' },
                    { label: 'Enviados', value: detailBroadcast.total_sent || 0, icon: CheckCircle2, color: 'text-primary' },
                    { label: 'Falhas', value: detailBroadcast.total_failed || 0, icon: XCircle, color: 'text-destructive' },
                    { label: 'Pendentes', value: Math.max(0, (detailBroadcast.total_recipients || 0) - (detailBroadcast.total_sent || 0) - (detailBroadcast.total_failed || 0)), icon: Clock, color: 'text-yellow-600' },
                  ].map((m, i) => (
                    <Card key={i} className="border-border"><CardContent className="p-3 text-center"><m.icon className={`w-4 h-4 mx-auto mb-1 ${m.color}`} /><p className={`text-lg font-bold ${m.color}`}>{m.value}</p><p className="text-[10px] text-muted-foreground">{m.label}</p></CardContent></Card>
                  ))}
                </div>

                {/* Progress bar */}
                {detailBroadcast.total_recipients && detailBroadcast.total_recipients > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>{Math.round(((detailBroadcast.total_sent || 0) + (detailBroadcast.total_failed || 0)) / detailBroadcast.total_recipients * 100)}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${((detailBroadcast.total_sent || 0) + (detailBroadcast.total_failed || 0)) / detailBroadcast.total_recipients * 100}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] border-0 ${statusBadge(detailBroadcast.status)}`}>{statusLabel(detailBroadcast.status)}</Badge>
                  {detailBroadcast.status === 'sending' && <Button variant="outline" size="sm" className="h-7 text-xs text-orange-600" onClick={() => pauseBroadcast(detailBroadcast.id)}><Pause className="w-3 h-3 mr-1" /> Pausar</Button>}
                  {detailBroadcast.status === 'paused' && <Button variant="outline" size="sm" className="h-7 text-xs text-primary" onClick={() => resumeBroadcast(detailBroadcast.id)}><Play className="w-3 h-3 mr-1" /> Retomar</Button>}
                  {(detailBroadcast.status === 'sending' || detailBroadcast.status === 'paused') && <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => cancelBroadcast(detailBroadcast.id)}><XCircle className="w-3 h-3 mr-1" /> Cancelar</Button>}
                  {detailBroadcast.status !== 'sending' && (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => handleDelete(detailBroadcast.id, detailBroadcast.status)}><Trash2 className="w-3 h-3 mr-1" /> Excluir</Button>
                  )}
                </div>

                <div className="glass-card p-3"><p className="text-xs text-muted-foreground">Mensagem (template):</p><p className="text-sm text-foreground mt-1">{detailBroadcast.message}</p></div>

                {/* Recipient search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar destinatário..." value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} className="pl-9 bg-muted/50 border-border h-8 text-xs" />
                </div>

                {recipientsLoading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div> : (
                  <div className="max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow className="border-border">
                        <TableHead className="text-muted-foreground">Contato</TableHead>
                        <TableHead className="text-muted-foreground">Telefone</TableHead>
                        <TableHead className="text-muted-foreground">Status</TableHead>
                        <TableHead className="text-muted-foreground">Horário</TableHead>
                        <TableHead className="text-muted-foreground">Erro</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {filteredRecipients.map(r => (
                          <TableRow key={r.id} className="border-border/50">
                            <TableCell className="text-sm text-foreground">{r.customers?.name || '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground font-mono">{r.customers?.phone || '—'}</TableCell>
                            <TableCell><Badge className={`text-[10px] border-0 ${r.status === 'sent' ? 'bg-primary/20 text-primary' : r.status === 'failed' ? 'bg-destructive/20 text-destructive' : r.status === 'skipped' ? 'bg-muted text-muted-foreground' : 'bg-yellow-500/20 text-yellow-600'}`}>{r.status}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.sent_at ? format(new Date(r.sent_at), 'HH:mm:ss') : '—'}</TableCell>
                            <TableCell className="text-xs text-destructive max-w-[150px] truncate">{r.error_message || ''}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
