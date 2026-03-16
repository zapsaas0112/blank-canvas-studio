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

    // Try info endpoint first
    const infoUrl = `${SERVER_URL}/api/instances/${encodeURIComponent(instanceKey)}/info`;
    console.log("[whatsapp-status] Checking info:", infoUrl);

    const infoRes = await fetch(infoUrl, { method: "GET", headers: { "token": TOKEN } });
    const infoText = await infoRes.text();
    console.log("[whatsapp-status] Info response:", infoRes.status, infoText.substring(0, 500));

    let connected = false;
    let phoneNumber = null;
    let profileName = null;
    let qrCode = null;

    if (infoRes.ok) {
      let infoData;
      try { infoData = JSON.parse(infoText); } catch { infoData = {}; }

      const instanceInfo = infoData.instance_data || infoData.data || infoData;
      connected = instanceInfo.connected === true ||
                  instanceInfo.status === "connected" ||
                  infoData.status === "connected" ||
                  instanceInfo.phone_connected === true;
      phoneNumber = instanceInfo.phone || instanceInfo.phone_number || instanceInfo.user?.id?.split(":")?.[0] || null;
      profileName = instanceInfo.name || instanceInfo.user?.name || instanceInfo.pushname || null;
    }

    // If not connected, try QR endpoint
    if (!connected) {
      const qrUrl = `${SERVER_URL}/api/instances/${encodeURIComponent(instanceKey)}/qrcode`;
      console.log("[whatsapp-status] Getting QR:", qrUrl);
      const qrRes = await fetch(qrUrl, { method: "GET", headers: { "token": TOKEN } });
      if (qrRes.ok) {
        const qrText = await qrRes.text();
        let qrData;
        try { qrData = JSON.parse(qrText); } catch { qrData = {}; }

        console.log("[whatsapp-status] QR data keys:", Object.keys(qrData));

        if (qrData.status === "connected" || qrData.data?.status === "connected") {
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
