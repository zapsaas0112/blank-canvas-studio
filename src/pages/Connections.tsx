import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Wifi, WifiOff, QrCode, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Connection {
  id: string;
  phone_number: string;
  api_url: string;
  api_token: string;
  is_active: boolean;
  webhook_url: string;
}

export default function Connections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => { fetchConnections(); }, []);

  async function fetchConnections() {
    const { data } = await supabase.from('whatsapp_config').select('*').order('created_at', { ascending: false });
    if (data) setConnections(data);
  }

  async function handleAdd() {
    if (!label.trim()) { toast.error('Digite um nome'); return; }
    const { data, error } = await supabase.from('whatsapp_config').insert({ phone_number: label.trim(), is_active: false }).select().single();
    if (error) { toast.error('Erro ao criar conexão'); return; }
    setDialogOpen(false);
    setLabel('');
    toast.success('Conexão criada');
    
    // Simulate connecting
    if (data) {
      setConnecting(data.id);
      setTimeout(async () => {
        await supabase.from('whatsapp_config').update({ is_active: true }).eq('id', data.id);
        setConnecting(null);
        toast.success('Conectado com sucesso!');
        fetchConnections();
      }, 3000);
    }
    fetchConnections();
  }

  async function handleDelete(id: string) {
    await supabase.from('whatsapp_config').delete().eq('id', id);
    toast.success('Conexão removida');
    fetchConnections();
  }

  async function toggleConnection(conn: Connection) {
    if (conn.is_active) {
      await supabase.from('whatsapp_config').update({ is_active: false }).eq('id', conn.id);
      toast.success('Desconectado');
    } else {
      setConnecting(conn.id);
      setTimeout(async () => {
        await supabase.from('whatsapp_config').update({ is_active: true }).eq('id', conn.id);
        setConnecting(null);
        toast.success('Conectado!');
        fetchConnections();
      }, 3000);
    }
    fetchConnections();
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Conexões WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus números conectados</p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map(conn => (
            <div key={conn.id} className="glass-card-hover p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${conn.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                    {connecting === conn.id ? <Loader2 className="w-5 h-5 text-warning animate-spin" /> : conn.is_active ? <Wifi className="w-5 h-5 text-primary" /> : <WifiOff className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{conn.phone_number || 'Sem nome'}</p>
                    <Badge variant="outline" className={`text-[10px] mt-0.5 ${conn.is_active ? 'border-primary text-primary' : connecting === conn.id ? 'border-warning text-warning' : 'border-muted-foreground text-muted-foreground'}`}>
                      {connecting === conn.id ? 'Conectando...' : conn.is_active ? 'Conectado' : 'Desconectado'}
                    </Badge>
                  </div>
                </div>
              </div>

              {!conn.is_active && connecting !== conn.id && (
                <div className="mb-4 p-6 border border-dashed border-border rounded-xl flex flex-col items-center justify-center bg-muted/30">
                  <QrCode className="w-16 h-16 text-muted-foreground mb-2 animate-pulse" />
                  <p className="text-xs text-muted-foreground">Escaneie com WhatsApp</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => toggleConnection(conn)}>
                  {conn.is_active ? 'Desconectar' : 'Conectar'}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(conn.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {connections.length === 0 && (
            <div className="glass-card p-10 text-center col-span-full">
              <WifiOff className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma conexão configurada</p>
              <Button size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>Adicionar conexão</Button>
            </div>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">Nova conexão</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-foreground text-sm">Nome / Número</Label><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex: Suporte, Vendas, +55..." className="bg-muted/50 border-border mt-1" /></div>
              <Button onClick={handleAdd} className="w-full">Criar conexão</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
