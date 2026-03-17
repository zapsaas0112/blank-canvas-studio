import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPERATIONS_URL = "https://ipazua.uazapi.com";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.substring(1);
  if (!digits.startsWith("55")) digits = "55" + digits;
  return digits;
}

function randomDelay(minSec: number, maxSec: number): number {
  const min = Math.max(0.5, minSec);
  const max = Math.max(min, maxSec);
  return (min + Math.random() * (max - min)) * 1000;
}

/**
 * Interpolate template variables in a message.
 * Supports: {{nome}}, {{name}}, {{telefone}}, {{phone}}
 */
function interpolateMessage(template: string, contact: { name?: string; phone?: string }): string {
  const name = (contact.name || "").trim();
  const phone = (contact.phone || "").trim();
  const fallbackName = name || phone || "Olá";

  let result = template;
  // Replace {{nome}} and {{name}} (case-insensitive)
  result = result.replace(/\{\{nome\}\}/gi, fallbackName);
  result = result.replace(/\{\{name\}\}/gi, fallbackName);
  // Replace {{telefone}} and {{phone}}
  result = result.replace(/\{\{telefone\}\}/gi, phone);
  result = result.replace(/\{\{phone\}\}/gi, phone);
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { broadcastId, token, delayMin = 20, delayMax = 25 } = await req.json();
    if (!broadcastId) throw new Error("broadcastId é obrigatório");
    if (!token) throw new Error("token do WhatsApp é obrigatório");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    // Verify instance connected
    const statusRes = await fetch(`${OPERATIONS_URL}/instance/status`, { method: "GET", headers: { token } });
    const statusData = await statusRes.json().catch(() => ({}));
    const inst = statusData?.instance || statusData || {};
    const so = statusData?.status || {};
    const isConnected = so?.connected === true || inst?.status === "open" || inst?.status === "connected";

    if (!isConnected) {
      await db.from("broadcasts").update({ status: "failed" }).eq("id", broadcastId);
      throw new Error("Instância não conectada");
    }

    const { data: broadcast } = await db.from("broadcasts").select("*").eq("id", broadcastId).single();
    if (!broadcast) throw new Error("Broadcast não encontrado");

    const workspaceId = broadcast.workspace_id;

    const { data: recipients } = await db.from("broadcast_recipients")
      .select("id, contact_id, status, customers:contact_id(id, name, phone)")
      .eq("broadcast_id", broadcastId).eq("status", "pending");

    const delayMinSec = Number(delayMin) || 1;
    const delayMaxSec = Math.max(Number(delayMax) || 1, delayMinSec);

    console.log(`[broadcast-send] Processing ${recipients?.length || 0} recipients, delay ${delayMinSec}-${delayMaxSec}s`);

    let totalSent = 0, totalFailed = 0;

    for (let i = 0; i < (recipients || []).length; i++) {
      const recipient = recipients![i];

      // Check if paused/canceled
      const { data: currentBc } = await db.from("broadcasts").select("status").eq("id", broadcastId).single();
      if (currentBc?.status === "paused" || currentBc?.status === "canceled") {
        console.log(`[broadcast-send] Campaign ${currentBc.status}, stopping`);
        break;
      }

      const contact = recipient.customers as any;
      if (!contact?.phone) {
        await db.from("broadcast_recipients").update({ status: "failed", failed_at: new Date().toISOString(), error_message: "Sem número" }).eq("id", recipient.id);
        totalFailed++;
        continue;
      }

      const phone = normalizePhone(contact.phone);
      if (phone.length < 12) {
        await db.from("broadcast_recipients").update({ status: "failed", failed_at: new Date().toISOString(), error_message: `Número inválido: ${phone}` }).eq("id", recipient.id);
        totalFailed++;
        continue;
      }

      // Interpolate variables per recipient
      const personalizedMsg = interpolateMessage(String(broadcast.message || ""), {
        name: contact.name || "",
        phone: contact.phone || "",
      });

      // ── Find or create conversation for this contact ──
      let conversationId: string | null = null;
      try {
        let { data: existingConv } = await db.from("conversations")
          .select("id")
          .eq("customer_id", contact.id)
          .eq("workspace_id", workspaceId)
          .neq("status", "closed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingConv) {
          conversationId = existingConv.id;
        } else {
          const { data: newConv } = await db.from("conversations").insert({
            customer_id: contact.id,
            workspace_id: workspaceId,
            status: "unassigned",
            last_message_at: new Date().toISOString(),
          }).select("id").single();
          conversationId = newConv?.id || null;
        }
      } catch (convErr: any) {
        console.error(`[broadcast-send] Conv error for ${phone}:`, convErr?.message);
      }

      // ── Send via WhatsApp API ──
      try {
        const res = await fetch(`${OPERATIONS_URL}/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({ number: phone, text: personalizedMsg }),
        });

        const raw = await res.text();
        console.log(`[broadcast-send] ${phone}: ${res.status} ${raw.substring(0, 300)}`);

        let data: any = {};
        try { data = JSON.parse(raw); } catch {}

        const hasId = !!(data?.messageId || data?.messageid || data?.key);
        const statusOk = !data?._status || data._status === 200;

        if (!res.ok || !statusOk || (data?.error && !hasId)) {
          throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
        }

        // ── Persist outbound message ──
        if (conversationId) {
          await db.from("messages").insert({
            conversation_id: conversationId,
            workspace_id: workspaceId,
            sender_type: "system",
            content: personalizedMsg,
            message_type: "text",
            status: "sent",
          });

          await db.from("conversations").update({
            last_message_at: new Date().toISOString(),
          }).eq("id", conversationId);
        }

        await db.from("broadcast_recipients").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", recipient.id);
        await db.from("broadcast_contacts").update({ status: "sent" }).eq("broadcast_id", broadcastId).eq("contact_id", recipient.contact_id);
        totalSent++;
      } catch (err: any) {
        console.error(`[broadcast-send] Failed ${phone}:`, err?.message);

        if (conversationId) {
          await db.from("messages").insert({
            conversation_id: conversationId,
            workspace_id: workspaceId,
            sender_type: "system",
            content: personalizedMsg,
            message_type: "text",
            status: "failed",
          });
        }

        await db.from("broadcast_recipients").update({ status: "failed", failed_at: new Date().toISOString(), error_message: (err?.message || "Erro").substring(0, 255) }).eq("id", recipient.id);
        totalFailed++;
      }

      // Update running totals
      await db.from("broadcasts").update({ total_sent: totalSent, total_failed: totalFailed }).eq("id", broadcastId);

      // Random delay between recipients (skip after last one)
      if (i < (recipients!.length - 1)) {
        const delayMs = randomDelay(delayMinSec, delayMaxSec);
        console.log(`[broadcast-send] Waiting ${Math.round(delayMs / 1000)}s before next...`);
        await sleep(delayMs);
      }
    }

    const finalStatus = totalSent > 0 ? "done" : totalFailed > 0 ? "failed" : "done";
    await db.from("broadcasts").update({
      status: finalStatus, total_sent: totalSent, total_failed: totalFailed,
      sent_at: new Date().toISOString(),
    }).eq("id", broadcastId);

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
