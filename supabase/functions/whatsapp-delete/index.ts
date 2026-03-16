import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instanceId } = await req.json();
    const API_KEY = "a2df6c76-6338-4089-819e-ff05d4aabc00";
    // URL do servidor WhatsApi, NÃO do Supabase local
    const SUPABASE_FUNCTIONS_URL = "https://xukeukdwhelyttifzveb.supabase.co/functions/v1";

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/delete-instance-external`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: API_KEY,
        instanceId,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao deletar instância");

    return new Response(
      JSON.stringify({ success: true, message: "Instância deletada permanentemente" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
