import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Instance } from '@/types/database';

export function useInstances() {
  const { workspace } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from('instances')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    if (data) setInstances(data as Instance[]);
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function updateInstance(id: string, updates: Partial<Instance>) {
    const { error } = await supabase.from('instances').update(updates).eq('id', id);
    if (error) throw error;
    await fetch();
  }

  async function removeInstance(id: string) {
    const { error } = await supabase.from('instances').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  }

  return { instances, loading, refetch: fetch, updateInstance, removeInstance };
}
