import { supabase } from '@/integrations/supabase/client';
import { normalizeWhatsAppNumber, isValidWhatsAppNumber } from '@/lib/whatsapp-utils';

/**
 * Get the active WhatsApp instance token from Supabase (primary) or localStorage (fallback)
 */
export async function getActiveToken(): Promise<{ token: string; instanceId: string } | null> {
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
 * Send a WhatsApp text message with full validation.
 * This ONLY sends via API. Persistence is handled by the caller or by sendAndPersistMessage.
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
 * Unified outbound message: sends via WhatsApp AND persists to messages + conversations.
 * Use this for test sends, manual sends outside a conversation, etc.
 */
export async function sendAndPersistMessage(params: {
  workspaceId: string;
  phone: string;
  message: string;
  senderType: 'agent' | 'bot' | 'system';
  senderId?: string;
  contactName?: string;
}): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  const { workspaceId, phone, message, senderType, senderId, contactName } = params;
  const normalized = normalizeWhatsAppNumber(phone);

  if (!isValidWhatsAppNumber(normalized)) {
    throw new Error(`Número inválido: ${phone} → ${normalized}`);
  }

  // 1. Find or create customer
  let { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('phone', normalized)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!customer) {
    const { data: newCust, error: custErr } = await supabase.from('customers').insert({
      phone: normalized,
      name: contactName || normalized,
      workspace_id: workspaceId,
    }).select('id, name').single();

    if (custErr) throw new Error(`Erro ao criar contato: ${custErr.message}`);
    customer = newCust;
  }

  // 2. Find or create conversation
  let { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('customer_id', customer!.id)
    .eq('workspace_id', workspaceId)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    const { data: newConv, error: convErr } = await supabase.from('conversations').insert({
      customer_id: customer!.id,
      workspace_id: workspaceId,
      status: 'unassigned',
      last_message_at: new Date().toISOString(),
    }).select('id').single();

    if (convErr) throw new Error(`Erro ao criar conversa: ${convErr.message}`);
    conversation = newConv;
  }

  // 3. Send via WhatsApp
  let apiSuccess = true;
  let apiError: string | null = null;
  try {
    await sendWhatsAppMessage(phone, message);
  } catch (err: any) {
    apiSuccess = false;
    apiError = err?.message || 'Erro ao enviar';
  }

  // 4. Persist message
  await supabase.from('messages').insert({
    conversation_id: conversation!.id,
    workspace_id: workspaceId,
    sender_type: senderType,
    sender_id: senderId || null,
    content: message,
    message_type: 'text',
    status: apiSuccess ? 'sent' : 'failed',
  });

  // 5. Update conversation
  await supabase.from('conversations').update({
    last_message_at: new Date().toISOString(),
  }).eq('id', conversation!.id);

  if (!apiSuccess) {
    return { success: false, conversationId: conversation!.id, error: apiError || undefined };
  }

  return { success: true, conversationId: conversation!.id };
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
