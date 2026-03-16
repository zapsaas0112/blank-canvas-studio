import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useInstances } from '@/hooks/useInstances';
import { supabase } from '@/integrations/supabase/client';
import * as whatsappService from '@/services/whatsappService';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Wifi, WifiOff, QrCode, Trash2, Loader2, Send, RefreshCw, Pencil, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { Instance } from '@/types/database';

export default function Connections() {
  const { workspace, profile } = useAuth();
  const { instances, loading, refetch, updateInstance, removeInstance } = useInstances();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [instanceName, setInstanceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [activeQr, setActiveQr] = useState<{ instanceId: string; qrCode: string } | null>(null);
  const [polling, setPolling] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  async function handleCreate() {
    if (!instanceName.trim() || !workspace) return;
    setCreating(true);
    try {
      const instance = await whatsappService.createInstance(workspace.id, instanceName.trim());
      setDialogOpen(false);
      setInstanceName('');
      await refetch();
      // If instance has qr_code, show it
      if (instance.qr_code) {
        setActiveQr({ instanceId: instance.id, qrCode: instance.qr_code });
        startPolling(instance);
      }
      toast.success('Instância criada!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar instância');
    } finally {
      setCreating(false);
    }
  }

  async function handleConnect(inst: Instance) {
    if (!inst.token) { toast.error('Token não encontrado'); return; }
    setPolling(inst.id);
    try {
      const result = await whatsappService.connectInstance(inst.token);
      if (result.qrCode) {
        setActiveQr({ instanceId: inst.id, qrCode: result.qrCode });
        await updateInstance(inst.id, { qr_code: result.qrCode });
      }
      startPolling(inst);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conectar');
      setPolling(null);
    }
  }

  function startPolling(inst: Instance) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPolling(inst.id);
    intervalRef.current = setInterval(async () => {
      if (!inst.token) return;
      try {
        const status = await whatsappService.getInstanceStatus(inst.token);
        if (status.connected) {
          await updateInstance(inst.id, {
            status: 'connected', is_active: true,
            phone_number: status.phoneNumber || inst.phone_number,
          });
          setActiveQr(null);
          setPolling(null);
          if (intervalRef.current) clearInterval(intervalRef.current);
          toast.success('WhatsApp conectado!');
          await refetch();
        } else if (status.qrCode) {
          setActiveQr({ instanceId: inst.id, qrCode: status.qrCode });
        }
      } catch { /* polling error - ignore */ }
    }, 3000);
  }

  async function handleDisconnect(inst: Instance) {
    if (!inst.token) return;
    try {
      await whatsappService.disconnectInstance(inst.token);
      await updateInstance(inst.id, { status: 'disconnected', is_active: false });
      toast.success('Desconectado');
      await refetch();
    } catch { toast.error('Erro ao desconectar'); }
  }

  async function handleDelete(inst: Instance) {
    if (!confirm('Tem certeza? Esta ação é irreversível!')) return;
    try {
      if (inst.instance_id_external) await whatsappService.deleteInstance(inst.instance_id_external);
      await removeInstance(inst.id);
      toast.success('Instância removida');
    } catch { toast.error('Erro ao remover'); }
  }

  async function handleCheckStatus(inst: Instance) {
    if (!inst.token) return;
    try {
      const status = await whatsappService.getInstanceStatus(inst.token);
      await updateInstance(inst.id, {
        status: status.connected ? 'connected' : 'disconnected',
        is_active: status.connected,
        phone_number: status.phoneNumber || inst.phone_number,
      });
      await refetch();
      toast.success(status.connected ? 'Conectado' : 'Desconectado');
    } catch { toast.error('Erro ao verificar'); }
  }

  if (loading) return <AppLayout><div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold text-foreground">Conexões WhatsApp</h1><p className="text-sm text-muted-foreground">Gerencie suas instâncias</p></div>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-1" /> Nova instância</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {instances.map(inst => (
            <div key={inst.id} className="glass-card-hover p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${inst.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                    {polling === inst.id ? <Loader2 className="w-5 h-5 animate-spin text-yellow-500" /> : inst.is_active ? <Wifi className="w-5 h-5 text-primary" /> : <WifiOff className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{inst.name || 'Sem nome'}</p>
                    {inst.phone_number && <p className="text-xs text-muted-foreground">{inst.phone_number}</p>}
                    <Badge variant="outline" className={`text-[10px] mt-0.5 ${inst.is_active ? 'border-primary text-primary' : 'border-muted-foreground text-muted-foreground'}`}>
                      {polling === inst.id ? 'Conectando...' : inst.is_active ? 'Conectado' : 'Desconectado'}
                    </Badge>
                  </div>
                </div>
              </div>

              {activeQr?.instanceId === inst.id && activeQr.qrCode && (
                <div className="text-center py-2">
                  <img src={`data:image/png;base64,${activeQr.qrCode}`} alt="QR Code" className="w-48 h-48 mx-auto rounded-xl border-2 border-border" />
                  <p className="text-xs text-muted-foreground mt-2 animate-pulse">Escaneie com WhatsApp</p>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {!inst.is_active && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleConnect(inst)} disabled={polling === inst.id}>
                    <QrCode className="w-3.5 h-3.5 mr-1" /> Conectar
                  </Button>
                )}
                {inst.is_active && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDisconnect(inst)}>Desconectar</Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleCheckStatus(inst)}><RefreshCw className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(inst)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}

          {instances.length === 0 && (
            <div className="glass-card p-10 text-center col-span-full">
              <Smartphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma instância configurada</p>
              <Button size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>Criar instância</Button>
            </div>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground">Nova instância</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-foreground text-sm">Nome da instância</Label><Input value={instanceName} onChange={e => setInstanceName(e.target.value)} placeholder="Ex: Suporte, Vendas..." className="bg-muted/50 border-border mt-1" /></div>
              <Button onClick={handleCreate} className="w-full" disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {creating ? 'Criando...' : 'Criar instância'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
