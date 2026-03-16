import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_KEY = "a2df6c76-6338-4089-819e-ff05d4aabc00";
const MANAGEMENT_URL = "https://xukeukdwhelyttifzveb.supabase.co/functions/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { instanceId } = await req.json();
    if (!instanceId) throw new Error("instanceId é obrigatório");

    console.log("[whatsapp-delete] Deleting instance:", instanceId);

    const res = await fetch(`${MANAGEMENT_URL}/delete-instance-external`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: API_KEY, instanceId }),
    });

    const raw = await res.text();
    console.log("[whatsapp-delete]", res.status, raw.substring(0, 300));

    let data: any = {};
    try { data = JSON.parse(raw); } catch {}

    if (!res.ok) throw new Error(data?.error || `Erro ao deletar (${res.status})`);

    return new Response(
      JSON.stringify({ success: true, message: "Instância deletada permanentemente" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
