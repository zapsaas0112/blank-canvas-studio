import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';
import WhatsAppManager from '@/components/WhatsAppManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Webhook, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface WebhookDiag {
  lastEvent: { id: string; event_type: string; created_at: string; payload: any; processed: boolean } | null;
  lastMessage: { from_number: string; message_text: string; created_at: string; direction: string } | null;
  totalEvents: number;
  lastError: string | null;
}

export default function Connections() {
  const { profile, workspace } = useAuth();
  const [diag, setDiag] = useState<WebhookDiag>({ lastEvent: null, lastMessage: null, totalEvents: 0, lastError: null });

  useEffect(() => {
    if (!workspace) return;
    (async () => {
      // Get instances for this workspace
      const { data: instances } = await supabase
        .from('instances')
        .select('id')
        .eq('workspace_id', workspace.id);

      if (!instances?.length) return;
      const instanceIds = instances.map(i => i.id);

      const [eventsRes, msgsRes, countRes] = await Promise.all([
        supabase.from('webhook_events').select('id, event_type, created_at, payload, processed')
          .in('instance_id', instanceIds).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('webhook_messages').select('from_number, message_text, created_at, direction')
          .in('instance_id', instanceIds).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('webhook_events').select('id', { count: 'exact', head: true })
          .in('instance_id', instanceIds),
      ]);

      setDiag({
        lastEvent: eventsRes.data || null,
        lastMessage: msgsRes.data || null,
        totalEvents: countRes.count || 0,
        lastError: eventsRes.data && !eventsRes.data.processed ? 'Último evento não processado' : null,
      });
    })();
  }, [workspace?.id]);

  return (
    <AppLayout>
      <div className="p-6 max-w-lg mx-auto space-y-6">
        <WhatsAppManager userName={profile?.name || "Usuário"} />

        {/* Webhook Diagnostics */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Webhook className="w-4 h-4" /> Diagnóstico do Webhook
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-muted-foreground">Total de eventos</span>
                <p className="text-foreground font-semibold text-lg">{diag.totalEvents}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <div className="mt-1">
                  {diag.totalEvents > 0 ? (
                    <Badge variant="outline" className="bg-primary/10 text-primary gap-1"><CheckCircle2 className="w-3 h-3" /> Recebendo</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground gap-1"><AlertTriangle className="w-3 h-3" /> Sem eventos</Badge>
                  )}
                </div>
              </div>
            </div>

            {diag.lastEvent && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Último webhook recebido</p>
                <p className="text-foreground font-medium">{format(new Date(diag.lastEvent.created_at), 'dd/MM/yy HH:mm:ss')}</p>
                <p className="text-muted-foreground">Tipo: <span className="text-foreground">{diag.lastEvent.event_type}</span></p>
                <p className="text-muted-foreground">Processado: <span className={diag.lastEvent.processed ? 'text-primary' : 'text-destructive'}>{diag.lastEvent.processed ? 'Sim' : 'Não'}</span></p>
                {diag.lastEvent.payload && (
                  <details className="mt-1">
                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Payload resumido</summary>
                    <pre className="bg-background p-2 rounded text-[10px] mt-1 overflow-x-auto max-h-24">
                      {JSON.stringify(diag.lastEvent.payload, null, 2).substring(0, 500)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {diag.lastMessage && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-muted-foreground">Última mensagem recebida</p>
                <p className="text-foreground">De: <span className="font-mono">{diag.lastMessage.from_number}</span></p>
                <p className="text-foreground truncate">"{diag.lastMessage.message_text}"</p>
                <p className="text-muted-foreground">{format(new Date(diag.lastMessage.created_at), 'dd/MM/yy HH:mm:ss')}</p>
              </div>
            )}

            {diag.lastError && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2">
                <p className="text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {diag.lastError}</p>
              </div>
            )}

            {!diag.lastEvent && (
              <p className="text-muted-foreground text-center py-2">Nenhum webhook recebido ainda. Envie uma mensagem pelo WhatsApp para testar.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}