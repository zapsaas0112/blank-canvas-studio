import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Conversation, Message } from '@/types/database';

export function useConversations() {
  const { workspace, user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from('conversations')
      .select('*, customer:customers(*)')
      .eq('workspace_id', workspace.id)
      .order('last_message_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    const convIds = data.map((c: any) => c.id);
    const [tagsRes, profilesRes] = await Promise.all([
      convIds.length > 0
        ? supabase.from('conversation_tags').select('conversation_id, tag:tags(*)').in('conversation_id', convIds)
        : { data: [] },
      supabase.from('profiles').select('user_id, name'),
    ]);

    const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p.name]));

    setConversations(data.map((c: any) => ({
      ...c,
      tags: (tagsRes.data || []).filter((ct: any) => ct.conversation_id === c.id).map((ct: any) => ct.tag),
      assigned_profile: c.assigned_user_id ? { name: profilesMap.get(c.assigned_user_id) || 'N/A' } : null,
    })));
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function assign(convId: string, userId: string) {
    await supabase.from('conversations').update({ assigned_user_id: userId, status: 'open' }).eq('id', convId);
    await fetch();
  }

  async function close(convId: string) {
    await supabase.from('conversations').update({ status: 'closed' }).eq('id', convId);
    await fetch();
  }

  async function reopen(convId: string) {
    await supabase.from('conversations').update({ status: 'open' }).eq('id', convId);
    await fetch();
  }

  return { conversations, loading, refetch: fetch, assign, close, reopen };
}

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data as Message[]);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => { fetch(); }, [fetch]);

  async function send(content: string, senderId: string, workspaceId: string) {
    if (!conversationId) return;
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      sender_id: senderId,
      content,
      message_type: 'text',
      workspace_id: workspaceId,
    });
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
    await fetch();
  }

  return { messages, loading, refetch: fetch, send };
}
