import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DELAY_MS = 1500; // 1.5s between each message

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { broadcastId } = await req.json();
    if (!broadcastId) throw new Error("broadcastId é obrigatório");

    const SERVER_URL = (Deno.env.get("WHATSAPI_SERVER_URL") || "").replace(/\/+$/, "");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");
    if (!SERVER_URL || !TOKEN) throw new Error("Credenciais UAZAPI não configuradas");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    // Get broadcast
    const { data: broadcast, error: bErr } = await db
      .from("broadcasts")
      .select("*")
      .eq("id", broadcastId)
      .single();
    if (bErr || !broadcast) throw new Error("Broadcast não encontrado");

    // Get recipients with contact info
    const { data: recipients, error: rErr } = await db
      .from("broadcast_recipients")
      .select("id, contact_id, status, customers:contact_id(name, phone)")
      .eq("broadcast_id", broadcastId)
      .eq("status", "pending");
    if (rErr) throw new Error("Erro ao buscar destinatários: " + rErr.message);

    console.log(`[broadcast-send] Processing ${recipients?.length || 0} recipients for broadcast ${broadcastId}`);

    let totalSent = 0;
    let totalFailed = 0;
    const sendUrl = `${SERVER_URL}/message/send-text`;

    for (const recipient of (recipients || [])) {
      const contact = recipient.customers as any;
      if (!contact?.phone) {
        await db.from("broadcast_recipients").update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: "Sem número de telefone",
        }).eq("id", recipient.id);
        totalFailed++;
        continue;
      }

      const phone = contact.phone.replace(/\D/g, "");
      const personalizedMessage = broadcast.message.replace(/\{\{name\}\}/gi, contact.name || "");

      try {
        console.log(`[broadcast-send] Sending to ${phone}...`);
        const res = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "token": TOKEN },
          body: JSON.stringify({ phone, message: personalizedMessage }),
        });

        const text = await res.text();
        console.log(`[broadcast-send] Response for ${phone}: ${res.status} ${text.substring(0, 200)}`);

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);

        await db.from("broadcast_recipients").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", recipient.id);

        // Also update broadcast_contacts
        await db.from("broadcast_contacts").update({ status: "sent" })
          .eq("broadcast_id", broadcastId)
          .eq("contact_id", recipient.contact_id);

        totalSent++;
      } catch (err) {
        console.error(`[broadcast-send] Failed for ${phone}:`, err.message);
        await db.from("broadcast_recipients").update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: err.message?.substring(0, 255),
        }).eq("id", recipient.id);
        totalFailed++;
      }

      // Delay between messages to avoid rate limiting
      await sleep(DELAY_MS);
    }

    // Update broadcast status
    await db.from("broadcasts").update({
      status: "done",
      total_sent: totalSent,
      total_failed: totalFailed,
      sent_at: new Date().toISOString(),
    }).eq("id", broadcastId);

    console.log(`[broadcast-send] Done. Sent: ${totalSent}, Failed: ${totalFailed}`);

    return new Response(
      JSON.stringify({ success: true, totalSent, totalFailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[broadcast-send] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
