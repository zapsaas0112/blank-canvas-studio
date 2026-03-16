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

    let instance_key = instanceKey;

    // If no instance key, create a new instance via UAZAPI endpoint
    if (!instance_key) {
      const slug = instanceName?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "instance";
      const createUrl = `${SERVER_URL}/instance/init`;

      console.log("[whatsapp-connect] Creating instance at:", createUrl);

      const createRes = await fetch(createUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admintoken": TOKEN,
        },
        body: JSON.stringify({ instance_key: slug }),
      });

      const createText = await createRes.text();
      console.log("[whatsapp-connect] Create response:", createRes.status, createText.substring(0, 500));

      if (!createRes.ok) {
        throw new Error(`Erro ao criar instância (${createRes.status}): ${createText}`);
      }

      let createData;
      try { createData = JSON.parse(createText); } catch { throw new Error(`Resposta inválida: ${createText}`); }

      // UAZAPI returns the instance data - extract the key/token
      instance_key = createData.instance_key || createData.key || createData.data?.instance_key || createData.instance?.key || slug;
      const instanceToken = createData.token || createData.instance?.token || createData.data?.token || null;

      console.log("[whatsapp-connect] Created instance_key:", instance_key, "token:", instanceToken ? "present" : "absent");
    }

    // Get QR code via UAZAPI endpoint
    const qrUrl = `${SERVER_URL}/instance/qrcode`;
    console.log("[whatsapp-connect] Getting QR from:", qrUrl);

    const qrRes = await fetch(qrUrl, {
      method: "GET",
      headers: { "token": TOKEN },
    });

    const qrText = await qrRes.text();
    console.log("[whatsapp-connect] QR response:", qrRes.status, qrText.substring(0, 300));

    let qrCode = null;
    let status = "waiting_qr";

    if (qrRes.ok) {
      let qrData;
      try { qrData = JSON.parse(qrText); } catch { qrData = {}; }

      console.log("[whatsapp-connect] QR data keys:", Object.keys(qrData));

      qrCode = qrData.qrcode || qrData.qr || qrData.data?.qrcode || qrData.data?.qr || qrData.base64 || null;

      if (qrData.status === "connected" || qrData.data?.status === "connected" || qrData.connected === true) {
        status = "connected";
        qrCode = null;
      } else if (qrCode) {
        status = "qr_ready";
      }
    }

    // If no QR yet, retry
    if (!qrCode && status !== "connected") {
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        console.log("[whatsapp-connect] QR retry", i + 1);
        const retryRes = await fetch(qrUrl, { method: "GET", headers: { "token": TOKEN } });
        if (retryRes.ok) {
          const retryText = await retryRes.text();
          let retryData;
          try { retryData = JSON.parse(retryText); } catch { continue; }
          qrCode = retryData.qrcode || retryData.qr || retryData.data?.qrcode || retryData.data?.qr || retryData.base64 || null;
          if (retryData.status === "connected" || retryData.data?.status === "connected" || retryData.connected === true) {
            status = "connected"; qrCode = null; break;
          }
          if (qrCode) { status = "qr_ready"; break; }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, instanceKey: instance_key, qrCode, status }),
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
