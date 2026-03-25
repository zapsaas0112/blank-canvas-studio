import { supabase } from "@/integrations/supabase/client";

// Normalize phone number to 55+DDD+9digits
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = "55" + cleaned.slice(1);
  }
  if (cleaned.length <= 11) {
    cleaned = "55" + cleaned;
  }
  return cleaned;
}

// Template interpolation
export function interpolateTemplate(
  template: string,
  contact: { name?: string; phone?: string }
): string {
  const nameValue =
    contact.name && contact.name.trim() ? contact.name.trim() : contact.phone || "Olá";
  const phoneValue = contact.phone || "";
  return template
    .replace(/\{\{nome\}\}/gi, nameValue)
    .replace(/\{\{name\}\}/gi, nameValue)
    .replace(/\{\{telefone\}\}/gi, phoneValue)
    .replace(/\{\{phone\}\}/gi, phoneValue);
}

// Send message via WhatsApp API and persist in database
export async function sendAndPersistMessage({
  conversationId,
  workspaceId,
  customerId,
  content,
  instanceToken,
  customerPhone,
  senderId,
}: {
  conversationId: string;
  workspaceId: string;
  customerId: string;
  content: string;
  instanceToken: string;
  customerPhone: string;
  senderId?: string;
}) {
  const normalizedPhone = normalizePhone(customerPhone);

  // 1. Send via WhatsApp API (UAZAPI uses token as path param)
  const apiUrl = "https://ipazua.uazapi.com";
  const response = await fetch(`${apiUrl}/${instanceToken}/send/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ number: normalizedPhone, text: content }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`WhatsApp API error: ${errBody}`);
  }

  // 2. Persist in messages table
  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      content,
      sender_type: "agent",
      sender_id: senderId || null,
      message_type: "text",
      status: "sent",
    })
    .select("id, created_at")
    .single();

  if (msgErr) throw msgErr;

  // 3. Update conversation
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 100),
    })
    .eq("id", conversationId);

  return message;
}

// Find or create conversation for a customer in a workspace
export async function findOrCreateConversation(
  workspaceId: string,
  customerId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) return existing[0].id;

  const { data: newConv, error } = await supabase
    .from("conversations")
    .insert({
      customer_id: customerId,
      workspace_id: workspaceId,
      status: "unassigned",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  return newConv!.id;
}
