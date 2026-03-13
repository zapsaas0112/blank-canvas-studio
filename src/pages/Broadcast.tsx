import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Radio, Send, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function Broadcast() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  useEffect(() => { fetchBroadcasts(); }, []);

  async function fetchBroadcasts() {
    const { data } = await supabase.from('broadcasts').select('*').order('created_at', { ascending: false });
    if (data) setBroadcasts(data);
  }

  async function fetchContacts() {
    const { data } = await supabase.from('customers').select('id, name, phone');
    if (data) setContacts(data);
  }

  function openWizard() {
    setStep(1);
    setName('');
    setMessage('');
    setSelectedContacts([]);
    fetchContacts();
    setDialogOpen(true);
  }

  function toggleContact(id: string) {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  async function handleSend() {
    if (!name.trim() || !message.trim() || selectedContacts.length === 0) {
      toast.error('Preencha todos os campos');
      return;
    }
    const { data: bc, error } = await supabase.from('broadcasts').insert({
      name: name.trim(),
      message: message.trim(),
      contacts_count: selectedContacts.length,
      status: 'sending',
    }).select().single();

    if (error || !bc) { toast.error('Erro ao criar disparo'); return; }

    await supabase.from('broadcast_contacts').insert(
      selectedContacts.map(cid => ({ broadcast_id: bc.id, contact_id: cid, status: 'pending' }))
    );

    // Simulate sending
    setTimeout(async () => {
      await supabase.from('broadcasts').update({ status: 'done', sent_at: new Date().toISOString() }).eq('id', bc.id);
      fetchBroadcasts();
    }, 2000);

    toast.success('Disparo iniciado!');
    setDialogOpen(false);
    fetchBroadcasts();
  }

  const statusColor: Record<string, string> = {
    draft: 'text-muted-foreground border-muted-foreground',
    sending: 'text-warning border-warning',
    done: 'text-primary border-primary',
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Disparos em Massa</h1>
            <p className="text-sm text-muted-foreground">Envie mensagens para múltiplos contatos</p>
          </div>
          <Button size="sm" onClick={openWizard}><Plus className="w-4 h-4 mr-1" /> Novo disparo</Button>
        </div>

        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Nome</TableHead>
                <TableHead className="text-muted-foreground">Mensagem</TableHead>
                <TableHead className="text-muted-foreground">Contatos</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map(b => (
                <TableRow key={b.id} className="border-border/50">
                  <TableCell className="font-medium text-foreground">{b.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">{b.message}</TableCell>
                  <TableCell className="text-muted-foreground">{b.contacts_count}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${statusColor[b.status] || ''}`}>{b.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(b.created_at), 'dd/MM/yy HH:mm')}</TableCell>
                </TableRow>
              ))}
              {broadcasts.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum disparo</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Wizard Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">Novo Disparo — Passo {step}/3</DialogTitle>
            </DialogHeader>

            {step === 1 && (
              <div className="space-y-3">
                <div><Label className="text-foreground text-sm">Nome do disparo</Label><Input value={name} onChange={e => setName(e.target.value)} className="bg-muted/50 border-border mt-1" /></div>
                <div>
                  <Label className="text-foreground text-sm">Mensagem</Label>
                  <Textarea value={message} onChange={e => setMessage(e.target.value)} className="bg-muted/50 border-border mt-1 min-h-[100px]" placeholder="Olá {{name}}, temos novidades..." />
                  <p className="text-[10px] text-muted-foreground mt-1">Use {"{{name}}"} para personalizar</p>
                </div>
                <Button onClick={() => setStep(2)} disabled={!name.trim() || !message.trim()} className="w-full">Próximo <ArrowRight className="w-4 h-4 ml-1" /></Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Selecione os contatos ({selectedContacts.length} selecionados)</p>
                <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
                  {contacts.map(c => (
                    <button key={c.id} onClick={() => toggleContact(c.id)} className={`w-full flex items-center gap-3 p-2.5 border-b border-border/50 text-left transition-colors ${selectedContacts.includes(c.id) ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                      <div className={`w-4 h-4 rounded border ${selectedContacts.includes(c.id) ? 'bg-primary border-primary' : 'border-muted-foreground'} flex items-center justify-center`}>
                        {selectedContacts.includes(c.id) && <span className="text-primary-foreground text-[10px]">✓</span>}
                      </div>
                      <div><p className="text-sm text-foreground">{c.name}</p><p className="text-xs text-muted-foreground">{c.phone}</p></div>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
                  <Button onClick={() => setStep(3)} disabled={selectedContacts.length === 0} className="flex-1">Próximo <ArrowRight className="w-4 h-4 ml-1" /></Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="glass-card p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Nome</span><span className="text-foreground font-medium">{name}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Contatos</span><span className="text-foreground font-medium">{selectedContacts.length}</span></div>
                  <div className="text-sm"><span className="text-muted-foreground">Mensagem:</span><p className="text-foreground mt-1 bg-muted/50 p-2 rounded-lg text-xs">{message}</p></div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
                  <Button onClick={handleSend} className="flex-1"><Send className="w-4 h-4 mr-1" /> Enviar agora</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
