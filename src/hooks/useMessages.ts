import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Message {
  id: string;
  conversation_id: string;
  content: string;
  sender_type: string;
  sender_id: string | null;
  message_type: string;
  status: string;
  created_at: string;
}

// Unified sort: always chronological (oldest first)
function sortMessages(msgs: Message[]): Message[] {
  return [...msgs].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateA - dateB;
  });
}

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesRef = useRef<Map<string, Message>>(new Map());

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, content, sender_type, sender_id, message_type, status, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      setLoading(false);
      return;
    }

    // Build dedup map
    const map = new Map<string, Message>();
    (data || []).forEach((m) => map.set(m.id, m as Message));
    messagesRef.current = map;

    setMessages(sortMessages(Array.from(map.values())));
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    messagesRef.current = new Map();
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription filtered by conversation_id
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-rt-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          // Dedup: skip if already exists
          if (messagesRef.current.has(newMsg.id)) return;

          messagesRef.current.set(newMsg.id, newMsg);
          setMessages(sortMessages(Array.from(messagesRef.current.values())));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          messagesRef.current.set(updated.id, updated);
          setMessages(sortMessages(Array.from(messagesRef.current.values())));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { messages, loading, refetch: fetchMessages };
}
