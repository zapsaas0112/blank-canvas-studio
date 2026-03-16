import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DELAY_MS = 1500; // 1.5s between each message

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { broadcastId } = await req.json();
    if (!broadcastId) throw new Error("broadcastId é obrigatório");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseServiceRoleKey);

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

    for (const recipient of (recipients || [])) {
      const contact = recipient.customers as any;

      if (!contact?.phone) {
        await db
          .from("broadcast_recipients")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            error_message: "Sem número de telefone",
          })
          .eq("id", recipient.id);
        totalFailed++;
        continue;
      }

      const phone = String(contact.phone).replace(/\D/g, "");
      const personalizedMessage = String(broadcast.message || "").replace(/\{\{name\}\}/gi, contact.name || "");

      try {
        console.log(`[broadcast-send] Sending to ${phone}...`);

        const sendRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            apikey: supabaseServiceRoleKey,
          },
          body: JSON.stringify({ phone, message: personalizedMessage }),
        });

        const sendRaw = await sendRes.text();
        console.log(`[broadcast-send] send result ${phone}: ${sendRes.status} ${sendRaw.substring(0, 200)}`);

        if (!sendRes.ok) {
          throw new Error(sendRaw.substring(0, 255));
        }

        await db
          .from("broadcast_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", recipient.id);

        await db
          .from("broadcast_contacts")
          .update({ status: "sent" })
          .eq("broadcast_id", broadcastId)
          .eq("contact_id", recipient.contact_id);

        totalSent++;
      } catch (err: any) {
        console.error(`[broadcast-send] Failed for ${phone}:`, err?.message || err);
        await db
          .from("broadcast_recipients")
          .update({
            status: "failed",
            failed_at: new Date().toISOString(),
            error_message: (err?.message || "Erro ao enviar").substring(0, 255),
          })
          .eq("id", recipient.id);
        totalFailed++;
      }

      // Delay between messages to avoid rate limiting
      await sleep(DELAY_MS);
    }

    await db
      .from("broadcasts")
      .update({
        status: totalSent > 0 || totalFailed === 0 ? "done" : "failed",
        total_sent: totalSent,
        total_failed: totalFailed,
        sent_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);

    console.log(`[broadcast-send] Done. Sent: ${totalSent}, Failed: ${totalFailed}`);

    return new Response(
      JSON.stringify({ success: true, totalSent, totalFailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[broadcast-send] Error:", error?.message || error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
