import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as whatsappService from '@/services/whatsappService';
import type { Broadcast } from '@/types/database';

export function useBroadcasts() {
  const { workspace } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    if (data) setBroadcasts(data as Broadcast[]);
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function create(name: string, message: string, contactIds: string[], delayMinSec = 20, delayMaxSec = 25) {
    if (!workspace) return;

    const conn = await whatsappService.getActiveToken();
    if (!conn) throw new Error("WhatsApp não conectado. Conecte primeiro na página de Conexões.");

    const { data: bc, error } = await supabase.from('broadcasts').insert({
      name, message,
      workspace_id: workspace.id,
      contacts_count: contactIds.length,
      total_recipients: contactIds.length,
      status: 'sending',
    }).select().single();

    if (error || !bc) throw error || new Error('Failed to create broadcast');

    await supabase.from('broadcast_contacts').insert(
      contactIds.map(cid => ({ broadcast_id: bc.id, contact_id: cid, status: 'pending' }))
    );
    await supabase.from('broadcast_recipients').insert(
      contactIds.map(cid => ({ broadcast_id: bc.id, contact_id: cid, status: 'pending' }))
    );

    // Fire and forget — edge function processes in background
    supabase.functions.invoke('broadcast-send', {
      body: { broadcastId: bc.id, token: conn.token, delayMin: delayMinSec, delayMax: delayMaxSec },
    }).then(({ data, error: sendErr }) => {
      if (sendErr) console.error('Broadcast send error:', sendErr);
      else console.log('Broadcast send result:', data);
      fetch();
    });

    await fetch();
    return bc;
  }

  async function deleteBroadcast(id: string) {
    // Delete recipients and contacts first, then broadcast
    await supabase.from('broadcast_recipients').delete().eq('broadcast_id', id);
    await supabase.from('broadcast_contacts').delete().eq('broadcast_id', id);
    const { error } = await supabase.from('broadcasts').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  }

  return { broadcasts, loading, refetch: fetch, create, deleteBroadcast };
}
