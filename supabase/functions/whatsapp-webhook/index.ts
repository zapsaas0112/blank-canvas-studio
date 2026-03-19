import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const payload = await req.json();
    console.log("[webhook] payload received:", JSON.stringify(payload).slice(0, 500));

    // --- Identify event type ---
    const eventType =
      payload.event ||
      payload.type ||
      (payload.message ? "messages.upsert" : "unknown");

    // Save raw webhook event
    const { data: webhookEvent } = await supabase
      .from("webhook_events")
      .insert({
        event_type: eventType,
        payload,
        instance_id: null, // will be updated below
        processed: false,
      })
      .select("id")
      .single();

    // --- Extract message data ---
    // Support multiple WhatsApi payload shapes
    let messageText: string | null = null;
    let fromNumber: string | null = null;
    let toNumber: string | null = null;
    let isFromMe = false;
    let messageType = "text";

    // Shape 1: payload.message object
    const msg = payload.message || payload.data?.message || payload;
    if (msg.text || msg.body || msg.conversation) {
      messageText = msg.text || msg.body || msg.conversation || "";
    }
    if (msg.message?.conversation) {
      messageText = msg.message.conversation;
    }
    if (msg.message?.extendedTextMessage?.text) {
      messageText = msg.message.extendedTextMessage.text;
    }

    // Extract numbers
    fromNumber = msg.from || msg.key?.remoteJid || msg.sender || payload.from || null;
    toNumber = msg.to || payload.to || null;
    isFromMe = msg.key?.fromMe === true || msg.fromMe === true || payload.fromMe === true;

    // Clean remoteJid format (remove @s.whatsapp.net)
    if (fromNumber) fromNumber = fromNumber.replace(/@.*$/, "");
    if (toNumber) toNumber = toNumber.replace(/@.*$/, "");

    // Determine direction
    const direction = isFromMe ? "outbound" : "inbound";

    // Detect message type
    if (msg.message?.imageMessage || msg.imageMessage) messageType = "image";
    if (msg.message?.audioMessage || msg.audioMessage) messageType = "audio";
    if (msg.message?.videoMessage || msg.videoMessage) messageType = "video";
    if (msg.message?.documentMessage || msg.documentMessage) messageType = "document";

    console.log("[webhook] parsed:", { fromNumber, toNumber, direction, messageType, messageText: messageText?.slice(0, 100) });

    // --- Find instance by phone number ---
    // The instance phone could match fromNumber (outbound) or toNumber (inbound)
    const instancePhone = isFromMe ? fromNumber : toNumber;
    const contactPhone = isFromMe ? toNumber : fromNumber;

    if (!contactPhone) {
      console.log("[webhook] no contact phone found, skipping");
      // Still save the raw webhook message
      if (webhookEvent?.id) {
        await supabase.from("webhook_messages").insert({
          webhook_event_id: webhookEvent.id,
          event_type: eventType,
          direction,
          from_number: fromNumber,
          to_number: toNumber,
          message_text: messageText,
          message_type: messageType,
          raw_payload: payload,
        });
      }
      return new Response(JSON.stringify({ ok: true, skipped: "no_contact_phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find instance
    let instance: any = null;
    if (instancePhone) {
      const { data } = await supabase
        .from("instances")
        .select("id, workspace_id, token")
        .or(`phone_number.eq.${instancePhone},phone_number.ilike.%${instancePhone.slice(-8)}%`)
        .eq("is_active", true)
        .limit(1)
        .single();
      instance = data;
    }

    // Fallback: get first active instance
    if (!instance) {
      const { data } = await supabase
        .from("instances")
        .select("id, workspace_id, token")
        .eq("is_active", true)
        .limit(1)
        .single();
      instance = data;
    }

    if (!instance) {
      console.error("[webhook] no active instance found");
      return new Response(JSON.stringify({ ok: false, error: "no_instance" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[webhook] instance found:", instance.id, "workspace:", instance.workspace_id);

    // Update webhook event with instance_id
    if (webhookEvent?.id) {
      await supabase
        .from("webhook_events")
        .update({ instance_id: instance.id })
        .eq("id", webhookEvent.id);
    }

    // Save webhook message
    await supabase.from("webhook_messages").insert({
      webhook_event_id: webhookEvent?.id,
      instance_id: instance.id,
      direction,
      from_number: fromNumber,
      to_number: toNumber,
      message_text: messageText,
      message_type: messageType,
      raw_payload: payload,
    });

    // --- Skip outbound messages from API (already persisted by sender) ---
    if (isFromMe) {
      console.log("[webhook] outbound message from API, skipping inbox persistence");
      return new Response(JSON.stringify({ ok: true, skipped: "outbound_from_api" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Process INBOUND message ---
    const workspaceId = instance.workspace_id;

    // 1. Find or create customer
    let customer: any = null;
    const normalizedPhone = contactPhone.replace(/\D/g, "");

    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("workspace_id", workspaceId)
      .or(`phone.eq.${normalizedPhone},phone.ilike.%${normalizedPhone.slice(-8)}%`)
      .limit(1);

    if (existingCustomers && existingCustomers.length > 0) {
      customer = existingCustomers[0];
      console.log("[webhook] customer found:", customer.id, customer.name);
    } else {
      const pushName = msg.pushName || msg.notifyName || payload.pushName || "";
      const { data: newCustomer, error: custErr } = await supabase
        .from("customers")
        .insert({
          phone: normalizedPhone,
          name: pushName || normalizedPhone,
          workspace_id: workspaceId,
        })
        .select("id, name, phone")
        .single();

      if (custErr) {
        console.error("[webhook] error creating customer:", custErr);
        return new Response(JSON.stringify({ ok: false, error: "customer_create_failed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      customer = newCustomer;
      console.log("[webhook] customer created:", customer.id);
    }

    // 2. Find or create conversation
    let conversation: any = null;
    const { data: existingConvs } = await supabase
      .from("conversations")
      .select("id, status, unread_count")
      .eq("workspace_id", workspaceId)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingConvs && existingConvs.length > 0) {
      conversation = existingConvs[0];
      console.log("[webhook] conversation found:", conversation.id);
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          customer_id: customer.id,
          workspace_id: workspaceId,
          status: "unassigned",
          last_message_at: new Date().toISOString(),
          last_message_preview: messageText?.slice(0, 100) || "",
          unread_count: 1,
        })
        .select("id, status, unread_count")
        .single();

      if (convErr) {
        console.error("[webhook] error creating conversation:", convErr);
        return new Response(JSON.stringify({ ok: false, error: "conversation_create_failed" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      conversation = newConv;
      console.log("[webhook] conversation created:", conversation.id);
    }

    // 3. Insert message
    const { data: savedMessage, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        workspace_id: workspaceId,
        content: messageText || "",
        sender_type: "customer",
        sender_id: null,
        message_type: messageType,
        status: "received",
      })
      .select("id")
      .single();

    if (msgErr) {
      console.error("[webhook] error saving message:", msgErr);
      return new Response(JSON.stringify({ ok: false, error: "message_save_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[webhook] message saved:", savedMessage?.id);

    // 4. Update conversation
    const currentUnread = conversation.unread_count || 0;
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageText?.slice(0, 100) || "",
        unread_count: currentUnread + 1,
        status: conversation.status === "resolved" ? "unassigned" : conversation.status,
      })
      .eq("id", conversation.id);

    console.log("[webhook] conversation updated:", conversation.id);

    // Mark webhook event as processed
    if (webhookEvent?.id) {
      await supabase
        .from("webhook_events")
        .update({ processed: true })
        .eq("id", webhookEvent.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message_id: savedMessage?.id,
        conversation_id: conversation.id,
        customer_id: customer.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[webhook] unhandled error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
