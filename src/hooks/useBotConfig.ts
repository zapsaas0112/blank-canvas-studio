import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { BotConfig, BotStep } from '@/types/database';

export function useBotConfig() {
  const { workspace } = useAuth();
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    const { data } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('workspace_id', workspace.id)
      .limit(1)
      .maybeSingle();
    if (data) setConfig(data as unknown as BotConfig);
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  async function save(isActive: boolean, welcomeMessage: string, steps: BotStep[]) {
    if (!workspace) return;
    const payload = {
      is_active: isActive,
      welcome_message: welcomeMessage,
      steps: steps as any,
      workspace_id: workspace.id,
    };
    if (config?.id) {
      await supabase.from('bot_configs').update(payload).eq('id', config.id);
    } else {
      const { data } = await supabase.from('bot_configs').insert(payload).select().single();
      if (data) setConfig(data as unknown as BotConfig);
    }
    await fetch();
  }

  return { config, loading, refetch: fetch, save };
}
