import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = "whatsapp_connection";

function getSavedToken(): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.token || null;
    }
  } catch {}
  return null;
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  const token = getSavedToken();
  if (!token) throw new Error("WhatsApp não conectado. Conecte primeiro na página de Conexões.");

  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { token, phone: phone.replace(/\D/g, ''), message },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function getInstanceStatus(): Promise<{
  connected: boolean;
  status: string;
  qrCode: string | null;
  phoneNumber: string | null;
  profileName: string | null;
}> {
  const token = getSavedToken();
  if (!token) return { connected: false, status: 'disconnected', qrCode: null, phoneNumber: null, profileName: null };

  const { data, error } = await supabase.functions.invoke('whatsapp-status', {
    body: { token },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
