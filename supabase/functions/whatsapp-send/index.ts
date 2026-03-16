import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type HttpMethod = "POST" | "PUT" | "GET";

type SendAttempt = {
  name: string;
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
};

let preferredAttemptName: string | null = null;

function buildAttempts(phone: string, message: string): SendAttempt[] {
  const basePaths = [
    "/message/send-text",
    "/message/sendText",
    "/message/send",
    "/messages/send-text",
    "/messages/sendText",
    "/send/text",
    "/sendText",
  ];

  const methods: HttpMethod[] = ["POST", "PUT"];
  const attempts: SendAttempt[] = [];

  for (const path of basePaths) {
    for (const method of methods) {
      attempts.push({ name: `${method} ${path} {phone,message}`, method, path, body: { phone, message } });
      attempts.push({ name: `${method} ${path} {number,text}`, method, path, body: { number: phone, text: message } });
      attempts.push({ name: `${method} ${path}/${phone} {message}`, method, path: `${path}/${phone}`, body: { message } });
      attempts.push({ name: `${method} ${path}/${phone} {text}`, method, path: `${path}/${phone}`, body: { text: message } });
    }
  }

  attempts.push({
    name: "GET /message/send-text?phone&message",
    method: "GET",
    path: `/message/send-text?phone=${encodeURIComponent(phone)}&message=${encodeURIComponent(message)}`,
  });

  attempts.push({
    name: "GET /send/text?phone&message",
    method: "GET",
    path: `/send/text?phone=${encodeURIComponent(phone)}&message=${encodeURIComponent(message)}`,
  });

  return attempts;
}

async function performAttempt(serverUrl: string, token: string, attempt: SendAttempt) {
  const response = await fetch(`${serverUrl}${attempt.path}`, {
    method: attempt.method,
    headers: {
      "Content-Type": "application/json",
      token,
      Authorization: `Bearer ${token}`,
    },
    body: attempt.method === "GET" ? undefined : JSON.stringify(attempt.body ?? {}),
  });

  const raw = await response.text();
  return { ok: response.ok, status: response.status, raw };
}

async function trySendMessage(serverUrl: string, token: string, phone: string, message: string) {
  const cleanPhone = phone.replace(/\D/g, "");
  const allAttempts = buildAttempts(cleanPhone, message);

  const sortedAttempts = preferredAttemptName
    ? [...allAttempts].sort((a, b) => (a.name === preferredAttemptName ? -1 : b.name === preferredAttemptName ? 1 : 0))
    : allAttempts;

  const errors: string[] = [];

  for (const attempt of sortedAttempts) {
    try {
      const result = await performAttempt(serverUrl, token, attempt);
      console.log(`[whatsapp-send] ${attempt.name} => ${result.status} ${result.raw.substring(0, 180)}`);

      if (result.ok) {
        preferredAttemptName = attempt.name;
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(result.raw);
        } catch {
          data = { raw: result.raw };
        }

        return { endpoint: attempt.name, data };
      }

      errors.push(`${attempt.name} -> ${result.status}: ${result.raw.substring(0, 120)}`);
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
