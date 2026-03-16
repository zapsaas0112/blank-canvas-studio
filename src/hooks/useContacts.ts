import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeWhatsAppNumber } from '@/lib/whatsapp-utils';
import type { Contact } from '@/types/database';

export function useContacts() {
  const { workspace } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false });
    if (data) setContacts(data as Contact[]);
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function create(name: string, phone: string) {
    if (!workspace) return;
    const normalized = normalizeWhatsAppNumber(phone);
    const { error } = await supabase.from('customers').insert({
      name, phone: normalized, workspace_id: workspace.id,
    });
    if (error) throw error;
    await fetch();
  }

  async function update(id: string, data: Partial<Contact>) {
    if (data.phone) {
      data = { ...data, phone: normalizeWhatsAppNumber(data.phone) };
    }
    const { error } = await supabase.from('customers').update(data).eq('id', id);
    if (error) throw error;
    await fetch();
  }

  async function importContacts(rows: { name: string; phone: string }[]) {
    if (!workspace) return;
    const normalized = rows.map(r => ({
      name: r.name,
      phone: normalizeWhatsAppNumber(r.phone),
      workspace_id: workspace.id,
    }));
    const { error } = await supabase.from('customers').insert(normalized);
    if (error) throw error;
    await fetch();
  }

  return { contacts, loading, refetch: fetch, create, update, importContacts };
}
