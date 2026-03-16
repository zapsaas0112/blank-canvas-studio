import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instanceName, instanceKey } = await req.json();
    const SERVER_URL = Deno.env.get("WHATSAPI_SERVER_URL");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");

    if (!SERVER_URL || !TOKEN) {
      throw new Error("WHATSAPI_SERVER_URL ou WHATSAPI_TOKEN não configurados");
    }

    let instance_key = instanceKey;

    // If no instance key, create a new instance
    if (!instance_key) {
      const createRes = await fetch(`${SERVER_URL}/api/instances/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "token": TOKEN },
        body: JSON.stringify({
          instance_key: instanceName?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || undefined,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error?.message || createData.message || "Erro ao criar instância");

      instance_key = createData.instance_key || createData.key || createData.data?.instance_key;
      if (!instance_key) throw new Error("Chave da instância não retornada");
    }

    // Get QR code
    const qrRes = await fetch(`${SERVER_URL}/api/instances/${instance_key}/qrcode`, {
      method: "GET",
      headers: { "token": TOKEN },
    });

    let qrCode = null;
    let status = "waiting_qr";

    if (qrRes.ok) {
      const qrData = await qrRes.json();
      qrCode = qrData.qrcode || qrData.qr || qrData.data?.qrcode || qrData.data?.qr || null;

      // If qrcode is a full data URI, extract the base64 part
      if (qrCode && qrCode.startsWith("data:image")) {
        // Keep as-is for display
      }

      // Check if already connected
      if (qrData.status === "connected" || qrData.data?.status === "connected") {
        status = "connected";
        qrCode = null;
      } else if (qrCode) {
        status = "qr_ready";
      }
    }

    // If no QR yet, try polling a few times
    if (!qrCode && status !== "connected") {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const retryRes = await fetch(`${SERVER_URL}/api/instances/${instance_key}/qrcode`, {
          method: "GET",
          headers: { "token": TOKEN },
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          qrCode = retryData.qrcode || retryData.qr || retryData.data?.qrcode || retryData.data?.qr || null;
          if (retryData.status === "connected" || retryData.data?.status === "connected") {
            status = "connected";
            qrCode = null;
            break;
          }
          if (qrCode) {
            status = "qr_ready";
            break;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, instanceKey: instance_key, qrCode, status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
