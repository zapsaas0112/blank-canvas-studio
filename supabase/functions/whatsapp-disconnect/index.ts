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

    const res = await fetch(`${OPERATIONS_URL}/instance/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({}),
    });

    const raw = await res.text();
    console.log("[whatsapp-disconnect]", res.status, raw.substring(0, 300));

    let data: any = {};
    try { data = JSON.parse(raw); } catch {}

    return new Response(
      JSON.stringify({ success: true, message: "Instância desconectada", data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
