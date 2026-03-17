/**
 * Unified message service for edge functions.
 * All outbound messages go through this to ensure:
 * 1. Customer exists
 * 2. Conversation exists or is created
 * 3. Message is persisted to `messages`
 * 4. Conversation is updated (last_message_at)
 * 5. WhatsApp API is called
 */

const OPERATIONS_URL = "https://ipazua.uazapi.com";

export interface SendMessageParams {
  db: any; // Supabase client with service role
  workspaceId: string;
  token: string; // WhatsApp instance token
  phone: string; // normalized phone number
  text: string;
  senderType: "agent" | "bot" | "system";
  senderId?: string | null; // user_id for agents
  contactName?: string; // optional name for new customers
  skipWhatsApp?: boolean; // persist only, don't send via API
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  conversationId?: string;
  customerId?: string;
  error?: string;
  providerMessageId?: string;
}

function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.substring(1);
  if (!digits.startsWith("55")) digits = "55" + digits;
  return digits;
}

export async function sendOutboundMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { db, workspaceId, token, phone, text, senderType, senderId, contactName, skipWhatsApp } = params;
  const normalized = normalizePhone(phone);

  try {
    // 1. Find or create customer
    let { data: customer } = await db.from("customers")
      .select("id, name")
      .eq("phone", normalized)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (!customer) {
      const { data: newCust, error: custErr } = await db.from("customers").insert({
        phone: normalized,
        name: contactName || normalized,
        workspace_id: workspaceId,
      }).select("id, name").single();

      if (custErr) {
        console.error("[message-service] Customer create error:", custErr.message);
        return { success: false, error: `Customer create failed: ${custErr.message}` };
      }
      customer = newCust;
    }

    // 2. Find or create conversation (reuse open/unassigned, or create new)
    let { data: conversation } = await db.from("conversations")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("workspace_id", workspaceId)
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv, error: convErr } = await db.from("conversations").insert({
        customer_id: customer.id,
        workspace_id: workspaceId,
        status: "unassigned",
        last_message_at: new Date().toISOString(),
      }).select("id").single();

      if (convErr) {
        console.error("[message-service] Conversation create error:", convErr.message);
        return { success: false, error: `Conversation create failed: ${convErr.message}` };
      }
      conversation = newConv;
    }

    // 3. Send via WhatsApp API (unless skipWhatsApp)
    let providerMessageId: string | null = null;
    let sendError: string | null = null;
    let apiSuccess = true;

    if (!skipWhatsApp) {
      try {
        const res = await fetch(`${OPERATIONS_URL}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({ number: normalized, text }),
        });

        const raw = await res.text();
        let data: any = {};
        try { data = JSON.parse(raw); } catch {}

        const hasId = !!(data?.messageId || data?.messageid || data?.key);
        const statusOk = !data?._status || data._status === 200;

        if (!res.ok || !statusOk || (data?.error && !hasId)) {
          apiSuccess = false;
          sendError = data?.error || data?.message || `HTTP ${res.status}`;
        } else {
          providerMessageId = data?.messageId || data?.messageid || data?.key?.id || null;
        }
      } catch (err: any) {
        apiSuccess = false;
        sendError = err?.message || "Network error";
      }
    }

    // 4. Persist message to `messages`
    const { data: msgRow, error: msgErr } = await db.from("messages").insert({
      conversation_id: conversation.id,
      workspace_id: workspaceId,
      sender_type: senderType,
      sender_id: senderId || null,
      content: text,
      message_type: "text",
      status: apiSuccess ? "sent" : "failed",
    }).select("id").single();

    if (msgErr) {
      console.error("[message-service] Message insert error:", msgErr.message);
    }

    // 5. Update conversation
    await db.from("conversations").update({
      last_message_at: new Date().toISOString(),
    }).eq("id", conversation.id);

    return {
      success: apiSuccess,
      messageId: msgRow?.id || undefined,
      conversationId: conversation.id,
      customerId: customer.id,
      providerMessageId: providerMessageId || undefined,
      error: sendError || undefined,
    };
  } catch (err: any) {
    console.error("[message-service] Unexpected error:", err?.message);
    return { success: false, error: err?.message || "Unknown error" };
  }
}
