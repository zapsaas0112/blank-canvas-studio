
-- Create bot_configs table
CREATE TABLE IF NOT EXISTS public.bot_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.whatsapp_config(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  welcome_message text DEFAULT '',
  steps jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bot configs viewable by authenticated" ON public.bot_configs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Bot configs manageable by admin" ON public.bot_configs
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create broadcasts table
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.whatsapp_config(id) ON DELETE CASCADE,
  name text NOT NULL,
  message text NOT NULL DEFAULT '',
  contacts_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broadcasts viewable by authenticated" ON public.broadcasts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Broadcasts manageable by admin" ON public.broadcasts
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create broadcast_contacts table
CREATE TABLE IF NOT EXISTS public.broadcast_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid REFERENCES public.broadcasts(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending'
);

ALTER TABLE public.broadcast_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broadcast contacts viewable by authenticated" ON public.broadcast_contacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Broadcast contacts manageable by admin" ON public.broadcast_contacts
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
