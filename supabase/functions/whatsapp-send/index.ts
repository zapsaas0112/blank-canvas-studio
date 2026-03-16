import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPERATIONS_URL = "https://ipazua.uazapi.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, phone, message, checkNumber } = await req.json();

    if (!token) throw new Error("token é obrigatório");
    if (!phone) throw new Error("phone é obrigatório");
    if (!message) throw new Error("message é obrigatório");

    // Normalize number: remove non-digits
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) throw new Error("Número inválido: muito curto");

    // ── Optional: check if number exists on WhatsApp ──
    if (checkNumber) {
      try {
        const checkRes = await fetch(`${OPERATIONS_URL}/contact/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token },
          body: JSON.stringify({ phone: cleanPhone }),
        });
        const checkData = await checkRes.json().catch(() => ({}));
        console.log("[whatsapp-send] contact/check:", JSON.stringify(checkData).substring(0, 300));

        // If the API says the number doesn't exist
        if (checkData?.exists === false || checkData?.numberExists === false) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Número ${cleanPhone} não encontrado no WhatsApp`,
              numberExists: false,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (e: any) {
        console.log("[whatsapp-send] contact/check failed (non-blocking):", e?.message);
      }
    }

    // ── Send message using /send/text with {number, text} ──
    const sendUrl = `${OPERATIONS_URL}/send/text`;
    const sendBody = { number: cleanPhone, text: message };

    console.log("[whatsapp-send] POST", sendUrl, JSON.stringify(sendBody));

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(sendBody),
    });

    const sendRaw = await sendRes.text();
    console.log("[whatsapp-send] response:", sendRes.status, sendRaw.substring(0, 500));

    let sendData: any = {};
    try { sendData = JSON.parse(sendRaw); } catch { sendData = { raw: sendRaw }; }

    // ── Validate real success ──
    const hasMessageId = !!(sendData?.messageId || sendData?.messageid || sendData?.key);
    const hasSuccess = sendData?.success === true;
    const statusOk = !sendData?._status || sendData._status === 200;
    const isSuccess = sendRes.ok && statusOk && (hasMessageId || hasSuccess || (!sendData?.error));

    if (!isSuccess) {
      const errorMsg = sendData?.error || sendData?.message || `Envio falhou (HTTP ${sendRes.status})`;
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMsg,
          httpStatus: sendRes.status,
          apiStatus: sendData?._status,
          debug: { endpoint: sendUrl, payload: sendBody, response: sendRaw.substring(0, 500) },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: sendData?.messageId || sendData?.messageid || sendData?.key?.id || null,
        data: sendData,
        debug: { endpoint: sendUrl, payload: sendBody },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[whatsapp-send] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
