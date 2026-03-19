import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ConversationWithCustomer {
  id: string;
  customer_id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  assigned_user_id: string | null;
  workspace_id: string | null;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
}

export function useConversations(workspaceId: string | null) {
  const [conversations, setConversations] = useState<ConversationWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from("conversations")
      .select(`
        id, customer_id, status, last_message_at, last_message_preview,
        unread_count, assigned_user_id, workspace_id,
        customers!conversations_customer_id_fkey (id, name, phone)
      `)
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      return;
    }

    const mapped = (data || []).map((c: any) => ({
      ...c,
      unread_count: c.unread_count ?? 0,
      last_message_preview: c.last_message_preview ?? "",
      customer: c.customers || { id: c.customer_id, name: "Desconhecido", phone: "" },
    }));

    setConversations(mapped);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime subscription for conversations list
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`conversations-list-rt-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          // Refetch on any change to conversations
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, fetchConversations]);

  const markAsRead = useCallback(async (conversationId: string) => {
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId);

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      )
    );
  }, []);

  return { conversations, loading, refetch: fetchConversations, markAsRead };
}
