import { supabase } from '@/integrations/supabase/client';
import type { Instance } from '@/types/database';

const API_KEY = 'a2df6c76-6338-4089-819e-ff05d4aabc00';
const WHATSAPI_FUNCTIONS_URL = 'https://xukeukdwhelyttifzveb.supabase.co/functions/v1';
const UAZAPI_URL = 'https://ipazua.uazapi.com';

export async function createInstance(workspaceId: string, name: string, webhookUrl?: string): Promise<Instance> {
  const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
    body: { userName: name, webhookUrl },
  });
  if (error) throw error;

  // Save to instances table
  const { data: instance, error: dbError } = await supabase
    .from('instances')
    .insert({
      workspace_id: workspaceId,
      name,
      token: data.token,
      instance_id_external: data.instanceId,
      status: data.status === 'connected' ? 'connected' : 'disconnected',
      qr_code: data.qrCode || null,
      is_active: data.status === 'connected',
    })
    .select()
    .single();

  if (dbError) throw dbError;
  return instance as Instance;
}

export async function connectInstance(token: string): Promise<{ qrCode: string | null; status: string }> {
  const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
    body: { token },
  });
  if (error) throw error;
  return { qrCode: data.qrCode, status: data.status };
}

export async function getInstanceStatus(token: string): Promise<{
  connected: boolean;
  status: string;
  qrCode: string | null;
  phoneNumber: string | null;
  profileName: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('whatsapp-status', {
    body: { token },
  });
  if (error) throw error;
  return data;
}

export async function disconnectInstance(token: string): Promise<void> {
  const { error } = await supabase.functions.invoke('whatsapp-disconnect', {
    body: { token },
  });
  if (error) throw error;
}

export async function deleteInstance(instanceIdExternal: string): Promise<void> {
  const { error } = await supabase.functions.invoke('whatsapp-delete', {
    body: { instanceId: instanceIdExternal },
  });
  if (error) throw error;
}

export async function sendWhatsAppMessage(token: string, phone: string, message: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { token, phone: phone.replace(/\D/g, ''), message },
  });
  if (error) throw error;
}

export async function registerInstanceWebhook(instanceId: string, url: string, events: string[] = ['messages']): Promise<void> {
  const { error } = await supabase.from('instance_webhooks').insert({
    instance_id: instanceId,
    url,
    events,
    is_active: true,
  });
  if (error) throw error;
}
