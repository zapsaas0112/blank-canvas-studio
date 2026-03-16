import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instanceKey } = await req.json();
    const SERVER_URL = (Deno.env.get("WHATSAPI_SERVER_URL") || "").replace(/\/+$/, "");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");

    if (!SERVER_URL || !TOKEN) throw new Error("Credenciais não configuradas");
    if (!instanceKey) throw new Error("instanceKey é obrigatório");

    // Try UAZAPI status endpoint
    const statusUrl = `${SERVER_URL}/instance/status`;
    console.log("[whatsapp-status] Checking:", statusUrl);

    const statusRes = await fetch(statusUrl, { method: "GET", headers: { "token": TOKEN } });
    const statusText = await statusRes.text();
    console.log("[whatsapp-status] Status response:", statusRes.status, statusText.substring(0, 500));

    let connected = false;
    let phoneNumber = null;
    let profileName = null;
    let qrCode = null;

    if (statusRes.ok) {
      let statusData;
      try { statusData = JSON.parse(statusText); } catch { statusData = {}; }

      console.log("[whatsapp-status] Data keys:", Object.keys(statusData));

      const instance = statusData.instance_data || statusData.data || statusData;
      connected = instance.connected === true ||
                  instance.status === "connected" ||
                  statusData.status === "connected" ||
                  instance.phone_connected === true;
      phoneNumber = instance.phone || instance.phone_number || instance.user?.id?.split(":")?.[0] || null;
      profileName = instance.name || instance.user?.name || instance.pushname || null;
    }

    // If not connected, try QR
    if (!connected) {
      const qrUrl = `${SERVER_URL}/instance/qrcode`;
      console.log("[whatsapp-status] Getting QR:", qrUrl);
      const qrRes = await fetch(qrUrl, { method: "GET", headers: { "token": TOKEN } });
      if (qrRes.ok) {
        const qrText = await qrRes.text();
        let qrData;
        try { qrData = JSON.parse(qrText); } catch { qrData = {}; }
        console.log("[whatsapp-status] QR keys:", Object.keys(qrData));
        if (qrData.status === "connected" || qrData.connected === true) {
          connected = true;
        } else {
          qrCode = qrData.qrcode || qrData.qr || qrData.data?.qrcode || qrData.data?.qr || qrData.base64 || null;
        }
      }
    }

    return new Response(
      JSON.stringify({
        connected,
        status: connected ? "connected" : qrCode ? "connecting" : "disconnected",
        qrCode: connected ? null : qrCode,
        phoneNumber,
        profileName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[whatsapp-status] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
