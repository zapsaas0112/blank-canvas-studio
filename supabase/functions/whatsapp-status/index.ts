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

    if (!SERVER_URL || !TOKEN) throw new Error("Credenciais não configuradas");

    const statusUrl = `${SERVER_URL}/instance/status`;
    const statusRes = await fetch(statusUrl, { method: "GET", headers: { "token": TOKEN } });
    const raw = await statusRes.text();

    // Parse safely
    let d: any = {};
    try { d = JSON.parse(raw); } catch (e) {
      console.error("[status] JSON parse error:", e.message, "raw:", raw.substring(0, 200));
      throw new Error("Resposta inválida do servidor");
    }

    // Log what we got
    const keys = Object.keys(d);
    const instStatus = d?.instance?.status;
    const topStatus = d?.status;
    console.log("[status] keys:", keys, "instance.status:", instStatus, "top.status:", topStatus);

    const isConnected = instStatus === "connected" || topStatus === "connected";
    const phone = d?.instance?.owner || null;
    const name = d?.instance?.profileName || d?.instance?.name || null;

    let qrCode = null;
    if (!isConnected) {
      const qrUrl = `${SERVER_URL}/instance/qrcode`;
      const qrRes = await fetch(qrUrl, { method: "GET", headers: { "token": TOKEN } });
      if (qrRes.ok) {
        try {
          const qd = await qrRes.json();
          console.log("[status] QR keys:", Object.keys(qd));
          if (qd?.instance?.status !== "connected") {
            qrCode = qd?.instance?.qrcode || qd?.qrcode || qd?.qr || qd?.base64 || null;
          }
        } catch {}
      }
    }

    return new Response(JSON.stringify({
      connected: isConnected,
      status: isConnected ? "connected" : qrCode ? "connecting" : "disconnected",
      qrCode: isConnected ? null : qrCode,
      phoneNumber: phone,
      profileName: name,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[status] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
