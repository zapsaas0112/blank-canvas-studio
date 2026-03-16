import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const SERVER_URL = (Deno.env.get("WHATSAPI_SERVER_URL") || "").replace(/\/+$/, "");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");

    if (!SERVER_URL || !TOKEN) throw new Error("WHATSAPI_SERVER_URL ou WHATSAPI_TOKEN não configurados");

    // UAZAPI: Check current status
    const statusRes = await fetch(`${SERVER_URL}/instance/status`, { method: "GET", headers: { "token": TOKEN } });
    let d: any = {};
    if (statusRes.ok) {
      try { d = await statusRes.json(); } catch {}
    }

    const inst = d?.instance || {};
    const instKey = inst.id || body.instanceKey || body.instanceName || "default";
    const isConnected = inst.status === "connected" || d?.status?.connected === true;

    console.log("[connect] instKey:", instKey, "connected:", isConnected);

    if (isConnected) {
      return new Response(JSON.stringify({
        success: true,
        instanceKey: instKey,
        qrCode: null,
        status: "connected",
        phoneNumber: inst.owner || null,
        profileName: inst.profileName || inst.name || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Not connected — get QR code
    let qrCode = null;
    let status = "waiting_qr";

    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));

      const qrRes = await fetch(`${SERVER_URL}/instance/qrcode`, { method: "GET", headers: { "token": TOKEN } });
      if (qrRes.ok) {
        let qd: any;
        try { qd = await qrRes.json(); } catch { continue; }

        const qi = qd?.instance || {};
        console.log("[connect] QR attempt", attempt, "inst.status:", qi.status, "has qrcode:", !!qi.qrcode);

        if (qi.status === "connected" || qd?.status?.connected === true) {
          status = "connected";
          qrCode = null;
          break;
        }

        qrCode = qi.qrcode || qd.qrcode || qd.qr || qd.base64 || null;
        if (qrCode && qrCode.length > 10) {
          status = "qr_ready";
          break;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      instanceKey: instKey,
      qrCode,
      status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[connect] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
