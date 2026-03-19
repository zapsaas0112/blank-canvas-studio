import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Template interpolation: replaces {{nome}}, {{name}}, {{telefone}}, {{phone}}
function interpolateTemplate(template: string, contact: { name?: string; phone?: string }): string {
  const nameValue = contact.name && contact.name.trim() ? contact.name.trim() : (contact.phone || "Olá");
  const phoneValue = contact.phone || "";

  return template
    .replace(/\{\{nome\}\}/gi, nameValue)
    .replace(/\{\{name\}\}/gi, nameValue)
    .replace(/\{\{telefone\}\}/gi, phoneValue)
    .replace(/\{\{phone\}\}/gi, phoneValue);
}

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = "55" + cleaned.slice(1);
  }
  if (cleaned.length <= 11) {
    cleaned = "55" + cleaned;
  }
  return cleaned;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { broadcast_id } = await req.json();

    if (!broadcast_id) {
      return new Response(JSON.stringify({ error: "broadcast_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[broadcast] starting broadcast:", broadcast_id);

    // 1. Get broadcast details
    const { data: broadcast, error: bErr } = await supabase
      .from("broadcasts")
      .select("*")
      .eq("id", broadcast_id)
      .single();

    if (bErr || !broadcast) {
      console.error("[broadcast] not found:", bErr);
      return new Response(JSON.stringify({ error: "broadcast not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workspaceId = broadcast.workspace_id;
    const delayMin = broadcast.delay_min_seconds ?? 10;
    const delayMax = broadcast.delay_max_seconds ?? 20;
    const messageTemplate = broadcast.message;

    // 2. Get instance for this workspace
    const { data: instance } = await supabase
      .from("instances")
      .select("id, token, phone_number")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!instance?.token) {
      console.error("[broadcast] no active instance for workspace:", workspaceId);
      await supabase.from("broadcasts").update({ status: "failed" }).eq("id", broadcast_id);
      return new Response(JSON.stringify({ error: "no_active_instance" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Get recipients with contact info
    const { data: recipients } = await supabase
      .from("broadcast_recipients")
      .select("id, contact_id, status")
      .eq("broadcast_id", broadcast_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (!recipients || recipients.length === 0) {
      console.log("[broadcast] no pending recipients");
      await supabase.from("broadcasts").update({ status: "completed" }).eq("id", broadcast_id);
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update broadcast to processing
    await supabase.from("broadcasts").update({
      status: "processing",
      sent_at: new Date().toISOString(),
      total_recipients: recipients.length,
    }).eq("id", broadcast_id);

    const apiUrl = Deno.env.get("WHATSAPI_SERVER_URL") || "https://ipazua.uazapi.com";
    let totalSent = 0;
    let totalFailed = 0;

    // 4. Process each recipient sequentially
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      // Check if broadcast was cancelled
      const { data: currentBroadcast } = await supabase
        .from("broadcasts")
        .select("status")
        .eq("id", broadcast_id)
        .single();

      if (currentBroadcast?.status === "cancelled") {
        console.log("[broadcast] cancelled, stopping");
        break;
      }

      // Get contact details
      const { data: contact } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("id", recipient.contact_id)
        .single();

      if (!contact) {
        console.error("[broadcast] contact not found:", recipient.contact_id);
        await supabase.from("broadcast_recipients").update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: "Contact not found",
        }).eq("id", recipient.id);
        totalFailed++;
        continue;
      }

      // Interpolate message
      const finalMessage = interpolateTemplate(messageTemplate, {
        name: contact.name,
        phone: contact.phone,
      });

      const normalizedPhone = normalizePhone(contact.phone);

      try {
        // Send via WhatsApp API
        console.log(`[broadcast] sending to ${normalizedPhone}: "${finalMessage.slice(0, 50)}..."`);
        const sendResponse = await fetch(`${apiUrl}/send/text`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${instance.token}`,
          },
          body: JSON.stringify({ number: normalizedPhone, text: finalMessage }),
        });

        const sendResult = await sendResponse.json();
        console.log("[broadcast] API response:", JSON.stringify(sendResult).slice(0, 200));

        if (sendResponse.ok) {
          // Update recipient as sent
          await supabase.from("broadcast_recipients").update({
            status: "sent",
            sent_at: new Date().toISOString(),
          }).eq("id", recipient.id);

          // --- SYNC WITH INBOX ---
          // Find or create conversation for this contact
          let conversationId: string;
          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("customer_id", contact.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (existingConv && existingConv.length > 0) {
            conversationId = existingConv[0].id;
          } else {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                customer_id: contact.id,
                workspace_id: workspaceId,
                status: "unassigned",
                last_message_at: new Date().toISOString(),
                last_message_preview: finalMessage.slice(0, 100),
              })
              .select("id")
              .single();
            conversationId = newConv!.id;
          }

          // Save message in messages table
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            workspace_id: workspaceId,
            content: finalMessage,
            sender_type: "agent",
            message_type: "text",
            status: "sent",
          });

          // Update conversation
          await supabase.from("conversations").update({
            last_message_at: new Date().toISOString(),
            last_message_preview: finalMessage.slice(0, 100),
          }).eq("id", conversationId);

          totalSent++;
        } else {
          await supabase.from("broadcast_recipients").update({
            status: "failed",
            failed_at: new Date().toISOString(),
            error_message: JSON.stringify(sendResult).slice(0, 200),
          }).eq("id", recipient.id);
          totalFailed++;
        }
      } catch (sendErr) {
        console.error("[broadcast] send error:", sendErr);
        await supabase.from("broadcast_recipients").update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: String(sendErr).slice(0, 200),
        }).eq("id", recipient.id);
        totalFailed++;
      }

      // Update broadcast progress
      await supabase.from("broadcasts").update({
        total_sent: totalSent,
        total_failed: totalFailed,
      }).eq("id", broadcast_id);

      // Delay between recipients (skip after last)
      if (i < recipients.length - 1) {
        const delayMs = (delayMin + Math.random() * (delayMax - delayMin)) * 1000;
        console.log(`[broadcast] waiting ${Math.round(delayMs / 1000)}s before next recipient`);
        await sleep(delayMs);
      }
    }

    // 5. Finalize broadcast
    const finalStatus = totalFailed === recipients.length ? "failed" : "completed";
    await supabase.from("broadcasts").update({
      status: finalStatus,
      total_sent: totalSent,
      total_failed: totalFailed,
    }).eq("id", broadcast_id);

    console.log(`[broadcast] finished: sent=${totalSent}, failed=${totalFailed}`);

    return new Response(
      JSON.stringify({ ok: true, sent: totalSent, failed: totalFailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[broadcast] unhandled error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
