import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPERATIONS_URL = "https://ipazua.uazapi.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) throw new Error("token é obrigatório");

    const statusRes = await fetch(`${OPERATIONS_URL}/instance/status`, {
      method: "GET",
      headers: { token },
    });

    const raw = await statusRes.text();
    let data: any = {};
    try { data = JSON.parse(raw); } catch {}

    console.log("[whatsapp-status] raw:", raw.substring(0, 400));

    // Parse status robustly
    const inst = data?.instance || data || {};
    const statusObj = data?.status || {};

    const isConnected =
      statusObj?.connected === true ||
      inst?.status === "open" ||
      inst?.status === "connected" ||
      data?.status === "connected";

    const isConnecting = inst?.status === "connecting" || data?.status === "connecting";

    const phoneNumber = inst?.owner || inst?.phone || data?.phone || null;
    const profileName = inst?.profileName || inst?.name || data?.name || null;

    // QR code only when not connected
    let qrCode: string | null = null;
    if (!isConnected) {
      qrCode = inst?.qrcode || data?.qrcode || data?.qr || data?.base64 || null;
    }

    return new Response(
      JSON.stringify({
        connected: isConnected,
        status: isConnected ? "connected" : isConnecting ? "connecting" : "disconnected",
        qrCode,
        phoneNumber,
        profileName,
        rawStatus: raw.substring(0, 500),
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
