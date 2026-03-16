import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instanceName, instanceKey } = await req.json();
    const SERVER_URL = (Deno.env.get("WHATSAPI_SERVER_URL") || "").replace(/\/+$/, "");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");

    if (!SERVER_URL || !TOKEN) {
      throw new Error("WHATSAPI_SERVER_URL ou WHATSAPI_TOKEN não configurados");
    }

    // UAZAPI: Check current status first
    const statusUrl = `${SERVER_URL}/instance/status`;
    console.log("[whatsapp-connect] Checking status:", statusUrl);

    const statusRes = await fetch(statusUrl, { method: "GET", headers: { "token": TOKEN } });
    let statusData: any = {};
    if (statusRes.ok) {
      try { statusData = JSON.parse(await statusRes.text()); } catch {}
    }

    const inst = statusData.instance || {};
    const instKey = inst.id || inst.instance_key || instanceKey || instanceName || "default";
    const topStatus = statusData.status || inst.status;

    console.log("[whatsapp-connect] Current status:", topStatus, "key:", instKey);

    if (topStatus === "connected") {
      // Already connected
      return new Response(
        JSON.stringify({
          success: true,
          instanceKey: instKey,
          qrCode: null,
          status: "connected",
          phoneNumber: inst.owner || null,
          profileName: inst.profileName || inst.name || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Not connected — get QR code
    const qrUrl = `${SERVER_URL}/instance/qrcode`;
    console.log("[whatsapp-connect] Getting QR:", qrUrl);

    let qrCode = null;
    let status = "waiting_qr";

    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));

      const qrRes = await fetch(qrUrl, { method: "GET", headers: { "token": TOKEN } });
      if (qrRes.ok) {
        let qrData: any;
        try { qrData = JSON.parse(await qrRes.text()); } catch { continue; }

        const qrInst = qrData.instance || {};
        console.log("[whatsapp-connect] QR attempt", attempt, "keys:", Object.keys(qrData), "inst.status:", qrInst.status);

        if (qrInst.status === "connected" || qrData.status === "connected") {
          status = "connected";
          qrCode = null;
          break;
        }

        qrCode = qrInst.qrcode || qrData.qrcode || qrData.qr || qrData.base64 || null;
        if (qrCode) {
          status = "qr_ready";
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, instanceKey: instKey, qrCode, status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[whatsapp-connect] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
