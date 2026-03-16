import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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

  async function create(name: string, message: string, contactIds: string[]) {
    if (!workspace) return;
    const { data: bc, error } = await supabase.from('broadcasts').insert({
      name, message,
      workspace_id: workspace.id,
      contacts_count: contactIds.length,
      total_recipients: contactIds.length,
      status: 'sending',
    }).select().single();

    if (error || !bc) throw error || new Error('Failed to create broadcast');

    // Insert recipients in both tables for compatibility
    await supabase.from('broadcast_contacts').insert(
      contactIds.map(cid => ({ broadcast_id: bc.id, contact_id: cid, status: 'pending' }))
    );
    await supabase.from('broadcast_recipients').insert(
      contactIds.map(cid => ({ broadcast_id: bc.id, contact_id: cid, status: 'pending' }))
    );

    // Trigger actual message sending via edge function (fire and forget)
    supabase.functions.invoke('broadcast-send', {
      body: { broadcastId: bc.id },
    }).then(({ data, error: sendErr }) => {
      if (sendErr) console.error('Broadcast send error:', sendErr);
      else console.log('Broadcast send result:', data);
      fetch(); // Refresh after sending completes
    });

    await fetch();
    return bc;
  }

  return { broadcasts, loading, refetch: fetch, create };
}
