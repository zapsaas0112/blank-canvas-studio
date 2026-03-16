import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { QuickReply } from '@/types/database';

export function useQuickReplies() {
  const { workspace, user } = useAuth();
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from('quick_replies')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    if (data) setReplies(data as QuickReply[]);
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function create(title: string, content: string, shortcut?: string) {
    if (!workspace) return;
    const { error } = await supabase.from('quick_replies').insert({
      title, content,
      shortcut: shortcut || null,
      created_by: user?.id || null,
      workspace_id: workspace.id,
    });
    if (error) throw error;
    await fetch();
  }

  async function update(id: string, title: string, content: string, shortcut?: string) {
    const { error } = await supabase.from('quick_replies').update({
      title, content, shortcut: shortcut || null,
    }).eq('id', id);
    if (error) throw error;
    await fetch();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('quick_replies').delete().eq('id', id);
    if (error) throw error;
    await fetch();
  }

  return { replies, loading, refetch: fetch, create, update, remove };
}
