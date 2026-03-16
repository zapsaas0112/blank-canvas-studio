import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPERATIONS_URL = "https://ipazua.uazapi.com";

async function safeJson(res: Response) {
  const text = await res.text();
  try { return { json: JSON.parse(text), raw: text, ok: res.ok, status: res.status }; }
  catch { return { json: {}, raw: text, ok: res.ok, status: res.status }; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) throw new Error("token é obrigatório");

    // ── Get status ──
    const statusRes = await fetch(`${OPERATIONS_URL}/instance/status`, {
      method: "GET",
      headers: { token },
    });
    const statusData = await safeJson(statusRes);

    console.log("[whatsapp-status] raw:", statusData.raw.substring(0, 400));

    const inst = statusData.json?.instance || statusData.json || {};
    const statusObj = statusData.json?.status || {};

    const isConnected =
      statusObj?.connected === true ||
      inst?.status === "open" ||
      inst?.status === "connected" ||
      statusData.json?.status === "connected";

    const isConnecting = inst?.status === "connecting";

    const phoneNumber = inst?.owner || inst?.phone || statusData.json?.phone || null;
    const profileName = inst?.profileName || inst?.name || statusData.json?.name || null;

    // ── Get QR if not connected ──
    let qrCode: string | null = null;
    if (!isConnected) {
      try {
        const qrRes = await fetch(`${OPERATIONS_URL}/instance/qrcode`, {
          method: "GET",
          headers: { token },
        });
        if (qrRes.ok) {
          const qrData = await safeJson(qrRes);
          const qi = qrData.json?.instance || qrData.json || {};
          // Don't return QR if connected
          if (qi?.status !== "open" && qi?.status !== "connected") {
            qrCode = qi?.qrcode || qrData.json?.qrcode || qrData.json?.qr || qrData.json?.base64 || null;
          }
        }
      } catch {}
    }

    // ── Get webhook info ──
    let webhookInfo: any = null;
    try {
      const whRes = await fetch(`${OPERATIONS_URL}/webhook`, {
        method: "GET",
        headers: { token },
      });
      if (whRes.ok) {
        const whData = await safeJson(whRes);
        webhookInfo = whData.json;
      }
    } catch {}

    return new Response(
      JSON.stringify({
        connected: isConnected,
        status: isConnected ? "connected" : isConnecting ? "connecting" : "disconnected",
        qrCode,
        phoneNumber,
        profileName,
        webhook: webhookInfo,
        rawStatus: statusData.raw.substring(0, 500),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[whatsapp-status] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
