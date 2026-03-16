import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instanceKey } = await req.json();
    const SERVER_URL = Deno.env.get("WHATSAPI_SERVER_URL");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");

    if (!SERVER_URL || !TOKEN) throw new Error("Credenciais não configuradas");
    if (!instanceKey) throw new Error("instanceKey é obrigatório");

    // WhatsAPI.my uses logout to disconnect
    const res = await fetch(`${SERVER_URL}/api/instances/${instanceKey}/logout`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "token": TOKEN },
    });

    const data = await res.json();

    return new Response(
      JSON.stringify({ success: true, message: "Instância desconectada", data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
