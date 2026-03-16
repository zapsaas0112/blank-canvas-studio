import { supabase } from '@/integrations/supabase/client';
import type { Instance } from '@/types/database';

export async function createInstance(workspaceId: string, name: string): Promise<Instance> {
  // Call connect which checks UAZAPI status and returns instance info
  const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
    body: { instanceName: name },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  // Save to instances table
  const { data: instance, error: dbError } = await supabase
    .from('instances')
    .insert({
      workspace_id: workspaceId,
      name,
      instance_id_external: data.instanceKey || 'default',
      status: data.status === 'connected' ? 'connected' : 'disconnected',
      qr_code: data.qrCode || null,
      is_active: data.status === 'connected',
      phone_number: data.phoneNumber || null,
    })
    .select()
    .single();

  if (dbError) throw dbError;
  return instance as Instance;
}

export async function connectInstance(instanceKey: string): Promise<{ qrCode: string | null; status: string }> {
  const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
    body: { instanceKey },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { qrCode: data.qrCode, status: data.status };
}

export async function getInstanceStatus(instanceKey: string): Promise<{
  connected: boolean;
  status: string;
  qrCode: string | null;
  phoneNumber: string | null;
  profileName: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('whatsapp-status', {
    body: { instanceKey },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function disconnectInstance(instanceKey: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('whatsapp-disconnect', {
    body: { instanceKey },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function deleteInstance(instanceKey: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('whatsapp-delete', {
    body: { instanceKey },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function sendWhatsAppMessage(instanceKey: string, phone: string, message: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { instanceKey, phone: phone.replace(/\D/g, ''), message },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
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
