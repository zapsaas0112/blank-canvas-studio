import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, useConversationMessages } from '@/hooks/useConversations';
import AppLayout from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Send, UserPlus, UserMinus, Check, CheckCheck, Phone, X, ChevronLeft, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'open', label: 'Abertas' },
  { key: 'unassigned', label: 'Pendentes' },
  { key: 'closed', label: 'Resolvidas' },
  { key: 'mine', label: 'Minhas' },
];

export default function Inbox() {
  const { user, workspace } = useAuth();
  const { conversations, loading: convsLoading, refetch: refetchConvs, assign, close } = useConversations();
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const { messages, loading: msgsLoading, refetch: refetchMsgs, send } = useConversationMessages(selectedConv);
  const [filter, setFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState<{ user_id: string; name: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load agents for filter
  useEffect(() => {
    if (!workspace) return;
    supabase.from('agents').select('user_id, name').eq('workspace_id', workspace.id).eq('is_active', true)
      .then(({ data }) => { if (data) setAgents(data); });
  }, [workspace?.id]);

  // Note: Realtime subscriptions are now handled inside useConversations and useConversationMessages hooks

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSelectConv(id: string) {
    setSelectedConv(id);
    setShowMobileChat(true);
  }

  async function handleSend() {
    if (!selectedConv || !user || !newMessage.trim() || !workspace) return;
    const selected = conversations.find(c => c.id === selectedConv);
    const customerPhone = selected?.customer?.phone || undefined;
    setSending(true);
    try {
      await send(newMessage.trim(), user.id, workspace.id, customerPhone);
      setNewMessage('');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  }

  async function handleAssign(convId: string) {
    if (!user) return;
    await assign(convId, user.id);
    toast.success('Conversa atribuída a você');
  }

  async function handleUnassign(convId: string) {
    await supabase.from('conversations').update({ assigned_user_id: null, status: 'unassigned' }).eq('id', convId);
    refetchConvs();
    toast.success('Conversa desatribuída');
  }

  async function handleClose(convId: string) {
    await close(convId);
    toast.success('Conversa encerrada');
  }

  const selected = conversations.find(c => c.id === selectedConv);

  const filtered = conversations.filter(c => {
    if (filter === 'unassigned') return c.status === 'unassigned';
    if (filter === 'open') return c.status === 'open';
    if (filter === 'closed') return c.status === 'closed';
    if (filter === 'mine') return c.assigned_user_id === user?.id;
    return true;
  }).filter(c => {
    if (agentFilter !== 'all') return c.assigned_user_id === agentFilter;
    return true;
  }).filter(c => {
    if (!searchTerm) return true;
    const name = c.customer?.name?.toLowerCase() || '';
    const phone = c.customer?.phone || '';
    return name.includes(searchTerm.toLowerCase()) || phone.includes(searchTerm);
  });

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* ── Conversation list ── */}
        <div className={cn("w-full md:w-80 lg:w-96 border-r border-border flex flex-col shrink-0 bg-card/50", showMobileChat && "hidden md:flex")}>
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar conversa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 bg-muted/50 border-border h-9 text-sm" />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap', filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                  {f.label}
                </button>
              ))}
            </div>
            {agents.length > 1 && (
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="h-8 text-xs bg-muted/50 border-border"><SelectValue placeholder="Filtrar por atendente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os atendentes</SelectItem>
                  {agents.map(a => <SelectItem key={a.user_id} value={a.user_id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
            {!convsLoading && filtered.length === 0 && (
              <div className="text-center py-12 px-4">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa</p>
                <p className="text-xs text-muted-foreground mt-1">Mensagens recebidas aparecerão aqui</p>
              </div>
            )}
            {filtered.map(conv => (
              <button key={conv.id} onClick={() => handleSelectConv(conv.id)} className={cn('w-full flex items-center gap-3 p-3 border-b border-border/50 transition-colors text-left', selectedConv === conv.id ? 'bg-accent' : 'hover:bg-muted/50')}>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                  {conv.customer?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground truncate">{conv.customer?.name || 'Desconhecido'}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{conv.last_message_at ? format(new Date(conv.last_message_at), 'HH:mm') : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex-1">{conv.customer?.phone}</p>
                    <div className={cn('w-2 h-2 rounded-full shrink-0', conv.status === 'open' ? 'bg-primary' : conv.status === 'unassigned' ? 'bg-yellow-500' : 'bg-muted-foreground/30')} />
                  </div>
                  {conv.assigned_profile?.name && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">👤 {conv.assigned_profile.name}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Chat area ── */}
        <div className={cn("flex-1 flex flex-col min-w-0", !showMobileChat && "hidden md:flex")}>
          {selected ? (
            <>
              <div className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-card/50">
                <button onClick={() => setShowMobileChat(false)} className="md:hidden text-muted-foreground hover:text-foreground"><ChevronLeft className="w-5 h-5" /></button>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">{selected.customer?.name?.charAt(0)?.toUpperCase() || '?'}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{selected.customer?.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground">{selected.customer?.phone}</p>
                    {selected.assigned_profile?.name && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">👤 {selected.assigned_profile.name}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {selected.tags?.map(tag => (<Badge key={tag.id} variant="outline" className="text-[10px] h-5" style={{ borderColor: tag.color, color: tag.color }}>{tag.name}</Badge>))}
                  {selected.status !== 'closed' && (
                    <>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => handleAssign(selected.id)}><UserPlus className="w-3.5 h-3.5 mr-1" /> Atribuir</Button>
                      {selected.assigned_user_id && (
                        <Button size="sm" variant="ghost" className="h-8 text-xs text-orange-600" onClick={() => handleUnassign(selected.id)}><UserMinus className="w-3.5 h-3.5 mr-1" /> Desatribuir</Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => handleClose(selected.id)}><X className="w-3.5 h-3.5 mr-1" /> Encerrar</Button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
                {messages.map(msg => (
                  <div key={msg.id} className={cn('flex', msg.sender_type === 'agent' || msg.sender_type === 'bot' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[70%] px-3.5 py-2 rounded-2xl text-sm', msg.sender_type === 'agent' ? 'bg-primary text-primary-foreground rounded-br-md' : msg.sender_type === 'bot' ? 'bg-secondary text-secondary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md')}>
                      {msg.sender_type === 'bot' && <p className="text-[10px] font-medium opacity-70 mb-0.5">🤖 Bot</p>}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <div className={cn('flex items-center gap-1 mt-1', msg.sender_type !== 'customer' ? 'justify-end' : 'justify-start')}>
                        <span className="text-[10px] opacity-60">{format(new Date(msg.created_at), 'HH:mm')}</span>
                        {msg.sender_type === 'agent' && (
                          msg.status === 'read' ? <CheckCheck className="w-3 h-3 text-secondary" /> :
                          msg.status === 'delivered' ? <CheckCheck className="w-3 h-3 opacity-60" /> :
                          msg.status === 'failed' ? <X className="w-3 h-3 text-destructive" /> :
                          msg.status === 'sending' ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin opacity-60" /> :
                          <Check className="w-3 h-3 opacity-60" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-3 border-t border-border bg-card/50">
                <div className="flex items-center gap-2">
                  <Input placeholder="Digite uma mensagem..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} className="bg-muted/50 border-border h-9 text-sm" disabled={sending} />
                  <Button size="icon" className="shrink-0 h-9 w-9" onClick={handleSend} disabled={!newMessage.trim() || sending}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4"><MessageSquare className="w-7 h-7 text-muted-foreground" /></div>
                <p className="text-sm font-medium text-foreground">Selecione uma conversa</p>
                <p className="text-xs text-muted-foreground mt-1">Mensagens do WhatsApp aparecerão aqui em tempo real</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Contact details panel ── */}
        {selected && (
          <div className="hidden xl:flex w-72 border-l border-border flex-col p-4 shrink-0 bg-card/30">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary mx-auto mb-3">{selected.customer?.name?.charAt(0)?.toUpperCase() || '?'}</div>
              <h3 className="text-sm font-semibold text-foreground">{selected.customer?.name}</h3>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1"><Phone className="w-3 h-3" /> {selected.customer?.phone}</p>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline" className="text-[10px] h-5">{selected.status}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Atribuído</span><span className="text-foreground">{selected.assigned_profile?.name || 'Ninguém'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Criado em</span><span className="text-foreground">{format(new Date(selected.created_at), 'dd/MM/yy')}</span></div>
              {selected.tags && selected.tags.length > 0 && (
                <div><span className="text-muted-foreground block mb-1.5">Tags</span><div className="flex flex-wrap gap-1">{selected.tags.map(tag => (<Badge key={tag.id} variant="outline" className="text-[10px]" style={{ borderColor: tag.color, color: tag.color }}>{tag.name}</Badge>))}</div></div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}