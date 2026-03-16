import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_KEY = "a2df6c76-6338-4089-819e-ff05d4aabc00";
const MANAGEMENT_URL = "https://xukeukdwhelyttifzveb.supabase.co/functions/v1";
const OPERATIONS_URL = "https://ipazua.uazapi.com";

async function safeJson(res: Response) {
  const text = await res.text();
  try { return { json: JSON.parse(text), raw: text, ok: res.ok, status: res.status }; }
  catch { return { json: {}, raw: text, ok: res.ok, status: res.status }; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const debug: any[] = [];
  function log(step: string, data: any) {
    console.log(`[whatsapp-connect] ${step}:`, JSON.stringify(data).substring(0, 500));
    debug.push({ step, ...data });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { userName, webhookUrl, token: existingToken, instanceId: existingInstanceId } = body;

    let token = existingToken;
    let instanceId = existingInstanceId;

    // ──────────── STEP 1: Create instance if no token ────────────
    if (!token) {
      log("create-instance", { url: `${MANAGEMENT_URL}/create-instance-external`, userName });
      
      const createRes = await fetch(`${MANAGEMENT_URL}/create-instance-external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: API_KEY,
          name: userName || "Minha Instância",
          webhookUrl: webhookUrl || undefined,
          webhookName: webhookUrl ? "webhook-principal" : undefined,
          events: ["messages", "connection", "messages_update"],
        }),
      });

      const createData = await safeJson(createRes);
      log("create-response", { status: createData.status, raw: createData.raw.substring(0, 300) });

      if (!createData.ok) {
        throw new Error(createData.json?.error || `Erro ao criar instância (${createData.status})`);
      }

      token = createData.json.token;
      instanceId = createData.json.instanceId;

      if (!token) {
        throw new Error("Token não retornado pela API de criação");
      }
    }

    // ──────────── STEP 2: Connect to generate QR ────────────
    log("connect", { url: `${OPERATIONS_URL}/instance/connect` });

    const connectRes = await fetch(`${OPERATIONS_URL}/instance/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({}),
    });

    const connectData = await safeJson(connectRes);
    log("connect-response", { status: connectData.status, raw: connectData.raw.substring(0, 300) });

    // Check if already connected
    const inst = connectData.json?.instance || connectData.json || {};
    const statusObj = connectData.json?.status || {};
    
    if (statusObj?.connected === true || inst?.status === "open" || inst?.status === "connected") {
      return new Response(
        JSON.stringify({
          success: true, instanceId, token, qrCode: null, status: "connected",
          phoneNumber: inst?.owner || inst?.phone || null,
          profileName: inst?.profileName || inst?.name || null,
          debug,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──────────── STEP 3: Poll for QR code ────────────
    let qrCode = inst?.qrcode || connectData.json?.qrcode || null;

    if (!qrCode) {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 3000));

        const statusRes = await fetch(`${OPERATIONS_URL}/instance/status`, {
          method: "GET",
          headers: { token },
        });

        const statusData = await safeJson(statusRes);
        const si = statusData.json?.instance || statusData.json || {};
        const so = statusData.json?.status || {};

        log(`poll-${i}`, { status: statusData.status, raw: statusData.raw.substring(0, 300) });

        // Connected during polling
        if (so?.connected === true || si?.status === "open" || si?.status === "connected") {
          return new Response(
            JSON.stringify({
              success: true, instanceId, token, qrCode: null, status: "connected",
              phoneNumber: si?.owner || si?.phone || null,
              profileName: si?.profileName || si?.name || null,
              debug,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        qrCode = si?.qrcode || statusData.json?.qrcode || statusData.json?.qr || statusData.json?.base64 || null;
        if (qrCode && String(qrCode).length > 20) break;
        qrCode = null;
      }
    }

    // ──────────── STEP 4: Configure webhook if provided ────────────
    if (webhookUrl && token) {
      try {
        const whRes = await fetch(`${OPERATIONS_URL}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({
            url: webhookUrl,
            enabled: true,
            events: ["messages", "connection", "messages_update"],
            excludeMessages: ["wasSentByApi"],
          }),
        });
        const whData = await safeJson(whRes);
        log("webhook-config", { status: whData.status, raw: whData.raw.substring(0, 200) });
      } catch (e: any) {
        log("webhook-error", { error: e?.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        instanceId,
        token,
        qrCode,
        status: qrCode ? "connecting" : "waiting_qr",
        debug,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[whatsapp-connect] Error:", error?.message);
    return new Response(
      JSON.stringify({ error: error.message, debug }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
