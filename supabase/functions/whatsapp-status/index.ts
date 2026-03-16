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

    // UAZAPI: /instance/status with token header
    const statusUrl = `${SERVER_URL}/instance/status`;
    console.log("[whatsapp-status] Checking:", statusUrl);

    const statusRes = await fetch(statusUrl, { method: "GET", headers: { "token": TOKEN } });
    const statusText = await statusRes.text();
    console.log("[whatsapp-status] Response:", statusRes.status, statusText.substring(0, 500));

    let connected = false;
    let phoneNumber = null;
    let profileName = null;
    let qrCode = null;

    if (statusRes.ok) {
      let statusData: any;
      try { statusData = JSON.parse(statusText); } catch { statusData = {}; }

      // UAZAPI response: { instance: { status: "connected", ... }, status: "connected" }
      const inst = statusData.instance || statusData.data || {};
      const topStatus = String(statusData.status || inst.status || "").trim();

      console.log("[whatsapp-status] topStatus:", JSON.stringify(topStatus), "inst.status:", JSON.stringify(inst.status), "statusData.status:", JSON.stringify(statusData.status));

      connected = topStatus === "connected";
      phoneNumber = inst.owner || inst.phone || inst.phone_number || null;
      profileName = inst.profileName || inst.name || inst.pushname || null;

      console.log("[whatsapp-status] Parsed: connected=", connected, "phone=", phoneNumber, "name=", profileName);
    }

    // If not connected, try QR endpoint
    if (!connected) {
      const qrUrl = `${SERVER_URL}/instance/qrcode`;
      console.log("[whatsapp-status] Getting QR:", qrUrl);
      const qrRes = await fetch(qrUrl, { method: "GET", headers: { "token": TOKEN } });
      if (qrRes.ok) {
        const qrText = await qrRes.text();
        let qrData: any;
        try { qrData = JSON.parse(qrText); } catch { qrData = {}; }
        console.log("[whatsapp-status] QR keys:", Object.keys(qrData));

        const qrInst = qrData.instance || qrData.data || {};
        if (qrInst.status === "connected" || qrData.status === "connected") {
          connected = true;
        } else {
          qrCode = qrInst.qrcode || qrData.qrcode || qrData.qr || qrData.base64 || null;
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
