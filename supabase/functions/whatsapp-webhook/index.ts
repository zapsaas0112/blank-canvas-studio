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
    console.log("[webhook] Received:", JSON.stringify(payload).substring(0, 600));

    // Extract event type
    const eventType = payload?.event || payload?.type || "unknown";

    // Extract message data
    const message = payload?.message || payload?.data?.message || payload?.data || {};
    const from = message?.from || payload?.from || message?.key?.remoteJid || "unknown";
    const text = message?.body || message?.text || message?.conversation || message?.message?.conversation || "";
    const messageType = message?.type || message?.messageType || "text";
    const pushName = message?.pushName || payload?.pushName || "";
    const isFromMe = message?.key?.fromMe || message?.fromMe || false;

    // Clean phone number
    const fromNumber = from.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");

    // Skip messages sent by the API itself
    if (isFromMe) {
      console.log("[webhook] Skipping own message");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "own_message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Save webhook event ──
    const { data: eventRow } = await db.from("webhook_events").insert({
      event_type: eventType,
      payload,
      processed: false,
    }).select("id").single();

    // ── Save webhook message ──
    if (text || messageType !== "unknown") {
      await db.from("webhook_messages").insert({
        webhook_event_id: eventRow?.id,
        from_number: fromNumber,
        message_text: text,
        message_type: messageType,
        direction: "inbound",
        raw_payload: payload,
      });
    }

    // ── Find or create customer and conversation ──
    if (fromNumber && text && eventType !== "connection") {
      // Find instance by checking all instances
      const { data: instances } = await db.from("instances").select("id, workspace_id").eq("is_active", true).limit(1);
      const instance = instances?.[0];

      if (instance) {
        // Find or create customer
        let { data: customer } = await db.from("customers")
          .select("id")
          .eq("phone", fromNumber)
          .eq("workspace_id", instance.workspace_id)
          .maybeSingle();

        if (!customer) {
          const { data: newCustomer } = await db.from("customers").insert({
            phone: fromNumber,
            name: pushName || fromNumber,
            workspace_id: instance.workspace_id,
          }).select("id").single();
          customer = newCustomer;
        }

        if (customer) {
          // Find or create conversation
          let { data: conversation } = await db.from("conversations")
            .select("id")
            .eq("customer_id", customer.id)
            .eq("workspace_id", instance.workspace_id)
            .neq("status", "closed")
            .maybeSingle();

          if (!conversation) {
            const { data: newConv } = await db.from("conversations").insert({
              customer_id: customer.id,
              workspace_id: instance.workspace_id,
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
              workspace_id: instance.workspace_id,
              sender_type: "customer",
              sender_id: customer.id,
              content: text,
              message_type: messageType === "text" ? "text" : messageType,
              status: "received",
            });
          }
        }
      }

      // Mark event as processed
      if (eventRow?.id) {
        await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      }
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
