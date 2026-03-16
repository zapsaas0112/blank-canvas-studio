import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tag } from '@/types/database';

export function useTags() {
  const { workspace } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from('tags')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at');
    if (data) setTags(data as Tag[]);
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function create(name: string, color: string) {
    if (!workspace) return;
    const { error } = await supabase.from('tags').insert({ name, color, workspace_id: workspace.id });
    if (error) throw error;
    await fetch();
  }

  async function update(id: string, name: string, color: string) {
    const { error } = await supabase.from('tags').update({ name, color }).eq('id', id);
    if (error) throw error;
    await fetch();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('tags').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  }

  return { tags, loading, refetch: fetch, create, update, remove };
}
