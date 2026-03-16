import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instanceKey, phone, message } = await req.json();
    const SERVER_URL = (Deno.env.get("WHATSAPI_SERVER_URL") || "").replace(/\/+$/, "");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");

    if (!SERVER_URL || !TOKEN) throw new Error("Credenciais não configuradas");
    if (!phone || !message) throw new Error("phone e message são obrigatórios");

    const url = `${SERVER_URL}/message/send-text`;
    console.log("[whatsapp-send] Sending to:", phone);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": TOKEN },
      body: JSON.stringify({
        phone: phone.replace(/\D/g, ""),
        message,
      }),
    });

    const text = await res.text();
    console.log("[whatsapp-send] Response:", res.status, text.substring(0, 300));

    if (!res.ok) throw new Error(`Erro (${res.status}): ${text}`);

    let data;
    try { data = JSON.parse(text); } catch { data = {}; }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[whatsapp-send] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
