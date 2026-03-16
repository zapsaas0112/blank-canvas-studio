import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), raw: text };
  } catch {
    return { json: {}, raw: text };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const SERVER_URL = (Deno.env.get("WHATSAPI_SERVER_URL") || "").replace(/\/+$/, "");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");
    const ADMIN_TOKEN = Deno.env.get("WHATSAPI_ADMIN_TOKEN");

    if (!SERVER_URL || !TOKEN) {
      return new Response(
        JSON.stringify({ success: false, error: "WHATSAPI_SERVER_URL ou WHATSAPI_TOKEN não configurados" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1) Try current token status first (connect-via-token flow)
    let statusData: any = {};
    try {
      const statusRes = await fetch(`${SERVER_URL}/instance/status`, {
        method: "GET",
        headers: { token: TOKEN },
      });
      const parsed = await safeJson(statusRes);
      statusData = parsed.json;
    } catch (e: any) {
      console.error("[connect] status request failed:", e?.message || e);
    }

    const inst = statusData?.instance || {};
    const existingInstanceKey = inst.id || body.instanceKey || body.instanceName || "default";
    const isConnected = inst.status === "connected" || statusData?.status?.connected === true;

    console.log("[connect] key:", existingInstanceKey, "connected:", isConnected);

    if (isConnected) {
      return new Response(
        JSON.stringify({
          success: true,
          instanceKey: existingInstanceKey,
          qrCode: null,
          status: "connected",
          phoneNumber: inst.owner || null,
          profileName: inst.profileName || inst.name || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) If user asked to create and admin token exists, try instance creation
    //    (without admin token, we keep connect-via-token behavior and do not fail with non-2xx)
    if (body.instanceName && ADMIN_TOKEN) {
      try {
        const createRes = await fetch(`${SERVER_URL}/instance/init`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            admintoken: ADMIN_TOKEN,
          },
          body: JSON.stringify({ instanceName: body.instanceName }),
        });

        const createParsed = await safeJson(createRes);
        console.log("[connect] create status:", createRes.status, createParsed.raw.substring(0, 200));

        if (!createRes.ok) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Não foi possível criar nova instância (${createRes.status}).`,
              details: createParsed.raw,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (e: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Falha ao criar nova instância no servidor",
            details: e?.message || String(e),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 3) Try to obtain QR for token-based flow
    let qrCode: string | null = null;
    let status = "disconnected";

    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));

      const qrRes = await fetch(`${SERVER_URL}/instance/qrcode`, {
        method: "GET",
        headers: { token: TOKEN },
      });

      const parsed = await safeJson(qrRes);
      const qd: any = parsed.json;
      const qi = qd?.instance || {};

      if (qi.status === "connected" || qd?.status?.connected === true) {
        status = "connected";
        qrCode = null;
        break;
      }

      const candidateQr = qi.qrcode || qd.qrcode || qd.qr || qd.base64 || null;
      if (candidateQr && String(candidateQr).length > 10) {
        status = "qr_ready";
        qrCode = candidateQr;
        break;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        instanceKey: existingInstanceKey,
        qrCode,
        status,
        requiresAdminToken: Boolean(body.instanceName) && !ADMIN_TOKEN,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[connect] Error:", error?.message || error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Erro desconhecido" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
