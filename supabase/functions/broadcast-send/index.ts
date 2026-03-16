import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPERATIONS_URL = "https://ipazua.uazapi.com";
const DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.substring(1);
  if (!digits.startsWith("55")) digits = "55" + digits;
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { broadcastId, token } = await req.json();
    if (!broadcastId) throw new Error("broadcastId é obrigatório");
    if (!token) throw new Error("token do WhatsApp é obrigatório");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    // ── Verify instance is connected ──
    const statusRes = await fetch(`${OPERATIONS_URL}/instance/status`, {
      method: "GET",
      headers: { token },
    });
    const statusData = await statusRes.json().catch(() => ({}));
    const inst = statusData?.instance || statusData || {};
    const so = statusData?.status || {};
    const isConnected = so?.connected === true || inst?.status === "open" || inst?.status === "connected";

    if (!isConnected) {
      await db.from("broadcasts").update({ status: "failed" }).eq("id", broadcastId);
      throw new Error("Instância não está conectada. Conecte antes de disparar.");
    }

    // ── Get broadcast ──
    const { data: broadcast, error: bErr } = await db
      .from("broadcasts").select("*").eq("id", broadcastId).single();
    if (bErr || !broadcast) throw new Error("Broadcast não encontrado");

    // ── Get recipients ──
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

      const phone = normalizePhone(contact.phone);
      if (phone.length < 12) {
        await db.from("broadcast_recipients").update({
          status: "failed", failed_at: new Date().toISOString(), error_message: `Número inválido: ${phone}`,
        }).eq("id", recipient.id);
        totalFailed++;
        continue;
      }

      const personalizedMessage = String(broadcast.message || "").replace(/\{\{name\}\}/gi, contact.name || "");

      try {
        // Use correct endpoint: /send/text with {number, text}
        const res = await fetch(`${OPERATIONS_URL}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({ number: phone, text: personalizedMessage }),
        });

        const raw = await res.text();
        console.log(`[broadcast-send] ${phone}: ${res.status} ${raw.substring(0, 300)}`);

        let data: any = {};
        try { data = JSON.parse(raw); } catch {}

        // Validate real success
        const hasId = !!(data?.messageId || data?.messageid || data?.key);
        const statusOk = !data?._status || data._status === 200;

        if (!res.ok || !statusOk || (data?.error && !hasId)) {
          throw new Error(data?.error || data?.message || `HTTP ${res.status}: ${raw.substring(0, 150)}`);
        }

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

    const finalStatus = totalSent > 0 ? "done" : totalFailed > 0 ? "failed" : "done";
    await db.from("broadcasts").update({
      status: finalStatus, total_sent: totalSent, total_failed: totalFailed,
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
      JSON.stringify({ success: false, error: error?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
