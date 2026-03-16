import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SendCandidate = {
  name: string;
  method: "POST" | "GET";
  path: string;
  body?: Record<string, unknown>;
};

async function trySendMessage(serverUrl: string, token: string, phone: string, message: string) {
  const cleanPhone = phone.replace(/\D/g, "");

  const candidates: SendCandidate[] = [
    { name: "POST /message/send-text {phone,message}", method: "POST", path: "/message/send-text", body: { phone: cleanPhone, message } },
    { name: "POST /message/send-text {number,text}", method: "POST", path: "/message/send-text", body: { number: cleanPhone, text: message } },
    { name: "POST /message/sendText {phone,message}", method: "POST", path: "/message/sendText", body: { phone: cleanPhone, message } },
    { name: "POST /message/sendText {number,text}", method: "POST", path: "/message/sendText", body: { number: cleanPhone, text: message } },
    { name: "POST /message/send {phone,message}", method: "POST", path: "/message/send", body: { phone: cleanPhone, message } },
    {
      name: "GET /message/send-text?phone&message",
      method: "GET",
      path: `/message/send-text?phone=${encodeURIComponent(cleanPhone)}&message=${encodeURIComponent(message)}`,
    },
  ];

  const errors: string[] = [];

  for (const attempt of candidates) {
    try {
      const response = await fetch(`${serverUrl}${attempt.path}`, {
        method: attempt.method,
        headers: {
          "Content-Type": "application/json",
          token,
          Authorization: `Bearer ${token}`,
        },
        body: attempt.method === "POST" ? JSON.stringify(attempt.body ?? {}) : undefined,
      });

      const raw = await response.text();
      console.log(`[whatsapp-send] ${attempt.name} => ${response.status} ${raw.substring(0, 200)}`);

      if (response.ok) {
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(raw); } catch {}
        return { endpoint: attempt.name, data };
      }

      errors.push(`${attempt.name} -> ${response.status}: ${raw.substring(0, 120)}`);
    } catch (error: any) {
      errors.push(`${attempt.name} -> network: ${error?.message || String(error)}`);
    }
  }

  throw new Error(`Falha ao enviar mensagem. Tentativas: ${errors.join(" | ")}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phone, message } = await req.json();
    const SERVER_URL = (Deno.env.get("WHATSAPI_SERVER_URL") || "").replace(/\/+$/, "");
    const TOKEN = Deno.env.get("WHATSAPI_TOKEN");

    if (!SERVER_URL || !TOKEN) throw new Error("Credenciais não configuradas");
    if (!phone || !message) throw new Error("phone e message são obrigatórios");

    const result = await trySendMessage(SERVER_URL, TOKEN, phone, message);

    return new Response(
      JSON.stringify({ success: true, endpoint: result.endpoint, data: result.data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[whatsapp-send] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
