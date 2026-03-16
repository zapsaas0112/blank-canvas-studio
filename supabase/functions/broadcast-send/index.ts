import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DELAY_MS = 1500;
const UAZAPI_URL = "https://ipazua.uazapi.com";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { broadcastId, token } = await req.json();
    if (!broadcastId) throw new Error("broadcastId é obrigatório");
    if (!token) throw new Error("token do WhatsApp é obrigatório");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: broadcast, error: bErr } = await db
      .from("broadcasts")
      .select("*")
      .eq("id", broadcastId)
      .single();
    if (bErr || !broadcast) throw new Error("Broadcast não encontrado");

    const { data: recipients, error: rErr } = await db
      .from("broadcast_recipients")
      .select("id, contact_id, status, customers:contact_id(name, phone)")
      .eq("broadcast_id", broadcastId)
      .eq("status", "pending");
    if (rErr) throw new Error("Erro ao buscar destinatários: " + rErr.message);

    console.log(`[broadcast-send] Processing ${recipients?.length || 0} recipients`);

    let totalSent = 0;
    let totalFailed = 0;

    for (const recipient of (recipients || [])) {
      const contact = recipient.customers as any;

      if (!contact?.phone) {
        await db.from("broadcast_recipients").update({
          status: "failed", failed_at: new Date().toISOString(), error_message: "Sem número",
        }).eq("id", recipient.id);
        totalFailed++;
        continue;
      }

      const phone = String(contact.phone).replace(/\D/g, "");
      const personalizedMessage = String(broadcast.message || "").replace(/\{\{name\}\}/gi, contact.name || "");

      try {
        const res = await fetch(`${UAZAPI_URL}/message/sendText`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({ phone, message: personalizedMessage }),
        });

        const raw = await res.text();
        console.log(`[broadcast-send] ${phone}: ${res.status} ${raw.substring(0, 200)}`);

        if (!res.ok) throw new Error(raw.substring(0, 255));

        await db.from("broadcast_recipients").update({
          status: "sent", sent_at: new Date().toISOString(),
        }).eq("id", recipient.id);

        await db.from("broadcast_contacts").update({ status: "sent" })
          .eq("broadcast_id", broadcastId).eq("contact_id", recipient.contact_id);

        totalSent++;
      } catch (err: any) {
        console.error(`[broadcast-send] Failed ${phone}:`, err?.message);
        await db.from("broadcast_recipients").update({
          status: "failed", failed_at: new Date().toISOString(),
          error_message: (err?.message || "Erro").substring(0, 255),
        }).eq("id", recipient.id);
        totalFailed++;
      }

      await sleep(DELAY_MS);
    }

    await db.from("broadcasts").update({
      status: totalSent > 0 || totalFailed === 0 ? "done" : "failed",
      total_sent: totalSent, total_failed: totalFailed,
      sent_at: new Date().toISOString(),
    }).eq("id", broadcastId);

    console.log(`[broadcast-send] Done. Sent: ${totalSent}, Failed: ${totalFailed}`);

    return new Response(
      JSON.stringify({ success: true, totalSent, totalFailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[broadcast-send] Error:", error?.message);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
