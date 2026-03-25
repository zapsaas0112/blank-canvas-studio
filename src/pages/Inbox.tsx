import { useState, useEffect, useRef } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useConversations, ConversationWithCustomer } from "@/hooks/useConversations";
import { useMessages, Message } from "@/hooks/useMessages";
import { sendAndPersistMessage } from "@/services/whatsappService";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Search, MessageSquare, User } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Inbox() {
  const { workspace, loading: wsLoading } = useWorkspace();
  const { conversations, loading: convLoading, markAsRead } = useConversations(workspace?.id ?? null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const { messages, loading: msgLoading } = useMessages(selectedConvId);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [instance, setInstance] = useState<{ id: string; token: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load active instance
  useEffect(() => {
    if (!workspace?.id) return;
    supabase
      .from("instances")
      .select("id, token")
      .eq("workspace_id", workspace.id)
      .eq("is_active", true)
      .not("token", "is", null)
      .limit(1)
      .single()
      .then(({ data }) => setInstance(data));
  }, [workspace?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark as read when selecting conversation
  useEffect(() => {
    if (selectedConvId) markAsRead(selectedConvId);
  }, [selectedConvId, markAsRead]);

  const selectedConversation = conversations.find((c) => c.id === selectedConvId);

  const filteredConversations = conversations.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.customer.name.toLowerCase().includes(term) ||
      c.customer.phone.includes(term) ||
      (c.last_message_preview || "").toLowerCase().includes(term)
    );
  });

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConversation || !instance?.token) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await sendAndPersistMessage({
        conversationId: selectedConversation.id,
        workspaceId: selectedConversation.workspace_id!,
        customerId: selectedConversation.customer_id,
        content: newMessage.trim(),
        instanceToken: instance.token,
        customerPhone: selectedConversation.customer.phone,
        senderId: user?.id,
      });
      setNewMessage("");
    } catch (err: any) {
      console.error("Send error:", err);
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (wsLoading || convLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {/* Sidebar - Conversations list */}
      <div className="w-80 border-r flex flex-col bg-card">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={conv.id === selectedConvId}
                onClick={() => setSelectedConvId(conv.id)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* Main - Chat area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat header */}
            <div className="h-14 border-b flex items-center px-4 gap-3 bg-card">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{selectedConversation.customer.name}</p>
                <p className="text-xs text-muted-foreground">{selectedConversation.customer.phone}</p>
              </div>
              <Badge variant="outline" className="ml-auto text-xs">
                {selectedConversation.status}
              </Badge>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {msgLoading ? (
                <div className="text-center text-muted-foreground text-sm">Carregando mensagens...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  Nenhuma mensagem nesta conversa
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message input */}
            <div className="border-t p-3 flex gap-2 bg-card">
              <Input
                placeholder="Digite uma mensagem..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={!newMessage.trim() || sending || !instance?.token}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <MessageSquare className="h-12 w-12 opacity-30" />
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: ConversationWithCustomer;
  isSelected: boolean;
  onClick: () => void;
}) {
  const time = conversation.last_message_at
    ? format(new Date(conversation.last_message_at), "HH:mm")
    : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-3 border-b transition-colors hover:bg-accent/50 ${
        isSelected ? "bg-accent" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center">
            <p className="font-medium text-sm truncate">{conversation.customer.name}</p>
            <span className="text-xs text-muted-foreground flex-shrink-0">{time}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {conversation.last_message_preview || conversation.customer.phone}
          </p>
        </div>
        {conversation.unread_count > 0 && (
          <Badge className="bg-primary text-primary-foreground text-xs h-5 min-w-[20px] flex items-center justify-center">
            {conversation.unread_count}
          </Badge>
        )}
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "HH:mm");

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
          isOutbound
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className={`text-[10px] mt-1 text-right ${isOutbound ? "opacity-70" : "text-muted-foreground"}`}>
          {time}
        </p>
      </div>
    </div>
  );
}
