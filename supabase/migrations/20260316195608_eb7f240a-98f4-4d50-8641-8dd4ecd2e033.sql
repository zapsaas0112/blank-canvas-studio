-- ========================================
-- MULTI-TENANT SaaS MIGRATION FOR ZAPDESK
-- ========================================

-- 1. Create workspaces table
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  owner_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 2. Create workspace_members table
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- 3. Create agents table
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'agent',
  is_active boolean DEFAULT true,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- 4. Create instances table
CREATE TABLE public.instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  phone_number text,
  status text NOT NULL DEFAULT 'disconnected',
  token text,
  instance_id_external text,
  qr_code text,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;

-- 5. Create instance_webhooks table
CREATE TABLE public.instance_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.instance_webhooks ENABLE ROW LEVEL SECURITY;

-- 6. Add workspace_id to existing tables
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.quick_replies ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.bot_configs ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 7. Create contact_tags table
CREATE TABLE public.contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  UNIQUE(contact_id, tag_id)
);
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

-- 8. Create webhook_events table
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid REFERENCES public.instances(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- 9. Create webhook_messages table
CREATE TABLE public.webhook_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id uuid REFERENCES public.webhook_events(id) ON DELETE CASCADE,
  instance_id uuid REFERENCES public.instances(id) ON DELETE CASCADE,
  from_number text,
  to_number text,
  message_text text,
  message_type text DEFAULT 'text',
  direction text DEFAULT 'inbound',
  raw_payload jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.webhook_messages ENABLE ROW LEVEL SECURITY;

-- 10. Create bot_triggers table
CREATE TABLE public.bot_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_config_id uuid NOT NULL REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'keyword',
  keyword text,
  response text,
  action text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.bot_triggers ENABLE ROW LEVEL SECURITY;

-- 11. Create conversation_bot_state table
CREATE TABLE public.conversation_bot_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  bot_config_id uuid REFERENCES public.bot_configs(id) ON DELETE SET NULL,
  current_step text,
  state jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.conversation_bot_state ENABLE ROW LEVEL SECURITY;

-- 12. Create broadcast_recipients table
CREATE TABLE public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- 13. Create send_folders table
CREATE TABLE public.send_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.send_folders ENABLE ROW LEVEL SECURITY;

-- 14. Add broadcast counters
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS total_recipients integer DEFAULT 0;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS total_sent integer DEFAULT 0;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS total_delivered integer DEFAULT 0;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS total_read integer DEFAULT 0;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS total_failed integer DEFAULT 0;

-- 15. Security definer function for workspace access
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
    AND user_id = auth.uid()
  )
$$;

-- ========================================
-- RLS POLICIES
-- ========================================

-- Workspaces
CREATE POLICY "Users can view workspaces they belong to" ON public.workspaces
FOR SELECT TO authenticated USING (public.user_has_workspace_access(id));

CREATE POLICY "Users can create workspaces" ON public.workspaces
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update workspace" ON public.workspaces
FOR UPDATE TO authenticated USING (owner_id = auth.uid());

-- Workspace members
CREATE POLICY "Members can view workspace members" ON public.workspace_members
FOR SELECT TO authenticated USING (public.user_has_workspace_access(workspace_id));

CREATE POLICY "Users can insert themselves as members" ON public.workspace_members
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Agents
CREATE POLICY "Workspace members can manage agents" ON public.agents
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

-- Instances
CREATE POLICY "Workspace members can manage instances" ON public.instances
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

-- Instance webhooks
CREATE POLICY "Workspace members can manage instance_webhooks" ON public.instance_webhooks
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.instances i WHERE i.id = instance_id AND public.user_has_workspace_access(i.workspace_id)));

-- Drop old policies and create workspace-based ones
DROP POLICY IF EXISTS "Authenticated can manage customers" ON public.customers;
CREATE POLICY "Workspace members can manage customers" ON public.customers
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Authenticated can manage conversations" ON public.conversations;
CREATE POLICY "Workspace members can manage conversations" ON public.conversations
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Authenticated can manage messages" ON public.messages;
CREATE POLICY "Workspace members can manage messages" ON public.messages
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Authenticated can manage tags" ON public.tags;
CREATE POLICY "Workspace members can manage tags" ON public.tags
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Authenticated can manage quick_replies" ON public.quick_replies;
CREATE POLICY "Workspace members can manage quick_replies" ON public.quick_replies
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Authenticated can manage bot_configs" ON public.bot_configs;
CREATE POLICY "Workspace members can manage bot_configs" ON public.bot_configs
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Authenticated can manage broadcasts" ON public.broadcasts;
CREATE POLICY "Workspace members can manage broadcasts" ON public.broadcasts
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

-- Contact tags
CREATE POLICY "Workspace members can manage contact_tags" ON public.contact_tags
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = contact_id AND public.user_has_workspace_access(c.workspace_id)));

-- Conversation tags
DROP POLICY IF EXISTS "Authenticated can manage conversation_tags" ON public.conversation_tags;
CREATE POLICY "Workspace members can manage conversation_tags" ON public.conversation_tags
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.user_has_workspace_access(c.workspace_id)));

-- Broadcast contacts
DROP POLICY IF EXISTS "Authenticated can manage broadcast_contacts" ON public.broadcast_contacts;
CREATE POLICY "Workspace members can manage broadcast_contacts" ON public.broadcast_contacts
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.broadcasts b WHERE b.id = broadcast_id AND public.user_has_workspace_access(b.workspace_id)));

-- Broadcast recipients
CREATE POLICY "Workspace members can manage broadcast_recipients" ON public.broadcast_recipients
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.broadcasts b WHERE b.id = broadcast_id AND public.user_has_workspace_access(b.workspace_id)));

-- Webhook events
CREATE POLICY "Workspace members can manage webhook_events" ON public.webhook_events
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.instances i WHERE i.id = instance_id AND public.user_has_workspace_access(i.workspace_id)));

-- Webhook messages
CREATE POLICY "Workspace members can manage webhook_messages" ON public.webhook_messages
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.instances i WHERE i.id = instance_id AND public.user_has_workspace_access(i.workspace_id)));

-- Bot triggers
CREATE POLICY "Workspace members can manage bot_triggers" ON public.bot_triggers
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.bot_configs bc WHERE bc.id = bot_config_id AND public.user_has_workspace_access(bc.workspace_id)));

-- Conversation bot state
CREATE POLICY "Workspace members can manage conversation_bot_state" ON public.conversation_bot_state
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.user_has_workspace_access(c.workspace_id)));

-- Send folders
CREATE POLICY "Workspace members can manage send_folders" ON public.send_folders
FOR ALL TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.instances;