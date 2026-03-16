import { supabase } from '@/integrations/supabase/client';
import { normalizeWhatsAppNumber, isValidWhatsAppNumber } from '@/lib/whatsapp-utils';

/**
 * Get the active WhatsApp instance token from Supabase (primary) or localStorage (fallback)
 */
export async function getActiveToken(): Promise<{ token: string; instanceId: string } | null> {
  // Primary: from Supabase instances table
  try {
    const { data } = await supabase
      .from('instances')
      .select('id, token, instance_id_external')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.token) {
      return { token: data.token, instanceId: data.instance_id_external || data.id };
    }
  } catch {}

  // Fallback: localStorage
  try {
    const saved = localStorage.getItem('whatsapp_connection');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.token) return { token: parsed.token, instanceId: parsed.instanceId };
    }
  } catch {}

  return null;
}

/**
 * Send a WhatsApp text message with full validation
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  options?: { checkNumber?: boolean }
): Promise<{ success: boolean; messageId?: string; error?: string; debug?: any }> {
  const conn = await getActiveToken();
  if (!conn) throw new Error("WhatsApp não conectado. Conecte primeiro na página de Conexões.");

  const normalized = normalizeWhatsAppNumber(phone);
  if (!isValidWhatsAppNumber(normalized)) {
    throw new Error(`Número inválido: ${phone} → ${normalized}. Use formato 5511999999999.`);
  }

  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: {
      token: conn.token,
      phone: normalized,
      message,
      checkNumber: options?.checkNumber,
    },
  });

  if (error) throw error;

  if (data?.success === false) {
    throw new Error(data.error || 'Falha ao enviar mensagem');
  }

  return data;
}

/**
 * Check instance status
 */
export async function getInstanceStatus(token: string): Promise<{
  connected: boolean;
  status: string;
  qrCode: string | null;
  phoneNumber: string | null;
  profileName: string | null;
  webhook: any;
  rawStatus: string;
}> {
  const { data, error } = await supabase.functions.invoke('whatsapp-status', {
    body: { token },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Save instance data to Supabase
 */
export async function persistInstance(
  workspaceId: string,
  updates: {
    token: string;
    instanceId: string;
    status: string;
    phoneNumber?: string | null;
    profileName?: string | null;
    qrCode?: string | null;
    webhookUrl?: string | null;
  }
): Promise<string> {
  // Check if instance already exists with this token
  const { data: existing } = await supabase
    .from('instances')
    .select('id')
    .eq('token', updates.token)
    .maybeSingle();

  const instanceData = {
    workspace_id: workspaceId,
    token: updates.token,
    instance_id_external: updates.instanceId,
    status: updates.status === 'connected' ? 'connected' : 'disconnected',
    is_active: updates.status === 'connected',
    phone_number: updates.phoneNumber || null,
    name: updates.profileName || 'WhatsApp',
    qr_code: updates.qrCode || null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('instances').update(instanceData).eq('id', existing.id);
    return existing.id;
  } else {
    const { data, error } = await supabase
      .from('instances')
      .insert(instanceData)
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
}
