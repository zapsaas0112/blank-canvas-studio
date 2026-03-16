import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, phone, message } = await req.json();
    const UAZAPI_URL = "https://ipazua.uazapi.com";

    if (!token || !phone || !message) {
      throw new Error("token, phone e message são obrigatórios");
    }

    const res = await fetch(`${UAZAPI_URL}/message/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({
        phone: phone.replace(/\D/g, ""),
        message,
      }),
    });

    const data = await res.json();

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
