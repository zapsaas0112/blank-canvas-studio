import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPERATIONS_URL = "https://ipazua.uazapi.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, supabaseKey);

  try {
    const payload = await req.json();
    console.log("[webhook] Received:", JSON.stringify(payload).substring(0, 800));

    const eventType = payload?.EventType || payload?.event || payload?.type || "unknown";
    const instanceToken = payload?.token || null;

    // ── Find instance in DB by token
    let instanceRow: any = null;
    if (instanceToken) {
      const { data } = await db.from("instances").select("id, workspace_id, token").eq("token", instanceToken).maybeSingle();
      instanceRow = data;
    }
    if (!instanceRow) {
      const { data } = await db.from("instances").select("id, workspace_id, token").eq("is_active", true).limit(1).maybeSingle();
      instanceRow = data;
    }

    // ── Save webhook event
    const { data: eventRow } = await db.from("webhook_events").insert({
      event_type: eventType,
      instance_id: instanceRow?.id || null,
      payload,
      processed: false,
    }).select("id").single();

    // ── Handle connection events
    if (eventType === "connection") {
      const instStatus = payload?.instance?.status;
      const owner = payload?.owner;
      const profileName = payload?.instance?.name || payload?.instanceName;

      if (instanceRow && (instStatus === "connected" || instStatus === "open")) {
        await db.from("instances").update({
          status: "connected", is_active: true,
          phone_number: owner || null,
          name: profileName || "WhatsApp",
          updated_at: new Date().toISOString(),
        }).eq("id", instanceRow.id);
      } else if (instanceRow && (instStatus === "disconnected" || instStatus === "close")) {
        await db.from("instances").update({
          status: "disconnected", is_active: false,
          updated_at: new Date().toISOString(),
        }).eq("id", instanceRow.id);
      }

      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(JSON.stringify({ success: true, event: "connection", status: instStatus }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Parse message
    const message = payload?.message || payload?.data?.message || payload?.data || {};
    const key = message?.key || payload?.key || {};
    const fromJid = key?.remoteJid || message?.from || payload?.from || "";
    const isFromMe = key?.fromMe === true || message?.fromMe === true;
    const text = message?.message?.conversation
      || message?.message?.extendedTextMessage?.text
      || message?.body || message?.text || message?.conversation || "";
    const messageType = message?.messageType || message?.type || "text";
    const pushName = message?.pushName || payload?.pushName || "";
    const fromNumber = fromJid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace(/\D/g, "");

    // Skip own messages
    if (isFromMe) {
      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "own_message" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Skip groups
    if (fromJid.includes("@g.us")) {
      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "group" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Skip empty
    if (!fromNumber || !text || eventType === "messages_update") {
      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_text_content" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // ── Find or create customer & conversation
    if (!instanceRow) {
      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_instance" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const workspaceId = instanceRow.workspace_id;

    let { data: customer } = await db.from("customers")
      .select("id").eq("phone", fromNumber).eq("workspace_id", workspaceId).maybeSingle();

    if (!customer) {
      const { data: newCust } = await db.from("customers").insert({
        phone: fromNumber, name: pushName || fromNumber, workspace_id: workspaceId,
      }).select("id").single();
      customer = newCust;
    }

    if (!customer) {
      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "customer_create_failed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let { data: conversation } = await db.from("conversations")
      .select("id, assigned_user_id, status")
      .eq("customer_id", customer.id).eq("workspace_id", workspaceId)
      .neq("status", "closed")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    const isNew = !conversation;
    if (!conversation) {
      const { data: newConv } = await db.from("conversations").insert({
        customer_id: customer.id, workspace_id: workspaceId,
        status: "unassigned", last_message_at: new Date().toISOString(),
      }).select("id, assigned_user_id, status").single();
      conversation = newConv;
    } else {
      await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation.id);
    }

    if (!conversation) {
      if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "conv_create_failed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Save inbound message
    await db.from("messages").insert({
      conversation_id: conversation.id,
      workspace_id: workspaceId,
      sender_type: "customer",
      sender_id: customer.id,
      content: text,
      message_type: messageType === "text" ? "text" : messageType,
      status: "received",
    });

    // ══════════════════════════════════════════════════
    // BOT RUNTIME - auto-responder
    // ══════════════════════════════════════════════════
    const isAssignedToHuman = !!conversation.assigned_user_id;

    if (!isAssignedToHuman) {
      try {
        // Check active bot_config for workspace
        const { data: botConfig } = await db.from("bot_configs")
          .select("id, is_active, welcome_message, steps")
          .eq("workspace_id", workspaceId)
          .eq("is_active", true)
          .limit(1).maybeSingle();

        if (botConfig) {
          console.log("[webhook][bot] Bot config found:", botConfig.id);

          // Check/create bot state for conversation
          let { data: botState } = await db.from("conversation_bot_state")
            .select("*")
            .eq("conversation_id", conversation.id)
            .eq("is_active", true)
            .maybeSingle();

          const steps: any[] = Array.isArray(botConfig.steps) ? botConfig.steps : [];
          const incomingText = text.toLowerCase().trim();
          let botResponse: string | null = null;
          let botAction: string = "continue";
          let matchedStepId: string | null = null;

          if (isNew && !botState && botConfig.welcome_message) {
            // New conversation — send welcome message first
            botResponse = botConfig.welcome_message;
            botAction = "continue";

            // Create bot state
            await db.from("conversation_bot_state").insert({
              conversation_id: conversation.id,
              bot_config_id: botConfig.id,
              current_step: "welcome",
              is_active: true,
              state: { sent_welcome: true },
            });
          } else {
            // Match steps
            let matched = false;
            for (const step of steps) {
              const keywords = (step.keywords || "").split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);

              if (keywords.length === 0) continue; // skip catch-all for now

              for (const kw of keywords) {
                if (incomingText === kw || incomingText.includes(kw)) {
                  botResponse = step.response || null;
                  botAction = step.action || "continue";
                  matchedStepId = step.id || null;
                  matched = true;
                  break;
                }
              }
              if (matched) break;
            }

            // Fallback: step with empty keywords (catch-all)
            if (!matched) {
              const fallback = steps.find((s: any) => !(s.keywords || "").trim());
              if (fallback) {
                botResponse = fallback.response || null;
                botAction = fallback.action || "continue";
                matchedStepId = fallback.id || null;
              }
            }

            // Update bot state
            if (botState) {
              await db.from("conversation_bot_state").update({
                current_step: matchedStepId || botState.current_step,
                updated_at: new Date().toISOString(),
              }).eq("id", botState.id);
            } else {
              await db.from("conversation_bot_state").insert({
                conversation_id: conversation.id,
                bot_config_id: botConfig.id,
                current_step: matchedStepId || "active",
                is_active: true,
                state: {},
              });
            }
          }

          // Send bot response via WhatsApp
          if (botResponse && instanceRow.token) {
            console.log("[webhook][bot] Sending response:", botResponse.substring(0, 100));
            try {
              const sendRes = await fetch(`${OPERATIONS_URL}/send/text`, {
                method: "POST",
                headers: { "Content-Type": "application/json", token: instanceRow.token },
                body: JSON.stringify({ number: fromNumber, text: botResponse }),
              });
              const sendData = await sendRes.text();
              console.log("[webhook][bot] Send result:", sendRes.status, sendData.substring(0, 200));

              // Save bot message to messages
              await db.from("messages").insert({
                conversation_id: conversation.id,
                workspace_id: workspaceId,
                sender_type: "bot",
                content: botResponse,
                message_type: "text",
                status: "sent",
              });

              // Update conversation timestamp
              await db.from("conversations").update({
                last_message_at: new Date().toISOString(),
              }).eq("id", conversation.id);
            } catch (sendErr: any) {
              console.error("[webhook][bot] Send error:", sendErr?.message);
            }
          }

          // Handle transfer action
          if (botAction === "transfer") {
            console.log("[webhook][bot] Transfer to human");
            await db.from("conversation_bot_state")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("conversation_id", conversation.id);

            // Leave conversation unassigned for human pickup
            await db.from("conversations").update({
              status: "unassigned",
            }).eq("id", conversation.id);
          }
        }
      } catch (botErr: any) {
        console.error("[webhook][bot] Runtime error:", botErr?.message);
      }
    }

    // Mark event processed
    if (eventRow?.id) await db.from("webhook_events").update({ processed: true }).eq("id", eventRow.id);

    return new Response(
      JSON.stringify({ success: true, received: { from: fromNumber, text, messageType, pushName, botProcessed: !isAssignedToHuman } }),
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
