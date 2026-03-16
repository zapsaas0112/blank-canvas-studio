import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instanceKey, phone, message } = await req.json();
    const SERVER_URL = Deno.env.get("WHATSAPI_SERVER_URL");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");

    if (!SERVER_URL || !TOKEN) throw new Error("Credenciais não configuradas");
    if (!instanceKey || !phone || !message) throw new Error("instanceKey, phone e message são obrigatórios");

    const res = await fetch(`${SERVER_URL}/api/instances/${instanceKey}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": TOKEN },
      body: JSON.stringify({
        to: phone.replace(/\D/g, ""),
        message,
      }),
    });

    const data = await res.json();

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
