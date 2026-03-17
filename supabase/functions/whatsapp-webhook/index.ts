import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, supabaseKey);

  try {
    const payload = await req.json();
    console.log("[webhook] Received:", JSON.stringify(payload).substring(0, 800));

    // ── UAZAPI sends: { EventType, instance, token, owner, ... }
    const eventType = payload?.EventType || payload?.event || payload?.type || "unknown";
    const instanceToken = payload?.token || null;

    // ── Find instance in DB by token
    let instanceRow: any = null;
    if (instanceToken) {
      const { data } = await db.from("instances").select("id, workspace_id").eq("token", instanceToken).maybeSingle();
      instanceRow = data;
    }
    if (!instanceRow) {
      // Try finding any active instance
      const { data } = await db.from("instances").select("id, workspace_id").eq("is_active", true).limit(1).maybeSingle();
      instanceRow = data;
    }

    // ── Save webhook event
    const { data: eventRow } = await db.from("webhook_events").insert({
      event_type: eventType,
      instance_id: instanceRow?.id || null,
      payload,
      processed: false,
    }).select("id").single();

    // ── Handle connection events: update instance status
    if (eventType === "connection") {
      const instStatus = payload?.instance?.status;
      const owner = payload?.owner;
      const profileName = payload?.instance?.name || payload?.instanceName;

      if (instanceRow && instStatus === "connected") {
        await db.from("instances").update({
          status: "connected",
          is_active: true,
          phone_number: owner || null,
          name: profileName || "WhatsApp",
          updated_at: new Date().toISOString(),
        }).eq("id", instanceRow.id);
      } else if (instanceRow && (instStatus === "disconnected" || instStatus === "close")) {
        await db.from("instances").update({
          status: "disconnected",
          is_active: false,
          updated_at: new Date().toISOString(),
        }).eq("id", instanceRow.id);
      }

      if (eventRow?.id) {
        await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      }

      return new Response(
        JSON.stringify({ success: true, event: "connection", status: instStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Handle message events
    // UAZAPI message format: payload.message or payload.data
    const message = payload?.message || payload?.data?.message || payload?.data || {};
    const key = message?.key || payload?.key || {};
    const fromJid = key?.remoteJid || message?.from || payload?.from || "";
    const isFromMe = key?.fromMe === true || message?.fromMe === true;
    const text = message?.message?.conversation
      || message?.message?.extendedTextMessage?.text
      || message?.body || message?.text || message?.conversation || "";
    const messageType = message?.messageType || message?.type || "text";
    const pushName = message?.pushName || payload?.pushName || "";

    // Clean phone number
    const fromNumber = fromJid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");

    // Skip own messages (sent by API)
    if (isFromMe) {
      console.log("[webhook] Skipping own message");
      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "own_message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip non-message events or empty messages
    if (!fromNumber || !text || eventType === "messages_update") {
      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_text_content" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Save webhook message
    await db.from("webhook_messages").insert({
      webhook_event_id: eventRow?.id,
      instance_id: instanceRow?.id || null,
      from_number: fromNumber,
      message_text: text,
      message_type: messageType,
      direction: "inbound",
      raw_payload: payload,
    });

    // ── Find or create customer
    if (instanceRow) {
      let { data: customer } = await db.from("customers")
        .select("id")
        .eq("phone", fromNumber)
        .eq("workspace_id", instanceRow.workspace_id)
        .maybeSingle();

      if (!customer) {
        const { data: newCustomer } = await db.from("customers").insert({
          phone: fromNumber,
          name: pushName || fromNumber,
          workspace_id: instanceRow.workspace_id,
        }).select("id").single();
        customer = newCustomer;
      }

      if (customer) {
        // Find open conversation or create new
        let { data: conversation } = await db.from("conversations")
          .select("id")
          .eq("customer_id", customer.id)
          .eq("workspace_id", instanceRow.workspace_id)
          .neq("status", "closed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!conversation) {
          const { data: newConv } = await db.from("conversations").insert({
            customer_id: customer.id,
            workspace_id: instanceRow.workspace_id,
            status: "unassigned",
            last_message_at: new Date().toISOString(),
          }).select("id").single();
          conversation = newConv;
        } else {
          await db.from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversation.id);
        }

        if (conversation) {
          await db.from("messages").insert({
            conversation_id: conversation.id,
            workspace_id: instanceRow.workspace_id,
            sender_type: "customer",
            sender_id: customer.id,
            content: text,
            message_type: messageType === "text" ? "text" : messageType,
            status: "received",
          });
        }
      }
    }

    // Mark processed
    if (eventRow?.id) {
      await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
    }

    return new Response(
      JSON.stringify({ success: true, received: { from: fromNumber, text, messageType, pushName } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[webhook] Error:", error?.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
